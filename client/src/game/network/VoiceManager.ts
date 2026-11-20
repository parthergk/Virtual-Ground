import { Socket } from "socket.io-client";

/**
 * VoiceManager — Handles Peer-to-Peer WebRTC Voice Chat with Spatial Audio.
 *
 * Features:
 * - Direct P2P audio streams via WebRTC RTCPeerConnection with STUN fallback.
 * - Spatial Volume Attenuation (Web Audio API GainNode):
 *   - Close range (<= 60px): 100% volume
 *   - Fading range (60px - 280px): Linear smooth rolloff
 *   - Beyond 280px: 0% volume (completely silent)
 * - Volume meter using AnalyserNode for active speaking detection.
 * - Mute / Unmute toggle controls.
 * - Graceful fallback when microphone permission is denied or audio is not supported.
 */

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const CLOSE_DISTANCE = 60; // Full volume distance in world pixels
const MAX_HEARING_DISTANCE = 280; // Distance where volume reaches 0

interface PeerAudio {
  pc: RTCPeerConnection;
  remoteStream?: MediaStream;
  sourceNode?: MediaStreamAudioSourceNode;
  gainNode?: GainNode;
}

export class VoiceManager {
  private socket: Socket | null = null;
  private localPlayerId = "";
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;

  private peers = new Map<string, PeerAudio>();
  private isMuted = true;
  private isSpeaking = false;
  private speakingInterval: number | null = null;

  private onSpeakingCallback: ((speaking: boolean) => void) | null = null;
  private onRemoteSpeakingCallback: ((peerId: string, speaking: boolean) => void) | null = null;

  constructor(
    onSpeaking?: (speaking: boolean) => void,
    onRemoteSpeaking?: (peerId: string, speaking: boolean) => void
  ) {
    if (onSpeaking) this.onSpeakingCallback = onSpeaking;
    if (onRemoteSpeaking) this.onRemoteSpeakingCallback = onRemoteSpeaking;
  }

  /**
   * Initialize with Socket.io instance and local player access code.
   */
  init(socket: Socket, localPlayerId: string): void {
    this.socket = socket;
    this.localPlayerId = localPlayerId;

    // Listen for WebRTC signals from other players
    this.socket.on(
      "voice-signal",
      async (data: {
        fromId: string;
        type: "offer" | "answer" | "candidate";
        signal: any;
      }) => {
        await this.handleVoiceSignal(data.fromId, data.type, data.signal);
      }
    );

    // Listen for remote speaking updates
    this.socket.on("player-speaking", (data: { id: string; speaking: boolean }) => {
      this.onRemoteSpeakingCallback?.(data.id, data.speaking);
    });
  }

  /**
   * Request microphone permission and activate voice transmission.
   */
  async enableMicrophone(): Promise<boolean> {
    if (this.localStream) {
      this.setMuted(false);
      return true;
    }

    try {
      // Resume or create AudioContext upon user gesture
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioContext && AudioCtxClass) {
        this.audioContext = new AudioCtxClass();
      }
      if (this.audioContext && this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.isMuted = false;

      // Set up speaking detection
      this.setupSpeakingDetection();

      // Add local audio tracks to any existing peer connections
      for (const [peerId, peer] of this.peers.entries()) {
        this.localStream.getAudioTracks().forEach((track) => {
          peer.pc.addTrack(track, this.localStream!);
        });
        // Renegotiate offer
        this.createAndSendOffer(peerId, peer.pc);
      }

      return true;
    } catch (err) {
      console.warn("[VoiceManager] Could not enable microphone:", err);
      return false;
    }
  }

