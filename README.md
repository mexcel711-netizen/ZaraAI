# ZARA AI

A bilingual Pakistani Urdu, Roman Urdu and English AI voice assistant built with React, TypeScript, Cloudflare Workers AI and D1.

## Production architecture
- Cloudflare Worker serves the Vite SPA and API routes.
- Cloudflare D1 stores conversations, memories, skills, notes, reminders, app configuration, living characters and the study library.
- Workers AI is the production AI provider through the `AI` binding, with Gemma as the primary conversational model and Llama fallbacks. If `GEMINI_API_KEY` is configured, Gemini can be selected or used as an additional fallback for chat, study/vision analysis and transcription.
- Chat uses the active character, saved memories, notes, reminders and study-library summaries as context. Provider failures trigger model/provider failover before the API returns a recoverable unavailable response.
- Production access is restricted by the Cloudflare Access policy. Keep its allow rule limited to trusted identities.
- The local Express/SQLite runtime and production Worker/D1 runtime share the browser API contract. The Worker-specific route handlers live in `worker/features.ts`.

## Database migrations and deployment
Apply database migrations **before deploying Worker code that depends on a new table or column**. The migration files are ordered and safe to re-run; they do not delete existing user data.

```bash
bun install --frozen-lockfile
bun run db:check
bun run db:migrate
bun run lint
bun run test
bun run build
bun run deploy
```

`bun run db:migrate` targets the configured remote D1 database `nova-ai-production`; only run it while authenticated to the intended Cloudflare account. GitHub Actions validates migration SQL against an in-memory SQLite database, then runs type checks, tests and the production build. It does not change the live D1 database.

## Local development
- Copy `.env.example` to `.env` and add `GEMINI_API_KEY` if you want to use Gemini locally.
- Run `bun install` then `bun run dev`.
- The local Express server uses Node SQLite; production uses Cloudflare D1.

## Security and privacy
- Production is behind Cloudflare Access; keep the allow policy limited to trusted email identities.
- The current deployment is a single-user assistant, not a multi-tenant service.
- Never commit API keys, `.env` files, local SQLite databases, or Wrangler state.


## ZARA AI holographic command centre and desktop companion
The Home screen includes a holographic command-centre layout and an optional local Desktop Bridge panel.

### Windows desktop actions
1. Start the local companion from the repository root: `bun run desktop:companion`.
2. Copy the one-time pairing token printed in the terminal into ZARA's **Desktop Bridge** panel and press **Pair**.
3. Use the panel buttons or say/type commands such as `Chrome kholo`, `Edge kholo`, `Notepad kholo`, or `Calculator kholo`.

The companion is an optional local Node.js process. It binds to loopback only, checks the ZARA origin and pairing token, and only launches the small allowlist of applications. See [desktop-companion/README.md](desktop-companion/README.md) for setup and security details.

### Pakistani Urdu neural female voice
ZARA uses one fixed Microsoft Edge neural speaker, `ur-PK-UzmaNeural`, for Urdu, Roman Urdu and English. Character, mood, language and device settings do not switch the speaker. The local Node server and Cloudflare Worker use the same Sec-MS-GEC v2 Read Aloud handshake. Browser SpeechSynthesis and the old Google Translate TTS fallback are disabled so a provider failure never silently changes the voice. If synthesis is temporarily unavailable, the written reply remains visible and ZARA retries the same fixed voice once. The app unlocks Web Audio on the first user gesture so delayed TTS responses can play under browser autoplay policies.


## Cloudflare production deployment

The production Worker is named `nova-ai` (not `novaai` or `zaraai`) and is bound to the existing `nova-ai-production` D1 database. Deploys run from GitHub Actions after changes reach `main`; pull requests run validation only.

Add these GitHub Actions repository secrets before enabling production deployment:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Workers Scripts edit and D1 read permissions.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
- `OPENAI_API_KEY`: OpenAI API key for natural OpenAI TTS.

The deployment workflow uploads `OPENAI_API_KEY` as a Worker secret before publishing. Never put API keys in `wrangler.toml`, source code, or client-side settings.

OpenAI speech uses `gpt-4o-mini-tts` with `marin` for female personas and `cedar` for male personas. OpenAI currently recommends these voices for quality, but its TTS voices are optimized for English; Pakistani Urdu pronunciation may vary. The model is scheduled for shutdown on January 6, 2027, so the TTS provider must be migrated before that date.
