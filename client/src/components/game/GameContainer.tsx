"use client";

import type * as PhaserType from "phaser";
import { useEffect, useRef, useState, useCallback } from "react";
import MobileControls from "./MobileControls";
import GameTopBar, { EMOTE_LIST } from "./GameTopBar";
import type { CharacterConfig } from "@/config/characters";

interface GameContainerProps {
  activeCharacter?: CharacterConfig;
  userCode?: string;
  onExitToGate?: () => void;
}

/**
 * GameContainer — mounts the Phaser game instance into a DOM element.
 *
 * Architecture:
 * - GameTopBar: Fixed top-right action bar (Proximity Voice Mic, Emote Tray, Exit)
 *   rendered reliably across desktop and mobile.
 * - MobileControls: Touch D-pad rendered strictly on touch-capable devices.
 * - Keyboard shortcuts on desktop:
 *   - 'M': toggle microphone mute/unmute
 *   - 'E': toggle emote tray
 *   - '1' to '8': send instant emote
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

  // Proximity Voice & Emotes State
  const [isMuted, setIsMuted] = useState(true);
  const [showEmotes, setShowEmotes] = useState(false);

  const handleToggleMic = useCallback(() => {
    gameRef.current?.events.emit("toggle-mic", (muted: boolean) => {
      setIsMuted(muted);
    });
  }, []);

  const handleSendEmote = useCallback((emote: string) => {
    gameRef.current?.events.emit("trigger-emote", emote);
  }, []);

  // Desktop keyboard shortcuts: 'M' for Mic, 'E' for Emotes, '1-8' for direct emotes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "m" || e.key === "M") {
        handleToggleMic();
      } else if (e.key === "e" || e.key === "E") {
        setShowEmotes((prev) => !prev);
      } else if (e.key >= "1" && e.key <= "8") {
        const idx = parseInt(e.key, 10) - 1;
        if (EMOTE_LIST[idx]) {
          handleSendEmote(EMOTE_LIST[idx]);
          setShowEmotes(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleMic, handleSendEmote]);

  // Detect mobile portrait orientation
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window !== "undefined") {
        const portrait =
          window.innerHeight > window.innerWidth && window.innerWidth < 1024;
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
        <p className="text-base font-semibold text-red-300 mb-2">
          Unable to load Virtual Ground
        </p>
        <p className="text-xs text-neutral-400 font-mono mb-4 max-w-xs">
          {initError}
        </p>
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

      {/* Top Action Bar (Mic, Emotes Tray, Exit) — Always visible on Desktop & Mobile */}
      <GameTopBar
        isMuted={isMuted}
        onToggleMic={handleToggleMic}
        showEmotes={showEmotes}
        onToggleEmotes={() => setShowEmotes((prev) => !prev)}
        onSendEmote={handleSendEmote}
        onExit={() => setShowExitConfirm(true)}
      />

      {/* Touch D-pad Overlay (Only visible on touch devices) */}
      <MobileControls />

      {/* Exit / Switch Character Modal */}
      {showExitConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(6px)",
            padding: 16,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 320,
              borderRadius: 16,
              background: "#0f0f10",
              border: "1px solid #27272a",
              padding: 24,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
              textAlign: "center",
              color: "#fff",
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#fef08a",
                marginBottom: 4,
              }}
            >
              Ramlila Ground
            </h3>
            <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 20 }}>
              Playing as{" "}
              <span style={{ fontWeight: 600, color: "#fbbf24" }}>
                {activeCharacter?.name || "Player"}
              </span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {onExitToGate && (
                <button
                  type="button"
                  onClick={() => {
                    setShowExitConfirm(false);
                    onExitToGate();
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#d97706",
                    color: "#000",
                    border: "none",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                >
                  Switch Character / Code
                </button>
              )}
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  background: "#27272a",
                  color: "#e4e4e7",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                Reload Ground
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                style={{
                  width: "100%",
                  padding: "8px 14px",
                  fontSize: 12,
                  color: "#a1a1aa",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Resume Exploring
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Landscape Rotation Suggestion Overlay (Mobile Portrait Only) */}
      {isPortrait && !dismissPortraitPrompt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(6px)",
            padding: 24,
            textAlign: "center",
            color: "#fff",
          }}
        >
          <div
            style={{
              fontSize: 36,
              marginBottom: 16,
            }}
          >
            🔄
          </div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#fcd34d",
              marginBottom: 8,
            }}
          >
            Rotate to Landscape
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#d4d4d8",
              maxWidth: 280,
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            Please turn your phone sideways (Landscape mode) to view the entire
            ground.
          </p>
          <button
            type="button"
            onClick={() => setDismissPortraitPrompt(true)}
            style={{
              fontSize: 12,
              color: "#a1a1aa",
              textDecoration: "underline",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px 12px",
            }}
          >
            Continue in portrait anyway
          </button>
        </div>
      )}
    </div>
  );
}
