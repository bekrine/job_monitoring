# Morocco IT Job Monitoring Agent (Hugging Face Edition)

An autonomous monitoring agent for Information Technology job postings and competitive civil service recruitment notices (*concours de recrutement*) in Morocco.

The agent scrapes Moroccan portals (including the official [Emploi-Public.ma](https://www.emploi-public.ma) portal), prefilters announcements to conserve quota, evaluates candidates using a verified serverless **Hugging Face** model, sends real-time alerts via **Telegram**, and maintains atomic persistent state in `data/seen.json`.

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
   Hugging Face AI Judge (Qwen/Qwen2.5-7B-Instruct via @huggingface/inference)
          │
    ┌─────┴────────────────┐
    ▼                      ▼
  MATCH / MAYBE          REJECT (Never notified)
    │
    ▼
  Telegram Notifier (HTML alerts with direct portal links)
    │
    ▼
  Atomic State Persist (data/seen.json)
```

---

## 1. Creating a Hugging Face Account

1. Go to [huggingface.co/join](https://huggingface.co/join).
2. Enter your email and choose a secure password.
3. Verify your email address by clicking the link sent to your inbox.
4. No credit card is required to sign up or use the standard free inference allowance.

---

## 2. Creating an Access Token with Minimal Permissions

To adhere to the principle of least privilege:

1. Click your profile avatar at the top right of Hugging Face and select **Settings**.
2. Click **Access Tokens** in the left sidebar (or visit [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)).
3. Click **Create new token**.
4. Choose **Fine-grained** token (or **Read** token).
5. Name the token: `morocco-job-monitor`.
6. Under permissions, select:
   - **Inference**: *Make calls to the serverless Inference API*
7. Click **Create token** and copy the resulting string (starts with `hf_...`). Store it securely.

---

## 3. Verifying the Selected Model & Inference Route

Not every model on the Hugging Face Hub is available for serverless inference through Inference Providers. Do not assume a model is supported simply because it exists on the Hub.

The verified default model for this agent is **`Qwen/Qwen2.5-Coder-7B-Instruct`**:
- **Why chosen:** Open license (non-gated, no manual approval), actively served by live Inference Providers (`nscale`, `featherless-ai`), highly proficient in software engineering and IT terminology, and exceptionally cost-effective ($0.01 per 1M input tokens, $0.03 per 1M output tokens), easily operating within the $0.10 monthly free credit allowance.
- **Model Discovery & Live Verification:**
  You can verify any model's live availability on the Hugging Face router using the built-in CLI command:
  ```bash
  # Verify default model:
  npx tsx src/cli.ts --verify-model

  # Verify a specific model:
  npx tsx src/cli.ts --verify-model Qwen/Qwen2.5-Coder-7B-Instruct
  ```
  Or inspect the live router catalog directly:
  ```bash
  curl -s https://router.huggingface.co/v1/models | jq '.data[].id'
  ```
- **Alternative verified live models on the router:**
  - `Qwen/Qwen2.5-Coder-3B-Instruct` (Ultra-light, fast)
  - `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` (Reasoning & classification)
  - `google/gemma-3-4b-it` (Google lightweight instruction model)
  - `meta-llama/Llama-3.1-8B-Instruct` (Requires Meta community license acceptance on Hugging Face before token access)

> **Note on `Qwen/Qwen2.5-7B-Instruct`:** This model is not currently active on the Hugging Face serverless router, causing requests to return `ProviderApiError: Failed to perform inference: an HTTP error occurred when requesting the provider.` (HTTP 404/400). Always use `Qwen/Qwen2.5-Coder-7B-Instruct` or run `--verify-model` before choosing an alternative.

---

## 4. Configuring `HF_TOKEN` and `HF_MODEL`

In your environment or `.env` file:

```env
HF_TOKEN="hf_your_actual_token_here"
HF_MODEL="Qwen/Qwen2.5-Coder-7B-Instruct"
```

The application strictly avoids paid inference providers, third-party API keys, or automatic billing.

---

## 5. Creating the Telegram Bot Using BotFather

1. Open Telegram and search for the official account **`@BotFather`** (verified checkmark).
2. Start the chat and send the command `/newbot`.
3. Choose a friendly name for your bot (e.g., `Morocco IT Job Alerts`).
4. Choose a username ending in `bot` (e.g., `morocco_it_jobs_alert_bot`).
5. BotFather will provide an HTTP API token formatted like:
   `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`
6. Set this as `TELEGRAM_BOT_TOKEN`.

---

## 6. Retrieving Your Telegram Chat ID

1. Open a chat with your newly created bot and click **Start** (or send `/start`).
2. Search for the utility bot **`@userinfobot`** on Telegram.
3. Send `/start` to `@userinfobot`. It will reply with your numeric `Id` (e.g., `987654321`).
4. Set this number as `TELEGRAM_CHAT_ID`.

*(If using a Telegram channel or group, add your bot as an administrator and use the channel ID, e.g., `-100xxxxxxxxxx`.)*

---

## 7. Configuring Local Environment Variables

Copy the template configuration file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
HF_TOKEN="hf_..."
HF_MODEL="Qwen/Qwen2.5-7B-Instruct"
TELEGRAM_BOT_TOKEN="123456789:..."
TELEGRAM_CHAT_ID="987654321"
FIRST_RUN_MAX_NOTIFICATIONS="5"
MAX_NOTIFICATIONS_PER_RUN="10"
```

---

## 8. Running Tests and a Dry Run

### Run All Unit and Integration Tests
```bash
npm test
```
The test suite validates mock Hugging Face inference responses, valid/malformed JSON, rate limits, quota exhaustion, exponential backoff retries, Telegram formatting, and atomic state handling without requiring real credentials.

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

## 9. Configuring GitHub Actions Secrets & Variables

In your GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**.
2. Under **Repository secrets**, click **New repository secret** and add:
   - `HF_TOKEN`: Your Hugging Face access token.
   - `TELEGRAM_BOT_TOKEN`: The bot token from BotFather.
   - `TELEGRAM_CHAT_ID`: Your destination numeric chat ID.
3. Under **Repository variables** (optional):
   - `HF_MODEL`: `Qwen/Qwen2.5-7B-Instruct` (defaults automatically if unset).

---

## 10. Enabling the Three-Hour Schedule

The GitHub Actions workflow is located at `.github/workflows/job-monitor.yml`.

- **Cron Schedule:** `0 */3 * * *` (runs every 3 hours at minute 0 UTC).
- **Concurrency Guard:** Prevents overlapping runs.
- **Pre-execution Verification:** Runs `npm test` before executing the scraper.
- **State Persistence:** Automatically commits updated `data/seen.json` back to the repository upon completion with `[skip ci]`.
- **Manual Trigger:** You can trigger the workflow anytime from the **Actions** tab with optional dry-run and demo inputs.

---

## 11. Troubleshooting Guide

| Problem | Cause | Resolution |
| :--- | :--- | :--- |
| `[AUTH_FAILURE] 401/403` | Invalid or expired token | Verify `HF_TOKEN` starts with `hf_` and has inference permissions on Hugging Face. |
| `[QUOTA_EXHAUSTED] 402` | Monthly free credit exhausted | The agent pauses AI evaluation gracefully. Un-evaluated jobs remain retryable. Wait for quota reset or switch to another supported open model. |
| `[RATE_LIMIT] 429` | Too many calls per 5 minutes | The agent automatically performs exponential backoff retries (up to 3 times). |
| `[MODEL_UNAVAILABLE] 503` | Model is loading/warming up | Normal serverless behavior. The agent automatically retries with backoff while the model spins up. |
| `Telegram error: 400 Chat not found` | Bot was not started | Open your bot in Telegram and send `/start` before running the agent. |
| `No jobs scraped` | Moroccan portal connectivity glitch | The agent automatically falls back to safe fixtures and preserves state. |

---

## 12. Understanding Free-Tier Limits & Spending Protection

- **No Unlimited Inference:** Free inference services are shared community resources. Hugging Face provides a free allowance (currently $0.10/month shared pool across serverless providers and hub rate limits).
- **No Automatic Charges:** The agent code **strictly forbids** registering paid fallback providers or initiating automatic payment.
- **Graceful Halt:** When free credits are exhausted, the agent reports the issue and stops. It **never fabricates** synthetic decisions or marks unevaluated jobs as rejected.
- **Conservative Token Budget:** Low token caps (~450 tokens) and prefiltering ensure every free token is used efficiently.
