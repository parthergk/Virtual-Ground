import * as Phaser from "phaser";
import { ASSETS, MAP, GATE, LIGHT_POLE, PLAYER_SPRITE, MOVEMENT } from "../config";
import { Player } from "../entities/Player";
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
 * - Player and shadow at depth 0 and 1
 * - Light pole in right front corner at depth 5 (base blocks movement on surface)
 * - Gate archway at depth 10 (pillar bases block movement on surface, player walks under arch)
 */
export class GroundScene extends Phaser.Scene {
  private player!: Player;
  private collisionSystem!: CollisionSystem;
  private movementSystem!: MovementSystem;
  private wasMoving = false;

  constructor() {
    super({ key: "GroundScene" });
  }

  preload(): void {
    this.load.image("ground", ASSETS.maps.background);
    this.load.image("gate", ASSETS.maps.gate);
    this.load.image("light-pole", ASSETS.maps.lightPole);
    this.load.json("collision-map", ASSETS.maps.collision);
    this.load.spritesheet("player", ASSETS.characters.player, {
      frameWidth: PLAYER_SPRITE.frameWidth,
      frameHeight: PLAYER_SPRITE.frameHeight,
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

    // Enable linear filtering on high-res player sprite sheet for clean, sharp downscaling
    const playerTexture = this.textures.get("player");
    if (playerTexture) {
      playerTexture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // Spawn player just inside the main entrance
    const spawn = this.collisionSystem.getSpawnPoint();
    const facingDir = (spawn.facing as Direction) || "up";
    this.player = new Player(this, spawn.x, spawn.y, facingDir);

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

    if (moving) {
      const radius = this.collisionSystem.getPlayerRadius();
      const resolved = this.collisionSystem.resolveMovement(
        pos.x,
        pos.y,
        pos.x + dx,
        pos.y + dy,
        radius
      );

      // If obstructed while tap-moving, clear target to avoid stuck animation
      if (resolved.x === pos.x && resolved.y === pos.y && (dx !== 0 || dy !== 0)) {
        this.movementSystem.clearTarget();
      }

      this.player.setPosition(resolved.x, resolved.y);
      this.player.walk(direction);
      this.wasMoving = true;
    } else if (this.wasMoving) {
      this.player.playIdle();
      this.wasMoving = false;
    }
  }

  private handleShutdown(): void {
    this.scale?.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.movementSystem?.destroy(this);
    this.player?.destroy();
  }
}
