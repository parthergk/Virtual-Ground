"use client";

import { useEffect, useRef } from "react";

interface GameTopBarProps {
  isMuted: boolean;
  onToggleMic: () => void;
  showEmotes: boolean;
  onToggleEmotes: () => void;
  onSendEmote: (emote: string) => void;
  onExit: () => void;
}

export const EMOTE_LIST = ["🙏", "👋", "❤️", "😂", "🔥", "🪔", "👏", "😮"];

export default function GameTopBar({
  isMuted,
  onToggleMic,
  showEmotes,
  onToggleEmotes,
  onSendEmote,
  onExit,
}: GameTopBarProps) {
  const emoteTrayRef = useRef<HTMLDivElement>(null);
  const emoteBtnRef = useRef<HTMLButtonElement>(null);

  // Close emote tray on click outside
  useEffect(() => {
    if (!showEmotes) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        emoteTrayRef.current &&
        !emoteTrayRef.current.contains(e.target as Node) &&
        emoteBtnRef.current &&
        !emoteBtnRef.current.contains(e.target as Node)
      ) {
        onToggleEmotes();
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [showEmotes, onToggleEmotes]);

  return (
    <>
      {/* Top action bar: Always visible across Desktop & Mobile */}
      <div
        className="game-top-bar"
        style={{
          position: "fixed",
          top: "max(12px, env(safe-area-inset-top, 12px))",
          right: "max(12px, env(safe-area-inset-right, 12px))",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 8,
          pointerEvents: "auto",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mic Toggle Button */}
        <button
          type="button"
          onClick={onToggleMic}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 10,
            cursor: "pointer",
            border: isMuted
              ? "1px solid rgba(255, 255, 255, 0.2)"
              : "1px solid rgba(52, 211, 153, 0.85)",
            background: isMuted
              ? "rgba(18, 18, 18, 0.85)"
              : "rgba(6, 78, 59, 0.85)",
            color: isMuted ? "#d4d4d8" : "#6ee7b7",
            boxShadow: isMuted
              ? "0 4px 12px rgba(0, 0, 0, 0.5)"
              : "0 4px 16px rgba(16, 185, 129, 0.35)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            touchAction: "manipulation",
            outline: "none",
            transition: "all 0.15s ease",
          }}
          title={isMuted ? "Unmute Mic (or press M)" : "Mute Mic (or press M)"}
          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          <span style={{ fontSize: 16 }}>{isMuted ? "🔇" : "🎙️"}</span>
          <span>{isMuted ? "Mic Off" : "Mic On"}</span>
        </button>

        {/* Emotes Trigger Button */}
        <button
          ref={emoteBtnRef}
          type="button"
          onClick={onToggleEmotes}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 10,
            cursor: "pointer",
            border: showEmotes
              ? "1px solid rgba(245, 158, 11, 0.9)"
              : "1px solid rgba(255, 255, 255, 0.2)",
            background: showEmotes
              ? "rgba(120, 53, 15, 0.85)"
              : "rgba(18, 18, 18, 0.85)",
            color: showEmotes ? "#fde68a" : "#d4d4d8",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            touchAction: "manipulation",
            outline: "none",
            transition: "all 0.15s ease",
          }}
          title="Send Emote (or press E)"
          aria-label="Send emote"
        >
          <span style={{ fontSize: 16 }}>😊</span>
          <span style={{ fontSize: 13 }}>Emotes</span>
        </button>

        {/* Exit / Switch Button */}
        <button
          type="button"
          onClick={onExit}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            borderRadius: 10,
            cursor: "pointer",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            background: "rgba(18, 18, 18, 0.85)",
            color: "#e4e4e7",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            touchAction: "manipulation",
            outline: "none",
            transition: "all 0.15s ease",
          }}
          title="Exit to Code Screen"
          aria-label="Exit or switch character"
        >
          Exit / Switch
        </button>
      </div>

      {/* Emote Tray Popover */}
      {showEmotes && (
        <div
          ref={emoteTrayRef}
          style={{
            position: "fixed",
            top: "calc(max(12px, env(safe-area-inset-top, 12px)) + 48px)",
            right: "max(12px, env(safe-area-inset-right, 12px))",
            zIndex: 51,
            display: "grid",
            gridTemplateColumns: "repeat(4, 44px)",
            gap: 8,
            padding: 10,
            borderRadius: 14,
            background: "rgba(10, 10, 10, 0.95)",
            border: "1px solid rgba(245, 158, 11, 0.5)",
            boxShadow: "0 16px 36px rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            userSelect: "none",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {EMOTE_LIST.map((emote, idx) => (
            <button
              key={emote}
              type="button"
              onClick={() => {
                onSendEmote(emote);
                onToggleEmotes();
              }}
              style={{
                width: 44,
                height: 44,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 10,
                cursor: "pointer",
                touchAction: "manipulation",
                transition: "all 0.1s ease",
                position: "relative",
              }}
              title={`Send ${emote} (Key ${idx + 1})`}
              aria-label={`Send ${emote} emote`}
            >
              <span>{emote}</span>
              <span
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 4,
                  fontSize: 8,
                  color: "rgba(255, 255, 255, 0.4)",
                  fontFamily: "monospace",
                }}
              >
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
