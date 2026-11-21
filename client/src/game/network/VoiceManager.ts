import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteAudioTrack,
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
 * - Proximity volume attenuation: Web Audio API GainNode attached to each remote track.
 * - Proximity curve:
 *   - 0–150 px: Full volume (1.0)
 *   - 150–350 px: Linear fade (1.0 -> 0.3)
 *   - 350–500 px: Very quiet (0.3 -> 0.05)
 *   - > 500 px: Muted (0.0)
 * - Automatic active-speaker detection via LiveKit `ActiveSpeakersChanged`.
 * - Cross-platform autoplay handling for Desktop and Mobile (iOS / Android).
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

interface RemoteTrackEntry {
  participantId: string;
  track: RemoteAudioTrack;
  element: HTMLMediaElement;
}

export class VoiceManager {
  private room: Room | null = null;
  private localPlayerCode = "";
  private audioContext: AudioContext | null = null;
  private remoteTracks = new Map<string, RemoteTrackEntry>();

  private isMuted = true;
  private isConnected = false;
  private isConfigured = false;
  private proximityConfig: ProximityConfig = DEFAULT_PROXIMITY;

  private onSpeakingCallback: ((speaking: boolean) => void) | null = null;
  private onRemoteSpeakingCallback: ((peerId: string, speaking: boolean) => void) | null = null;
  private userInteractionCleanup: (() => void) | null = null;

  constructor(
    onSpeaking?: (speaking: boolean) => void,
    onRemoteSpeaking?: (peerId: string, speaking: boolean) => void,
    config?: Partial<ProximityConfig>
  ) {
    if (onSpeaking) this.onSpeakingCallback = onSpeaking;
    if (onRemoteSpeaking) this.onRemoteSpeakingCallback = onRemoteSpeaking;
    if (config) this.proximityConfig = { ...DEFAULT_PROXIMITY, ...config };

    this.setupGlobalUnlockListener();
  }

  /**
   * Unlock browser audio autoplay restrictions on the first user interaction (touch/click/key).
   */
  private setupGlobalUnlockListener(): void {
    if (typeof window === "undefined") return;

    const onUserInteraction = () => {
      this.unlockAudio().catch(() => {});
      removeListeners();
    };

    const removeListeners = () => {
      window.removeEventListener("pointerdown", onUserInteraction);
      window.removeEventListener("touchstart", onUserInteraction);
      window.removeEventListener("keydown", onUserInteraction);
      this.userInteractionCleanup = null;
    };

    window.addEventListener("pointerdown", onUserInteraction, { passive: true });
    window.addEventListener("touchstart", onUserInteraction, { passive: true });
    window.addEventListener("keydown", onUserInteraction, { passive: true });

    this.userInteractionCleanup = removeListeners;
  }

