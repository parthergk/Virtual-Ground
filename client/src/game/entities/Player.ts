import * as Phaser from "phaser";
import { PLAYER_SPRITE } from "../config";
import { Direction } from "../systems/MovementSystem";

/**
 * Player entity — manages the player sprite, ground shadow, animations,
 * and movement/facing state.
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

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    facing: Direction = "down",
    characterKey: string = "player"
  ) {
    this.facing = facing;
    this.characterKey = characterKey;

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
    this.sprite.setDepth(1);

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

  /** Update the player's and shadow's ground position. */
  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.shadow.setPosition(x, y - 2);
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
    this.shadow?.destroy();
    this.sprite?.destroy();
  }
}
