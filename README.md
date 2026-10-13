# Fair Shift (agent core)

Shared core for a Nebius x NVIDIA Global AI Hackathon entry (track: Best Apps and Agents, also aiming at Best Use of Tavily).
Fair Shift checks hourly pay against official wage rules. This first commit holds the domain-independent layers only.

The core runs NVIDIA Nemotron 3 models on **Nebius Token Factory** and retrieves rule text from **official government sites only** with **Tavily**. Anything quoted to a user must appear verbatim in text retrieved during that run.

## What is here

| Layer | File | What it does |
|---|---|---|
| Model client | `lib/llm/nebius.ts` | OpenAI-compatible client for Token Factory. Walks the fallback chain Nano -> Super -> Ultra when a model is missing or errors. Stops at once on HTTP 401/402/403 so an empty balance never escalates to pricier models. |
| Model config | `lib/config.ts` | Base URL and model IDs (env overridable), per-tier prices for cost estimates, caps, live/mock switch. |
| Search client | `lib/search/tavily.ts` | Tavily `/search` and `/extract`. `include_domains` is set from the allowlist, every result URL is re-checked in code, extract refuses non-allowlisted URLs before any request. Extract results are cached for 6 hours. |
| Allowlist | `lib/domains.ts` | Exact host or subdomain match. Rejects lookalikes and `user@host` tricks. Set with `APP_ALLOWED_DOMAINS`. |
| Citation check | `lib/agent/citations.ts` | Stores every retrieved document; a quote is accepted only if it appears verbatim (whitespace and full-width forms normalised, nothing else). |
| Agent loop | `lib/agent/session.ts` | Tool-calling loop with built-in `search_official`, `fetch_official`, `finish`, plus app tools. Enforces step, tool-call, search and per-run cost caps in code. Records a trace of every model and tool step. Also `chatJson` for cheap Nano-tier JSON calls. |
| Mock provider | `lib/llm/mock.ts`, `lib/search/fixture.ts` | Scripted stand-in model and recorded fixtures for offline work. Every result is tagged as fixture data. |
| Provider switch | `lib/providers.ts` | Live when both keys are set, otherwise demo mode, labelled in every response. |
| Demo caps | `lib/budget.ts` | Per-visitor hourly and daily limits, global daily limits on runs, model spend and Tavily credits. |
| Status | `app/api/status/route.ts`, `app/page.tsx` | Shows mode, model chain, allowed domains and caps. Never shows key values. |

## Models (Token Factory catalog, checked 2026-10-13)

| Tier | Default model ID | USD per 1M tokens (in / out) |
|---|---|---|
| Nano | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 0.06 / 0.24 |
| Super | `nvidia/nemotron-3-super-120b-a12b` | 0.30 / 0.90 |
| Ultra | `nvidia/Nemotron-3-Ultra-550b-a55b` | 1.00 / 3.00 |

Base URL: `https://api.tokenfactory.nebius.com/v1/` ([quickstart](https://docs.tokenfactory.nebius.com/quickstart)). Override any ID with `NEMOTRON_NANO_MODEL`, `NEMOTRON_SUPER_MODEL`, `NEMOTRON_ULTRA_MODEL`.

## Run it

Requires Node 20.9 or newer.

```bash
npm install
npm test          # 33 tests, never touch the network
npm run typecheck
npm run dev       # http://localhost:3000
```

Keys are read from the environment only: `NEBIUS_API_KEY` and `TAVILY_API_KEY`. On Windows, set them as user environment variables and open a new terminal. Without both keys the app runs in demo mode. `APP_FORCE_MOCK=1` forces demo mode. See `.env.example` for every setting.

## Demo caps (defaults)

| Setting | Default |
|---|---|
| Runs per visitor | 6 per hour, 20 per day |
| Runs per day, all visitors | 300 |
| Model spend per day | US$2 |
| Tavily credits per day | 300 |
| Model spend per run | US$0.05 |
| Agent steps per run | 24 |
| Tavily calls per run | 10 |

Counters are in memory per server instance. On Vercel each warm instance keeps its own count, so the real ceiling is caps x instances; fine for a hackathon demo, swap in a shared store for anything bigger.

## Status

- Done: everything in the table above, with tests.
- Not done yet: the product layer (app tools, prompts, fixtures recorded from real official pages, UI, evaluation cases). Waiting on the topic decision.
- Blocked on keys: any live call to Token Factory or Tavily. No live run has happened yet.

## License

MIT, see `LICENSE`.