  /**
   * Resume AudioContext and trigger LiveKit startAudio() inside user gesture context.
   */
  public async unlockAudio(): Promise<void> {
    this.initAudioContext();

    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
        console.log("[VoiceManager] Web Audio Context resumed successfully.");
      } catch (err) {
        console.warn("[VoiceManager] AudioContext resume failed:", err);
      }
    }

    if (this.room && !this.room.canPlaybackAudio) {
      try {
        await this.room.startAudio();
        console.log("[VoiceManager] LiveKit room.startAudio() unlocked audio playback.");
      } catch (err) {
        console.warn("[VoiceManager] LiveKit room.startAudio() error:", err);
      }
    }
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

      // Lazy-initialize Web Audio Context
      this.initAudioContext();

      // Create LiveKit Room instance with optimized audio defaults
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
      console.log(`[VoiceManager] Connecting to LiveKit SFU: ${data.url}...`);
      await this.room.connect(data.url, data.token);
      this.isConnected = true;
      console.log(`[VoiceManager] Connected to LiveKit voice room "${data.room}" as "${data.identity}"`);

      // Start muted by default
      await this.room.localParticipant.setMicrophoneEnabled(false);
      this.isMuted = true;

      // Handle any existing audio tracks from participants who joined earlier
      this.room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub) => {
          if (pub.isSubscribed && pub.track && pub.track.kind === Track.Kind.Audio) {
            console.log(`[VoiceManager] Found pre-existing audio track for ${participant.identity}`);
            this.attachRemoteAudioTrack(participant.identity, pub.track as RemoteAudioTrack);
          }
        });
      });

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

    // Handle incoming remote audio tracks
    this.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          console.log(`[VoiceManager] Subscribed to audio track from: ${participant.identity}`);
          this.attachRemoteAudioTrack(participant.identity, track as RemoteAudioTrack);
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
      for (const peerId of this.remoteTracks.keys()) {
        const isPeerSpeaking = speakerIdentities.has(peerId);
        this.onRemoteSpeakingCallback?.(peerId, isPeerSpeaking);
      }
    });

    this.room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      console.log(`[VoiceManager] Audio playback permitted: ${this.room?.canPlaybackAudio}`);
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log("[VoiceManager] Disconnected from LiveKit voice room.");
      this.isConnected = false;
      this.cleanupAllTracks();
    });
  }

  /**
   * Route remote participant audio through Web Audio GainNode for proximity attenuation.
   * Also attaches the HTMLMediaElement to ensure the browser's WebRTC engine actively decodes RTP packets.
   */
  private attachRemoteAudioTrack(participantId: string, track: RemoteAudioTrack): void {
    this.initAudioContext();
    this.detachRemoteAudioTrack(participantId);

    try {
      // Connect to Web Audio context for GainNode processing
      if (this.audioContext) {
        track.setAudioContext(this.audioContext);
      }

      // CRITICAL: track.attach() creates and mounts an <audio> element.
      // In WebRTC (Chrome, Safari, Android/iOS), remote audio tracks do NOT decode or pull
      // frames unless attached to an active media element.
      const element = track.attach();
      element.style.display = "none";
      element.setAttribute("data-participant-id", participantId);

      if (typeof document !== "undefined" && !document.body.contains(element)) {
        document.body.appendChild(element);
      }

      // Attempt immediate play (will be unlocked if gesture already occurred)
      element.play().catch(() => {});

      this.remoteTracks.set(participantId, {
        participantId,
        track,
        element,
      });

      console.log(`[VoiceManager] Remote audio track attached successfully for: ${participantId}`);
    } catch (err) {
      console.error(`[VoiceManager] Error attaching audio track for ${participantId}:`, err);
    }
  }

  private detachRemoteAudioTrack(participantId: string): void {
    const entry = this.remoteTracks.get(participantId);
    if (!entry) return;

    try {
      entry.track.detach(entry.element);
      if (entry.element.parentNode) {
        entry.element.parentNode.removeChild(entry.element);
      }
    } catch (_e) {}

    this.remoteTracks.delete(participantId);
  }

  private cleanupAllTracks(): void {
    for (const [id] of this.remoteTracks.entries()) {
      this.detachRemoteAudioTrack(id);
    }
    this.remoteTracks.clear();
  }

  /**
   * Calculate distance between local player and remote players, updating GainNode volumes.
   */
  updateSpatialAudio(
    localPos: { x: number; y: number },
    remotePositions: Map<string, { x: number; y: number }>
  ): void {
    if (this.remoteTracks.size === 0) return;

    for (const [peerId, entry] of this.remoteTracks.entries()) {
      const remotePos = remotePositions.get(peerId);
      if (!remotePos) {
        // If peer position is unknown, mute smoothly
        entry.track.setVolume(0);
        continue;
      }

      const dist = Math.hypot(localPos.x - remotePos.x, localPos.y - remotePos.y);
      const targetGain = this.calculateProximityGain(dist);

      // Smooth volume transition using LiveKit GainNode
      entry.track.setVolume(targetGain);
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
  async toggleMute(): Promise<boolean> {
    await this.unlockAudio();

    if (!this.room || !this.isConnected) {
      console.warn("[VoiceManager] Cannot toggle microphone: voice room not connected.");
      return this.isMuted;
    }

    const nextMutedState = !this.isMuted;

    try {
      await this.room.localParticipant.setMicrophoneEnabled(!nextMutedState);
      this.isMuted = nextMutedState;
      console.log(`[VoiceManager] Microphone state: ${this.isMuted ? "MUTED" : "UNMUTED"}`);
    } catch (err) {
      console.error("[VoiceManager] Error setting microphone state:", err);
      this.isMuted = true;
    }

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
    this.userInteractionCleanup?.();
    this.cleanupAllTracks();

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
