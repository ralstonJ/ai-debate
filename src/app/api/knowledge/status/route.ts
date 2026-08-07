import { NextResponse } from "next/server";
import { getElevenLabs, toErrorResponse } from "@/lib/elevenlabs";
import type { KnowledgeStatus } from "@/lib/types";

const EMBEDDING_MODEL = "multilingual_e5_large_instruct";

const NOT_INDEXABLE = new Set(["document_too_small", "cannot_index_folder", "rag_limit_exceeded"]);

function toKnowledgeStatus(ragStatus: string): KnowledgeStatus {
  if (ragStatus === "succeeded") return "indexed";
  if (ragStatus === "failed") return "error";
  if (NOT_INDEXABLE.has(ragStatus)) return "promptMode";
  return "indexing";
}

/**
 * Poll RAG indexing progress for a document.
 *
 * `computeRagIndex` is idempotent for a given (document, model) pair — calling it
 * again returns the current state rather than starting a second index job, so it
 * doubles as the poll endpoint.
 */
export async function GET(request: Request) {
  try {
    const documentId = new URL(request.url).searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json({ message: "documentId is required." }, { status: 400 });
    }

    const client = getElevenLabs();
    const index = await client.conversationalAi.knowledgeBase.document.computeRagIndex(
      documentId,
      { model: EMBEDDING_MODEL },
    );

    return NextResponse.json({
      status: toKnowledgeStatus(index.status),
      rawStatus: index.status,
      progress: index.progressPercentage ?? 0,
    });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
