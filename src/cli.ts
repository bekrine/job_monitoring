import * as dotenv from 'dotenv';
import { JobMonitoringAgent } from './monitor.ts';
import { TelegramNotifier } from './notifier/telegram.ts';
import { StateManager } from './state/state-manager.ts';
import {
  DEFAULT_OPENROUTER_MODEL,
  verifyOpenRouterModel,
  DEFAULT_VERIFIED_HF_MODEL,
  verifyModelInferenceProvider,
} from './matching/model-verifier.ts';

// Load .env if present
dotenv.config();

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Morocco IT Job Monitoring Agent (OpenRouter Free Edition)

Usage:
  npm run monitor             Run monitoring agent against Moroccan job portals
  npm run monitor:dry         Run in dry-run mode (no Telegram notifications, no state write)
  npx tsx src/cli.ts [flags]

Flags:
  --dry-run                   Simulate decisions and notifications without side effects
  --force-notify              Send notifications even if the job was previously marked as notified
  --test-telegram             Send a test message to verify Telegram bot token and chat ID
  --reset-notified            Reset notified status on all seen jobs to re-trigger notifications
  --demo                      Use built-in Moroccan IT announcements (no live web scrape)
  --target <url>              Custom recruitment portal or RSS feed URL
  --model <modelId>           Override AI model identifier (e.g. openrouter/free, google/gemma-4-31b-it:free)
  --verify-model [modelId]    Verify if a model is currently free and available on OpenRouter
  --state <path>              Custom path to persistent state JSON file (default: data/seen.json)
  --help, -h                  Show this help message

