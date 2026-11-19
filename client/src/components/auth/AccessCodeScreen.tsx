"use client";

import { useState } from "react";
import type { CharacterConfig } from "@/config/characters";

interface AccessCodeScreenProps {
  onSuccess: (character: CharacterConfig, code: string, assignedTo: string) => void;
  initialCode?: string;
}

export default function AccessCodeScreen({
  onSuccess,
  initialCode = "",
}: AccessCodeScreenProps) {
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When validated, hold the validated character data to display preview before entering
  const [validatedData, setValidatedData] = useState<{
    character: CharacterConfig;
    code: string;
    assignedTo: string;
  } | null>(null);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError("Please enter your access code.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode }),
      });

      const data = await res.json();

      if (!res.ok || !data.valid) {
        setError(data.message || "Invalid access code. Please try again.");
        setLoading(false);
        return;
      }

      // Validated! Show character preview
      setValidatedData({
        character: data.character,
        code: data.code,
        assignedTo: data.assignedTo,
      });
    } catch (err) {
      console.error(err);
      setError("Network error validating code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmEnter() {
    if (validatedData) {
      onSuccess(
        validatedData.character,
        validatedData.code,
        validatedData.assignedTo
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md px-4 select-none">
      {/* Background ambient decorative glow */}
      <div className="absolute w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm rounded-2xl bg-neutral-950/95 border border-amber-500/25 p-6 shadow-2xl shadow-amber-950/30 text-white font-sans">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-2xl mb-3 shadow-inner">
            🎪
          </div>
          <h1 className="text-xl font-bold tracking-wide text-amber-100">
            Virtual Ramlila Ground
          </h1>
          <p className="text-xs text-amber-200/60 mt-1">
            Enter your personal code to unlock your character
          </p>
        </div>

        {!validatedData ? (
          /* Step 1: Code Input Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="access-code"
                className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5"
              >
                Access Code
              </label>
              <div className="relative">
                <input
                  id="access-code"
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  placeholder="e.g. GROUND-01"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-center text-lg font-mono font-bold tracking-widest text-amber-300 placeholder:text-neutral-600 outline-none transition-all"
                />
              </div>

              {error && (
                <p className="mt-2 text-xs text-red-400 font-medium text-center">
                  ⚠ {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm tracking-wide bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-[0.98] text-black shadow-lg shadow-amber-600/20 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/80 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Unlock Character →</span>
              )}
            </button>

            <div className="pt-2 text-center">
              <span className="text-[10px] text-neutral-500 font-mono">
                Starter codes: GROUND-01 • GROUND-02
              </span>
            </div>
          </form>
        ) : (
          /* Step 2: Assigned Character Preview */
          <div className="space-y-5 animate-fade-in text-center">
            <div className="p-4 rounded-xl bg-neutral-900/80 border border-amber-500/20 flex flex-col items-center">
              {/* Character sprite preview */}
              <div className="relative w-20 h-24 mb-3 flex items-center justify-center bg-black/60 rounded-xl border border-neutral-800 shadow-inner overflow-hidden">
                <div
                  style={{
                    width: 72,
                    height: 96,
                    backgroundImage: `url(${validatedData.character.spriteUrl})`,
                    backgroundPosition: "0px 0px",
                    backgroundSize: "432px 384px", // 2x scaled preview
                    imageRendering: "pixelated",
                  }}
                  title={validatedData.character.name}
                />
              </div>

              <div className="inline-block px-2.5 py-0.5 mb-1.5 rounded-full text-[10px] font-mono font-medium tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Assigned: {validatedData.assignedTo}
              </div>

              <h2 className="text-lg font-bold text-white">
                {validatedData.character.name}
              </h2>
              <p className="text-xs text-amber-200/70 mt-0.5">
                {validatedData.character.description}
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleConfirmEnter}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm tracking-wide bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-[0.98] text-black shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Enter Ramlila Ground ➔
              </button>

              <button
                type="button"
                onClick={() => setValidatedData(null)}
                className="text-xs text-neutral-400 hover:text-white transition-colors py-1"
              >
                Use another code
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