  /**
   * Toggle mute state. Returns the new mute state (true = muted, false = unmuted).
   */
  toggleMute(): boolean {
    if (!this.localStream) {
      this.enableMicrophone();
      return false;
    }

    const nextMuted = !this.isMuted;
    this.setMuted(nextMuted);
    return nextMuted;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    if (muted && this.isSpeaking) {
      this.isSpeaking = false;
      this.onSpeakingCallback?.(false);
      this.socket?.emit("player-speaking", { speaking: false });
    }
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Call when a new peer joins the ground to initiate connection.
   */
  async connectToPeer(peerId: string): Promise<void> {
    if (peerId === this.localPlayerId || this.peers.has(peerId)) return;

    const pc = this.createPeerConnection(peerId);
    this.peers.set(peerId, { pc });

    // Add local tracks if we already have a stream
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    await this.createAndSendOffer(peerId, pc);
  }

  /**
   * Remove peer when they disconnect.
   */
  disconnectPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.gainNode?.disconnect();
      peer.sourceNode?.disconnect();
      peer.pc.close();
      this.peers.delete(peerId);
    }
  }

  /**
   * Updates proximity audio volume based on Euclidean distance in Phaser world coordinates.
   * Called every frame in GroundScene.update().
   */
  updateSpatialAudio(
    localPos: { x: number; y: number },
    remotePositions: Map<string, { x: number; y: number }>
  ): void {
    if (!this.audioContext || this.audioContext.state !== "running") return;

    for (const [peerId, peer] of this.peers.entries()) {
      if (!peer.gainNode) continue;

      const remotePos = remotePositions.get(peerId);
      if (!remotePos) {
        peer.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        continue;
      }

      const dist = Math.hypot(remotePos.x - localPos.x, remotePos.y - localPos.y);

      let targetGain = 0;
      if (dist <= CLOSE_DISTANCE) {
        targetGain = 1.0;
      } else if (dist < MAX_HEARING_DISTANCE) {
        // Linear volume drop-off between CLOSE_DISTANCE and MAX_HEARING_DISTANCE
        targetGain =
          1.0 - (dist - CLOSE_DISTANCE) / (MAX_HEARING_DISTANCE - CLOSE_DISTANCE);
      }

      // Smooth gain transition to avoid audio popping
      peer.gainNode.gain.setTargetAtTime(
        Math.max(0, Math.min(1, targetGain)),
        this.audioContext.currentTime,
        0.04
      );
    }
  }

  // ─── Private WebRTC Helpers ──────────────────────────────────────────

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit("voice-signal", {
          toId: peerId,
          type: "candidate",
          signal: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.setupRemoteAudio(peerId, remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.disconnectPeer(peerId);
      }
    };

    return pc;
  }

  private setupRemoteAudio(peerId: string, stream: MediaStream): void {
    if (!this.audioContext) {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioContext = new AudioCtxClass();
      }
    }

    if (!this.audioContext) return;

    try {
      const sourceNode = this.audioContext.createMediaStreamSource(stream);
      const gainNode = this.audioContext.createGain();

      // Start muted until proximity calculation sets the proper volume
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);

      sourceNode.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      const peer = this.peers.get(peerId);
      if (peer) {
        peer.remoteStream = stream;
        peer.sourceNode = sourceNode;
        peer.gainNode = gainNode;
      }
    } catch (err) {
      console.warn("[VoiceManager] Could not set up spatial audio node:", err);
    }
  }

  private async createAndSendOffer(
    peerId: string,
    pc: RTCPeerConnection
  ): Promise<void> {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket?.emit("voice-signal", {
        toId: peerId,
        type: "offer",
        signal: offer,
      });
    } catch (err) {
      console.warn("[VoiceManager] Error creating offer:", err);
    }
  }

  private async handleVoiceSignal(
    fromId: string,
    type: "offer" | "answer" | "candidate",
    signal: any
  ): Promise<void> {
    let peer = this.peers.get(fromId);

    if (type === "offer") {
      if (!peer) {
        const pc = this.createPeerConnection(fromId);
        peer = { pc };
        this.peers.set(fromId, peer);

        if (this.localStream) {
          this.localStream.getAudioTracks().forEach((track) => {
            pc.addTrack(track, this.localStream!);
          });
        }
      }

      await peer.pc.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);

      this.socket?.emit("voice-signal", {
        toId: fromId,
        type: "answer",
        signal: answer,
      });
    } else if (type === "answer" && peer) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (type === "candidate" && peer) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(signal));
      } catch (e) {
        console.warn("[VoiceManager] Could not add ICE candidate:", e);
      }
    }
  }

  private setupSpeakingDetection(): void {
    if (!this.localStream || !this.audioContext) return;

    try {
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      source.connect(this.analyserNode);

      const bufferLength = this.analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.speakingInterval = window.setInterval(() => {
        if (!this.analyserNode || this.isMuted) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.onSpeakingCallback?.(false);
            this.socket?.emit("player-speaking", { speaking: false });
          }
          return;
        }

        this.analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const nowSpeaking = avg > 18; // Threshold for vocal energy

        if (nowSpeaking !== this.isSpeaking) {
          this.isSpeaking = nowSpeaking;
          this.onSpeakingCallback?.(nowSpeaking);
          this.socket?.emit("player-speaking", { speaking: nowSpeaking });
        }
      }, 100);
    } catch (err) {
      console.warn("[VoiceManager] Could not initialize speaking meter:", err);
    }
  }

  cleanup(): void {
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }

    for (const [peerId] of this.peers) {
      this.disconnectPeer(peerId);
    }
    this.peers.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.socket = null;
  }
}
