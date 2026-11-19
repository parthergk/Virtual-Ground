"use client";

import type * as PhaserType from "phaser";
import { useEffect, useRef, useState } from "react";
import MobileControls from "./MobileControls";
import type { CharacterConfig } from "@/config/characters";

interface GameContainerProps {
  activeCharacter?: CharacterConfig;
  userCode?: string;
  onExitToGate?: () => void;
}

/**
 * GameContainer — mounts the Phaser game instance into a DOM element.
 *
 * Responsiveness & Mobile features:
 * - Detects mobile portrait orientation and displays a friendly landscape prompt.
 * - Observes parent container size via ResizeObserver to trigger scale.refresh()
 *   when orientation changes, devtools toggle, or window resizes.
 * - Handles errors gracefully with user-visible diagnostics on mobile.
 * - Prevents double-init during React development / hot reload.
 * - Cleans up instances and observers on unmount.
 */
export default function GameContainer({
  activeCharacter,
  userCode,
  onExitToGate,
}: GameContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserType.Game | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [dismissPortraitPrompt, setDismissPortraitPrompt] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  // Detect mobile portrait orientation
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window !== "undefined") {
        const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 1024;
        setIsPortrait(portrait);
      }
    };

    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    let isMounted = true;
    let resizeObserver: ResizeObserver | null = null;

    const init = async () => {
      try {
        const phaserMod = await import("phaser");
        const PhaserLib = (
          "Game" in phaserMod
            ? phaserMod
            : (phaserMod as unknown as { default: typeof PhaserType }).default
        ) as typeof PhaserType;

        const { createGameConfig } = await import("@/game/config");
        const { GroundScene } = await import("@/game/scenes/GroundScene");

        if (!containerRef.current || gameRef.current || !isMounted) return;

        const config = createGameConfig(
          PhaserLib,
          containerRef.current,
          [GroundScene],
          {
            character: activeCharacter,
            code: userCode || activeCharacter?.id || "GROUND-01",
          }
        );
        const game = new PhaserLib.Game(config);
        gameRef.current = game;

        // Handle dynamic resize of the container (rotation, split-screen, viewport shifts)
        const refreshScale = () => {
          if (isMounted && game.scale) {
            game.scale.refresh();
          }
        };

        resizeObserver = new ResizeObserver(refreshScale);
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
        }

        window.addEventListener("orientationchange", refreshScale);
        window.addEventListener("resize", refreshScale);
      } catch (err) {
        console.error("Failed to initialize Phaser game:", err);
        if (isMounted) {
          setInitError(
            err instanceof Error ? err.message : "Failed to load game engine"
          );
        }
      }
    };

    init();

    return () => {
      isMounted = false;
      resizeObserver?.disconnect();
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full p-6 text-center text-white bg-black">
        <div className="text-red-400 text-3xl mb-3">⚠</div>
        <p className="text-base font-semibold text-red-300 mb-2">Unable to load Virtual Ground</p>
        <p className="text-xs text-neutral-400 font-mono mb-4 max-w-xs">{initError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 rounded text-white transition-colors"
        >
          Tap to Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Phaser Canvas Mount */}
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden"
        id="game-container"
      />

      {/* Mobile D-pad + Exit button overlay */}
      <MobileControls onExit={() => setShowExitConfirm(true)} />

      {/* Desktop subtle top-right exit button */}
      <div className="hidden sm:block absolute top-3 right-3 z-30">
        <button
          onClick={() => setShowExitConfirm(true)}
          className="px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/90 border border-neutral-700/80 text-xs font-semibold text-neutral-300 hover:text-white transition-all shadow-md backdrop-blur-sm cursor-pointer"
        >
          Exit / Switch
        </button>
      </div>

      {/* Exit / Switch Character Modal */}
      {showExitConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs rounded-xl bg-neutral-900 border border-neutral-800 p-5 shadow-2xl text-center text-white space-y-4">
            <h3 className="text-base font-bold text-amber-200">Ramlila Ground</h3>
            <p className="text-xs text-neutral-300">
              Playing as{" "}
              <span className="font-semibold text-amber-400">
                {activeCharacter?.name || "Player"}
              </span>
            </p>
            <div className="space-y-2 pt-1">
              {onExitToGate && (
                <button
                  onClick={() => {
                    setShowExitConfirm(false);
                    onExitToGate();
                  }}
                  className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-black transition-colors cursor-pointer"
                >
                  Switch Character / Code
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors cursor-pointer"
              >
                Reload Ground
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-1.5 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Resume Exploring
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Landscape Rotation Suggestion Overlay (Mobile Portrait Only) */}
      {isPortrait && !dismissPortraitPrompt && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-6 text-center text-white transition-opacity">
          <div className="w-14 h-14 mb-4 text-amber-400 animate-bounce flex items-center justify-center text-3xl">
            🔄
          </div>
          <h2 className="text-lg font-bold text-amber-300 mb-1">Rotate to Landscape</h2>
          <p className="text-xs text-neutral-300 max-w-xs mb-5 leading-relaxed">
            Please turn your phone sideways (Landscape mode) to view the entire ground.
          </p>
          <button
            onClick={() => setDismissPortraitPrompt(true)}
            className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 py-1 px-3"
          >
            Continue in portrait anyway
          </button>
        </div>
      )}
    </div>
  );
}
