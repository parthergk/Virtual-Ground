"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AccessCodeScreen from "@/components/auth/AccessCodeScreen";
import type { CharacterConfig } from "@/config/characters";

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

const STORAGE_KEY = "vg_access_code";

export default function Home() {
  const [authStatus, setAuthStatus] = useState<
    "checking" | "unauthenticated" | "authenticated"
  >("checking");
  const [activeCharacter, setActiveCharacter] = useState<CharacterConfig | null>(
    null
  );
  const [userCode, setUserCode] = useState<string>("");

  useEffect(() => {
    const checkSavedCode = async () => {
      try {
        const savedCode = localStorage.getItem(STORAGE_KEY);
        if (!savedCode) {
          setAuthStatus("unauthenticated");
          return;
        }

        const res = await fetch("/api/auth/validate-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: savedCode }),
        });

        const data = await res.json();
        if (res.ok && data.valid && data.character) {
          setUserCode(data.code || savedCode);
          setActiveCharacter(data.character);
          setAuthStatus("authenticated");
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setAuthStatus("unauthenticated");
        }
      } catch (err) {
        console.error("Failed to check saved code:", err);
        setAuthStatus("unauthenticated");
      }
    };

    checkSavedCode();
  }, []);

  const handleAuthSuccess = (
    character: CharacterConfig,
    code: string,
    _assignedTo: string
  ) => {
    localStorage.setItem(STORAGE_KEY, code);
    setUserCode(code);
    setActiveCharacter(character);
    setAuthStatus("authenticated");
  };

  const handleExitToGate = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUserCode("");
    setActiveCharacter(null);
    setAuthStatus("unauthenticated");
  };

  return (
    <main className="fixed inset-0 w-full h-full bg-black overflow-hidden select-none">
      {authStatus === "checking" && (
        <div className="flex flex-col items-center justify-center w-full h-full text-white space-y-3 bg-black">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium tracking-wide text-amber-200/80 font-mono">
            Verifying access...
          </p>
        </div>
      )}

      {authStatus === "unauthenticated" && (
        <AccessCodeScreen onSuccess={handleAuthSuccess} />
      )}

      {authStatus === "authenticated" && activeCharacter && (
        <GameContainer
          key={activeCharacter.id}
          activeCharacter={activeCharacter}
          userCode={userCode}
          onExitToGate={handleExitToGate}
        />
      )}
    </main>
  );
}
