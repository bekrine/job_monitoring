import { ScrapedJob } from './types.ts';

/**
 * Mapping of Arabic month names (and common spelling variations) to 0-based month index.
 */
export const ARABIC_MONTHS: Record<string, number> = {
  يناير: 0,
  فبراير: 1,
  مارس: 2,
  أبريل: 3,
  ابريل: 3,
  إبريل: 3,
  ماي: 4,
  مايو: 4,
  يونيو: 5,
  يوليوز: 6,
  يوليو: 6,
  غشت: 7,
  أغسطس: 7,
  اغسطس: 7,
  شتنبر: 8,
  سبتمبر: 8,
  أكتوبر: 9,
  اكتوبر: 9,
  إكتوبر: 9,
  نونبر: 10,
  نوفمبر: 10,
  دجنبر: 11,
  ديسمبر: 11,
};

/**
 * Mapping of French month names to 0-based month index.
 */
export const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11,
};

/**
 * Keywords in titles or summaries that indicate the candidature submission period has ended
 * and the contest is in subsequent post-submission stages (convocations, exam results, etc.).
 */
export const CLOSED_STAGE_INDICATORS = [
  'لائحة المدعوين',
  'لائحة الناجحين',
  'الاستدعاء للاختبار',
  'الاستدعاء للمقابلات',
  'نتائج الاختبار',
  'النتائج النهائية',
  'liste des convoques',
  'liste des convoqués',
  'liste des admis',
  'resultats du concours',
  'résultats du concours',
  'convocation a l’ecrit',
  'convocation à l’écrit',
];

/**
 * Parses written Moroccan/French/Arabic date strings into a JavaScript Date object.
 * Examples:
 * - "30 أكتوبر 2026 - 16:30"
 * - "15 أكتوبر 2026"
 * - "25 Octobre 2026"
 * - "15/10/2026" or "15-10-2026"
 */
export function parseMoroccanDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const cleaned = dateStr.trim();

  // Pattern 1: DD <MonthName> YYYY [- HH:MM]
  const wordMonthRegex =
    /([0-9]{1,2})\s+([^\s0-9–-]+)\s+([0-9]{4})(?:\s*[-–:]\s*([0-9]{1,2}):([0-9]{2}))?/i;
  const wordMatch = cleaned.match(wordMonthRegex);
  if (wordMatch) {
    const day = parseInt(wordMatch[1], 10);
    const rawMonth = wordMatch[2].toLowerCase().replace(/[.,;:]/g, '').trim();
    const year = parseInt(wordMatch[3], 10);

    let monthIdx = ARABIC_MONTHS[rawMonth];
    if (monthIdx === undefined) {
      monthIdx = FRENCH_MONTHS[rawMonth];
    }

    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      const hour = wordMatch[4] ? parseInt(wordMatch[4], 10) : 23;
      const min = wordMatch[5] ? parseInt(wordMatch[5], 10) : 59;
      const sec = wordMatch[4] ? 0 : 59;

      // Note: Morocco uses UTC+1 timezone. We create the date timestamp accordingly.
      return new Date(Date.UTC(year, monthIdx, day, hour - 1, min, sec));
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY [HH:MM]
  const slashRegex =
    /([0-9]{1,2})[\/\.-]([0-9]{1,2})[\/\.-]([0-9]{4})(?:\s*[-–:]?\s*([0-9]{1,2}):([0-9]{2}))?/;
  const slashMatch = cleaned.match(slashRegex);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const monthIdx = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);

    if (monthIdx >= 0 && monthIdx <= 11 && day >= 1 && day <= 31) {
      const hour = slashMatch[4] ? parseInt(slashMatch[4], 10) : 23;
      const min = slashMatch[5] ? parseInt(slashMatch[5], 10) : 59;
      const sec = slashMatch[4] ? 0 : 59;
      return new Date(Date.UTC(year, monthIdx, day, hour - 1, min, sec));
    }
  }

  // Pattern 3: YYYY-MM-DD
  const isoRegex = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T|\s)?(?:([0-9]{2}):([0-9]{2}))?/;
  const isoMatch = cleaned.match(isoRegex);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const monthIdx = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 23;
    const min = isoMatch[5] ? parseInt(isoMatch[5], 10) : 59;
    return new Date(Date.UTC(year, monthIdx, day, hour - 1, min, 59));
  }

  return null;
}

/**
 * Checks if a deadline string has already passed the reference date.
 */
export function isDeadlinePassed(
  deadlineStr: string | undefined,
  referenceDate: Date = new Date()
): boolean {
  if (!deadlineStr) return false;
  const parsed = parseMoroccanDate(deadlineStr);
  if (!parsed) return false;
  return parsed.getTime() < referenceDate.getTime();
}

export interface CandidatureClosureCheck {
  isClosed: boolean;
  reason?: string;
  parsedDeadline?: Date | null;
}

/**
 * Checks whether a job announcement is no longer accepting candidatures
 * because its deadline has passed or it represents a post-submission stage
 * (convocation / exam results publication).
 */
export function isCandidatureClosed(
  job: ScrapedJob,
  referenceDate: Date = new Date()
): CandidatureClosureCheck {
  // 1. Check title for convocation / results announcement flags (e.g. لائحة المدعوين, لائحة الناجحين)
  const titleText = job.title.toLowerCase();
  for (const indicator of CLOSED_STAGE_INDICATORS) {
    if (titleText.includes(indicator.toLowerCase())) {
      return {
        isClosed: true,
        reason: `Candidatures closes: annonce de convocation ou résultats déjà publiée (${indicator})`,
      };
    }
  }

  // 2. Check extracted deadline date
  if (job.deadline) {
    const parsed = parseMoroccanDate(job.deadline);
    if (parsed) {
      if (parsed.getTime() < referenceDate.getTime()) {
        return {
          isClosed: true,
          reason: `Délai de dépôt des candidatures dépassé (${job.deadline})`,
          parsedDeadline: parsed,
        };
      }
      return {
        isClosed: false,
        parsedDeadline: parsed,
      };
    }
  }

  // 3. Fallback: Check if description contains an explicit deadline phrase that passed
  const deadlineMatch = job.description.match(
    /(?:آخر أجل لإيداع الترشيحات|آخر أجل لإيداع ملفات الترشيح|آخر أجل|Délai de dépôt des candidatures|Date limite de dépôt)\s*[:]?\s*([0-9]{1,2}\s+[^\s\n\r–-]+(?:\s+[0-9]{4})?(?:\s*-\s*[0-9]{1,2}:[0-9]{2})?|[0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{4})/i
  );
  if (deadlineMatch && deadlineMatch[1]) {
    const parsed = parseMoroccanDate(deadlineMatch[1]);
    if (parsed && parsed.getTime() < referenceDate.getTime()) {
      return {
        isClosed: true,
        reason: `Délai de dépôt des candidatures dépassé (${deadlineMatch[1].trim()})`,
        parsedDeadline: parsed,
      };
    }
  }

  return { isClosed: false };
}
