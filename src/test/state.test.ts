import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from '../state/state-manager.ts';
import { JudgeEvaluation, ScrapedJob } from '../matching/types.ts';

const TEST_STATE_PATH = path.resolve(process.cwd(), 'data/test-seen.json');

const testJob: ScrapedJob = {
  id: 'test-job-99',
  title: 'Développeur Symfony',
  employer: 'Agence Digitale Rabat',
  location: 'Rabat',
  url: 'https://example.com/job-99',
  description: 'Bac+2 DTS informatique',
};

const testEvaluation: JudgeEvaluation = {
  decision: 'match',
  confidence: 88,
  category: 'technicien_specialise',
  reasons: 'DTS match',
  qualification_assessment: 'Bac+2',
  missing_information: 'None',
};

describe('StateManager Persistence & Reliability', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_STATE_PATH)) {
      fs.unlinkSync(TEST_STATE_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_STATE_PATH)) {
      fs.unlinkSync(TEST_STATE_PATH);
    }
  });

  it('detects first-run state when file does not exist', () => {
    const sm = new StateManager({
      stateFilePath: TEST_STATE_PATH,
      firstRunMaxNotifications: 5,
      maxNotificationsPerRun: 15,
    });

    expect(sm.isFirstRun()).toBe(true);
    expect(sm.getEffectiveNotificationLimit()).toBe(5);
  });

  it('atomically saves and restores state across sessions', () => {
    const sm1 = new StateManager({ stateFilePath: TEST_STATE_PATH });
    sm1.recordJobDiscovered(testJob, true);
    sm1.recordEvaluationSuccess(testJob.id, testEvaluation);
    sm1.recordNotificationSuccess(testJob.id);
    sm1.save();

    expect(fs.existsSync(TEST_STATE_PATH)).toBe(true);

    // Second session
    const sm2 = new StateManager({
      stateFilePath: TEST_STATE_PATH,
      firstRunMaxNotifications: 5,
      maxNotificationsPerRun: 15,
    });
    expect(sm2.isFirstRun()).toBe(false);
    expect(sm2.getEffectiveNotificationLimit()).toBe(15);
    expect(sm2.hasBeenNotified(testJob.id)).toBe(true);

    const cached = sm2.getCachedEvaluation(testJob.id);
    expect(cached).toBeDefined();
    expect(cached?.decision).toBe('match');
  });

  it('keeps failed AI evaluations retryable (evaluated: false)', () => {
    const sm = new StateManager({ stateFilePath: TEST_STATE_PATH });
    sm.recordJobDiscovered(testJob, true);
    sm.recordEvaluationFailure(testJob.id, 'Rate limit 429');
    sm.save();

    const record = sm.getRecord(testJob.id);
    expect(record?.evaluated).toBe(false);
    expect(record?.evaluationError).toBe('Rate limit 429');

    // Cached evaluation should return undefined so it gets retried
    expect(sm.getCachedEvaluation(testJob.id)).toBeUndefined();
  });

  it('keeps failed notifications retryable (notified: false)', () => {
    const sm = new StateManager({ stateFilePath: TEST_STATE_PATH });
    sm.recordJobDiscovered(testJob, true);
    sm.recordEvaluationSuccess(testJob.id, testEvaluation);
    sm.recordNotificationFailure(testJob.id, 'Telegram network error');
    sm.save();

    const record = sm.getRecord(testJob.id);
    expect(record?.evaluated).toBe(true);
    expect(record?.notified).toBe(false);
    expect(sm.hasBeenNotified(testJob.id)).toBe(false);
  });

  it('does not write to disk in dry-run mode', () => {
    const sm = new StateManager({
      stateFilePath: TEST_STATE_PATH,
      dryRun: true,
    });
    sm.recordJobDiscovered(testJob, true);
    sm.save();

    expect(fs.existsSync(TEST_STATE_PATH)).toBe(false);
  });
});
