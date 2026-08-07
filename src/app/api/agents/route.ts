import { NextResponse } from "next/server";
import { getElevenLabs, toErrorResponse } from "@/lib/elevenlabs";
import { buildSystemPrompt } from "@/lib/prompts";
import type { Agent, KnowledgeStatus, UsageMode } from "@/lib/types";

/** Agent LLM. Sonnet 5 is fast enough for turn-taking and holds character well. */
const AGENT_LLM = "claude-sonnet-5";

/**
 * Low-latency TTS model — turn-taking latency matters more here than maximum fidelity.
 *
 * Must be a v2 model: the agents API rejects English agents using v2.5
 * ("English Agents must use turbo or flash v2"). eleven_flash_v2_5 is the
 * multilingual variant and is only valid once the agent language is non-English.
 */
const TTS_MODEL = "eleven_flash_v2";

const EMBEDDING_MODEL = "multilingual_e5_large_instruct";

/** RAG index states that mean "give up on RAG and inline the text instead". */
const NOT_INDEXABLE = new Set(["document_too_small", "cannot_index_folder", "rag_limit_exceeded"]);

interface ProvisionRequest {
  agent: Pick<Agent, "id" | "name" | "role" | "voiceId" | "knowledge">;
  situation: string;
  wordBudget: number;
  opponents: string[];
}

interface KnowledgeResult {
  documentId?: string;
  documentName?: string;
  usageMode: UsageMode;
  ragEnabled: boolean;
  status: KnowledgeStatus;
  note?: string;
}

/**
 * Create the knowledge document and try to RAG-index it.
 *
 * ElevenLabs refuses to index documents below a minimum size (`document_too_small`).
 * That isn't an error worth failing on — short knowledge is better inlined in the
 * system prompt anyway, so we fall back to usageMode "prompt" and say so in the UI.
 */
async function provisionKnowledge(
  client: ReturnType<typeof getElevenLabs>,
  agent: ProvisionRequest["agent"],
): Promise<KnowledgeResult> {
  const text = agent.knowledge.trim();

  if (!text) {
    return { usageMode: "prompt", ragEnabled: false, status: "empty" };
  }

  const documentName = `${agent.name || "agent"}-kb-${agent.id.slice(0, 8)}`;
  const document = await client.conversationalAi.knowledgeBase.documents.createFromText({
    text,
    name: documentName,
  });

  try {
    const index = await client.conversationalAi.knowledgeBase.document.computeRagIndex(
      document.id,
      { model: EMBEDDING_MODEL },
    );

    if (NOT_INDEXABLE.has(index.status)) {
      return {
        documentId: document.id,
        documentName,
        usageMode: "prompt",
        ragEnabled: false,
        status: "promptMode",
        note:
          index.status === "document_too_small"
            ? "Knowledge is short, so it's inlined in the prompt instead of RAG — better grounding at this size."
            : `RAG unavailable (${index.status}); inlined in the prompt instead.`,
      };
    }

    return {
      documentId: document.id,
      documentName,
      usageMode: "auto",
      ragEnabled: true,
      status: index.status === "succeeded" ? "indexed" : "indexing",
    };
  } catch {
    // Indexing is an optimization, not a requirement. If it fails outright the agent
    // still works with the document inlined — degrade instead of blocking the debate.
    return {
      documentId: document.id,
      documentName,
      usageMode: "prompt",
      ragEnabled: false,
      status: "promptMode",
      note: "Could not start RAG indexing; inlined in the prompt instead.",
    };
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ProvisionRequest;
    const { agent, situation, wordBudget, opponents } = body;

    if (!agent?.voiceId) {
      return NextResponse.json({ message: "Agent is missing a voice." }, { status: 400 });
    }

    const client = getElevenLabs();
    const knowledge = await provisionKnowledge(client, agent);

    const created = await client.conversationalAi.agents.create({
      name: `debate-${agent.name || "agent"}-${agent.id.slice(0, 8)}`,
      conversationConfig: {
        agent: {
          // Empty: the debate is driven entirely by sendMessage, so the agent must
          // not open with a greeting when a session connects.
          firstMessage: "",
          prompt: {
            prompt: buildSystemPrompt(agent as Agent, situation, wordBudget, opponents),
            llm: AGENT_LLM,
            rag: knowledge.ragEnabled
              ? { enabled: true, embeddingModel: EMBEDDING_MODEL }
              : { enabled: false },
            knowledgeBase: knowledge.documentId
              ? [
                  {
                    type: "text",
                    id: knowledge.documentId,
                    name: knowledge.documentName!,
                    usageMode: knowledge.usageMode,
                  },
                ]
              : [],
          },
        },
        tts: { voiceId: agent.voiceId, modelId: TTS_MODEL },
      },
    });

    return NextResponse.json({
      elevenLabsAgentId: created.agentId,
      knowledgeDocId: knowledge.documentId ?? null,
      knowledgeStatus: knowledge.status,
      note: knowledge.note ?? null,
    });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}

/** Clean up agents created for a debate so the workspace doesn't fill with throwaways. */
export async function DELETE(request: Request) {
  try {
    const { agentIds } = (await request.json()) as { agentIds: string[] };
    const client = getElevenLabs();

    await Promise.allSettled(
      (agentIds ?? []).map((id) => client.conversationalAi.agents.delete(id)),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
