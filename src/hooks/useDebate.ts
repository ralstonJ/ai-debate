"use client";

import { useCallback, useRef, useState } from "react";
import { planDebate, shouldSkipToClosings } from "@/lib/budget";
import { buildTurnMessage } from "@/lib/prompts";
import { runTurn, TurnAbortedError } from "@/lib/runTurn";
import {
  MODERATOR_ID,
  type Agent,
  type DebateConfig,
  type DebatePlan,
  type DebateStatus,
  type Turn,
} from "@/lib/types";

/** Absolute ceiling so a misbehaving agent can't run forever past the budget. */
const HARD_STOP_MULTIPLIER = 1.6;

const KB_POLL_INTERVAL_MS = 2000;
const KB_POLL_TIMEOUT_MS = 90_000;

interface ProvisionedAgent extends Agent {
  elevenLabsAgentId: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useDebate() {
  const [status, setStatus] = useState<DebateStatus>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [plan, setPlan] = useState<DebatePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provisionNotes, setProvisionNotes] = useState<Record<string, string>>({});

  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);
  const skipRef = useRef(false);
  const interjectionRef = useRef<string | null>(null);
  /** Elapsed speech time. Kept in a ref because the loop reads it between awaits. */
  const elapsedRef = useRef(0);

  const addTurn = useCallback((turn: Turn) => {
    setTurns((previous) => [...previous, turn]);
  }, []);

  /** Queue text spoken by the human. Consumed by the next agent turn. */
  const pushInterjection = useCallback(
    (text: string) => {
      interjectionRef.current = text;
      addTurn({
        id: crypto.randomUUID(),
        speakerId: MODERATOR_ID,
        speakerName: "You",
        phase: "interjection",
        text,
      });
    },
    [addTurn],
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setStatus("speaking");
  }, []);

  const skipTurn = useCallback(() => {
    skipRef.current = true;
    abortRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    pausedRef.current = false;
    abortRef.current?.abort();
    setStatus("finished");
    setCurrentSpeakerId(null);
  }, []);

  /** Create the ElevenLabs agent (and knowledge document) backing each participant. */
  const provision = useCallback(
    async (config: DebateConfig, wordBudget: number): Promise<ProvisionedAgent[]> => {
      const provisioned: ProvisionedAgent[] = [];
      const notes: Record<string, string> = {};

      for (const agent of config.agents) {
        const opponents = config.agents.filter((a) => a.id !== agent.id).map((a) => a.name);

        const response = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: {
              id: agent.id,
              name: agent.name,
              role: agent.role,
              voiceId: agent.voiceId,
              knowledge: agent.knowledge,
            },
            situation: config.situation,
            wordBudget,
            opponents,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message ?? `Could not set up ${agent.name}.`);
        }

        if (data.note) notes[agent.id] = data.note;

        provisioned.push({
          ...agent,
          elevenLabsAgentId: data.elevenLabsAgentId,
          knowledgeDocId: data.knowledgeDocId ?? undefined,
          knowledgeStatus: data.knowledgeStatus,
        });
      }

      setProvisionNotes(notes);
      return provisioned;
    },
    [],
  );

  /**
   * Wait for RAG indexing to finish.
   *
   * Starting a debate against an unindexed knowledge base is the most likely reason
   * an agent mysteriously knows nothing, so this blocks rather than racing it.
   */
  const waitForKnowledge = useCallback(async (agents: ProvisionedAgent[]) => {
    const pending = agents.filter(
      (agent) => agent.knowledgeStatus === "indexing" && agent.knowledgeDocId,
    );
    if (pending.length === 0) return;

    const deadline = Date.now() + KB_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const results = await Promise.all(
        pending.map(async (agent) => {
          const response = await fetch(
            `/api/knowledge/status?documentId=${encodeURIComponent(agent.knowledgeDocId!)}`,
          );
          if (!response.ok) return "error";
          const data = (await response.json()) as { status: string };
          return data.status;
        }),
      );

      if (results.every((s) => s !== "indexing")) return;
      await sleep(KB_POLL_INTERVAL_MS);
    }
    // Timed out: proceed anyway. The agent still has its role and the situation,
    // and blocking the debate entirely would be worse than degraded grounding.
  }, []);

  const start = useCallback(
    async (config: DebateConfig) => {
      setError(null);
      setTurns([]);
      setElapsedSec(0);
      elapsedRef.current = 0;
      pausedRef.current = false;

      const debatePlan = planDebate(config.durationSec, config.agents);
      if (!debatePlan) {
        setError("That many agents doesn't fit the time budget. Remove one or raise the duration.");
        setStatus("error");
        return;
      }
      setPlan(debatePlan);

      let provisioned: ProvisionedAgent[];
      try {
        setStatus("provisioning");
        provisioned = await provision(config, debatePlan.wordBudget);
        await waitForKnowledge(provisioned);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Setup failed.");
        setStatus("error");
        return;
      }

      const byId = new Map(provisioned.map((agent) => [agent.id, agent]));
      const hardStopSec = config.durationSec * HARD_STOP_MULTIPLIER;
      const transcript: Turn[] = [];

      setStatus("speaking");

      let index = 0;
      while (index < debatePlan.order.length) {
        const planned = debatePlan.order[index];

        // Wall-clock guard, evaluated only between turns — clipping audio mid-word
        // sounds broken, so we decide what happens next rather than interrupting.
        if (
          planned.phase === "rebuttal" &&
          shouldSkipToClosings(elapsedRef.current, config.durationSec, config.agents.length)
        ) {
          const firstClosing = debatePlan.order.findIndex((t) => t.phase === "closing");
          index = firstClosing === -1 ? debatePlan.order.length : firstClosing;
          continue;
        }

        // Backstop. Closings are exempt so the debate always lands properly.
        if (planned.phase !== "closing" && elapsedRef.current >= config.durationSec) {
          const firstClosing = debatePlan.order.findIndex((t) => t.phase === "closing");
          index = firstClosing === -1 ? debatePlan.order.length : firstClosing;
          continue;
        }
        if (elapsedRef.current >= hardStopSec) break;

        while (pausedRef.current) {
          await sleep(200);
        }

        const agent = byId.get(planned.speakerId);
        if (!agent) {
          index += 1;
          continue;
        }

        const lastAgentTurn = [...transcript].reverse().find((t) => t.speakerId !== MODERATOR_ID);
        const interjection = interjectionRef.current;
        interjectionRef.current = null;

        const message = buildTurnMessage({
          phase: planned.phase,
          wordBudget: debatePlan.wordBudget,
          transcript,
          lastSpeakerName: lastAgentTurn?.speakerName,
          interjection: interjection ?? undefined,
        });

        const controller = new AbortController();
        abortRef.current = controller;
        skipRef.current = false;
        setCurrentSpeakerId(agent.id);

        try {
          const result = await runTurn({
            elevenLabsAgentId: agent.elevenLabsAgentId,
            message,
            signal: controller.signal,
          });

          if (result.text) {
            const turn: Turn = {
              id: crypto.randomUUID(),
              speakerId: agent.id,
              speakerName: agent.name,
              phase: planned.phase,
              text: result.text,
              durationMs: result.durationMs,
            };
            transcript.push(turn);
            addTurn(turn);
          }

          elapsedRef.current += result.durationMs / 1000;
          setElapsedSec(elapsedRef.current);
        } catch (caught) {
          if (caught instanceof TurnAbortedError) {
            // Skip advances to the next speaker; stop ends the debate.
            if (!skipRef.current) {
              setCurrentSpeakerId(null);
              return;
            }
          } else {
            setError(caught instanceof Error ? caught.message : "A turn failed.");
            setStatus("error");
            setCurrentSpeakerId(null);
            return;
          }
        } finally {
          abortRef.current = null;
        }

        index += 1;
      }

      setCurrentSpeakerId(null);
      setStatus("finished");

      // Throwaway agents would otherwise pile up in the ElevenLabs workspace.
      void fetch("/api/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentIds: provisioned.map((a) => a.elevenLabsAgentId) }),
      }).catch(() => {});
    },
    [addTurn, provision, waitForKnowledge],
  );

  return {
    status,
    turns,
    currentSpeakerId,
    elapsedSec,
    plan,
    error,
    provisionNotes,
    start,
    pause,
    resume,
    skipTurn,
    stop,
    pushInterjection,
    isPaused: () => pausedRef.current,
  };
}
