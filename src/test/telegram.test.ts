import { describe, it, expect, vi } from 'vitest';
import { TelegramNotifier } from '../notifier/telegram.ts';
import { formatTelegramMessage } from '../notifier/formatter.ts';
import { JudgeEvaluation, ScrapedJob } from '../matching/types.ts';

const mockJob: ScrapedJob = {
  id: 'tg-1',
  title: 'Technicien Informatique et Réseaux',
  employer: 'Ministère des Finances',
  location: 'Rabat, Maroc',
  url: 'https://www.emploi-public.ma/ar/concours/100',
  deadline: '30 Novembre 2026',
  description: 'DTS en Réseaux Informatiques',
};

const matchEvaluation: JudgeEvaluation = {
  decision: 'match',
  confidence: 90,
  category: 'technicien_specialise',
  reasons: 'Perfect fit for DTS Technicien Spécialisé in networking.',
  qualification_assessment: 'Bac+2 DTS OFPPT / ISTA',
  missing_information: 'None',
};

const maybeEvaluation: JudgeEvaluation = {
  decision: 'maybe',
  confidence: 60,
  category: 'both',
  reasons: 'Administrative assistant role with digital archiving duties.',
  qualification_assessment: 'Bac+2 ou Bac+3',
  missing_information: 'Exact IT percentage of work',
};

const rejectEvaluation: JudgeEvaluation = {
  decision: 'reject',
  confidence: 95,
  category: 'irrelevant',
  reasons: 'Accounting without IT component',
  qualification_assessment: 'Bac+2 Comptabilité',
  missing_information: 'None',
};

describe('Telegram Formatting & Notifications', () => {
  it('formats match notification with correct HTML tags and details', () => {
    const formatted = formatTelegramMessage(mockJob, matchEvaluation);
    expect(formatted).toContain('🎯 <b>[MATCH - IT Opportunity Found]</b>');
    expect(formatted).toContain('Technicien Informatique et Réseaux');
    expect(formatted).toContain('Ministère des Finances');
    expect(formatted).toContain('Category A: Technicien Spécialisé (Bac+2)');
    expect(formatted).toContain('90%');
    expect(formatted).toContain('https://www.emploi-public.ma/ar/concours/100');
  });

  it('clearly labels uncertain results as MAYBE', () => {
    const formatted = formatTelegramMessage(mockJob, maybeEvaluation);
    expect(formatted).toContain('⚠️ <b>[MAYBE - Human Review Recommended]</b>');
    expect(formatted).toContain('Exact IT percentage of work');
  });

  it('refuses to notify rejected jobs', async () => {
    const notifier = new TelegramNotifier({
      botToken: 'dummy_token',
      chatId: '12345',
    });

    const result = await notifier.notify(mockJob, rejectEvaluation);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Rejected jobs must never trigger notifications/);
  });

  it('executes dry-run without making HTTP requests', async () => {
    const mockFetch = vi.fn();
    const notifier = new TelegramNotifier({
      botToken: 'dummy_token',
      chatId: '12345',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await notifier.notify(mockJob, matchEvaluation, true);
    expect(result.success).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles Telegram API error responses gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
    });

    const notifier = new TelegramNotifier({
      botToken: 'invalid_token',
      chatId: '99999',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await notifier.notify(mockJob, matchEvaluation, false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('chat not found');
  });
});
