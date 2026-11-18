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
export default function MobileControls() {
  const [visible, setVisible] = useState(false);

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
    window.location.reload();
  }

  if (!visible) return null;

  const btnBase: React.CSSProperties = {
    width: 56,
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.55)",
    border: "2px solid rgba(255,255,255,0.18)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 22,
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    cursor: "pointer",
    transition: "background 0.08s",
    // pressed state handled via CSS attr selector below
  };

  return (
    <>
      {/* Inline style for pressed state — avoids className generation overhead */}
      <style>{`
        [data-pressed="true"] {
          background: rgba(180, 83, 9, 0.75) !important;
          border-color: rgba(255,255,255,0.45) !important;
        }
      `}</style>

      {/* D-pad — bottom-left with safe-area inset */}
      <div
        style={{
          position: "absolute",
          left: "max(16px, env(safe-area-inset-left, 16px))",
          bottom: "max(16px, env(safe-area-inset-bottom, 16px))",
          display: "grid",
          gridTemplateColumns: "56px 56px 56px",
          gridTemplateRows: "56px 56px 56px",
          gap: 4,
          zIndex: 40,
          touchAction: "none",
        }}
        aria-label="D-pad directional controls"
      >
        {/* Row 1: _, Up, _ */}
        <div />
        <button
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
          ref={(el) => { btnRefs.current.left = el; }}
          style={btnBase}
          aria-label="Move left"
          {...makeHandlers("left")}
        >
          ◀
        </button>
        <div />
        <button
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
          ref={(el) => { btnRefs.current.down = el; }}
          style={btnBase}
          aria-label="Move down"
          {...makeHandlers("down")}
        >
          ▼
        </button>
        <div />
      </div>

      {/* Exit button — bottom-right with safe-area inset */}
      <button
        onClick={handleExit}
        style={{
          position: "absolute",
          right: "max(16px, env(safe-area-inset-right, 16px))",
          bottom: "max(16px, env(safe-area-inset-bottom, 16px))",
          ...btnBase,
          width: "auto",
          paddingLeft: 16,
          paddingRight: 16,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.04em",
          zIndex: 40,
          touchAction: "manipulation",
        }}
        aria-label="Exit game"
      >
        EXIT
      </button>
    </>
  );
}
