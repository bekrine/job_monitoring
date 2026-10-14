# Morocco IT Job Monitoring Agent (OpenRouter Free Edition)

An autonomous monitoring agent for Information Technology job postings and competitive civil service recruitment notices (*concours de recrutement*) in Morocco.

The agent scrapes Moroccan portals (including the official [Emploi-Public.ma](https://www.emploi-public.ma) portal), prefilters announcements to conserve quota, evaluates candidates using a 100% free **OpenRouter** model (such as `openrouter/free` or `google/gemma-4-31b-it:free`), sends real-time alerts via **Telegram**, and maintains atomic persistent state in `data/seen.json`.

---

## Architecture Overview

```
[Moroccan Job Portals] (Emploi-Public.ma / RSS)
          │
          ▼
   Scraper Coordinator
          │
          ▼
   Loose Prefilter (Eliminates obvious non-IT jobs, saves tokens)
          │
          ▼
   State & Cache Check (data/seen.json - prevents repeat evaluations)
          │
          ▼
   OpenRouter Free AI Judge (openrouter/free / google/gemma-4-31b-it:free)
          │
    ┌─────┴────────────────┐
    ▼                      ▼
  MATCH / MAYBE          REJECT (Never notified)
    │
    ▼
  Telegram Notifier (HTML alerts with direct portal links delivered one by one)
    │
    ▼
  Atomic State Persist (data/seen.json)
```

---

## 1. Creating a Free OpenRouter Account & API Key

1. Go to [openrouter.ai](https://openrouter.ai).
2. Sign in with your Google or GitHub account (or email).
3. Navigate to [openrouter.ai/keys](https://openrouter.ai/keys).
4. Click **Create Key**, give it a name (e.g. `morocco-job-monitor`), and copy the key (starts with `sk-or-v1-...`).
5. **Zero Spend / No Credit Card:** OpenRouter free models (ending with `:free` or `openrouter/free`) are 100% free with $0 balance required!

---

## 2. Supported Free Models on OpenRouter

OpenRouter hosts dedicated free models with $0.00 prompt and completion cost:

- **`openrouter/free`** (Recommended Default): A smart dynamic router that automatically routes requests to the fastest, most available free model from OpenRouter's pool.
- **`google/gemma-4-31b-it:free`**: 262k context window, exceptional French and Arabic language comprehension for Moroccan diplomas and concurso notices.
- **`google/gemma-4-26b-a4b-it:free`**: Fast multimodal free model.
- **`nvidia/nemotron-3.5-lightning:free`**: Ultra-low latency, highly capable instruction model.
- **`cohere/north-mini-code:free`**: Specialized IT and coding model.
- **`liquid/lfm-2.5-2.6b:free`**: Lightweight, responsive free model.

You can verify any model's live availability and free status using the built-in CLI:

```bash
# Verify default free model:
npx tsx src/cli.ts --verify-model

# Verify a specific model:
npx tsx src/cli.ts --verify-model google/gemma-4-31b-it:free
```

---

## 3. Creating the Telegram Bot Using BotFather

1. Open Telegram and search for the official account **`@BotFather`** (verified checkmark).
2. Start the chat and send the command `/newbot`.
3. Choose a friendly name for your bot (e.g., `Morocco IT Job Alerts`).
4. Choose a username ending in `bot` (e.g., `morocco_it_jobs_alert_bot`).
5. BotFather will provide an HTTP API token formatted like:
   `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`
6. Set this as `TELEGRAM_BOT_TOKEN`.

---

## 4. Retrieving Your Telegram Chat ID

1. Open a chat with your newly created bot and click **Start** (or send `/start`).
2. Search for the utility bot **`@userinfobot`** on Telegram.
3. Send `/start` to `@userinfobot`. It will reply with your numeric `Id` (e.g., `987654321`).
4. Set this number as `TELEGRAM_CHAT_ID`.

*(If using a Telegram channel or group, add your bot as an administrator and use the channel ID, e.g., `-100xxxxxxxxxx`.)*

---

## 5. Configuring Local Environment Variables

Copy the template configuration file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_MODEL="openrouter/free"
TELEGRAM_BOT_TOKEN="123456789:..."
TELEGRAM_CHAT_ID="987654321"
FIRST_RUN_MAX_NOTIFICATIONS="5"
MAX_NOTIFICATIONS_PER_RUN="10"
```

---

## 6. Running Tests and a Dry Run

### Run All Unit and Integration Tests
```bash
npm test
```
The test suite validates mock OpenRouter inference responses, valid/malformed JSON, rate limits, quota exhaustion, exponential backoff retries, Telegram formatting, and atomic state handling without requiring real credentials.

### Run a Safe Dry Run
```bash
# Using live Moroccan recruitment portal:
npm run monitor:dry

# Or using built-in Moroccan IT test fixtures:
npm run monitor:dry -- --demo
```
In dry-run mode, the agent simulates evaluation, displays decision reasoning, prints simulated Telegram notifications, and **never writes to `data/seen.json` or sends live messages**.

### Run Production Monitor
```bash
npm run monitor
```

---

## 7. Configuring GitHub Actions Secrets & Variables

In your GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**.
2. Under **Repository secrets**, click **New repository secret** and add:
   - `OPENROUTER_API_KEY`: Your OpenRouter free API key (`sk-or-v1-...`).
   - `TELEGRAM_BOT_TOKEN`: The bot token from BotFather.
   - `TELEGRAM_CHAT_ID`: Your destination numeric chat ID.
3. Under **Repository variables** (optional):
   - `OPENROUTER_MODEL`: `openrouter/free` (or `google/gemma-4-31b-it:free`).

*(Note: Legacy `HF_TOKEN` and `HF_MODEL` continue to be supported as an optional fallback if configured).*

---

## 8. Enabling the Daily Schedule

The GitHub Actions workflow is located at `.github/workflows/job-monitor.yml`.

- **Cron Schedule:** `0 8 * * *` (runs once each day at 08:00 UTC / 09:00 Morocco time).
- **Concurrency Guard:** Prevents overlapping runs.
- **Pre-execution Verification:** Runs `npm test` before executing the scraper.
- **Lockfile Resolution:** Automatically detects presence of `package-lock.json` and runs `npm ci` or `npm install`.
- **State Persistence:** Automatically commits updated `data/seen.json` back to the repository upon completion with `[skip ci]`.
- **Manual Trigger:** You can trigger the workflow anytime from the **Actions** tab with optional dry-run and demo inputs.

---

## 9. Troubleshooting Guide

| Problem | Cause | Resolution |
| :--- | :--- | :--- |
| `[AUTH_FAILURE] 401/403` | Invalid or expired token | Verify `OPENROUTER_API_KEY` starts with `sk-or-v1-` and was created at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `[QUOTA_EXHAUSTED] 402` | Monthly free credit exhausted | The agent pauses AI evaluation gracefully. Un-evaluated jobs remain retryable. Use `openrouter/free` to leverage free pool models. |
| `[RATE_LIMIT] 429` | Too many calls per minute | The agent automatically performs exponential backoff retries with jitter (up to 3 times). |
| `[PROVIDER_UNAVAILABLE] 503` | Upstream provider busy | The agent automatically retries with exponential backoff. |
| `Telegram error: 400 Chat not found` | Bot was not started | Open your bot in Telegram and send `/start` before running the agent. |
| `No jobs scraped` | Moroccan portal connectivity glitch | The agent automatically falls back to safe fixtures and preserves state. |

---

## 10. Zero-Cost Protection Guarantee

- **100% Free Models:** OpenRouter free models have zero dollar prompt and completion pricing.
- **No Automatic Charges:** The agent code **strictly forbids** registering paid fallback providers or initiating automatic payment.
- **Graceful Halt:** When credits are exhausted, the agent reports the issue and stops. It **never fabricates** synthetic decisions or marks unevaluated jobs as rejected.
- **Conservative Token Budget:** Low token caps (~500 tokens) and prefiltering ensure maximum efficiency.
