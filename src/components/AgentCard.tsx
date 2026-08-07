"use client";

import { VoicePicker } from "./VoicePicker";
import type { Agent } from "@/lib/types";

/** Past this, RAG is doing real work and the prompt would be enormous. Advisory only. */
const KNOWLEDGE_WARN_CHARS = 40_000;

export function AgentCard({
  agent,
  index,
  takenVoiceIds,
  canRemove,
  note,
  onChange,
  onRemove,
}: {
  agent: Agent;
  index: number;
  takenVoiceIds: string[];
  canRemove: boolean;
  note?: string;
  onChange: (patch: Partial<Agent>) => void;
  onRemove: () => void;
}) {
  const knowledgeChars = agent.knowledge.length;

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide opacity-60">
          Agent {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs opacity-60 underline hover:opacity-100"
          >
            Remove
          </button>
        )}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input
            value={agent.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Priya, Head of Risk"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Role and position</span>
          <textarea
            value={agent.role}
            onChange={(event) => onChange({ role: event.target.value })}
            rows={3}
            placeholder="You think the rollout is far too risky. You care about downside protection above all else."
            className="w-full resize-y rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          />
        </label>

        <div>
          <span className="mb-1 block text-sm font-medium">Voice</span>
          <VoicePicker
            value={agent.voiceId}
            onChange={(voiceId) => onChange({ voiceId })}
            takenVoiceIds={takenVoiceIds}
          />
        </div>

        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-sm font-medium">
            <span>Knowledge base</span>
            <span
              className={`text-xs font-normal ${
                knowledgeChars > KNOWLEDGE_WARN_CHARS ? "text-amber-600" : "opacity-50"
              }`}
            >
              {knowledgeChars.toLocaleString()} chars
              {knowledgeChars > KNOWLEDGE_WARN_CHARS ? " — consider trimming" : ""}
            </span>
          </span>
          <textarea
            value={agent.knowledge}
            onChange={(event) => onChange({ knowledge: event.target.value })}
            rows={5}
            placeholder="Paste facts, figures, and background only this agent should know. Leave empty to have it argue from the situation alone."
            className="w-full resize-y rounded-md border border-black/15 bg-transparent px-3 py-2 font-mono text-xs dark:border-white/20"
          />
        </label>

        {note && (
          <p className="rounded-md bg-black/5 px-3 py-2 text-xs opacity-80 dark:bg-white/10">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
