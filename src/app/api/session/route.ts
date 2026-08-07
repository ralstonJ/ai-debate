import { NextResponse } from "next/server";
import { getElevenLabs, toErrorResponse } from "@/lib/elevenlabs";

/**
 * Mint a short-lived signed URL so the browser can open a conversation WebSocket
 * without ever holding the API key.
 */
export async function POST(request: Request) {
  try {
    const { agentId } = (await request.json()) as { agentId: string };
    if (!agentId) {
      return NextResponse.json({ message: "agentId is required." }, { status: 400 });
    }

    const client = getElevenLabs();
    const { signedUrl } = await client.conversationalAi.conversations.getSignedUrl({ agentId });

    return NextResponse.json({ signedUrl });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
