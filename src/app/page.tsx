"use client";

import dynamic from "next/dynamic";

// Dynamically import GameContainer with SSR disabled.
// Phaser requires browser APIs (window, document, canvas) and must not run on the server.
const GameContainer = dynamic(
  () => import("@/components/game/GameContainer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center w-full h-full text-white space-y-3">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium tracking-wide text-amber-200/80 font-mono">
          Loading Virtual Ground...
        </p>
      </div>
    ),
  }
);

export default function Home() {
  return (
    <main className="fixed inset-0 w-full h-full bg-black overflow-hidden select-none">
      <GameContainer />
    </main>
  );
}
