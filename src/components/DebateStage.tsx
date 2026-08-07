"use client";

import { useEffect, useRef } from "react";
import { MODERATOR_ID, type Agent, type Turn } from "@/lib/types";

const PHASE_LABEL: Record<Turn["phase"], string> = {
  opening: "Opening",
  rebuttal: "Rebuttal",
  closing: "Closing",
  interjection: "You",
};

export function DebateStage({
  turns,
  agents,
  currentSpeakerId,
  elapsedSec,
  durationSec,
}: {
  turns: Turn[];
  agents: Agent[];
  currentSpeakerId: string | null;
  elapsedSec: number;
  durationSec: number;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, currentSpeakerId]);

  const speaking = agents.find((agent) => agent.id === currentSpeakerId);
  const progress = Math.min(100, (elapsedSec / durationSec) * 100);

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="opacity-60">
            {speaking ? `${speaking.name} is speaking…` : "Debate floor"}
          </span>
          <span className="font-mono opacity-60">
            {elapsedSec.toFixed(0)}s / {durationSec}s
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
          <div
            className="h-full rounded-full bg-current transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {turns.length === 0 && (
          <p className="text-sm opacity-50">The debate will appear here as it happens.</p>
        )}

        {turns.map((turn) => {
          const isModerator = turn.speakerId === MODERATOR_ID;
          return (
            <div
              key={turn.id}
              className={`rounded-lg border p-3 ${
                isModerator
                  ? "border-blue-500/40 bg-blue-500/5"
                  : "border-black/10 dark:border-white/15"
              }`}
            >
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-sm font-semibold">{turn.speakerName}</span>
                <span className="text-[11px] uppercase tracking-wide opacity-50">
                  {PHASE_LABEL[turn.phase]}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{turn.text}</p>
            </div>
          );
        })}

        {speaking && (
          <div className="rounded-lg border border-dashed border-black/20 p-3 dark:border-white/25">
            <span className="text-sm font-semibold">{speaking.name}</span>
            <p className="mt-1 text-sm opacity-50">Speaking…</p>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
