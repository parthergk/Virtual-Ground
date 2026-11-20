"use client";

import { useEffect, useRef, useState } from "react";
import { mobileInput } from "@/game/systems/MobileInput";

type Direction = "up" | "down" | "left" | "right";

/** Returns true when the current device has touch capability. */
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * MobileControls — High-performance D-pad for touch/mobile devices.
 *
 * Design:
 * - Returns null on non-touch (desktop) devices.
 * - Writes directly to `mobileInput` singleton without triggering React re-renders.
 * - Uses pointer capture and direct DOM data-attributes for pressed state styling.
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
        e.stopPropagation();
        press(dir, e.pointerId, e.currentTarget);
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        release(dir, e.pointerId);
      },
      onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
        release(dir, e.pointerId);
      },
      onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
          release(dir, e.pointerId);
        }
      },
    };
  }

  if (!visible) return null;

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
      <style>{`
        [data-pressed="true"] {
          background: rgba(180, 83, 9, 0.75) !important;
          border-color: rgba(255,255,255,0.45) !important;
        }
        [data-ctrl] {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
      `}</style>

      {/* D-pad — bottom-right with safe-area inset */}
      <div
        style={{
          position: "fixed",
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
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div />
        <button
          data-ctrl
          ref={(el) => {
            btnRefs.current.up = el;
          }}
          style={btnBase}
          aria-label="Move up"
          {...makeHandlers("up")}
        >
          ▲
        </button>
        <div />

        <button
          data-ctrl
          ref={(el) => {
            btnRefs.current.left = el;
          }}
          style={btnBase}
          aria-label="Move left"
          {...makeHandlers("left")}
        >
          ◀
        </button>
        <div />
        <button
          data-ctrl
          ref={(el) => {
            btnRefs.current.right = el;
          }}
          style={btnBase}
          aria-label="Move right"
          {...makeHandlers("right")}
        >
          ▶
        </button>

        <div />
        <button
          data-ctrl
          ref={(el) => {
            btnRefs.current.down = el;
          }}
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
