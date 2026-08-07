import { NextResponse } from "next/server";
import { getElevenLabs, toErrorResponse } from "@/lib/elevenlabs";

export interface VoiceOption {
  voiceId: string;
  name: string;
  description?: string;
}

// The default voice catalogue doesn't change between requests; cache it per server process.
let cache: VoiceOption[] | null = null;

export async function GET() {
  try {
    if (!cache) {
      const client = getElevenLabs();
      const result = await client.voices.search({
        voiceType: "default",
        pageSize: 100,
      });

      cache = (result.voices ?? []).map((voice) => ({
        voiceId: voice.voiceId,
        name: voice.name ?? "Unnamed voice",
        // labels is a loose record; join whatever descriptors exist for the picker subtitle.
        description: Object.values(voice.labels ?? {})
          .filter(Boolean)
          .join(" · "),
      }));
    }

    return NextResponse.json({ voices: cache });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
