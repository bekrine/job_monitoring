import * as dotenv from 'dotenv';
import { JobMonitoringAgent } from './monitor.ts';
import {
  DEFAULT_VERIFIED_HF_MODEL,
  verifyModelInferenceProvider,
} from './matching/model-verifier.ts';

// Load .env if present
dotenv.config();

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Morocco IT Job Monitoring Agent (Hugging Face Edition)

Usage:
  npm run monitor             Run monitoring agent against Moroccan job portals
  npm run monitor:dry         Run in dry-run mode (no Telegram notifications, no state write)
  npx tsx src/cli.ts [flags]

Flags:
  --dry-run                   Simulate decisions and notifications without side effects
  --demo                      Use built-in Moroccan IT announcements (no live web scrape)
  --target <url>              Custom recruitment portal or RSS feed URL
  --model <modelId>           Override Hugging Face model identifier
  --verify-model [modelId]    Verify if a model is currently live on Hugging Face router
  --state <path>              Custom path to persistent state JSON file (default: data/seen.json)
  --help, -h                  Show this help message

Environment Variables:
  HF_TOKEN                    Hugging Face user access token (Required for AI evaluation)
  HF_MODEL                    Hugging Face model ID (Default: ${DEFAULT_VERIFIED_HF_MODEL})
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
        : process.env.HF_MODEL || DEFAULT_VERIFIED_HF_MODEL;

    console.log(`Verifying router inference availability for model: ${targetModel}...`);
    const result = await verifyModelInferenceProvider(targetModel);
    if (result.isSupportedOnRouter) {
      console.log(`[PASS] Model '${targetModel}' is LIVE on Hugging Face Inference Providers.`);
      console.log(`  Live Providers: ${result.liveProviders.join(', ')}`);
      if (result.pricing) {
        console.log(`  Pricing: $${result.pricing.input}/1M input, $${result.pricing.output}/1M output`);
      }
      process.exit(0);
    } else {
      console.error(`[FAIL] Model '${targetModel}' is NOT supported on the Hugging Face router.`);
      if (result.error) console.error(`  Error: ${result.error}`);
      console.log(`  Suggested supported models:`);
      result.suggestions.forEach((s) => console.log(`    - ${s}`));
      process.exit(1);
    }
  }

  const dryRun = args.includes('--dry-run');
  const demo = args.includes('--demo');

  let customTargetUrl: string | undefined;
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    customTargetUrl = args[targetIdx + 1];
  }

  let stateFilePath: string | undefined;
  const stateIdx = args.indexOf('--state');
  if (stateIdx !== -1 && args[stateIdx + 1]) {
    stateFilePath = args[stateIdx + 1];
  }

  let customModel: string | undefined;
  const modelIdx = args.indexOf('--model');
  if (modelIdx !== -1 && args[modelIdx + 1]) {
    customModel = args[modelIdx + 1];
    process.env.HF_MODEL = customModel;
  }

  const activeModel = customModel || process.env.HF_MODEL || DEFAULT_VERIFIED_HF_MODEL;

  console.log('='.repeat(65));
  console.log('Morocco IT Job Monitoring Agent - Hugging Face Edition');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`Source: ${customTargetUrl || (demo ? 'Built-in Moroccan Fixtures' : 'Emploi-Public.ma Portal')}`);
  console.log(`Model: ${activeModel}`);
  console.log('='.repeat(65));

  const agent = new JobMonitoringAgent({
    dryRun,
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
      console.warn('⚠️ WARNING: Hugging Face free tier inference quota was exhausted during run.');
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
