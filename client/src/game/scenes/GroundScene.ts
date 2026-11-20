import * as Phaser from "phaser";
import { ASSETS, MAP, GATE, LIGHT_POLE, PLAYER_SPRITE, MOVEMENT } from "../config";
import { Player } from "../entities/Player";
import { RemotePlayer } from "../entities/RemotePlayer";
import { NetworkManager } from "../network/NetworkManager";
import { VoiceManager } from "../network/VoiceManager";
import { CHARACTERS } from "@/config/characters";
import {
  CollisionMapData,
  CollisionSystem,
} from "../systems/CollisionSystem";
import { Direction, MovementSystem } from "../systems/MovementSystem";

/**
 * GroundScene — main gameplay scene for the Ramlila Ground hangout.
 *
 * Visual hierarchy:
 * - Background at depth -1
 * - Players and shadows at depth 0 and 1
 * - Light pole in right front corner at depth 5 (base blocks movement on surface)
 * - Gate archway at depth 10 (pillar bases block movement on surface, player walks under arch)
 */
export class GroundScene extends Phaser.Scene {
  private player!: Player;
  private collisionSystem!: CollisionSystem;
  private movementSystem!: MovementSystem;
  private wasMoving = false;

  private activeCharacter!: { id: string; spriteUrl: string; name?: string };
  private playerCode!: string;

  // Real-time multiplayer state
  private remotePlayers = new Map<string, RemotePlayer>();
  private networkManager: NetworkManager | null = null;
  private voiceManager: VoiceManager | null = null;

  constructor() {
    super({ key: "GroundScene" });
  }

  init(): void {
    const registryChar = this.registry.get("character") as
      | { id: string; spriteUrl: string; name?: string }
      | undefined;

    this.activeCharacter = registryChar || CHARACTERS.char_1;
    this.playerCode = (this.registry.get("code") as string) || "GROUND-01";
  }

  preload(): void {
    this.load.image("ground", ASSETS.maps.background);
    this.load.image("gate", ASSETS.maps.gate);
    this.load.image("light-pole", ASSETS.maps.lightPole);
    this.load.json("collision-map", ASSETS.maps.collision);

    // Preload ALL configured characters so remote players render instantly
    Object.values(CHARACTERS).forEach((char) => {
      this.load.spritesheet(char.id, char.spriteUrl, {
        frameWidth: PLAYER_SPRITE.frameWidth,
        frameHeight: PLAYER_SPRITE.frameHeight,
      });
    });

    this.load.image("shadow", ASSETS.characters.shadow);
  }

