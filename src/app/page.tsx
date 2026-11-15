"use client";

import dynamic from "next/dynamic";

// Dynamically import GameContainer with SSR disabled.
// Phaser requires browser APIs (window, document, canvas) and must not run on the server.
const GameContainer = dynamic(
  () => import("@/components/game/GameContainer"),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="fixed inset-0 w-screen h-screen h-dvh bg-black overflow-hidden select-none">
      <GameContainer />
    </main>
  );
}
