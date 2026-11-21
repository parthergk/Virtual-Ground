import { Client, Room } from "colyseus.js";
import { Direction } from "../systems/MovementSystem";
import { GroundState } from "./schema/GroundState";
import { PlayerState } from "./schema/PlayerState";

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
  onConnectionStatus?: (status: "connecting" | "connected" | "reconnecting" | "disconnected" | "error", message?: string) => void;
}

const SEND_INTERVAL_MS = 50; // 20 Hz movement updates

function getColyseusEndpoint(): string {
  if (process.env.NEXT_PUBLIC_COLYSEUS_URL) {
    return process.env.NEXT_PUBLIC_COLYSEUS_URL;
  }
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL.replace(/^http/, "ws");
  }
  if (typeof window !== "undefined") {
    const isHttps = window.location.protocol === "https:";
    const protocol = isHttps ? "wss:" : "ws:";
    const hostname = window.location.hostname;

    if (isHttps || hostname.includes("ngrok")) {
      return `${protocol}//${window.location.host}`;
    }

    return `${protocol}//${hostname}:3001`;
  }
  return "ws://localhost:3001";
}

export class NetworkManager {
  private client: Client | null = null;
  private room: Room<GroundState> | null = null;
  private callbacks: NetworkCallbacks | null = null;
  private localPlayerCode = "";

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
   * Connect to the Colyseus game server and join the "ground" room.
   */
  async connect(playerInfo: {
    code: string;
    characterId: string;
    x: number;
    y: number;
    direction: Direction;
  }): Promise<void> {
    this.localPlayerCode = playerInfo.code;
    const endpoint = getColyseusEndpoint();
    console.log(`[NetworkManager] Connecting to Colyseus at: ${endpoint}`);

    this.callbacks?.onConnectionStatus?.("connecting");
    this.client = new Client(endpoint);

    const storageKey = `vg_reconnect_${playerInfo.code}`;
    const savedToken = typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;

    try {
      // 1. Attempt reconnection if token is available
      if (savedToken) {
        try {
          console.log("[NetworkManager] Attempting reconnection with saved token...");
          this.callbacks?.onConnectionStatus?.("reconnecting");
          this.room = await this.client.reconnect<GroundState>(savedToken, GroundState);
          console.log("[NetworkManager] Reconnection successful!");
        } catch (_reconnectErr) {
          console.log("[NetworkManager] Reconnection token expired or invalid, joining fresh room...");
          sessionStorage.removeItem(storageKey);
          this.room = null;
        }
      }

      // 2. Fresh joinOrCreate if not reconnected
      if (!this.room) {
        this.room = await this.client.joinOrCreate<GroundState>(
          "ground",
          {
            code: playerInfo.code,
            characterId: playerInfo.characterId,
          },
          GroundState
        );
      }

      this.isConnected = true;
      this.callbacks?.onConnectionStatus?.("connected");
      console.log(`[NetworkManager] Joined GroundRoom. SessionId: ${this.room.sessionId}`);

      // Save reconnection token
      if (typeof window !== "undefined" && this.room.reconnectionToken) {
        sessionStorage.setItem(storageKey, this.room.reconnectionToken);
      }

      // Register Colyseus state listeners
      this.setupRoomListeners();

    } catch (err: any) {
      console.error("[NetworkManager] Colyseus connection failed:", err);
      this.isConnected = false;
      this.callbacks?.onConnectionStatus?.("error", err?.message || "Failed to connect to game server");
    }
  }

