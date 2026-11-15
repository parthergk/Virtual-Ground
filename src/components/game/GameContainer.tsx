"use client";

import type * as PhaserType from "phaser";
import { useEffect, useRef } from "react";

/**
 * GameContainer — mounts the Phaser game instance into a DOM element.
 *
 * Responsiveness features:
 * - Observes parent container size via ResizeObserver to trigger scale.refresh()
 *   when orientation changes, devtools toggle, or window resizes.
 * - Prevents double-init during React development / hot reload.
 * - Cleans up instances and observers on unmount.
 */
export default function GameContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserType.Game | null>(null);

  useEffect(() => {
    // Guard: skip if already initialised or container missing
    if (gameRef.current || !containerRef.current) return;

    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;

    const init = async () => {
      const phaserMod = await import("phaser");
      const PhaserLib = (
        "Game" in phaserMod
          ? phaserMod
          : (phaserMod as unknown as { default: typeof PhaserType }).default
      ) as typeof PhaserType;

      const { createGameConfig } = await import("@/game/config");
      const { GroundScene } = await import("@/game/scenes/GroundScene");

      if (!containerRef.current || gameRef.current || destroyed) return;

      const config = createGameConfig(PhaserLib, containerRef.current, [
        GroundScene,
      ]);
      const game = new PhaserLib.Game(config);
      gameRef.current = game;

      // Handle dynamic resize of the container (rotation, split-screen, viewport shifts)
      resizeObserver = new ResizeObserver(() => {
        if (!destroyed && game.scale) {
          game.scale.refresh();
        }
      });
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
    };

    init();

    return () => {
      destroyed = true;
      resizeObserver?.disconnect();
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      id="game-container"
    />
  );
}
