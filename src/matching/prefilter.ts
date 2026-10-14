import { ScrapedJob } from './types.ts';
import { isCandidatureClosed } from './deadline-filter.ts';
import { evaluateJobSpecialite } from './specialite-filter.ts';

// Standard multi-character IT positive keywords in French, Arabic, and English
const IT_POSITIVE_KEYWORDS = [
  'informatique',
  'developpeur',
  'développeur',
  'developer',
  'software',
  'programmeur',
  'reseau',
  'réseau',
  'reseaux',
  'réseaux',
  'systeme',
  'système',
  'systemes',
  'systèmes',
  'technicien',
  'support it',
  'helpdesk',
  'maintenance informatique',
  'data engineer',
  'data scientist',
  'data analyst',
  'donnees',
  'données',
  'cloud',
  'devops',
  'cybersecurite',
  'cybersécurité',
  'securite informatique',
  'sécurité informatique',
  'database',
  'base de donnees',
  'base de données',
  'fullstack',
  'full-stack',
  'frontend',
  'front-end',
  'backend',
  'back-end',
  'mobile',
  'android',
  'ios',
  'technicien specialise',
  'technicien spécialisé',
  'genie logiciel',
  'génie logiciel',
  'معلوماتيات',
  'معلوميات',
  'إعلاميات',
  'إعلامي',
  'تقني',
  'مهندس دولة',
  'تقني من الدرجة الثالثة',
  'برمجة',
  'شبكات',
  'نظم المعلومات',
  'تكنولوجيا المعلومات',
];

// Short keywords that require strict whole-word boundary matching
const SHORT_IT_WORDS = new Set(['it', 'si', 'dsi', 'dts', 'ista', 'ofppt', 'sql', 'web', 'dev', 'api']);

// Obviously non-IT occupations
const EXCLUDED_JOB_TITLES = [
  'infirmier',
  'infirmiere',
  'infirmière',
  'medecin',
  'médecin',
  'sage-femme',
  'sage femme',
  'aide-soignant',
  'aide soignant',
  'pharmacien',
  'chauffeur',
  'conducteur',
  'gardien',
  'cuisinier',
  'serveur',
  'boucher',
  'menuisier',
  'plombier',
  'mecanicien',
  'mécanicien',
  'electricien batiment',
  'électricien bâtiment',
  'genie civil',
  'génie civil',
  'topographe',
  'architecte batiment',
  'ingenieur btp',
  'ingénieur btp',
  'assistant dentaire',
  'kinesitherapeute',
  'kinésithérapeute',
];

export interface PrefilterResult {
  passed: boolean;
  reason: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Checks if text contains any IT keywords using substring or strict word boundary.
 */
function hasItMatch(text: string): boolean {
  const norm = normalizeText(text);

  // 1. Check multi-word or long keywords
  for (const kw of IT_POSITIVE_KEYWORDS) {
    if (norm.includes(normalizeText(kw))) {
      return true;
    }
  }

  // 2. Tokenize and check short word matches
  const tokens = norm.split(/[^a-z0-9\u0600-\u06FF]+/).filter(Boolean);
  for (const token of tokens) {
    if (SHORT_IT_WORDS.has(token)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether a scraped job announcement passes the prefilter:
 * 1. Délai de dépôt des candidatures: Deadline must not have passed the current date.
 * 2. Spécialité: Must contain "informatique" or "technique de développement informatique" (or Moroccan Arabic equivalents).
 * 3. Title/occupation exclusions and IT keywords check.
 */
export function prefilterJob(
  job: ScrapedJob,
  referenceDate: Date = new Date()
): PrefilterResult {
  // 1. Deadline & candidature closure check (Délai de dépôt des candidatures)
  const closureCheck = isCandidatureClosed(job, referenceDate);
  if (closureCheck.isClosed) {
    return {
      passed: false,
      reason: `Prefilter: Candidature fermée - ${closureCheck.reason}`,
    };
  }

  // 2. Spécialité filter check
  const specialiteCheck = evaluateJobSpecialite(job);
  if (!specialiteCheck.matches) {
    return {
      passed: false,
      reason: `Prefilter: Spécialité non conforme (doit contenir "informatique" ou "technique de développement informatique")`,
    };
  }

  // 3. Excluded non-IT occupations check
  const combined = `${job.title} ${job.description} ${job.employer}`;
  const titleNorm = normalizeText(job.title);

  const isExcludedTitle = EXCLUDED_JOB_TITLES.some((kw) =>
    titleNorm.includes(normalizeText(kw))
  );

  const hasIt = hasItMatch(combined);

  if (isExcludedTitle && !hasIt) {
    return {
      passed: false,
      reason: `Prefilter: Excluded non-IT occupation detected in title without IT indicators`,
    };
  }

  if (!hasIt) {
    return {
      passed: false,
      reason: `Prefilter: No IT-related keywords matched in title or description`,
    };
  }

  return {
    passed: true,
    reason: `Prefilter: Spécialité validée (${specialiteCheck.matchedKeyword}) et délai ouvert`,
  };
}

/**
 * Deduplicates a list of jobs based on ID and normalized title+employer
 */
export function deduplicateJobs(jobs: ScrapedJob[]): ScrapedJob[] {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const uniqueJobs: ScrapedJob[] = [];

  for (const job of jobs) {
    const signature = `${normalizeText(job.title)}::${normalizeText(job.employer)}::${normalizeText(job.location)}`;
    if (seenIds.has(job.id) || seenSignatures.has(signature)) {
      continue;
    }
    seenIds.add(job.id);
    seenSignatures.add(signature);
    uniqueJobs.push(job);
  }

  return uniqueJobs;
}
