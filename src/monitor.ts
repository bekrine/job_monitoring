import { deduplicateJobs, prefilterJob } from './matching/prefilter.ts';
import { OpenRouterJudge } from './matching/openrouter-judge.ts';
import { HuggingFaceJudge } from './matching/huggingface-judge.ts';
import { AiJudge, JudgeError, ScrapedJob } from './matching/types.ts';
import { TelegramNotifier } from './notifier/telegram.ts';
import { ScraperCoordinator } from './scraper/scraper.ts';
import { StateManager } from './state/state-manager.ts';

export interface MonitorOptions {
  dryRun?: boolean;
  forceNotify?: boolean;
  useDemoFixtures?: boolean;
  customTargetUrl?: string;
  stateFilePath?: string;
  judge?: AiJudge;
  notifier?: TelegramNotifier;
  stateManager?: StateManager;
  scraper?: ScraperCoordinator;
}

export interface MonitorRunSummary {
  success: boolean;
  dryRun: boolean;
  totalScraped: number;
  uniqueJobs: number;
  prefilteredOut: number;
  evaluatedWithAi: number;
  cachedEvaluationsUsed: number;
  matchesFound: number;
  maybesFound: number;
  rejectsFound: number;
  notificationsSent: number;
  quotaExhausted: boolean;
  errors: string[];
}

export class JobMonitoringAgent {
  private readonly stateManager: StateManager;
  private readonly scraper: ScraperCoordinator;
  private readonly judge?: AiJudge;
  private readonly notifier: TelegramNotifier;
  private readonly dryRun: boolean;
  private readonly forceNotify: boolean;

