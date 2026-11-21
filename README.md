# Voice Debate

Describe a situation, cast two to five AI agents — each with its own ElevenLabs voice, role,
and knowledge base — and let them debate it out loud. Hold the talk button to interrupt and
question the panel mid-debate.asd

**The whole debate lasts 1 minute** (adjustable, 30–180s). Every turn from every agent fits
inside that budget.

## Setup

### 1. Get an ElevenLabs API key

1. Sign up at [elevenlabs.io](https://elevenlabs.io) — the free tier needs no credit card.
2. Account menu (bottom-left avatar) → **API Keys** → **Create API Key**. Copy it immediately;
   the full value is shown only once.
3. While creating it, set a **credit quota** on the key. This hard-caps what a runaway loop can burn.

Add it to `.env.local`:

```
ELEVENLABS_API_KEY=your_key_here
```

Verify it works before starting the app:

```bash
curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v2/voices | head -c 400
```

A JSON list of voices means you're set. `401` means the key is wrong or was truncated.

### 2. Run it

```bash
npm run dev
```

The dev server binds to a **free port chosen at startup** (`--port 0`), so read the actual URL
from the terminal output. There's also a **Voice Debate.app** on your Desktop that starts the
server and opens the right port for you — regenerate it any time with
`./scripts/make-launcher.sh`.

## Free tier limits

The free plan gives **15 minutes of agent call time** and **4 concurrent calls**, plus a
separate 10,000-credit pool that speech-to-text draws from at ~330 credits/minute. The LLM is
billed separately on top.

At roughly one billed minute per debate, that's **12–15 full debates** before you need a paid
plan — enough to build and verify against, not enough for regular use.

## How it works

- **One session at a time.** Each turn opens a fresh ElevenLabs voice session for the speaking
  agent, injects the turn prompt as text via `sendUserMessage`, plays the reply in that agent's
  voice, then closes the session. Only one call is ever open, so billed minutes track actual
  speech rather than wall-clock × agent count — and the 4-concurrent cap never binds.
- **The mic is muted during agent turns.** Voice sessions open the microphone by default, which
  would let an agent hear itself and interrupt mid-sentence.
- **Time budget drives the format.** `planDebate()` picks how many rebuttal rounds fit the
  duration and derives a per-turn word budget from it, which is injected into each prompt. A
  wall-clock guard runs at turn boundaries — never mid-audio, since a clipped sentence sounds
  broken — and reserves time so closing statements always land.
- **Knowledge falls back automatically.** Pasted text becomes an ElevenLabs knowledge document
  and is RAG-indexed. ElevenLabs refuses to index short documents (`document_too_small`), so
  those fall back to being inlined in the system prompt — which is better grounding at that
  size anyway. The UI tells you which mode each agent ended up in.

## Layout

```
src/
  app/
    page.tsx                 setup + debate stage
    api/voices/              list ElevenLabs voices
    api/agents/              provision agents + knowledge; clean up after
    api/knowledge/status/    poll RAG indexing
    api/session/             mint short-lived signed URL for the browser
    api/transcribe/          speech-to-text for interjections
    api/preview/             voice preview sample
  components/                AgentCard, VoicePicker, DebateStage, PushToTalk
  hooks/useDebate.ts         turn loop, time enforcement, transport controls
  lib/
    budget.ts                planDebate, wall-clock guard
    prompts.ts               system + per-turn prompt construction
    runTurn.ts               one session, one turn
    elevenlabs.ts            server client + error mapping
    types.ts
```

The API key is used **only** in route handlers. The browser reaches agents through a
short-lived signed URL and never sees the key.