Environment Variables:
  OPENROUTER_API_KEY          OpenRouter API key (Required for AI evaluation; get at https://openrouter.ai/keys)
  OPENROUTER_MODEL            OpenRouter model ID (Default: ${DEFAULT_OPENROUTER_MODEL})
  HF_TOKEN                    Legacy Hugging Face token (Optional fallback)
  HF_MODEL                    Legacy Hugging Face model ID (Optional fallback: ${DEFAULT_VERIFIED_HF_MODEL})
  TELEGRAM_BOT_TOKEN          Telegram Bot API token
  TELEGRAM_CHAT_ID            Telegram destination Chat ID
  FIRST_RUN_MAX_NOTIFICATIONS Maximum notifications sent on initial run (Default: 5)
  MAX_NOTIFICATIONS_PER_RUN   Maximum notifications per routine scheduled run (Default: 10)
    `);
    process.exit(0);
  }

  // Handle --verify-model
  if (args.includes('--verify-model')) {
    const vIdx = args.indexOf('--verify-model');
    const targetModel =
      args[vIdx + 1] && !args[vIdx + 1].startsWith('-')
        ? args[vIdx + 1]
        : process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;

    console.log(`Verifying OpenRouter availability and zero-cost pricing for model: ${targetModel}...`);
    const result = await verifyOpenRouterModel(targetModel);
    if (result.isAvailable) {
      console.log(`[PASS] Model '${targetModel}' is LIVE on OpenRouter.`);
      console.log(`  Zero-cost Free Model: ${result.isFree ? 'YES (100% Free)' : 'NO (Paid model)'}`);
      if (result.contextLength) {
        console.log(`  Context Length: ${result.contextLength} tokens`);
      }
      if (result.pricing) {
        console.log(`  Pricing: $${result.pricing.prompt}/token prompt, $${result.pricing.completion}/token completion`);
      }
      process.exit(result.isFree ? 0 : 1);
    } else {
      console.error(`[FAIL] Model '${targetModel}' was not found in OpenRouter catalog.`);
      if (result.error) console.error(`  Error: ${result.error}`);
      console.log(`  Suggested verified free models on OpenRouter:`);
      result.suggestions.forEach((s) => console.log(`    - ${s}`));

      // Check Hugging Face router as fallback info
      if (process.env.HF_TOKEN) {
        console.log('\nChecking Hugging Face router as fallback...');
        const hfResult = await verifyModelInferenceProvider(targetModel);
        if (hfResult.isSupportedOnRouter) {
          console.log(`  Model is available on Hugging Face router providers: ${hfResult.liveProviders.join(', ')}`);
        }
      }
      process.exit(1);
    }
  }

  let stateFilePath: string | undefined;
  const stateIdx = args.indexOf('--state');
  if (stateIdx !== -1 && args[stateIdx + 1]) {
    stateFilePath = args[stateIdx + 1];
  }

  // Handle --test-telegram
  if (args.includes('--test-telegram')) {
    console.log('Sending test message to Telegram...');
    const notifier = new TelegramNotifier();
    if (!notifier.isConfigured()) {
      console.error('[FAIL] Telegram is not configured.');
      console.error('Please check that TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in your .env file:');
      console.error('  TELEGRAM_BOT_TOKEN=<your_bot_token>');
      console.error('  TELEGRAM_CHAT_ID=<your_chat_id>');
      process.exit(1);
    }
    const testResult = await notifier.sendMessage(
      '🔔 <b>Morocco IT Job Monitoring Agent</b>: Test message! Your Telegram bot configuration is working properly.'
    );
    if (testResult.success) {
      console.log(`[PASS] Test message sent successfully to Telegram! (Message ID: ${testResult.messageId})`);
      process.exit(0);
    } else {
      console.error(`[FAIL] Telegram send failed: ${testResult.error}`);
      process.exit(1);
    }
  }

  // Handle --reset-notified
  if (args.includes('--reset-notified')) {
    const sm = new StateManager({ stateFilePath });
    const resetCount = sm.resetNotifiedStatus();
    sm.save();
    console.log(
      `[PASS] Reset notification status for ${resetCount} job postings in ${stateFilePath || 'data/seen.json'}. Next run will re-notify matching opportunities.`
    );
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const forceNotify = args.includes('--force-notify');
  const demo = args.includes('--demo');

  let customTargetUrl: string | undefined;
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    customTargetUrl = args[targetIdx + 1];
  }

  let customModel: string | undefined;
  const modelIdx = args.indexOf('--model');
  if (modelIdx !== -1 && args[modelIdx + 1]) {
    customModel = args[modelIdx + 1];
    process.env.OPENROUTER_MODEL = customModel;
  }

  const activeProvider = process.env.OPENROUTER_API_KEY
    ? 'OpenRouter (Free Models)'
    : process.env.HF_TOKEN
    ? 'Hugging Face (Legacy)'
    : 'None (Prefilter Only)';

  const activeModel =
    customModel ||
    process.env.OPENROUTER_MODEL ||
    DEFAULT_OPENROUTER_MODEL;

  console.log('='.repeat(65));
  console.log('Morocco IT Job Monitoring Agent - OpenRouter Free Edition');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`Source: ${customTargetUrl || (demo ? 'Built-in Moroccan Fixtures' : 'Emploi-Public.ma Portal')}`);
  console.log(`Provider: ${activeProvider}`);
  console.log(`Model: ${activeModel}`);
  console.log('='.repeat(65));

  const agent = new JobMonitoringAgent({
    dryRun,
    forceNotify,
    useDemoFixtures: demo,
    customTargetUrl,
    stateFilePath,
  });

  try {
    const summary = await agent.run();
    console.log('='.repeat(65));
    console.log('Execution Summary:');
    console.log(`- Success: ${summary.success ? 'YES' : 'NO'}`);
    console.log(`- Announcements Scraped: ${summary.totalScraped}`);
    console.log(`- Unique Postings: ${summary.uniqueJobs}`);
    console.log(`- Prefiltered Out: ${summary.prefilteredOut}`);
    console.log(`- AI Evaluations: ${summary.evaluatedWithAi}`);
    console.log(`- Cached Evaluations Reused: ${summary.cachedEvaluationsUsed}`);
    console.log(`- Matches: ${summary.matchesFound}`);
    console.log(`- Maybes: ${summary.maybesFound}`);
    console.log(`- Rejects: ${summary.rejectsFound}`);
    console.log(`- Telegram Notifications: ${summary.notificationsSent}`);

    if (summary.quotaExhausted) {
      console.warn('⚠️ WARNING: Free tier inference quota was exhausted during run.');
    }

    if (summary.errors.length > 0) {
      console.warn(`- Encountered issues (${summary.errors.length}):`);
      summary.errors.forEach((e) => console.warn(`  * ${e}`));
    }
    console.log('='.repeat(65));

    process.exit(summary.success ? 0 : 1);
  } catch (fatal) {
    console.error('Fatal agent error:', fatal);
    process.exit(1);
  }
}

main();