  private setupRoomListeners(): void {
    if (!this.room) return;

    // Initial state: populate existing players
    this.room.onStateChange.once((state) => {
      const existingPlayers: RemotePlayerState[] = [];
      state.players.forEach((p: PlayerState) => {
        if (p.playerId !== this.localPlayerCode && p.isOnline) {
          existingPlayers.push({
            id: p.playerId,
            characterId: p.characterId,
            x: p.x,
            y: p.y,
            direction: (p.direction as Direction) || "up",
            moving: p.isMoving,
          });
        }
      });
      if (existingPlayers.length > 0) {
        this.callbacks?.onCurrentPlayers(existingPlayers);
      }
    });

    // Player added to collection
    this.room.state.players.onAdd((player: PlayerState, sessionId: string) => {
      console.log(`[NetworkManager] State onAdd: ${player.playerId} (${sessionId})`);

      if (player.playerId !== this.localPlayerCode) {
        this.callbacks?.onPlayerJoined({
          id: player.playerId,
          characterId: player.characterId,
          x: player.x,
          y: player.y,
          direction: (player.direction as Direction) || "up",
          moving: player.isMoving,
        });
      }

      // Listen for property changes on this player
      player.onChange(() => {
        if (player.playerId !== this.localPlayerCode) {
          this.callbacks?.onPlayerMoved({
            id: player.playerId,
            characterId: player.characterId,
            x: player.x,
            y: player.y,
            direction: (player.direction as Direction) || "up",
            moving: player.isMoving,
          });
        }
      });
    });

    // Player removed from collection
    this.room.state.players.onRemove((player: PlayerState, _sessionId: string) => {
      console.log(`[NetworkManager] State onRemove: ${player.playerId}`);
      if (player.playerId !== this.localPlayerCode) {
        this.callbacks?.onPlayerLeft({ id: player.playerId });
      }
    });

    // Emote broadcast event from server
    this.room.onMessage("player-emoted", (data: { id: string; emote: string }) => {
      this.callbacks?.onPlayerEmoted?.(data);
    });

    // Speaking broadcast event
    this.room.onMessage("player-speaking", (data: { id: string; speaking: boolean }) => {
      this.callbacks?.onPlayerSpeaking?.(data);
    });

    // Error handler
    this.room.onError((code, message) => {
      console.warn(`[NetworkManager] Room error [${code}]:`, message);
      this.callbacks?.onConnectionStatus?.("error", message);
    });

    // Leave handler
    this.room.onLeave((code) => {
      console.log(`[NetworkManager] Left room with code: ${code}`);
      this.isConnected = false;
      this.callbacks?.onConnectionStatus?.("disconnected");
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
    if (!this.room || !this.isConnected) return;

    const now = performance.now();
    const posChanged =
      Math.abs(x - this.lastSentX) > 0.5 || Math.abs(y - this.lastSentY) > 0.5;
    const dirChanged = direction !== this.lastSentDir;
    const movingChanged = moving !== this.lastSentMoving;

    const shouldSend =
      movingChanged ||
      (moving && (posChanged || dirChanged) && now - this.lastSentTime >= SEND_INTERVAL_MS);

    if (shouldSend) {
      this.lastSentTime = now;
      this.lastSentX = Math.round(x);
      this.lastSentY = Math.round(y);
      this.lastSentDir = direction;
      this.lastSentMoving = moving;

      this.room.send("move", {
        x: this.lastSentX,
        y: this.lastSentY,
        direction,
        moving,
      });
    }
  }

  /**
   * Broadcast an emote reaction to all other connected players via Colyseus.
   */
  sendEmote(emote: string): void {
    if (!this.room || !this.isConnected) return;
    this.room.send("emote", { emote });
  }

  /**
   * Broadcast local speaking indicator state.
   */
  sendSpeaking(speaking: boolean): void {
    if (!this.room || !this.isConnected) return;
    this.room.send("speaking", { speaking });
  }

  /**
   * Legacy socket accessor (returns null now that Colyseus handles networking).
   */
  getSocket(): any {
    return null;
  }

  /**
   * Disconnect cleanly from the Colyseus room.
   */
  disconnect(): void {
    if (this.room) {
      const storageKey = `vg_reconnect_${this.localPlayerCode}`;
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(storageKey);
      }
      this.room.leave(true);
      this.room = null;
    }
    this.client = null;
    this.callbacks = null;
    this.isConnected = false;
  }
}
