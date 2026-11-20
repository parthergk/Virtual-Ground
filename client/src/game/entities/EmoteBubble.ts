import * as Phaser from "phaser";

/**
 * EmoteBubble — Manages a floating emoji speech bubble and speaking indicator
 * above a character (works identically for local and remote players).
 */
export class EmoteBubble {
  private bubbleContainer: Phaser.GameObjects.Container | null = null;
  private speakingDot: Phaser.GameObjects.Graphics | null = null;
  private speakingTween: Phaser.Tweens.Tween | null = null;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Display a floating emote speech bubble with smooth pop-in and fade-out animation.
   */
  showEmote(x: number, y: number, depth: number, emote: string): void {
    if (!this.scene || !this.scene.add) return;

    // Destroy existing bubble if one is already active
    if (this.bubbleContainer) {
      this.bubbleContainer.destroy();
      this.bubbleContainer = null;
    }

    const container = this.scene.add.container(x, y - 56);
    container.setDepth(depth + 0.1);
    container.setScale(0);

    // Retro-styled dark speech bubble with amber border
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0a0a0a, 0.92);
    bg.lineStyle(1.5, 0xf59e0b, 0.9);
    bg.fillRoundedRect(-18, -15, 36, 30, 8);
    bg.strokeRoundedRect(-18, -15, 36, 30, 8);

    // Downward speech bubble pointer triangle
    bg.beginPath();
    bg.moveTo(-4, 15);
    bg.lineTo(0, 20);
    bg.lineTo(4, 15);
    bg.closePath();
    bg.fillPath();
    bg.strokePath();

    // Emoji text
    const text = this.scene.add.text(0, -1, emote, {
      fontSize: "17px",
      align: "center",
    });
    text.setOrigin(0.5, 0.5);

    container.add([bg, text]);
    this.bubbleContainer = container;

    // Pop-in bounce animation
    this.scene.tweens.add({
      targets: container,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: "Back.easeOut",
      onComplete: () => {
        // Hold for 2.4s, then float upward and fade out
        this.scene.time.delayedCall(2400, () => {
          if (!container || !container.active) return;
          this.scene.tweens.add({
            targets: container,
            y: container.y - 14,
            alpha: 0,
            duration: 350,
            ease: "Power1",
            onComplete: () => {
              container.destroy();
              if (this.bubbleContainer === container) {
                this.bubbleContainer = null;
              }
            },
          });
        });
      },
    });
  }

  /**
   * Show/hide a pulsing green audio indicator dot over the character's head when speaking.
   */
  setSpeaking(x: number, y: number, depth: number, isSpeaking: boolean): void {
    if (!this.scene || !this.scene.add) return;

    if (isSpeaking) {
      if (!this.speakingDot) {
        const dot = this.scene.add.graphics();
        dot.fillStyle(0x22c55e, 0.95);
        dot.lineStyle(1, 0xffffff, 0.9);
        dot.fillCircle(0, 0, 4);
        dot.strokeCircle(0, 0, 4);
        dot.setPosition(x, y - 52);
        dot.setDepth(depth + 0.05);

        this.speakingTween = this.scene.tweens.add({
          targets: dot,
          scaleX: 1.4,
          scaleY: 1.4,
          duration: 280,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });

        this.speakingDot = dot;
      }
    } else {
      if (this.speakingDot) {
        this.speakingTween?.stop();
        this.speakingTween = null;
        this.speakingDot.destroy();
        this.speakingDot = null;
      }
    }
  }

  /**
   * Keep bubble and speaking indicator following character coordinates.
   */
  updatePosition(x: number, y: number, depth: number): void {
    if (this.bubbleContainer && this.bubbleContainer.active) {
      this.bubbleContainer.setPosition(x, y - 56);
      this.bubbleContainer.setDepth(depth + 0.1);
    }
    if (this.speakingDot && this.speakingDot.active) {
      this.speakingDot.setPosition(x, y - 52);
      this.speakingDot.setDepth(depth + 0.05);
    }
  }

  destroy(): void {
    if (this.bubbleContainer) {
      this.bubbleContainer.destroy();
      this.bubbleContainer = null;
    }
    if (this.speakingDot) {
      this.speakingTween?.stop();
      this.speakingTween = null;
      this.speakingDot.destroy();
      this.speakingDot = null;
    }
  }
}
