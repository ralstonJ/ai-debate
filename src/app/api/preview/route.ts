import { getElevenLabs, toErrorResponse } from "@/lib/elevenlabs";

const SAMPLE_LINE =
  "I disagree, and I think the evidence points the other way. Let me explain why.";

/** Speak a fixed sample line so a voice can be auditioned before it's assigned to an agent. */
export async function POST(request: Request) {
  try {
    const { voiceId } = (await request.json()) as { voiceId: string };
    if (!voiceId) {
      return Response.json({ message: "voiceId is required." }, { status: 400 });
    }

    const client = getElevenLabs();
    const audio = await client.textToSpeech.convert(voiceId, {
      text: SAMPLE_LINE,
      modelId: "eleven_flash_v2_5",
      outputFormat: "mp3_44100_128",
    });

    return new Response(audio as unknown as ReadableStream, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    return Response.json({ message }, { status });
  }
}
