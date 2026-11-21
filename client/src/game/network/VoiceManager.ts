import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Track,
  Participant,
  ConnectionState,
} from "livekit-client";

/**
 * VoiceManager — Handles Proximity Voice Chat powered by LiveKit + Web Audio API.
 *
 * Architecture:
 * - Real-time audio transport: LiveKit SFU (WebRTC).
 * - Room credentials obtained securely via Next.js `/api/livekit/token` API.
 * - Proximity volume attenuation: Web Audio API `GainNode` attached to each remote track.
 * - Proximity curve (configurable):
 *   - 0–150 px: Full volume (1.0)
 *   - 150–350 px: Linear fade (1.0 -> 0.3)
 *   - 350–500 px: Very quiet (0.3 -> 0.05)
 *   - > 500 px: Muted (0.0)
 * - Automatic active-speaker detection via LiveKit `ActiveSpeakersChanged`.
 * - Clean teardown of audio graph nodes, media streams, and room connections.
 */

export interface ProximityConfig {
  fullVolumeDist: number; // 0 - 150px
  fadeDist: number;       // 150 - 350px
  quietDist: number;      // 350 - 500px
  mutedDist: number;      // > 500px
}

const DEFAULT_PROXIMITY: ProximityConfig = {
  fullVolumeDist: 150,
  fadeDist: 350,
  quietDist: 500,
  mutedDist: 500,
};

interface RemoteAudioNode {
  participantId: string;
  sourceNode: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  stream: MediaStream;
}

export class VoiceManager {
  private room: Room | null = null;
  private localPlayerCode = "";
  private audioContext: AudioContext | null = null;
  private remoteAudioNodes = new Map<string, RemoteAudioNode>();

  private isMuted = true;
  private isConnected = false;
  private isConfigured = false;
  private proximityConfig: ProximityConfig = DEFAULT_PROXIMITY;

  private onSpeakingCallback: ((speaking: boolean) => void) | null = null;
  private onRemoteSpeakingCallback: ((peerId: string, speaking: boolean) => void) | null = null;

  constructor(
    onSpeaking?: (speaking: boolean) => void,
    onRemoteSpeaking?: (peerId: string, speaking: boolean) => void,
    config?: Partial<ProximityConfig>
  ) {
    if (onSpeaking) this.onSpeakingCallback = onSpeaking;
    if (onRemoteSpeaking) this.onRemoteSpeakingCallback = onRemoteSpeaking;
    if (config) this.proximityConfig = { ...DEFAULT_PROXIMITY, ...config };
  }

