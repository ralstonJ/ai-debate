import type { Agent, DebatePhase, Turn } from "./types";

/** How many prior turns to replay to an agent. Sessions are per-turn, so this is its memory. */
export const TRANSCRIPT_WINDOW = 6;

/**
 * Everything the agent's voice output must obey.
 *
 * This text goes straight to text-to-speech, so anything that isn't speakable —
 * markdown, asterisks, headings, emoji, stage directions — gets read aloud or
 * mangled. These rules are load-bearing, not stylistic.
 */
function speechRules(wordBudget: number): string {
  return [
    "HOW YOU SPEAK:",
    `- Stay under ${wordBudget} words. This is a hard limit. Make one point and stop talking.`,
    "- You are speaking out loud. Write only words a person would say.",
    "- Never use markdown, asterisks, bullet points, headings, numbered lists, or emoji.",
    "- Never write stage directions or narration such as *leans forward* or (pauses).",
    "- Do not announce yourself, restate the question, or summarize what was already said.",
    "- Open with your point. No preamble.",
  ].join("\n");
}

/**
 * The agent's persistent system prompt, set once when the ElevenLabs agent is created.
 *
 * The word budget is baked in here because it's fixed for a given debate configuration
 * (it derives from agent count and duration, both known at provisioning time).
 */
export function buildSystemPrompt(
  agent: Agent,
  situation: string,
  wordBudget: number,
  opponents: string[],
): string {
  const others =
    opponents.length > 0
      ? `You are debating against: ${opponents.join(", ")}. Address them by name.`
      : "";

  return [
    `You are ${agent.name}, taking part in a live spoken debate.`,
    "",
    "YOUR ROLE AND POSITION:",
    agent.role.trim() || "Argue your honest view of the situation.",
    "",
    "THE SITUATION BEING DEBATED:",
    situation.trim(),
    "",
    others,
    "",
    "USING WHAT YOU KNOW:",
    "- Ground your arguments in your knowledge base wherever it is relevant.",
    "- If your knowledge base does not cover something, say so plainly rather than inventing specifics.",
    "- Never invent statistics, dates, names, or quotations.",
    "",
    speechRules(wordBudget),
    "",
    "Stay in character for the entire debate. You are this person, not an assistant playing them.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Phase-specific instruction for a single turn. */
function phaseInstruction(phase: DebatePhase, lastSpeakerName?: string): string {
  switch (phase) {
    case "opening":
      return "Give your opening statement. State your position and the single strongest reason for it.";
    case "rebuttal":
      return lastSpeakerName
        ? `Rebut ${lastSpeakerName} directly. Name them, quote or paraphrase the specific claim you are attacking, and say why it is wrong.`
        : "Rebut the strongest argument made so far. Name who made it and say why it is wrong.";
    case "closing":
      return "Give your closing statement. Land your strongest point one final time. Do not introduce new arguments.";
  }
}

function renderTranscript(turns: Turn[]): string {
  if (turns.length === 0) return "";

  const recent = turns.slice(-TRANSCRIPT_WINDOW);
  const lines = recent.map((turn) => `${turn.speakerName}: ${turn.text}`);

  return ["WHAT HAS BEEN SAID SO FAR:", ...lines].join("\n");
}

/**
 * The per-turn message sent to the agent.
 *
 * Each turn runs in a fresh session (see useDebate), so the agent has no memory of
 * its own earlier turns. The transcript window is what gives it continuity.
 */
export function buildTurnMessage(options: {
  phase: DebatePhase;
  wordBudget: number;
  transcript: Turn[];
  lastSpeakerName?: string;
  /** Text the human spoke since the last agent turn, if any. */
  interjection?: string;
}): string {
  const { phase, wordBudget, transcript, lastSpeakerName, interjection } = options;

  const parts = [renderTranscript(transcript)];

  // The human's question outranks the normal phase instruction — if someone asks
  // the panel something directly and gets ignored, the feature is useless.
  if (interjection) {
    parts.push(
      [
        "THE MODERATOR JUST INTERRUPTED AND SAID:",
        `"${interjection}"`,
        "Answer the moderator directly and specifically before you do anything else.",
      ].join("\n"),
    );
  }

  parts.push(`YOUR TURN NOW: ${phaseInstruction(phase, lastSpeakerName)}`);
  parts.push(`Remember: under ${wordBudget} words, plain spoken words only.`);

  return parts.filter(Boolean).join("\n\n");
}
