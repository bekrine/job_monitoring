import { JudgeEvaluation, ScrapedJob } from '../matching/types.ts';
import {
  formatTelegramMessage,
  formatPrefilterTelegramMessage,
} from './formatter.ts';

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
  fetchFn?: typeof fetch;
  paceDelayMs?: number;
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export class TelegramNotifier {
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly fetchFn: typeof fetch;
  private readonly paceDelayMs: number;

  constructor(config: TelegramConfig = {}) {
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID || '';
    this.fetchFn = config.fetchFn || fetch;
    this.paceDelayMs = config.paceDelayMs ?? 750; // Pacing delay so messages arrive one by one
  }

  public isConfigured(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  /**
   * Sends arbitrary HTML message to Telegram.
   */
  public async sendMessage(
    text: string,
    dryRun: boolean = false
  ): Promise<TelegramSendResult> {
    if (dryRun) {
      console.log('[DRY RUN] [Telegram Message]:', text);
      return { success: true, messageId: -1 };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        error:
          'Telegram not configured. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.',
      };
    }

    const endpoint = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      const response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };

      if (!response.ok || !data.ok) {
        return {
          success: false,
          error: data.description || `Telegram API error: HTTP ${response.status}`,
        };
      }

      // Small pacing delay so sequential sends arrive one by one
      if (this.paceDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.paceDelayMs));
      }

      return {
        success: true,
        messageId: data.result?.message_id,
      };
    } catch (err) {
      return {
        success: false,
        error: `Network error sending Telegram message: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Sends a notification for a match or maybe decision.
   * Strictly ignores reject decisions.
   */
  public async notify(
    job: ScrapedJob,
    evaluation: JudgeEvaluation,
    dryRun: boolean = false
  ): Promise<TelegramSendResult> {
    if (evaluation.decision === 'reject') {
      return {
        success: false,
        error: 'Rejected jobs must never trigger notifications.',
      };
    }

    const messageHtml = formatTelegramMessage(job, evaluation);
    return this.sendMessage(messageHtml, dryRun);
  }

  /**
   * Sends notification for prefiltered announcement when AI is offline.
   */
  public async notifyPrefiltered(
    job: ScrapedJob,
    reason: string,
    dryRun: boolean = false
  ): Promise<TelegramSendResult> {
    const messageHtml = formatPrefilterTelegramMessage(job, reason);
    return this.sendMessage(messageHtml, dryRun);
  }
}
