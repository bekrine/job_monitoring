import * as fs from 'fs';
import * as path from 'path';
import { JudgeEvaluation, ScrapedJob } from '../matching/types.ts';
import { SeenJobRecord, SeenState } from './types.ts';

export interface StateManagerConfig {
  stateFilePath?: string;
  firstRunMaxNotifications?: number;
  maxNotificationsPerRun?: number;
  dryRun?: boolean;
}

export const DEFAULT_STATE_FILE = 'data/seen.json';
export const DEFAULT_FIRST_RUN_MAX_NOTIFICATIONS = 5;
export const DEFAULT_MAX_NOTIFICATIONS_PER_RUN = 10;

export class StateManager {
  private readonly stateFilePath: string;
  private readonly firstRunMaxNotifications: number;
  private readonly maxNotificationsPerRun: number;
  private readonly dryRun: boolean;
  private state: SeenState;
  private wasInitialStateEmpty: boolean = false;

  constructor(config: StateManagerConfig = {}) {
    this.stateFilePath = path.resolve(
      process.cwd(),
      config.stateFilePath || DEFAULT_STATE_FILE
    );
    this.firstRunMaxNotifications =
      config.firstRunMaxNotifications ??
      Number(process.env.FIRST_RUN_MAX_NOTIFICATIONS || DEFAULT_FIRST_RUN_MAX_NOTIFICATIONS);
    this.maxNotificationsPerRun =
      config.maxNotificationsPerRun ??
      Number(process.env.MAX_NOTIFICATIONS_PER_RUN || DEFAULT_MAX_NOTIFICATIONS_PER_RUN);
    this.dryRun = config.dryRun ?? false;

    this.state = this.loadState();
  }

  private loadState(): SeenState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw) as SeenState;
        if (parsed && typeof parsed.jobs === 'object') {
          this.wasInitialStateEmpty = Object.keys(parsed.jobs).length === 0;
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`[StateManager] Notice: Could not read existing state file, initializing clean state: ${(err as Error).message}`);
    }

    this.wasInitialStateEmpty = true;
    return {
      version: 1,
      lastRunAt: new Date().toISOString(),
      totalJobsSeen: 0,
      jobs: {},
    };
  }

  public isFirstRun(): boolean {
    return this.wasInitialStateEmpty;
  }

  public getEffectiveNotificationLimit(): number {
    return this.isFirstRun()
      ? this.firstRunMaxNotifications
      : this.maxNotificationsPerRun;
  }

  public getRecord(jobId: string): SeenJobRecord | undefined {
    return this.state.jobs[jobId];
  }

  public hasBeenNotified(jobId: string): boolean {
    return Boolean(this.state.jobs[jobId]?.notified);
  }

  public getCachedEvaluation(jobId: string): JudgeEvaluation | undefined {
    const record = this.state.jobs[jobId];
    if (record?.evaluated && record.evaluation) {
      return record.evaluation;
    }
    return undefined;
  }

  public recordJobDiscovered(job: ScrapedJob, detailFetched: boolean): SeenJobRecord {
    const now = new Date().toISOString();
    const existing = this.state.jobs[job.id];

    if (existing) {
      existing.lastUpdatedAt = now;
      if (detailFetched) {
        existing.detailFetched = true;
      }
      return existing;
    }

    const newRecord: SeenJobRecord = {
      id: job.id,
      url: job.url,
      title: job.title,
      employer: job.employer,
      firstSeenAt: now,
      lastUpdatedAt: now,
      detailFetched,
      evaluated: false,
      notified: false,
    };

    this.state.jobs[job.id] = newRecord;
    this.state.totalJobsSeen++;
    return newRecord;
  }

  public recordPrefilterResult(jobId: string, passed: boolean): void {
    const record = this.state.jobs[jobId];
    if (record) {
      record.prefilterPassed = passed;
      record.lastUpdatedAt = new Date().toISOString();
    }
  }

  public recordEvaluationSuccess(
    jobId: string,
    evaluation: JudgeEvaluation
  ): void {
    const record = this.state.jobs[jobId];
    if (record) {
      record.evaluated = true;
      record.evaluation = evaluation;
      record.evaluationError = undefined;
      record.evaluationFailedAt = undefined;
      record.lastUpdatedAt = new Date().toISOString();
    }
  }

  public recordEvaluationFailure(jobId: string, errorMsg: string): void {
    const record = this.state.jobs[jobId];
    if (record) {
      // Keep evaluated as false so it remains retryable
      record.evaluated = false;
      record.evaluationError = errorMsg;
      record.evaluationFailedAt = new Date().toISOString();
      record.lastUpdatedAt = new Date().toISOString();
    }
  }

  public recordNotificationSuccess(jobId: string): void {
    const record = this.state.jobs[jobId];
    if (record) {
      record.notified = true;
      record.notifiedAt = new Date().toISOString();
      record.notificationError = undefined;
      record.lastUpdatedAt = new Date().toISOString();
    }
  }

  public recordNotificationFailure(jobId: string, errorMsg: string): void {
    const record = this.state.jobs[jobId];
    if (record) {
      // Keep notified as false so it remains retryable
      record.notified = false;
      record.notificationError = errorMsg;
      record.lastUpdatedAt = new Date().toISOString();
    }
  }

  /**
   * Atomically writes state to disk unless dryRun is active.
   */
  public save(): void {
    if (this.dryRun) {
      console.log('[DRY RUN] Skipping persistent state write to disk.');
      return;
    }

    this.state.lastRunAt = new Date().toISOString();
    const dir = path.dirname(this.stateFilePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${this.stateFilePath}.tmp.${Date.now()}`;
    const payload = JSON.stringify(this.state, null, 2);

    fs.writeFileSync(tempPath, payload, 'utf-8');
    fs.renameSync(tempPath, this.stateFilePath);
  }

  /**
   * Resets the notified status for all jobs so they can be re-notified if requested.
   */
  public resetNotifiedStatus(): number {
    let count = 0;
    for (const record of Object.values(this.state.jobs)) {
      if (record.notified) {
        record.notified = false;
        record.notifiedAt = undefined;
        record.lastUpdatedAt = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  public getAllRecords(): Record<string, SeenJobRecord> {
    return { ...this.state.jobs };
  }

  public getRawState(): SeenState {
    return JSON.parse(JSON.stringify(this.state));
  }
}
