"use client";

import { useMemo, useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { DebateStage } from "@/components/DebateStage";
import { PushToTalk } from "@/components/PushToTalk";
import { DEFAULT_DURATION_SEC, describePlan, planDebate } from "@/lib/budget";
import { useDebate } from "@/hooks/useDebate";
import type { Agent } from "@/lib/types";

const MAX_AGENTS = 5;

function newAgent(): Agent {
  return {
    id: crypto.randomUUID(),
    name: "",
    role: "",
    voiceId: "",
    knowledge: "",
    knowledgeStatus: "empty",
  };
}

export default function Home() {
  const [situation, setSituation] = useState("");
  const [durationSec, setDurationSec] = useState(DEFAULT_DURATION_SEC);
  const [agents, setAgents] = useState<Agent[]>(() => [newAgent(), newAgent()]);

  const debate = useDebate();
  const running =
    debate.status === "provisioning" ||
    debate.status === "speaking" ||
    debate.status === "paused";

  const plan = useMemo(() => planDebate(durationSec, agents), [durationSec, agents]);

  const missing = useMemo(() => {
    if (!situation.trim()) return "Describe the situation to debate.";
    if (agents.length < 2) return "Add at least two agents.";
    if (agents.some((agent) => !agent.name.trim())) return "Every agent needs a name.";
    if (agents.some((agent) => !agent.voiceId)) return "Every agent needs a voice.";
    if (!plan) return describePlan(null, agents.length);
    return null;
  }, [situation, agents, plan]);

  const updateAgent = (id: string, patch: Partial<Agent>) =>
    setAgents((current) =>
      current.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)),
    );

  const takenVoiceIds = agents.map((agent) => agent.voiceId).filter(Boolean);

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Setup */}
      <section className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">Voice Debate</h1>
          <p className="mt-1 text-sm opacity-70">
            Give a situation, cast two or more agents with their own voice, role, and knowledge,
            then let them argue it out. Hold the talk button to interrupt.
          </p>
        </header>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">The situation</span>
          <textarea
            value={situation}
            onChange={(event) => setSituation(event.target.value)}
            rows={3}
            disabled={running}
            placeholder="Should we ship the payments rewrite before the holiday freeze?"
            className="w-full resize-y rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm disabled:opacity-60 dark:border-white/20"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Total debate length: {durationSec}s
          </span>
          <input
            type="range"
            min={30}
            max={180}
            step={15}
            value={durationSec}
            disabled={running}
            onChange={(event) => setDurationSec(Number(event.target.value))}
            className="w-full"
          />
        </label>

        <div
          className={`rounded-md px-3 py-2 text-xs ${
            plan
              ? "bg-black/5 opacity-80 dark:bg-white/10"
              : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
          }`}
        >
          {describePlan(plan, agents.length)}
        </div>

        <div className="space-y-4">
          {agents.map((agent, index) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              index={index}
              canRemove={agents.length > 2 && !running}
              takenVoiceIds={takenVoiceIds}
              note={debate.provisionNotes[agent.id]}
              onChange={(patch) => updateAgent(agent.id, patch)}
              onRemove={() =>
                setAgents((current) => current.filter((candidate) => candidate.id !== agent.id))
              }
            />
          ))}
        </div>

        {agents.length < MAX_AGENTS && !running && (
          <button
            type="button"
            onClick={() => setAgents((current) => [...current, newAgent()])}
            className="w-full rounded-md border border-dashed border-black/25 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
          >
            Add agent
          </button>
        )}
      </section>

      {/* Stage */}
      <section className="flex min-h-[70vh] flex-col gap-4 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
        <div className="flex-1 overflow-hidden rounded-lg border border-black/10 p-4 dark:border-white/15">
          <DebateStage
            turns={debate.turns}
            agents={agents}
            currentSpeakerId={debate.currentSpeakerId}
            elapsedSec={debate.elapsedSec}
            durationSec={durationSec}
          />
        </div>

        {debate.error && (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {debate.error}
          </p>
        )}

        {debate.status === "provisioning" && (
          <p className="text-sm opacity-70">
            Setting up agents and indexing knowledge bases…
          </p>
        )}

        <div className="space-y-3">
          {!running ? (
            <>
              <button
                type="button"
                disabled={Boolean(missing)}
                onClick={() => debate.start({ situation, durationSec, agents })}
                className="w-full rounded-md bg-foreground px-4 py-3 text-sm font-medium text-background disabled:opacity-40"
              >
                {debate.status === "finished" ? "Run again" : "Start debate"}
              </button>
              {missing && <p className="text-center text-xs opacity-60">{missing}</p>}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={debate.status === "paused" ? debate.resume : debate.pause}
                className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
              >
                {debate.status === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={debate.skipTurn}
                className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
              >
                Skip turn
              </button>
              <button
                type="button"
                onClick={debate.stop}
                className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
              >
                Stop
              </button>
            </div>
          )}

          <PushToTalk
            disabled={!running}
            onHoldStart={debate.pause}
            onHoldEnd={debate.resume}
            onTranscript={debate.pushInterjection}
          />
        </div>
      </section>
    </main>
  );
}
