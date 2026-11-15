import type * as Phaser from "phaser";

/** Asset path constants — single source of truth for all asset references */
export const ASSETS = {
  maps: {
    background: "/assets/maps/ground-map.png",
    gate: "/assets/maps/gate.png",
    lightPole: "/assets/maps/lightPole.png",
    collision: "/assets/maps/collision-map-new.json",
  },
  characters: {
    player: "/assets/characters/me.png",
    shadow: "/assets/characters/shadow.png",
  },
} as const;

/** Ground map dimensions in source pixels (864 x 432 matching ground-map.png) */
export const MAP = {
  width: 864,
  height: 432,
} as const;

/** Entrance gate overlay dimensions and position (pillar bases collide on ground surface; player walks through arch) */
export const GATE = {
  x: 416, // Shifted slightly to the left to align with courtyard
  y: 376, // Anchored to the front curb line
  width: 220, // Increased size (+10%)
  height: 165, // 4:3 aspect ratio matching gate.png
  depth: 10, // Renders in front of player so player walks through arch
} as const;

/** Light pole overlay in the right front area of the ground (front side anchored to curb line; base collides on surface) */
export const LIGHT_POLE = {
  x: 745, // Moved inside from the right boundary
  y: 376, // Anchored on the front side curb line
  width: 84, // Increased size preserving 614:1430 ratio
  height: 195, // Increased height for prominent floodlight tower
  depth: 5, // Above ground, foreground depth
} as const;

/** Player sprite sheet layout for me.png (6 columns x 4 rows) */
export const PLAYER_SPRITE = {
  frameWidth: 192,
  frameHeight: 288,
  displayWidth: 28,
  displayHeight: 42,
  columns: 6,
  rows: 4,
  /** Row indices for each facing direction */
  directions: {
    down: 0,
    left: 1,
    right: 2,
    up: 3,
  } as const,
} as const;

/** Movement and physics tuning for 864x432 world */
export const MOVEMENT = {
  /** Pixels per second */
  speed: 85,
  /** Collision footprint radius in pixels (from the player's ground contact point) */
  collisionRadius: 4,
} as const;

/**
 * Build the Phaser.Types.Core.GameConfig.
 * Configured with Scale.FIT, expandParent, touch capture, and pixelArt
 * for responsive, sharp rendering across all screen sizes.
 */
export function createGameConfig(
  phaser: typeof Phaser,
  parent: HTMLElement,
  scenes: Phaser.Types.Scenes.SceneType[]
): Phaser.Types.Core.GameConfig {
  return {
    type: phaser.AUTO,
    parent,
    width: MAP.width,
    height: MAP.height,
    pixelArt: true, // nearest-neighbour filtering for crisp pixel art
    roundPixels: true,
    antialias: false,
    backgroundColor: "#000000",
    scale: {
      mode: phaser.Scale.FIT,
      autoCenter: phaser.Scale.CENTER_BOTH,
      parent,
      width: MAP.width,
      height: MAP.height,
    },
    scene: scenes,
    input: {
      touch: {
        capture: true,
      },
    },
  };
}
