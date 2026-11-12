# AI Travel Advisor

## 1. Setup & run

**Prerequisites:** Docker Desktop (or Docker Engine + Compose v2).

1. Create a `.env` file in the **project root** with your OpenAI API key:

   ```
   OPENAI_API_KEY=sk-...
   ```

   If the key was issued by an OpenAI-compatible gateway (e.g. OpenRouter) rather than OpenAI
   directly, also set:

   ```
   OPENAI_BASE_URL=https://openrouter.ai/api/v1
   OPENAI_MODEL=openai/gpt-4o-mini
   ```

   Leave `OPENAI_BASE_URL` unset for a real OpenAI key — the SDK then talks to the standard
   OpenAI endpoint. `OPENAI_MODEL` defaults to `gpt-4o-mini` if not set.

2. Start the app:

   ```
   docker compose up
   ```

3. Open `http://localhost:4000`.

Conversations, the trip plan, traveler facts, and the system prompt persist in a Docker-managed
volume across `docker compose down` / `up` and full container recreation. To start from a clean
database, remove the volume: `docker compose down -v`.

### Local development (optional — not required to run the app)

- `npm install` at the repo root (installs both workspaces).
- Copy `server/.env.example` to `server/.env` and fill in `OPENAI_API_KEY` (same optional
  `OPENAI_BASE_URL` / `OPENAI_MODEL` as above).
- `npm run dev:server`, and in a second terminal `npm run dev:client` — the Vite dev server
  proxies `/api` requests to the Express server on port 4000.

## 2. Architecture overview

**Backend** — Node.js + TypeScript, run directly via `tsx` (no separate compile step, in either
development or the Docker image). Express serves the REST API and, in production, the built React
static files from the same process. **Prisma + SQLite** is the persistence layer (`Traveler`,
`Conversation`, `Message`, `TripPlan`, `TravelerFact`, `SystemPrompt`), stored on a Docker-managed
volume so data survives container recreation, not just a process restart.

**Identity** — no login. An anonymous httpOnly cookie identifies each "traveler" on first
request; every conversation, the trip plan, and every remembered fact are scoped to that identity.

**LLM integration** — the official `openai` npm SDK, calling the **Responses API**. Each chat turn
assembles `instructions` (the editable system prompt plus the traveler's stored facts, both read
fresh from the database on every request — never cached) and the full conversation history, then
runs a bounded tool-calling loop (capped at 4 round-trips per turn) against five tools:

- `get_exchange_rate` / `get_weather` — real live data from Frankfurter and Open-Meteo (both free,
  no API key required).
- `flag_visa_immigration_question` — a hard, backend-enforced refusal for visa/entry questions
  (see Known limitations).
- `update_trip_plan` — writes to the traveler's trip plan.
- `remember_fact` — writes to the traveler's stable, cross-conversation facts.

**Frontend** — React + Vite, three views (conversation list, chat, settings) switched by a small
hand-rolled state machine, no router library. The chat view shows a persistent Trip Plan panel
alongside the conversation itself, so the plan visibly updates as the advisor fills it in.

**Docker** — one `Dockerfile`, one `docker-compose.yml`, one service, one named volume for the
SQLite file.

## 3. Key decisions

- **Responses API over Chat Completions.** Chosen specifically to be able to use OpenAI's hosted
  `web_search` tool for visa questions. Empirical testing later showed the configured gateway
  doesn't return genuinely live search results (see Known limitations), so that particular use
  case was replaced with a hard refusal — but the rest of the tool architecture is built on the
  Responses API and that choice stands.
- **`tsx` at runtime, no compiled build for the server.** The server runs its TypeScript source
  directly in development and in the Docker image. This keeps dev and prod symmetric and avoids a
  cross-package `rootDir`/emit-boundary issue with the `shared/` types folder.
- **SQLite + Prisma, with exactly one active `TripPlan` per traveler enforced in application code,
  not the database.** `TripPlan.travelerId` has no database-level unique constraint; "one plan"
  is a find-or-create invariant inside `tripPlanService.ts`, kept deliberately simple.
- **Anonymous httpOnly cookie identity, no accounts.** Satisfies "no login" while still isolating
  data between different browsers/travelers.
- **Tool-driven writes share one service function with any equivalent REST endpoint.**
  `update_trip_plan` and the manual `PATCH /api/trip-plan` both call the same
  `tripPlanService.applyTripPlanPatch` — one place owns validation and persistence, not two.
- **`TravelerFact` has no REST endpoint or UI, by deliberate choice.** The continuity requirement
  only obligates the advisor's *behavior*, not that facts be viewable or editable — unlike the
  trip plan and system prompt, which explicitly ask for that. Facts are written only via the
  `remember_fact` tool and read only internally when assembling each turn's instructions.
- **Last-write-wins for facts, no history.** Enforced by a `@@unique([travelerId, key])` database
  constraint — writing an existing key overwrites it rather than accumulating rows.
- **Visa questions get a fixed, backend-enforced refusal, never a model-composed answer** — see
  Known limitations for why.
- **The system prompt and traveler facts are re-assembled into `instructions` on every single chat
  request, with no caching.** An edit to the system prompt, or a fact recorded in one
  conversation, takes effect on the very next message — including in a different conversation.

## Project status and limitations

This is a full-stack travel-planning application and portfolio demonstration, not a production-hosted service.

- The application uses a browser cookie to identify a traveler. It does not include user accounts or authentication.
- The system-prompt editing endpoint should be restricted before deploying the app publicly.
- Travelers cannot currently inspect and selectively delete individual remembered facts.
- Chat responses are returned as complete messages rather than streamed incrementally.
- The application requires an API key to use the AI provider; usage may incur charges.

## Development and testing

Install dependencies with `npm install` and build the frontend with `npm run build`.
Backend tests can be run with `npm run test --workspace=server`.

## Security

Do not commit `.env` files, API keys, local databases, or personal travel information.
Review privacy and access controls before making this application available to real users.
