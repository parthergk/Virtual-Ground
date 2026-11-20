"use client";

import { useEffect, useRef, useState } from "react";
import { mobileInput, resetMobileInput } from "@/game/systems/MobileInput";

type Direction = "up" | "down" | "left" | "right";

/** Returns true when the current device has touch capability. */
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * MobileControls — D-pad + Exit button overlay for touch devices.
 *
 * Design decisions:
 * - Renders nothing on non-touch devices.
 * - Writes directly to the `mobileInput` singleton; never calls setState for
 *   movement so there are zero React re-renders per animation frame.
 * - Uses pointer events + setPointerCapture so dragging off the button still
 *   counts as holding it down.
 * - Tracks active pointer IDs per direction (a Set) so multi-finger gestures
 *   are handled correctly.
 * - Pressed visual state is toggled via a data-attribute on the DOM node
 *   directly (via refs) to avoid re-renders.
 */
interface MobileControlsProps {
  onExit?: () => void;
  onToggleMic?: () => void;
  isMuted?: boolean;
  onSendEmote?: (emote: string) => void;
}

const EMOTE_LIST = ["🙏", "👋", "❤️", "😂", "🔥", "🪔", "👏", "😮"];

export default function MobileControls({
  onExit,
  onToggleMic,
  isMuted = true,
  onSendEmote,
}: MobileControlsProps) {
  const [visible, setVisible] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);

  useEffect(() => {
    setVisible(isTouchDevice());
  }, []);

  // Refs to button DOM nodes for direct pressed-state toggling
  const btnRefs = useRef<Record<Direction, HTMLButtonElement | null>>({
    up: null,
    down: null,
    left: null,
    right: null,
  });

  // Active pointer IDs per direction
  const activePointers = useRef<Record<Direction, Set<number>>>({
    up: new Set(),
    down: new Set(),
    left: new Set(),
    right: new Set(),
  });

  function press(dir: Direction, pointerId: number, el: HTMLElement) {
    el.setPointerCapture(pointerId);
    activePointers.current[dir].add(pointerId);
    mobileInput[dir] = true;
    // Visual feedback via data-attribute (no setState → no re-render)
    btnRefs.current[dir]?.setAttribute("data-pressed", "true");
  }

  function release(dir: Direction, pointerId: number) {
    activePointers.current[dir].delete(pointerId);
    if (activePointers.current[dir].size === 0) {
      mobileInput[dir] = false;
      btnRefs.current[dir]?.removeAttribute("data-pressed");
    }
  }

  function makeHandlers(dir: Direction) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        press(dir, e.pointerId, e.currentTarget);
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        release(dir, e.pointerId);
      },
      onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
        release(dir, e.pointerId);
      },
      onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => {
        // Only release if pointer is NOT captured (captured ones still fire
        // pointerup on the element even when leaving)
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
          release(dir, e.pointerId);
        }
      },
    };
  }

  function handleExit() {
    resetMobileInput();
    if (onExit) {
      onExit();
    } else {
      window.location.reload();
    }
  }

  if (!visible) return null;

  // 44px buttons — compact but still easy to hit
  const SZ = 44;

  const btnBase: React.CSSProperties = {
    width: SZ,
    height: SZ,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.55)",
    border: "2px solid rgba(255,255,255,0.18)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 17,
    // Prevent browser text-selection, tap-highlight and callout — these
    // are what cause the haptic "selection" vibration on Android/iOS.
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    WebkitTapHighlightColor: "transparent",
    outline: "none",
    cursor: "pointer",
    transition: "background 0.08s",
  };

  return (
    <>
      {/* Pressed state + global selection kill for the overlay */}
      <style>{`
        [data-pressed="true"] {
          background: rgba(180, 83, 9, 0.75) !important;
          border-color: rgba(255,255,255,0.45) !important;
        }
        /* Belt-and-braces: kill tap highlight on every control button */
        [data-ctrl] {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
      `}</style>

      {/* Top-Right Action Bar: Voice Mic, Emote Tray, Exit */}
      <div
        style={{
          position: "absolute",
          right: "max(12px, env(safe-area-inset-right, 12px))",
          top: "max(12px, env(safe-area-inset-top, 12px))",
          display: "flex",
          gap: 6,
          alignItems: "center",
          zIndex: 45,
        }}
      >
        {/* Proximity Voice Mic Button */}
        {onToggleMic && (
          <button
            data-ctrl
            onClick={onToggleMic}
            style={{
              ...btnBase,
              width: "auto",
              height: "auto",
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 10,
              paddingRight: 10,
              fontSize: 14,
              background: isMuted ? "rgba(0,0,0,0.6)" : "rgba(34,197,94,0.35)",
              borderColor: isMuted
                ? "rgba(255,255,255,0.2)"
                : "rgba(34,197,94,0.85)",
              touchAction: "manipulation",
            }}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            aria-label="Toggle voice chat"
          >
            {isMuted ? "🔇" : "🎙️"}
          </button>
        )}

        {/* Emote Selector Toggle Button */}
        {onSendEmote && (
          <button
            data-ctrl
            onClick={() => setShowEmotes((prev) => !prev)}
            style={{
              ...btnBase,
              width: "auto",
              height: "auto",
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 10,
              paddingRight: 10,
              fontSize: 14,
              background: showEmotes
                ? "rgba(245,158,11,0.3)"
                : "rgba(0,0,0,0.6)",
              borderColor: showEmotes
                ? "rgba(245,158,11,0.8)"
                : "rgba(255,255,255,0.2)",
              touchAction: "manipulation",
            }}
            title="Express an Emote"
            aria-label="Open emote tray"
          >
            😊
          </button>
        )}

        {/* EXIT button */}
        <button
          data-ctrl
          onClick={handleExit}
          style={{
            ...btnBase,
            width: "auto",
            height: "auto",
            paddingTop: 6,
            paddingBottom: 6,
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            touchAction: "manipulation",
          }}
          aria-label="Exit game"
        >
          EXIT
        </button>
      </div>

      {/* Floating Emote Tray Popover */}
      {showEmotes && onSendEmote && (
        <div
          style={{
            position: "absolute",
            right: "max(12px, env(safe-area-inset-right, 12px))",
            top: "calc(max(12px, env(safe-area-inset-top, 12px)) + 42px)",
            display: "grid",
            gridTemplateColumns: "repeat(4, 38px)",
            gap: 6,
            padding: 8,
            borderRadius: 12,
            background: "rgba(10, 10, 10, 0.94)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.7)",
            zIndex: 46,
            backdropFilter: "blur(8px)",
          }}
        >
          {EMOTE_LIST.map((emote) => (
            <button
              key={emote}
              data-ctrl
              onClick={() => {
                onSendEmote(emote);
                setShowEmotes(false);
              }}
              style={{
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                cursor: "pointer",
                touchAction: "manipulation",
                transition: "transform 0.08s, background 0.08s",
              }}
              aria-label={`Send ${emote} emote`}
            >
              {emote}
            </button>
          ))}
        </div>
      )}

      {/* D-pad — bottom-right with safe-area inset */}
      <div
        style={{
          position: "absolute",
          right: "max(12px, env(safe-area-inset-right, 12px))",
          bottom: "max(12px, env(safe-area-inset-bottom, 12px))",
          display: "grid",
          gridTemplateColumns: `${SZ}px ${SZ}px ${SZ}px`,
          gridTemplateRows: `${SZ}px ${SZ}px ${SZ}px`,
          gap: 3,
          zIndex: 40,
          touchAction: "none",
        }}
        aria-label="D-pad directional controls"
      >
        {/* Row 1: _, Up, _ */}
        <div />
        <button
          data-ctrl
          ref={(el) => { btnRefs.current.up = el; }}
          style={btnBase}
          aria-label="Move up"
          {...makeHandlers("up")}
        >
          ▲
        </button>
        <div />

        {/* Row 2: Left, _, Right */}
        <button
          data-ctrl
          ref={(el) => { btnRefs.current.left = el; }}
          style={btnBase}
          aria-label="Move left"
          {...makeHandlers("left")}
        >
          ◀
        </button>
        <div />
        <button
          data-ctrl
          ref={(el) => { btnRefs.current.right = el; }}
          style={btnBase}
          aria-label="Move right"
          {...makeHandlers("right")}
        >
          ▶
        </button>

        {/* Row 3: _, Down, _ */}
        <div />
        <button
          data-ctrl
          ref={(el) => { btnRefs.current.down = el; }}
          style={btnBase}
          aria-label="Move down"
          {...makeHandlers("down")}
        >
          ▼
        </button>
        <div />
      </div>
    </>
  );
}
