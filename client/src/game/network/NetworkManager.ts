import { io, Socket } from "socket.io-client";
import { Direction } from "../systems/MovementSystem";

export interface RemotePlayerState {
  id: string;          // User's access code (e.g. "GROUND-01")
  characterId: string; // e.g. "char_1" or "char_2"
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
}

export interface NetworkCallbacks {
  onCurrentPlayers: (players: RemotePlayerState[]) => void;
  onPlayerJoined: (player: RemotePlayerState) => void;
  onPlayerMoved: (player: RemotePlayerState) => void;
  onPlayerLeft: (data: { id: string }) => void;
  onPlayerEmoted?: (data: { id: string; emote: string }) => void;
  onPlayerSpeaking?: (data: { id: string; speaking: boolean }) => void;
}

const DEFAULT_SOCKET_URL = "http://localhost:3001";
const SEND_INTERVAL_MS = 50; // 20 Hz movement updates

export class NetworkManager {
  private socket: Socket | null = null;
  private callbacks: NetworkCallbacks | null = null;

  // Local state tracking for throttling
  private lastSentTime = 0;
  private lastSentX = -1;
  private lastSentY = -1;
  private lastSentDir: Direction = "up";
  private lastSentMoving = false;
  private isConnected = false;

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Connect to the Socket.io server and send initial join payload.
   */
  connect(playerInfo: {
    code: string;
    characterId: string;
    x: number;
    y: number;
    direction: Direction;
  }): void {
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || DEFAULT_SOCKET_URL;

    console.log(`[NetworkManager] Connecting to WebSocket server at: ${socketUrl}`);

    this.socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      timeout: 10000,
    });

    this.socket.on("connect", () => {
      console.log(`[NetworkManager] Connected with socket ID: ${this.socket?.id}`);
      this.isConnected = true;

      // Send join event
      this.socket?.emit("join-ground", {
        code: playerInfo.code,
        characterId: playerInfo.characterId,
        x: playerInfo.x,
        y: playerInfo.y,
        direction: playerInfo.direction,
        moving: false,
      });
    });

    this.socket.on("connect_error", (err) => {
      console.warn(`[NetworkManager] WebSocket connection warning:`, err.message);
    });

    this.socket.on("disconnect", (reason) => {
      console.log(`[NetworkManager] Disconnected: ${reason}`);
      this.isConnected = false;
    });

    // Listen for room updates
    this.socket.on("current-players", (players: RemotePlayerState[]) => {
      this.callbacks?.onCurrentPlayers(players);
    });

    this.socket.on("player-joined", (player: RemotePlayerState) => {
      this.callbacks?.onPlayerJoined(player);
    });

    this.socket.on("player-moved", (player: RemotePlayerState) => {
      this.callbacks?.onPlayerMoved(player);
    });

    this.socket.on("player-left", (data: { id: string }) => {
      this.callbacks?.onPlayerLeft(data);
    });

    this.socket.on("player-emoted", (data: { id: string; emote: string }) => {
      this.callbacks?.onPlayerEmoted?.(data);
    });

    this.socket.on("player-speaking", (data: { id: string; speaking: boolean }) => {
      this.callbacks?.onPlayerSpeaking?.(data);
    });
  }

  /**
   * Send local player movement to server (throttled to 20Hz while moving, immediate on stop).
   */
  sendMovement(
    x: number,
    y: number,
    direction: Direction,
    moving: boolean
  ): void {
    if (!this.socket || !this.isConnected) return;

    const now = performance.now();
    const posChanged =
      Math.abs(x - this.lastSentX) > 0.5 || Math.abs(y - this.lastSentY) > 0.5;
    const dirChanged = direction !== this.lastSentDir;
    const movingChanged = moving !== this.lastSentMoving;

    // Send immediately if moving stopped or started
    // Otherwise throttle to SEND_INTERVAL_MS if moving and position/direction changed
    const shouldSend =
      movingChanged ||
      (moving && (posChanged || dirChanged) && now - this.lastSentTime >= SEND_INTERVAL_MS);

    if (shouldSend) {
      this.lastSentTime = now;
      this.lastSentX = Math.round(x);
      this.lastSentY = Math.round(y);
      this.lastSentDir = direction;
      this.lastSentMoving = moving;

      this.socket.emit("player-move", {
        x: this.lastSentX,
        y: this.lastSentY,
        direction,
        moving,
      });
    }
  }

  /**
   * Broadcast an emote reaction to all other connected players.
   */
  sendEmote(emote: string): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit("player-emote", { emote });
  }

  /**
   * Get direct reference to Socket.io socket (for WebRTC voice signaling).
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Disconnect and clean up listeners on scene shutdown.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.callbacks = null;
    this.isConnected = false;
  }
}
