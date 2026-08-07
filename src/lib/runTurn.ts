import { Conversation } from "@elevenlabs/client";

/** Give up on a turn that never produces speech, so one bad session can't stall the debate. */
const TURN_TIMEOUT_MS = 45_000;

/**
 * Agents can pause briefly mid-sentence, which flips mode back to "listening".
 * Wait this long after speech stops before calling the turn done.
 */
const SETTLE_MS = 700;

export interface TurnResult {
  text: string;
  durationMs: number;
}

export class TurnAbortedError extends Error {
  constructor() {
    super("Turn aborted.");
    this.name = "TurnAbortedError";
  }
}

/**
 * Run exactly one debate turn.
 *
 * Opens a fresh voice session for the agent, injects the turn prompt as text, lets the
 * agent speak it aloud, then tears the session down. Sessions are per-turn and
 * sequential: only one is ever open, which keeps us at one concurrent call regardless
 * of agent count and means billed minutes track speech rather than wall-clock.
 *
 * The microphone is muted for the whole session — the agent would otherwise hear its
 * own output and interrupt itself.
 */
export async function runTurn(options: {
  elevenLabsAgentId: string;
  message: string;
  signal?: AbortSignal;
  /** Called as soon as the agent's text arrives, before its audio finishes. */
  onText?: (text: string) => void;
}): Promise<TurnResult> {
  const { elevenLabsAgentId, message, signal, onText } = options;

  if (signal?.aborted) throw new TurnAbortedError();

  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId: elevenLabsAgentId }),
  });

  if (!response.ok) {
    const { message: reason } = await response.json().catch(() => ({ message: "" }));
    throw new Error(reason || "Could not start a session for this agent.");
  }

  const { signedUrl } = (await response.json()) as { signedUrl: string };

  let conversation: Awaited<ReturnType<typeof Conversation.startSession>> | null = null;
  let spokenText = "";
  let hasStartedSpeaking = false;
  let speechStartedAt = 0;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  return new Promise<TurnResult>((resolve, reject) => {
    const cleanup = () => {
      if (settleTimer) clearTimeout(settleTimer);
      clearTimeout(timeoutTimer);
      signal?.removeEventListener("abort", onAbort);
      void conversation?.endSession().catch(() => {
        // Session teardown races with the server closing it; nothing useful to do.
      });
    };

    const finish = () => {
      cleanup();
      resolve({
        text: spokenText.trim(),
        durationMs: speechStartedAt ? Date.now() - speechStartedAt : 0,
      });
    };

    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onAbort = () => fail(new TurnAbortedError());
    signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutTimer = setTimeout(() => {
      // Partial speech is still usable — keep whatever we got rather than losing the turn.
      if (spokenText.trim()) finish();
      else fail(new Error("The agent didn't respond in time."));
    }, TURN_TIMEOUT_MS);

    Conversation.startSession({
      signedUrl,
      // false = voice conversation: we send text in and get audio back in the
      // agent's own voice. textOnly would give us the text but no speech.
      textOnly: false,
      onConnect: () => {
        // Mute before anything is sent; an open mic makes the agent interrupt itself.
        conversation?.setMicMuted(true);
        conversation?.sendUserMessage(message);
      },
      onMessage: ({ message: text, role }) => {
        if (role !== "agent") return;
        spokenText = spokenText ? `${spokenText} ${text}` : text;
        onText?.(spokenText);
      },
      onModeChange: ({ mode }) => {
        if (mode === "speaking") {
          if (!hasStartedSpeaking) {
            hasStartedSpeaking = true;
            speechStartedAt = Date.now();
          }
          if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
          }
          return;
        }

        // Back to listening. If the agent has already spoken, the turn is over —
        // but wait out a brief pause in case it's only drawing breath.
        if (hasStartedSpeaking && !settleTimer) {
          settleTimer = setTimeout(finish, SETTLE_MS);
        }
      },
      onDisconnect: () => {
        if (hasStartedSpeaking) finish();
        else fail(new Error("The agent disconnected before speaking."));
      },
      onError: (errorMessage) => fail(new Error(errorMessage)),
    })
      .then((session) => {
        conversation = session;
        if (signal?.aborted) onAbort();
      })
      .catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error("Could not connect to the agent."));
      });
  });
}
