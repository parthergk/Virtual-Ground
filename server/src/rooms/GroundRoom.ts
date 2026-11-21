import colyseusPkg from "colyseus";
const { Room } = colyseusPkg;
import type { Client } from "colyseus";
import { GroundState } from "../schema/GroundState.js";
import { PlayerState } from "../schema/PlayerState.js";
import { CollisionValidator } from "../collision/CollisionValidator.js";
import {
  VALID_CODES,
  ALLOWED_EMOTES,
  EMOTE_NAME_TO_EMOJI,
  RosterEntry,
} from "../config/roster.js";

interface JoinOptions {
  code?: string;
  characterId?: string;
  reconnectionToken?: string;
}

interface AuthContext {
  roster: RosterEntry;
}

export class GroundRoom extends Room<GroundState> {
  maxClients = 10;
  private collisionValidator = new CollisionValidator();

  // Tracks active character reservations: characterId -> sessionId
  private characterReservations = new Map<string, string>();

  // Rate-limiting for emotes: sessionId -> timestamp
  private lastEmoteTime = new Map<string, number>();

  onCreate(_options: any): void {
    this.setState(new GroundState());

    // Movement message handler — authoritative validation
    this.onMessage("move", (client, message: {
      x?: number;
      y?: number;
      dx?: number;
      dy?: number;
      direction?: string;
      moving?: boolean;
    }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.isOnline) return;

      const currentX = player.x;
      const currentY = player.y;

      let targetX = currentX;
      let targetY = currentY;

      if (typeof message.x === "number" && typeof message.y === "number") {
        targetX = message.x;
        targetY = message.y;
      } else if (typeof message.dx === "number" && typeof message.dy === "number") {
        targetX = currentX + message.dx;
        targetY = currentY + message.dy;
      }

      // Collect other active players' positions for collision avoidance
      const otherPlayers: { x: number; y: number; radius?: number }[] = [];
      this.state.players.forEach((otherP: PlayerState, sId: string) => {
        if (sId !== client.sessionId && otherP.isOnline) {
          otherPlayers.push({ x: otherP.x, y: otherP.y, radius: 4 });
        }
      });

      // Authoritative collision resolution
      const resolved = this.collisionValidator.resolveMovement(
        currentX,
        currentY,
        targetX,
        targetY,
        4,
        otherPlayers
      );

      player.x = resolved.x;
      player.y = resolved.y;
      if (message.direction) {
        player.direction = message.direction;
      }
      player.isMoving = Boolean(message.moving);
      player.lastSeen = Date.now();
    });

    // Emote message handler — rate limited and validated
    this.onMessage("emote", (client, message: { emote: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.isOnline || !message || !message.emote) return;

      const rawEmote = String(message.emote).trim();
      if (!ALLOWED_EMOTES.has(rawEmote)) {
        return; // Ignore invalid emote
      }

      const now = Date.now();
      const lastTime = this.lastEmoteTime.get(client.sessionId) || 0;
      if (now - lastTime < 1500) {
        return; // Rate limit: max 1 emote every 1.5 seconds
      }
      this.lastEmoteTime.set(client.sessionId, now);

      // Convert named emote to emoji if needed
      const displayEmote = EMOTE_NAME_TO_EMOJI[rawEmote] || rawEmote;
      player.currentEmote = displayEmote;

      // Broadcast emote event to all clients in the room
      this.broadcast("player-emoted", {
        id: player.playerId,
        emote: displayEmote,
      });

      // Clear emote on state after 3 seconds
      this.clock.setTimeout(() => {
        if (player.currentEmote === displayEmote) {
          player.currentEmote = "";
        }
      }, 3000);
    });

    console.log("[GroundRoom] Ramlila Ground Colyseus Room created.");
  }

  async onAuth(client: Client, options: JoinOptions): Promise<AuthContext> {
    try {
      console.log("[GroundRoom] onAuth called. options:", JSON.stringify(options));
      const rawCode = String(options?.code || "").trim().toUpperCase();
      if (!rawCode) {
        throw new Error("Missing access code. Please enter your assigned code.");
      }

      const roster = VALID_CODES[rawCode];
      if (!roster) {
        throw new Error(`Invalid or unauthorized access code: "${rawCode}"`);
      }

      // Check if character is currently reserved
      const existingSessionId = this.characterReservations.get(roster.characterId);
      if (existingSessionId && existingSessionId !== client.sessionId) {
        const existingPlayer = this.state.players.get(existingSessionId);
        if (existingPlayer) {
          if (existingPlayer.isOnline) {
            throw new Error(
              `Character "${roster.name}" is already occupied in an active session.`
            );
          } else {
            throw new Error(
              `Character "${roster.name}" is currently reserved during disconnection grace period.`
            );
          }
        }
      }

      return { roster };
    } catch (err: any) {
      console.error("[GroundRoom] onAuth error:", err?.stack || err);
      throw err;
    }
  }

  onJoin(client: Client, options: JoinOptions, auth?: any): void {
    try {
      console.log("[GroundRoom] onJoin called. options:", JSON.stringify(options), "auth:", JSON.stringify(auth));
      const rawCode = String(options?.code || "").trim().toUpperCase();
      const roster: RosterEntry =
        auth?.roster ||
        (client as any).auth?.roster ||
        VALID_CODES[rawCode];

      if (!roster) {
        throw new Error(
          `Unable to determine character roster for session ${client.sessionId}. Code: ${options?.code}`
        );
      }

      // Spawn coordinate based on character
      const spawnOffset = roster.characterId === "char_2" ? 28 : -14;
      const spawnX = 416 + spawnOffset;
      const spawnY = 350;

      const player = new PlayerState();
      player.playerId = roster.code;
      player.characterId = roster.characterId;
      player.x = spawnX;
      player.y = spawnY;
      player.direction = "up";
      player.isMoving = false;
      player.isOnline = true;
      player.lastSeen = Date.now();

      this.state.players.set(client.sessionId, player);
      this.characterReservations.set(roster.characterId, client.sessionId);

      console.log(
        `[GroundRoom] Player ${player.playerId} (${roster.name}) joined. Session: ${client.sessionId}. Total: ${this.state.players.size}`
      );
    } catch (err: any) {
      console.error("[GroundRoom] onJoin error:", err?.stack || err);
      throw err;
    }
  }

  async onLeave(client: Client, consented?: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (consented) {
      console.log(
        `[GroundRoom] Player ${player.playerId} left voluntarily. Session: ${client.sessionId}`
      );
      this.characterReservations.delete(player.characterId);
      this.lastEmoteTime.delete(client.sessionId);
      this.state.players.delete(client.sessionId);
      return;
    }

    // Unexpected disconnection — start 30-second grace period
    player.isOnline = false;
    player.isMoving = false;
    console.log(
      `[GroundRoom] Player ${player.playerId} dropped unexpectedly. Session: ${client.sessionId}. Starting 30s grace period.`
    );

    try {
      await this.allowReconnection(client, 30);
      player.isOnline = true;
      player.lastSeen = Date.now();
      console.log(
        `[GroundRoom] Player ${player.playerId} successfully reconnected! Session: ${client.sessionId}`
      );
    } catch (_e) {
      console.log(
        `[GroundRoom] Grace period expired for ${player.playerId}. Releasing reservation.`
      );
      this.characterReservations.delete(player.characterId);
      this.lastEmoteTime.delete(client.sessionId);
      this.state.players.delete(client.sessionId);
    }
  }

  onDispose(): void {
    console.log("[GroundRoom] Room disposed.");
  }
}
