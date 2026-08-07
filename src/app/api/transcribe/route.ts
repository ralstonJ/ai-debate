import { NextResponse } from "next/server";
import { getElevenLabs, toErrorResponse } from "@/lib/elevenlabs";

/** Transcribe a push-to-talk recording so the human turn can enter the transcript as text. */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ message: "No audio received." }, { status: 400 });
    }

    const client = getElevenLabs();
    const result = await client.speechToText.convert({
      file: audio,
      modelId: "scribe_v2",
    });

    // Multichannel responses carry per-channel transcripts; push-to-talk is always
    // single channel, so fall back to an empty string rather than assuming a shape.
    const text = "text" in result && typeof result.text === "string" ? result.text.trim() : "";

    if (!text) {
      return NextResponse.json({ message: "Didn't catch that — try again." }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
