import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

/**
 * Thrown when the API key is missing, so routes can return a readable message
 * instead of a stack trace or an opaque 500.
 */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ELEVENLABS_API_KEY is not set. Add it to .env.local and restart the dev server. " +
        "Get a key at https://elevenlabs.io → avatar (bottom-left) → API Keys.",
    );
    this.name = "MissingApiKeyError";
  }
}

let cached: ElevenLabsClient | null = null;

/**
 * Server-only ElevenLabs client.
 *
 * The key must never reach the browser — every call goes through a route handler,
 * and the browser talks to agents using a short-lived signed URL instead.
 */
export function getElevenLabs(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();

  if (!cached) {
    cached = new ElevenLabsClient({ apiKey });
  }
  return cached;
}

/** Normalizes any thrown value into `{ message, status }` for a JSON error response. */
export function toErrorResponse(error: unknown): { message: string; status: number } {
  if (error instanceof MissingApiKeyError) {
    return { message: error.message, status: 500 };
  }

  // ElevenLabsError carries a statusCode; surface the real status so the UI can
  // distinguish "bad key" (401) from "out of credits" (401/429) from a genuine bug.
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode: unknown }).statusCode) || 500
      : 500;

  const message =
    error instanceof Error ? error.message : "Unexpected error calling ElevenLabs.";

  return { message, status };
}
