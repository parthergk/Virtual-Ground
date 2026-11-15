import * as Phaser from "phaser";

/** Direction the player is facing */
export type Direction = "up" | "down" | "left" | "right";

/** Maximum frame delta in ms to clamp lag spikes and prevent huge jumps */
const MAX_DELTA_MS = 50;

/**
 * MovementSystem — handles both keyboard (WASD / Arrows) and touch/pointer
 * (click or tap-to-move) input to ensure complete responsiveness across
 * all desktop, tablet, and mobile screen sizes.
 */
export class MovementSystem {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  } | null = null;

  /** Pointer / touch target position in world coordinates */
  private targetPos: { x: number; y: number } | null = null;
  private onPointerDownBound: ((pointer: Phaser.Input.Pointer) => void) | null = null;

  /** Bind keyboard and touch/pointer events. Call once during scene create(). */
  init(scene: Phaser.Scene): void {
    const kb = scene.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.wasd = {
        W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    // Touch / click-to-move support for mobile, tablet, and mouse
    this.onPointerDownBound = (pointer: Phaser.Input.Pointer) => {
      // Convert screen pointer position to game world coordinates
      this.targetPos = { x: pointer.worldX, y: pointer.worldY };
    };
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDownBound);
  }

  /** Cancel any active pointer destination. */
  clearTarget(): void {
    this.targetPos = null;
  }

  /**
   * Sample input (keyboard first, then pointer destination) and return movement intent.
   *
   * @param speed      Movement speed in pixels per second.
   * @param delta      Frame delta in milliseconds.
   * @param currentPos Current player world position (required for tap-to-move calculation).
   */
  getMovement(
    speed: number,
    delta: number,
    currentPos?: { x: number; y: number }
  ): { dx: number; dy: number; direction: Direction; moving: boolean } {
    let ix = 0;
    let iy = 0;

    // 1. Check keyboard input
    if (this.cursors && this.wasd) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) ix -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) ix += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) iy -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) iy += 1;
    }

    // Keyboard overrides touch target
    if (ix !== 0 || iy !== 0) {
      this.targetPos = null;
    } else if (this.targetPos && currentPos) {
      // 2. Check pointer / touch destination
      const toX = this.targetPos.x - currentPos.x;
      const toY = this.targetPos.y - currentPos.y;
      const distance = Math.hypot(toX, toY);

      if (distance < 3) {
        // Destination reached
        this.targetPos = null;
        return { dx: 0, dy: 0, direction: "down", moving: false };
      }

      ix = toX / distance;
      iy = toY / distance;
    }

    const moving = ix !== 0 || iy !== 0;
    if (!moving) {
      return { dx: 0, dy: 0, direction: "down", moving: false };
    }

    // Normalise input vector
    const length = Math.hypot(ix, iy);
    const nx = ix / length;
    const ny = iy / length;

    // Clamp delta to avoid tunnelling
    const dt = Math.min(delta, MAX_DELTA_MS) / 1000;
    const dx = nx * speed * dt;
    const dy = ny * speed * dt;

    // Determine facing direction
    let direction: Direction;
    if (Math.abs(iy) >= Math.abs(ix)) {
      direction = iy < 0 ? "up" : "down";
    } else {
      direction = ix < 0 ? "left" : "right";
    }

    return { dx, dy, direction, moving };
  }

  /** Clean up event listeners. Call on scene shutdown/destroy. */
  destroy(scene: Phaser.Scene): void {
    if (this.onPointerDownBound) {
      scene.input?.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDownBound);
      this.onPointerDownBound = null;
    }
    scene.input?.keyboard?.removeAllKeys(true);
    this.cursors = null;
    this.wasd = null;
    this.targetPos = null;
  }
}
