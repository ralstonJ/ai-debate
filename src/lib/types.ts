/** Where a knowledge document ends up: inlined in the system prompt, or RAG-retrieved. */
export type UsageMode = "prompt" | "auto";

/**
 * Lifecycle of an agent's knowledge base.
 *
 * `promptMode` is not a failure. ElevenLabs refuses to RAG-index documents below a
 * minimum size (`document_too_small`), so short pasted knowledge falls back to being
 * inlined in the system prompt — which is better grounding at that size anyway.
 */
export type KnowledgeStatus =
  | "empty"
  | "creating"
  | "indexing"
  | "indexed"
  | "promptMode"
  | "error";

export type DebatePhase = "opening" | "rebuttal" | "closing";

/** A debate participant, as configured in the UI and mirrored onto ElevenLabs. */
export interface Agent {
  /** Local id, stable across edits. Not the ElevenLabs agent id. */
  id: string;
  name: string;
  /** Stance and personality. Becomes the bulk of the system prompt. */
  role: string;
  voiceId: string;
  /** Pasted text. Empty is allowed — the agent then argues from the situation alone. */
  knowledge: string;

  // Populated during provisioning.
  elevenLabsAgentId?: string;
  knowledgeDocId?: string;
  knowledgeStatus: KnowledgeStatus;
  knowledgeError?: string;
}

/** One spoken contribution. `speakerId` is an Agent.id, or MODERATOR_ID for the human. */
export interface Turn {
  id: string;
  speakerId: string;
  speakerName: string;
  phase: DebatePhase | "interjection";
  text: string;
  /** Measured playback duration, used by the wall-clock guard. */
  durationMs?: number;
}

export const MODERATOR_ID = "moderator";

/** A single scheduled slot in the debate running order. */
export interface PlannedTurn {
  speakerId: string;
  phase: DebatePhase;
}

/** Output of the time-budget planner. */
export interface DebatePlan {
  /** Rebuttal rounds that fit the budget. May be 0. */
  rounds: number;
  totalTurns: number;
  /** Words each agent is told to stay within, derived from the time budget. */
  wordBudget: number;
  order: PlannedTurn[];
}

export interface DebateConfig {
  situation: string;
  durationSec: number;
  agents: Agent[];
}

export type DebateStatus =
  | "idle"
  | "provisioning"
  | "connecting"
  | "speaking"
  | "listening"
  | "paused"
  | "finished"
  | "error";
