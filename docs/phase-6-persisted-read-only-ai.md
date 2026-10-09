# Phase 6: persisted conversations and read-only AI

Status: implemented locally on 2026-09-29; Postgres and Vercel AI Gateway provider verification remains pending.

## Delivered contract

- Migration `0004_conversations_generations_usage.sql` adds addressable conversations,
  ordered messages, generations, tool calls, usage reservations, usage ledger entries,
  and request idempotency.
- A generation and its user message, immutable base revision, estimated cost, and hard
  token reservation are committed before any provider call.
- Generation POSTs require an idempotency key. Replays return the existing generation;
  reuse with a different request fails closed.
- Organization daily-token and workspace-concurrency limits are locked and checked
  transactionally before invocation.
- Only stories declaring `authoring.ai.enabled: true` can invoke AI. The declaration
  enables the capability but grants no authorization; `story:edit` remains mandatory.
- The model is selected and allow-listed by the server. The default is
  `gpt-5.4-mini` and is called through the official OpenAI SDK Responses API.
- The AI SDK `ToolLoopAgent` is capped at six steps, 60 seconds total, 25 seconds per
  provider step, and a configurable output-token maximum.
- Available tools are read-only: `inspect_element`, `inspect_neighbourhood`,
  `list_assets`, and `ask_clarification`. Every call is persisted before execution
  and reaches a completed or failed state.
- Story JSON, story text, asset names, conversation history, and user requests are
  explicitly delimited as untrusted data. System messages from stored content are
  not accepted.
- Messages and terminal generation state are durable. Editor refreshes recover the
  active conversation and poll its addressable generation instead of regenerating.
- Success records token usage, Gateway generation IDs, provider-reported cost,
  latency, and assistant output. Failure/cancellation conservatively reconciles or
  releases the reservation according to whether provider execution began.
- `db:reconcile-generations` terminates stale pending/running records, resolves their
  reservations, fails stranded tool calls, and removes expired idempotency records.

No tool in this phase can write Story Language JSON, create a revision, upload an
asset, acknowledge a preview, or commit production.

## Configuration

- `SCROLLTASTIC_AI_MODEL` selects the server model.
- `SCROLLTASTIC_AI_MODELS` is the comma-separated allow-list.
- `SCROLLTASTIC_AI_MAX_OUTPUT_TOKENS` defaults to 2,048.
- `SCROLLTASTIC_AI_DAILY_TOKEN_LIMIT` defaults to 100,000.
- `SCROLLTASTIC_AI_CONCURRENCY` defaults to 2 per workspace.
- `SCROLLTASTIC_AI_INPUT_USD_PER_MILLION` and
  `SCROLLTASTIC_AI_OUTPUT_USD_PER_MILLION` are required when choosing a model other
  than the default.
- Provider authentication uses the server-only `OPENAI_API_KEY`. The runner has
  no dependency on deployment-platform identity or Vercel AI Gateway.

## Remaining provider evidence

- Apply migration `0004` on an isolated Postgres branch and exercise concurrent
  reservations, idempotent replay, cancellation, and worker-loss reconciliation.
- Validate the OpenAI project key, model allow-listing, timeout/cancellation,
  insufficient-credit handling, and 429 rate limiting.
- Record production quota, pricing, retention, and model/failover decisions.