  constructor(options: MonitorOptions = {}) {
    this.dryRun = options.dryRun ?? false;
    this.forceNotify = options.forceNotify ?? false;

    this.stateManager =
      options.stateManager ||
      new StateManager({
        dryRun: this.dryRun,
        stateFilePath: options.stateFilePath,
      });

    this.scraper =
      options.scraper ||
      new ScraperCoordinator({
        customUrl: options.customTargetUrl,
        useDemoFixtures: options.useDemoFixtures,
      });

    this.notifier = options.notifier || new TelegramNotifier();

    if (options.judge) {
      this.judge = options.judge;
    } else if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_TOKEN) {
      try {
        this.judge = new OpenRouterJudge();
      } catch (err) {
        console.warn(`[Agent] Notice initializing OpenRouterJudge: ${(err as Error).message}`);
      }
    } else if (process.env.HF_TOKEN) {
      try {
        this.judge = new HuggingFaceJudge();
      } catch (err) {
        console.warn(`[Agent] Notice initializing HuggingFaceJudge: ${(err as Error).message}`);
      }
    }
  }

  public async run(): Promise<MonitorRunSummary> {
    const summary: MonitorRunSummary = {
      success: true,
      dryRun: this.dryRun,
      totalScraped: 0,
      uniqueJobs: 0,
      prefilteredOut: 0,
      evaluatedWithAi: 0,
      cachedEvaluationsUsed: 0,
      matchesFound: 0,
      maybesFound: 0,
      rejectsFound: 0,
      notificationsSent: 0,
      quotaExhausted: false,
      errors: [],
    };

    console.log(`[Agent] Starting Morocco IT Job Monitoring run (DryRun: ${this.dryRun})...`);

    if (!this.notifier.isConfigured() && !this.dryRun) {
      console.warn(
        '[Agent] NOTICE: Telegram notifications are disabled (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing from .env).'
      );
    }

    // 1. Fetch raw jobs from portal
    let rawJobs: ScrapedJob[] = [];
    try {
      rawJobs = await this.scraper.fetchAllJobs();
      summary.totalScraped = rawJobs.length;
      console.log(`[Agent] Fetched ${rawJobs.length} job announcements from recruitment portals.`);
    } catch (err) {
      const msg = `Scraper failure: ${(err as Error).message}`;
      console.error(`[Agent] ${msg}`);
      summary.errors.push(msg);
      summary.success = false;
      return summary;
    }

    // 2. Deduplicate
    const uniqueJobs = deduplicateJobs(rawJobs);
    summary.uniqueJobs = uniqueJobs.length;

    const notificationLimit = this.stateManager.getEffectiveNotificationLimit();
    console.log(
      `[Agent] Effective notification limit for this run: ${notificationLimit} (First-run mode: ${this.stateManager.isFirstRun()})`
    );

    const itCandidateJobs: Array<{ job: ScrapedJob; reason: string }> = [];

    // 3. Process jobs
    for (const job of uniqueJobs) {
      // Record discovery
      this.stateManager.recordJobDiscovered(job, false);

      // Fetch full details if needed so the complete syllabus, specialty, and deadline are available
      try {
        const enrichedJob = await this.scraper.fetchJobDetails(job);
        job.description = enrichedJob.description;
        job.specialite = enrichedJob.specialite || job.specialite;
        job.deadline = enrichedJob.deadline || job.deadline;
        this.stateManager.recordJobDiscovered(job, true);
      } catch (detailErr) {
        console.warn(`[Agent] Could not retrieve full details for ${job.id}: ${(detailErr as Error).message}`);
        summary.errors.push(`Detail fetch failed for ${job.id}`);
      }

      // Check prefilter: deadline validity, specialite keywords ("informatique" / "technique de developpement informatique")
      const prefilterResult = prefilterJob(job);
      this.stateManager.recordPrefilterResult(job.id, prefilterResult.passed);

      if (!prefilterResult.passed) {
        summary.prefilteredOut++;
        console.log(
          `[Agent] Excluded: ${job.title.slice(0, 50)}... (${prefilterResult.reason})`
        );
        continue;
      }

      itCandidateJobs.push({ job, reason: prefilterResult.reason });

      // Check for cached evaluation
      let evaluation = this.stateManager.getCachedEvaluation(job.id);
      if (evaluation) {
        summary.cachedEvaluationsUsed++;
      } else if (!summary.quotaExhausted) {
        if (!this.judge) {
          const warnMsg = `AI judge is not configured (OPENROUTER_API_KEY or HF_TOKEN missing). Skipping AI evaluation for job ${job.id}.`;
          console.warn(`[Agent] ${warnMsg}`);
          summary.errors.push(warnMsg);
          continue;
        }

        try {
          evaluation = await this.judge.evaluateJob(job);
          this.stateManager.recordEvaluationSuccess(job.id, evaluation);
          summary.evaluatedWithAi++;
        } catch (err: unknown) {
          const judgeErr =
            err instanceof JudgeError
              ? err
              : this.judge.categorizeError(err);

          if (judgeErr.type === 'QUOTA_EXHAUSTED') {
            summary.quotaExhausted = true;
            summary.errors.push(judgeErr.message);
            console.error(`[Agent] CRITICAL: ${judgeErr.message}`);
            console.error('[Agent] Halting AI evaluation to avoid unexpected paid usage.');
            // Continue the loop so remaining scraped jobs are still prefiltered and identified
            continue;
          }

          if (judgeErr.type === 'AUTH_FAILURE' || judgeErr.type === 'INVALID_MODEL') {
            summary.errors.push(judgeErr.message);
            console.error(`[Agent] CONFIGURATION ERROR: ${judgeErr.message}`);
            console.error(
              `[Agent] Diagnostic Details: ${judgeErr.getDiagnosticString()}`
            );
            this.stateManager.recordEvaluationFailure(job.id, judgeErr.message);
            // Non-transient configuration issues will fail all subsequent items; halt run cleanly
            break;
          }

          console.error(`[Agent] Evaluation error for job ${job.id}: ${judgeErr.message}`);
          console.error(`[Agent] Diagnostic: ${judgeErr.getDiagnosticString()}`);
          this.stateManager.recordEvaluationFailure(job.id, judgeErr.message);
          summary.errors.push(`AI evaluation failed for ${job.id}: ${judgeErr.message}`);
          continue; // keep retryable for next scheduled run
        }
      }

      // Tally decisions
      if (evaluation) {
        if (evaluation.decision === 'match') {
          summary.matchesFound++;
        } else if (evaluation.decision === 'maybe') {
          summary.maybesFound++;
        } else {
          summary.rejectsFound++;
        }

        // 4. Notifications for evaluated matches/maybes
        if (evaluation.decision === 'match' || evaluation.decision === 'maybe') {
          const alreadyNotified = this.stateManager.hasBeenNotified(job.id);
          if (alreadyNotified && !this.forceNotify) {
            console.log(
              `[Agent] Opportunity already notified previously: [${evaluation.decision.toUpperCase()}] ${job.title.slice(0, 45)}... (skipping duplicate Telegram alert)`
            );
            continue;
          }

          if (summary.notificationsSent >= notificationLimit) {
            console.log(
              `[Agent] Notification safety cap (${notificationLimit}) reached. Queuing remaining matches for subsequent runs.`
            );
            continue;
          }

          const notifyResult = await this.notifier.notify(job, evaluation, this.dryRun);
          if (notifyResult.success) {
            if (!this.dryRun) {
              this.stateManager.recordNotificationSuccess(job.id);
            }
            summary.notificationsSent++;
            console.log(
              `[Agent] Successfully sent Telegram notification for [${evaluation.decision.toUpperCase()}] ${job.title.slice(0, 50)}...`
            );
          } else {
            console.error(`[Agent] Notification delivery failed for ${job.id}: ${notifyResult.error}`);
            this.stateManager.recordNotificationFailure(job.id, notifyResult.error || 'Unknown error');
            summary.errors.push(`Notification delivery failed for ${job.id}`);
          }
        }
      }
    }

    // Fallback delivery when AI quota is exhausted:
    // If AI evaluation was halted due to quota exhaustion, send the candidate IT jobs one by one
    // so the user still receives all discovered opportunities in Morocco!
    if (summary.quotaExhausted && this.notifier.isConfigured() && !this.dryRun) {
      console.log('[Agent] Dispatching prefiltered Moroccan IT opportunities one by one to Telegram...');
      await this.notifier.sendMessage(
        '⚠️ <b>AI Quota Alert (HTTP 402)</b>: AI model free allowance exhausted. Delivering discovered Moroccan IT job postings directly one by one:'
      );

      for (const { job, reason } of itCandidateJobs) {
        if (this.stateManager.hasBeenNotified(job.id)) {
          continue;
        }

        if (summary.notificationsSent >= notificationLimit) {
          console.log(`[Agent] Notification safety cap (${notificationLimit}) reached.`);
          break;
        }

        const res = await this.notifier.notifyPrefiltered(job, reason, this.dryRun);
        if (res.success) {
          this.stateManager.recordNotificationSuccess(job.id);
          summary.notificationsSent++;
          console.log(`[Agent] Delivered prefiltered notice for ${job.id}: ${job.title.slice(0, 50)}...`);
        }
      }
    }

    // 5. Persist state atomically
    try {
      this.stateManager.save();
      console.log('[Agent] Persistent state saved successfully.');
    } catch (saveErr) {
      const msg = `Failed to persist state: ${(saveErr as Error).message}`;
      console.error(`[Agent] ${msg}`);
      summary.errors.push(msg);
      summary.success = false;
    }

    console.log(
      `[Agent] Run completed. Total scraped: ${summary.totalScraped}, AI evaluated: ${summary.evaluatedWithAi}, Matches: ${summary.matchesFound}, Maybes: ${summary.maybesFound}, Notifications sent: ${summary.notificationsSent}`
    );

    return summary;
  }
}