  create(): void {
    // Render background at native resolution (864x432) with top-left origin
    const bg = this.add.image(0, 0, "ground");
    bg.setOrigin(0, 0);
    bg.setDisplaySize(MAP.width, MAP.height);
    bg.setDepth(-1);

    // Render light pole in the right front corner of the ground (base collides on ground surface)
    const pole = this.add.image(LIGHT_POLE.x, LIGHT_POLE.y, "light-pole");
    pole.setOrigin(0.5, 1);
    pole.setDisplaySize(LIGHT_POLE.width, LIGHT_POLE.height);
    pole.setDepth(LIGHT_POLE.depth);

    // Render entrance gate overlay (depth 10 so player walks under the arch; pillar bases collide)
    const gate = this.add.image(GATE.x, GATE.y, "gate");
    gate.setOrigin(0.5, 1);
    gate.setDisplaySize(GATE.width, GATE.height);
    gate.setDepth(GATE.depth);

    // Load collision polygons from Phaser's preloaded JSON cache
    this.collisionSystem = new CollisionSystem();
    const collisionData = this.cache.json.get(
      "collision-map"
    ) as CollisionMapData;
    this.collisionSystem.setData(collisionData);

    // Initialise movement controls (keyboard + touch/click-to-move)
    this.movementSystem = new MovementSystem();
    this.movementSystem.init(this);

    // Spawn local player with slight character-specific offset so multiple players don't spawn atop each other
    const baseSpawn = this.collisionSystem.getSpawnPoint();
    const spawnOffset = this.activeCharacter.id === "char_2" ? 28 : -14;
    const spawnX = baseSpawn.x + spawnOffset;
    const spawnY = baseSpawn.y;
    const facingDir = (baseSpawn.facing as Direction) || "up";

    this.player = new Player(
      this,
      spawnX,
      spawnY,
      facingDir,
      this.activeCharacter.id
    );

    // Initialize Real-time Network Manager
    this.networkManager = new NetworkManager({
      onCurrentPlayers: (players) => {
        players.forEach((p) => {
          if (p.id !== this.playerCode && !this.remotePlayers.has(p.id)) {
            const rp = new RemotePlayer(
              this,
              p.id,
              p.characterId,
              p.x,
              p.y,
              p.direction
            );
            if (p.moving) {
              rp.setTargetPosition(p.x, p.y, p.direction, true);
            }
            this.remotePlayers.set(p.id, rp);
            this.voiceManager?.connectToPeer(p.id);
          }
        });
      },
      onPlayerJoined: (p) => {
        if (p.id !== this.playerCode && !this.remotePlayers.has(p.id)) {
          const rp = new RemotePlayer(
            this,
            p.id,
            p.characterId,
            p.x,
            p.y,
            p.direction
          );
          this.remotePlayers.set(p.id, rp);
          this.voiceManager?.connectToPeer(p.id);
        }
      },
      onPlayerMoved: (p) => {
        const rp = this.remotePlayers.get(p.id);
        if (rp) {
          rp.setTargetPosition(p.x, p.y, p.direction, p.moving);
        }
      },
      onPlayerLeft: ({ id }) => {
        const rp = this.remotePlayers.get(id);
        if (rp) {
          rp.destroy();
          this.remotePlayers.delete(id);
        }
        this.voiceManager?.disconnectPeer(id);
      },
      onPlayerEmoted: ({ id, emote }) => {
        const rp = this.remotePlayers.get(id);
        if (rp) {
          rp.showEmote(emote);
        }
      },
      onPlayerSpeaking: ({ id, speaking }) => {
        const rp = this.remotePlayers.get(id);
        if (rp) {
          rp.setSpeaking(speaking);
        }
      },
    });

    this.networkManager.connect({
      code: this.playerCode,
      characterId: this.activeCharacter.id,
      x: spawnX,
      y: spawnY,
      direction: facingDir,
    });

    // Initialize Proximity Voice Manager with WebRTC Spatial Audio
    this.voiceManager = new VoiceManager(
      (speaking) => {
        this.player.setSpeaking(speaking);
      },
      (peerId, speaking) => {
        this.remotePlayers.get(peerId)?.setSpeaking(speaking);
      }
    );
    const sock = this.networkManager.getSocket();
    if (sock) {
      this.voiceManager.init(sock, this.playerCode);
    }

    // Register React UI control event listeners
    this.game.events.on("trigger-emote", this.handleTriggerEmote, this);
    this.game.events.on("toggle-mic", this.handleToggleMic, this);

    // Setup responsive camera
    this.cameras.main.setBounds(0, 0, MAP.width, MAP.height);
    this.handleResize();

    // Listen to scale/resize events
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    // Ensure resources are cleaned up when the scene shuts down or game is destroyed
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  /** Dynamically adjust camera zoom and tracking based on viewport aspect ratio. */
  private handleResize(): void {
    const camera = this.cameras?.main;
    if (!camera) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const screenAspect = width / (height || 1);

    if (screenAspect < 1.0) {
      // Portrait screen (mobile phone held vertically):
      // Zoom in smoothly and follow the player so the character is clearly visible
      const portraitZoom = Math.min(1.8, Math.max(1.3, 1 / screenAspect));
      camera.setZoom(portraitZoom);
      if (this.player?.sprite) {
        camera.startFollow(this.player.sprite, true, 0.1, 0.1);
      }
    } else {
      // Landscape screen (desktop, laptop, tablet, phone in landscape):
      // Stop follow and show the full Ramlila Ground centered
      camera.stopFollow();
      camera.setZoom(1);
      camera.centerOn(MAP.width / 2, MAP.height / 2);
    }
  }

  update(_time: number, delta: number): void {
    if (!this.player || !this.collisionSystem || !this.movementSystem) return;

    const pos = this.player.getPosition();
    const { dx, dy, direction, moving } = this.movementSystem.getMovement(
      MOVEMENT.speed,
      delta,
      pos
    );

    // Gather remote players' ground positions for collision avoidance
    const otherPlayers = Array.from(this.remotePlayers.values()).map((rp) =>
      rp.getPosition()
    );

    if (moving) {
      const radius = this.collisionSystem.getPlayerRadius();
      const resolved = this.collisionSystem.resolveMovement(
        pos.x,
        pos.y,
        pos.x + dx,
        pos.y + dy,
        radius,
        otherPlayers
      );

      // If obstructed while tap-moving, clear target to avoid stuck animation
      if (resolved.x === pos.x && resolved.y === pos.y && (dx !== 0 || dy !== 0)) {
        this.movementSystem.clearTarget();
      }

      this.player.setPosition(resolved.x, resolved.y);
      this.player.walk(direction);
      this.wasMoving = true;

      // Broadcast position to other players
      this.networkManager?.sendMovement(resolved.x, resolved.y, direction, true);
    } else if (this.wasMoving) {
      this.player.playIdle();
      this.wasMoving = false;

      // Broadcast idle state immediately to other players
      this.networkManager?.sendMovement(pos.x, pos.y, this.player.getFacing(), false);
    }

    // Update position interpolation and walk/idle animation for all remote players
    for (const rp of this.remotePlayers.values()) {
      rp.update(delta);
    }

    // Update Web Audio proximity rolloff based on real-time distances
    const remotePosMap = new Map<string, { x: number; y: number }>();
    for (const [id, rp] of this.remotePlayers.entries()) {
      remotePosMap.set(id, rp.getPosition());
    }
    this.voiceManager?.updateSpatialAudio(pos, remotePosMap);
  }

  private handleTriggerEmote(emote: string): void {
    this.player.showEmote(emote);
    this.networkManager?.sendEmote(emote);
  }

  private handleToggleMic(callback?: (isMuted: boolean) => void): void {
    if (this.voiceManager) {
      const isMuted = this.voiceManager.toggleMute();
      callback?.(isMuted);
    }
  }

  private handleShutdown(): void {
    this.game.events.off("trigger-emote", this.handleTriggerEmote, this);
    this.game.events.off("toggle-mic", this.handleToggleMic, this);

    this.scale?.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.movementSystem?.destroy(this);
    this.player?.destroy();

    // Clean up voice manager
    this.voiceManager?.cleanup();
    this.voiceManager = null;

    // Clean up network connection and remote player sprites
    this.networkManager?.disconnect();
    this.networkManager = null;

    this.remotePlayers.forEach((rp) => rp.destroy());
    this.remotePlayers.clear();
  }
}
