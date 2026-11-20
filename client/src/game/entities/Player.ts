import * as Phaser from "phaser";
import { PLAYER_SPRITE } from "../config";
import { Direction } from "../systems/MovementSystem";
import { EmoteBubble } from "./EmoteBubble";

/**
 * Player entity — manages the player sprite, ground shadow, animations,
 * movement/facing state, and emote/voice indicators.
 *
 * The sprite's origin is (0.5, 1) — horizontally centred and vertically
 * anchored at the feet. Thus (x, y) represents the player's ground-contact
 * point, matching what CollisionSystem tests against.
 */
export class Player {
  /** Main character sprite */
  sprite: Phaser.GameObjects.Sprite;
  /** Transparent oval shadow anchored below the player */
  shadow: Phaser.GameObjects.Image;

  private facing: Direction;
  private characterKey: string;
  private emoteManager: EmoteBubble;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    facing: Direction = "down",
    characterKey: string = "player"
  ) {
    this.facing = facing;
    this.characterKey = characterKey;
    this.emoteManager = new EmoteBubble(scene);

    // Shadow sits slightly below the player sprite in depth order
    this.shadow = scene.add.image(x, y, "shadow");
    this.shadow.setOrigin(0.5, 0.5);
    this.shadow.setDisplaySize(24, 9);
    this.shadow.setAlpha(0.55);
    this.shadow.setDepth(0);

    // Player sprite anchored at feet baseline so sprite stands on shadow
    this.sprite = scene.add.sprite(x, y, characterKey);
    this.sprite.setOrigin(0.5, 0.98);
    const scale = PLAYER_SPRITE.displayWidth / PLAYER_SPRITE.frameWidth;
    this.sprite.setScale(scale);

    // Initial position & dynamic Y-depth
    this.setPosition(x, y);

    this.createAnimations(scene);
    this.playIdle();
  }

  private createAnimations(scene: Phaser.Scene): void {
    const dirs: Direction[] = ["down", "left", "right", "up"];
    const rowMap = PLAYER_SPRITE.directions;
    const cols = PLAYER_SPRITE.columns;

    for (const dir of dirs) {
      const row = rowMap[dir];
      const walkKey = `walk-${this.characterKey}-${dir}`;
      const idleKey = `idle-${this.characterKey}-${dir}`;

      // Guard against duplicate animation registration on scene restart
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: scene.anims.generateFrameNumbers(this.characterKey, {
            start: row * cols,
            end: row * cols + (cols - 1),
          }),
          frameRate: 8,
          repeat: -1,
        });
      }

      if (!scene.anims.exists(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key: this.characterKey, frame: row * cols }],
          frameRate: 1,
          repeat: 0,
        });
      }
    }
  }

  /** Update the player's and shadow's ground position and dynamic Y-depth. */
  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.shadow.setPosition(x, y - 2);

    // Continuous dynamic depth based on ground Y coordinate:
    // Scale is 1 + (y / 1000) (1.000 to 1.432), well below props like gate (depth 10) and pole (depth 5).
    // The player further down the screen (larger Y) is always rendered IN FRONT of the player higher up.
    const dynamicDepth = 1 + y / 1000;
    this.sprite.setDepth(dynamicDepth);
    this.shadow.setDepth(dynamicDepth - 0.001);
    this.emoteManager.updatePosition(x, y, dynamicDepth);
  }

  /**
   * Display a floating emote reaction bubble over the player's head.
   */
  showEmote(emote: string): void {
    this.emoteManager.showEmote(
      this.sprite.x,
      this.sprite.y,
      this.sprite.depth,
      emote
    );
  }

  /**
   * Show/hide active speaking voice indicator over player's head.
   */
  setSpeaking(isSpeaking: boolean): void {
    this.emoteManager.setSpeaking(
      this.sprite.x,
      this.sprite.y,
      this.sprite.depth,
      isSpeaking
    );
  }

  /** Return the player's current ground-contact (feet) position. */
  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** Return the direction the player is currently facing. */
  getFacing(): Direction {
    return this.facing;
  }

  /** Play the walking animation for the given direction. */
  walk(direction: Direction): void {
    this.facing = direction;
    this.sprite.play(`walk-${this.characterKey}-${direction}`, true);
  }

  /** Switch to the idle frame for the current facing direction. */
  playIdle(): void {
    this.sprite.play(`idle-${this.characterKey}-${this.facing}`, true);
  }

  /** Clean up Phaser game objects and animations. */
  destroy(): void {
    this.emoteManager?.destroy();
    this.shadow?.destroy();
    this.sprite?.destroy();
  }
}
