import type { Agent, DebatePlan, PlannedTurn } from "./types";

/** Conversational speech, roughly. 150 wpm. */
export const WORDS_PER_SECOND = 2.5;

/** Below this a "turn" stops being an argument and becomes a fragment. */
export const MIN_WORDS_PER_TURN = 15;

/** Seconds reserved per agent so closing statements always fit. */
export const CLOSING_SECONDS_PER_AGENT = 5;

export const DEFAULT_DURATION_SEC = 60;

/** Rebuttal-round counts to try, richest first. */
const CANDIDATE_ROUNDS = [2, 1, 0];

/**
 * Fit a debate into a wall-clock budget.
 *
 * The whole debate — every turn from every agent — has to land inside `durationSec`.
 * We spend that budget on as many rebuttal rounds as we can while keeping each turn
 * long enough to carry an actual point, and return the per-turn word budget that the
 * agents are instructed to respect.
 *
 * Returns null when even zero rebuttal rounds can't clear MIN_WORDS_PER_TURN — the
 * caller should block Start and tell the user to drop an agent or raise the duration.
 */
export function planDebate(
  durationSec: number,
  agents: Pick<Agent, "id">[],
): DebatePlan | null {
  const agentCount = agents.length;
  if (agentCount < 2) return null;

  const totalWords = durationSec * WORDS_PER_SECOND;

  for (const rounds of CANDIDATE_ROUNDS) {
    // Every agent gets an opening and a closing, plus one turn per rebuttal round.
    const totalTurns = agentCount * (2 + rounds);
    const wordBudget = Math.floor(totalWords / totalTurns);

    if (wordBudget >= MIN_WORDS_PER_TURN) {
      return {
        rounds,
        totalTurns,
        wordBudget,
        order: buildTurnOrder(agents, rounds),
      };
    }
  }

  return null;
}

/** Round-robin running order: all openings, then each rebuttal round, then all closings. */
export function buildTurnOrder(
  agents: Pick<Agent, "id">[],
  rounds: number,
): PlannedTurn[] {
  const order: PlannedTurn[] = [];

  for (const agent of agents) {
    order.push({ speakerId: agent.id, phase: "opening" });
  }

  for (let round = 0; round < rounds; round++) {
    for (const agent of agents) {
      order.push({ speakerId: agent.id, phase: "rebuttal" });
    }
  }

  for (const agent of agents) {
    order.push({ speakerId: agent.id, phase: "closing" });
  }

  return order;
}

/**
 * Seconds that must stay in reserve so every agent still gets a closing statement.
 * Once elapsed time crosses `durationSec - reserve`, the loop skips remaining
 * rebuttals and jumps to closings rather than being cut off mid-argument.
 */
export function closingReserveSec(agentCount: number): number {
  return agentCount * CLOSING_SECONDS_PER_AGENT;
}

/**
 * Decide what happens after the turn that just finished.
 *
 * Called at turn boundaries only — we never interrupt audio mid-word, since a
 * clipped sentence sounds broken. The hard stop is the caller's backstop.
 */
export function shouldSkipToClosings(
  elapsedSec: number,
  durationSec: number,
  agentCount: number,
): boolean {
  return elapsedSec >= durationSec - closingReserveSec(agentCount);
}

/** Human-readable summary for the setup screen, e.g. "3 agents · 1 rebuttal round · ~17 words each". */
export function describePlan(plan: DebatePlan | null, agentCount: number): string {
  if (!plan) {
    return `${agentCount} agents doesn't fit the time budget — remove an agent or raise the duration.`;
  }

  const roundLabel =
    plan.rounds === 0
      ? "no rebuttals"
      : `${plan.rounds} rebuttal round${plan.rounds === 1 ? "" : "s"}`;

  return `${agentCount} agents · ${roundLabel} · ${plan.totalTurns} turns · ~${plan.wordBudget} words each`;
}
