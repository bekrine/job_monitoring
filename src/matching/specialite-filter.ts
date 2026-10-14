import { ScrapedJob } from './types.ts';

/**
 * Positive keywords matching "informatique" and "technique de développement informatique"
 * across French and Arabic (including official Moroccan public administration and OFPPT terms).
 */
export const INFORMATIQUE_KEYWORDS_FR = [
  'informatique',
  'genie informatique',
  'systeme d\'information',
  'systemes d\'information',
  'informatique et reseaux',
  'maintenance informatique',
  'securite informatique',
  'genie logiciel',
  'sciences informatiques',
];

export const TECH_DEV_INFORMATIQUE_KEYWORDS_FR = [
  'technique de developpement informatique',
  'techniques de developpement informatique',
  'technicien de developpement informatique',
  'technicien en developpement informatique',
  'developpement informatique',
  'developpeur informatique',
  'developpement web',
  'developpement logiciel',
  'software developer',
  'software engineer',
  'fullstack developer',
  'full stack developer',
  'developpeur fullstack',
  'developpeur web',
];

export const INFORMATIQUE_KEYWORDS_AR = [
  'معلوميات',
  'المعلوميات',
  'معلوماتيات',
  'المعلوماتيات',
  'إعلاميات',
  'الإعلاميات',
  'تكنولوجيا المعلومات',
  'نظم المعلومات',
  'أنظمة المعلومات',
  'الأنظمة المعلوماتية',
  'علوم الحاسوب',
  'هندسة البرمجيات',
  'هندسة البرامج',
  'هندسة البيانات',
  'علم البيانات',
  'البيانات الضخمة',
  'الذكاء الاصطناعي',
  'الشبكات والأمن',
];

export const TECH_DEV_INFORMATIQUE_KEYWORDS_AR = [
  'تقنيات تطوير المعلوميات',
  'تطوير المعلوميات',
  'تقنيات البرمجة',
  'البرمجة المعلوماتية',
  'تطوير البرمجيات',
  'تطوير الأنظمة المعلوماتية',
  'تطوير الويب',
  'تطوير المواقع',
];

/**
 * Normalizes text by lowercasing, stripping diacritics / accents, and normalizing spaces.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SpecialiteCheckResult {
  matches: boolean;
  matchedKeyword?: string;
  sourceField?: 'specialite' | 'title' | 'description';
}

/**
 * Checks if a given text string contains the required specialty keywords:
 * "informatique" or "technique de développement informatique" (or their Moroccan Arabic equivalents).
 */
export function checkSpecialiteText(text: string): { matches: boolean; matchedKeyword?: string } {
  if (!text) return { matches: false };

  const norm = normalizeText(text);

  // 1. Check exact TDI abbreviation with word boundary
  if (/\btdi\b/.test(norm)) {
    return { matches: true, matchedKeyword: 'TDI (Techniques de Développement Informatique)' };
  }

  // 2. Check French technique de développement informatique phrases
  for (const kw of TECH_DEV_INFORMATIQUE_KEYWORDS_FR) {
    if (norm.includes(normalizeText(kw))) {
      return { matches: true, matchedKeyword: kw };
    }
  }

  // 3. Check French informatique terms
  for (const kw of INFORMATIQUE_KEYWORDS_FR) {
    if (norm.includes(normalizeText(kw))) {
      return { matches: true, matchedKeyword: kw };
    }
  }

  // 4. Check Arabic development terms
  for (const kw of TECH_DEV_INFORMATIQUE_KEYWORDS_AR) {
    if (norm.includes(normalizeText(kw))) {
      return { matches: true, matchedKeyword: kw };
    }
  }

  // 5. Check Arabic informatique terms
  for (const kw of INFORMATIQUE_KEYWORDS_AR) {
    if (norm.includes(normalizeText(kw))) {
      return { matches: true, matchedKeyword: kw };
    }
  }

  return { matches: false };
}

/**
 * Extracts and evaluates the Spécialité of a scraped job announcement.
 * Prioritizes the explicit `job.specialite` field if present, and falls back to
 * inspecting title and description.
 */
export function evaluateJobSpecialite(job: ScrapedJob): SpecialiteCheckResult {
  // 1. Priority: Explicit specialite field
  if (job.specialite) {
    const res = checkSpecialiteText(job.specialite);
    if (res.matches) {
      return {
        matches: true,
        matchedKeyword: res.matchedKeyword,
        sourceField: 'specialite',
      };
    }
  }

  // 2. Check title (many concours specify specialty directly in the title, e.g. "تخصص تكنولوجيا المعلومات")
  const titleRes = checkSpecialiteText(job.title);
  if (titleRes.matches) {
    return {
      matches: true,
      matchedKeyword: titleRes.matchedKeyword,
      sourceField: 'title',
    };
  }

  // 3. Check description content
  const descRes = checkSpecialiteText(job.description);
  if (descRes.matches) {
    return {
      matches: true,
      matchedKeyword: descRes.matchedKeyword,
      sourceField: 'description',
    };
  }

  return { matches: false };
}