  /**
   * Initialize and connect to the LiveKit voice room.
   */
  async init(_legacySocketOrUnused: any, localPlayerCode?: string): Promise<void> {
    const code = localPlayerCode || (typeof _legacySocketOrUnused === "string" ? _legacySocketOrUnused : "");
    if (!code) {
      console.warn("[VoiceManager] No player code provided for LiveKit voice chat.");
      return;
    }

    this.localPlayerCode = code;

    try {
      console.log(`[VoiceManager] Requesting LiveKit token for ${code}...`);
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok || !data.configured) {
        console.warn(
          "[VoiceManager] LiveKit not configured or token generation failed:",
          data.error || "Credentials missing"
        );
        this.isConfigured = false;
        return;
      }

      this.isConfigured = true;

      // Initialize Web Audio Context (lazy created on user gesture or room init)
      this.initAudioContext();

      // Create LiveKit Room
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.setupRoomEvents();

      // Connect to LiveKit SFU
      await this.room.connect(data.url, data.token);
      this.isConnected = true;
      console.log(`[VoiceManager] Connected to LiveKit voice room "${data.room}" as "${data.identity}"`);

      // Start muted by default
      await this.room.localParticipant.setMicrophoneEnabled(false);
      this.isMuted = true;

    } catch (err) {
      console.error("[VoiceManager] Failed to connect to LiveKit:", err);
      this.isConnected = false;
    }
  }

  private initAudioContext(): void {
    if (!this.audioContext && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
  }

  private setupRoomEvents(): void {
    if (!this.room) return;

    // Handle remote participant audio tracks
    this.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          console.log(`[VoiceManager] Subscribed to audio track from: ${participant.identity}`);
          this.attachRemoteAudioTrack(participant.identity, track);
        }
      }
    );

    // Clean up when remote audio track unpublishes
    this.room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          console.log(`[VoiceManager] Unsubscribed audio track from: ${participant.identity}`);
          this.detachRemoteAudioTrack(participant.identity);
        }
      }
    );

    // Active speakers detection for visual speech rings
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const speakerIdentities = new Set(speakers.map((s) => s.identity));

      // Local player speaking
      const isLocalSpeaking = speakerIdentities.has(this.localPlayerCode);
      this.onSpeakingCallback?.(isLocalSpeaking);

      // Remote players speaking
      for (const [peerId] of this.remoteAudioNodes.entries()) {
        const isPeerSpeaking = speakerIdentities.has(peerId);
        this.onRemoteSpeakingCallback?.(peerId, isPeerSpeaking);
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log("[VoiceManager] Disconnected from LiveKit voice room.");
      this.isConnected = false;
      this.cleanupAllNodes();
    });
  }

  /**
   * Route remote participant audio through Web Audio GainNode for proximity attenuation.
   */
  private attachRemoteAudioTrack(participantId: string, track: RemoteTrack): void {
    this.initAudioContext();
    if (!this.audioContext || !track.mediaStreamTrack) return;

    // Remove existing node for this participant if any
    this.detachRemoteAudioTrack(participantId);

    try {
      const stream = new MediaStream([track.mediaStreamTrack]);
      const sourceNode = this.audioContext.createMediaStreamSource(stream);
      const gainNode = this.audioContext.createGain();

      // Start with default volume
      gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);

      sourceNode.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      this.remoteAudioNodes.set(participantId, {
        participantId,
        sourceNode,
        gainNode,
        stream,
      });

      console.log(`[VoiceManager] Web Audio GainNode attached for ${participantId}`);
    } catch (err) {
      console.error(`[VoiceManager] Error setting up Web Audio for ${participantId}:`, err);
    }
  }

  private detachRemoteAudioTrack(participantId: string): void {
    const node = this.remoteAudioNodes.get(participantId);
    if (!node) return;

    try {
      node.sourceNode.disconnect();
      node.gainNode.disconnect();
    } catch (_e) {}

    this.remoteAudioNodes.delete(participantId);
  }

  private cleanupAllNodes(): void {
    for (const [id] of this.remoteAudioNodes.entries()) {
      this.detachRemoteAudioTrack(id);
    }
    this.remoteAudioNodes.clear();
  }

  /**
   * Calculate distance between local player and remote players, updating GainNode volumes.
   */
  updateSpatialAudio(
    localPos: { x: number; y: number },
    remotePositions: Map<string, { x: number; y: number }>
  ): void {
    if (!this.audioContext || this.remoteAudioNodes.size === 0) return;

    const now = this.audioContext.currentTime;

    for (const [peerId, audioNode] of this.remoteAudioNodes.entries()) {
      const remotePos = remotePositions.get(peerId);
      if (!remotePos) {
        // If peer position is unknown, mute smoothly
        audioNode.gainNode.gain.setTargetAtTime(0, now, 0.08);
        continue;
      }

      const dist = Math.hypot(localPos.x - remotePos.x, localPos.y - remotePos.y);
      const targetGain = this.calculateProximityGain(dist);

      // Smooth volume transition without audio clicks
      audioNode.gainNode.gain.setTargetAtTime(targetGain, now, 0.08);
    }
  }

  /**
   * Mathematical proximity volume curve:
   * 0 - 150px: Full volume (1.0)
   * 150 - 350px: Linear fade (1.0 -> 0.3)
   * 350 - 500px: Very quiet (0.3 -> 0.05)
   * > 500px: Muted (0.0)
   */
  private calculateProximityGain(distance: number): number {
    const { fullVolumeDist, fadeDist, quietDist } = this.proximityConfig;

    if (distance <= fullVolumeDist) {
      return 1.0;
    }

    if (distance <= fadeDist) {
      const t = (distance - fullVolumeDist) / (fadeDist - fullVolumeDist);
      return 1.0 - t * 0.7; // 1.0 down to 0.3
    }

    if (distance <= quietDist) {
      const t = (distance - fadeDist) / (quietDist - fadeDist);
      return 0.3 - t * 0.25; // 0.3 down to 0.05
    }

    return 0.0;
  }

  /**
   * Toggle local player microphone mute/unmute.
   */
  toggleMute(): boolean {
    if (!this.room || !this.isConnected) {
      this.isMuted = !this.isMuted;
      return this.isMuted;
    }

    this.initAudioContext();
    this.isMuted = !this.isMuted;

    this.room.localParticipant
      .setMicrophoneEnabled(!this.isMuted)
      .then(() => {
        console.log(`[VoiceManager] Microphone ${this.isMuted ? "muted" : "unmuted"}`);
      })
      .catch((err) => {
        console.error("[VoiceManager] Error toggling microphone:", err);
        this.isMuted = true;
      });

    return this.isMuted;
  }

  /**
   * Peer connection helpers (maintained for backwards compatibility with GroundScene).
   */
  connectToPeer(_peerId: string): void {
    // Handled automatically by LiveKit room subscriptions
  }

  disconnectPeer(peerId: string): void {
    this.detachRemoteAudioTrack(peerId);
  }

  isVoiceConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Clean up all LiveKit connections and Web Audio resources.
   */
  cleanup(): void {
    this.cleanupAllNodes();

    if (this.room) {
      try {
        if (this.room.state === ConnectionState.Connected) {
          this.room.disconnect();
        }
      } catch (_e) {}
      this.room = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        this.audioContext.close();
      } catch (_e) {}
      this.audioContext = null;
    }

    this.isConnected = false;
    this.onSpeakingCallback = null;
    this.onRemoteSpeakingCallback = null;
  }
}
