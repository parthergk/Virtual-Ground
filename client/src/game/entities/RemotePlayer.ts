import * as Phaser from "phaser";
import { PLAYER_SPRITE } from "../config";
import { Direction } from "../systems/MovementSystem";

/**
 * RemotePlayer — manages another connected player on the ground.
 *
 * Design:
 * - Clean pixel-art rendering with shadow (no name tag above head).
 * - Smooth linear interpolation (lerp) to target network coordinates.
 * - Synchronized 4-directional walk and idle animations.
 */
export class RemotePlayer {
  readonly id: string;
  readonly characterKey: string;

  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;

  private currentX: number;
  private currentY: number;
  private targetX: number;
  private targetY: number;

  private facing: Direction = "down";
  private isMoving = false;

  constructor(
    scene: Phaser.Scene,
    id: string,
    characterKey: string,
    initialX: number,
    initialY: number,
    facing: Direction = "down"
  ) {
    this.id = id;
    this.characterKey = characterKey;
    this.currentX = initialX;
    this.currentY = initialY;
    this.targetX = initialX;
    this.targetY = initialY;
    this.facing = facing;

    // Shadow below remote player sprite
    this.shadow = scene.add.image(initialX, initialY, "shadow");
    this.shadow.setOrigin(0.5, 0.5);
    this.shadow.setDisplaySize(24, 9);
    this.shadow.setAlpha(0.55);
    this.shadow.setDepth(0);

    // Remote player sprite anchored at feet baseline
    this.sprite = scene.add.sprite(initialX, initialY, characterKey);
    this.sprite.setOrigin(0.5, 0.98);
    const scale = PLAYER_SPRITE.displayWidth / PLAYER_SPRITE.frameWidth;
    this.sprite.setScale(scale);

    // Initial dynamic Y-depth
    const dynamicDepth = 1 + initialY / 1000;
    this.sprite.setDepth(dynamicDepth);
    this.shadow.setDepth(dynamicDepth - 0.001);

    this.ensureAnimations(scene);
    this.playIdle();
  }

  /**
   * Ensure walk and idle animations exist for this character.
   */
  private ensureAnimations(scene: Phaser.Scene): void {
    const dirs: Direction[] = ["down", "left", "right", "up"];
    const rowMap = PLAYER_SPRITE.directions;
    const cols = PLAYER_SPRITE.columns;

    for (const dir of dirs) {
      const row = rowMap[dir];
      const walkKey = `walk-${this.characterKey}-${dir}`;
      const idleKey = `idle-${this.characterKey}-${dir}`;

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

  /**
   * Update network target position from incoming packet.
   */
  setTargetPosition(
    x: number,
    y: number,
    direction: Direction,
    moving: boolean
  ): void {
    const dist = Math.hypot(x - this.currentX, y - this.currentY);

    // If teleporting or first spawn distance is large, snap immediately
    if (dist > 120) {
      this.currentX = x;
      this.currentY = y;
      this.sprite.setPosition(x, y);
      this.shadow.setPosition(x, y - 2);
      const dynamicDepth = 1 + y / 1000;
      this.sprite.setDepth(dynamicDepth);
      this.shadow.setDepth(dynamicDepth - 0.001);
    }

    this.targetX = x;
    this.targetY = y;
    this.facing = direction;
    this.isMoving = moving;
  }

  /**
   * Interpolate toward target position and update animation. Called every frame in scene.update().
   */
  update(delta: number): void {
    // Frame-rate independent lerp factor (~12x per second)
    const lerpFactor = Math.min(1, (delta / 1000) * 12);
    this.currentX = Phaser.Math.Linear(this.currentX, this.targetX, lerpFactor);
    this.currentY = Phaser.Math.Linear(this.currentY, this.targetY, lerpFactor);

    this.sprite.setPosition(this.currentX, this.currentY);
    this.shadow.setPosition(this.currentX, this.currentY - 2);

    // Continuous dynamic depth based on ground Y coordinate:
    // Characters closer to the camera (larger Y) always render in front of characters further up.
    const dynamicDepth = 1 + this.currentY / 1000;
    this.sprite.setDepth(dynamicDepth);
    this.shadow.setDepth(dynamicDepth - 0.001);

    if (this.isMoving) {
      this.sprite.play(`walk-${this.characterKey}-${this.facing}`, true);
    } else {
      this.sprite.play(`idle-${this.characterKey}-${this.facing}`, true);
    }
  }

  /**
   * Return current ground position and collision radius for obstacle separation.
   */
  getPosition(): { x: number; y: number; radius: number } {
    return { x: this.currentX, y: this.currentY, radius: 8 };
  }

  private playIdle(): void {
    this.sprite.play(`idle-${this.characterKey}-${this.facing}`, true);
  }

  destroy(): void {
    this.shadow?.destroy();
    this.sprite?.destroy();
  }
}
