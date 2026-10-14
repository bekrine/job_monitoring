import { JudgeEvaluation, ScrapedJob } from '../matching/types.ts';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Formats a job match or maybe decision into a Telegram HTML message.
 */
export function formatTelegramMessage(
  job: ScrapedJob,
  evalResult: JudgeEvaluation
): string {
  const isMaybe = evalResult.decision === 'maybe';
  const statusBadge = isMaybe
    ? '⚠️ <b>[MAYBE - Human Review Recommended]</b>'
    : '🎯 <b>[MATCH - IT Opportunity Found]</b>';

  let categoryLabel = 'IT General';
  if (evalResult.category === 'technicien_specialise') {
    categoryLabel = 'Category A: Technicien Spécialisé (Bac+2)';
  } else if (evalResult.category === 'both') {
    categoryLabel = 'Category A & B: Technicien Spécialisé & General IT';
  } else if (evalResult.category === 'it_general') {
    categoryLabel = 'Category B: General IT (Morocco)';
  }

  const lines = [
    statusBadge,
    '',
    `💼 <b>Title:</b> ${escapeHtml(job.title)}`,
    `🏢 <b>Employer:</b> ${escapeHtml(job.employer)}`,
    `📍 <b>Location:</b> ${escapeHtml(job.location)}`,
    `🎓 <b>Category:</b> ${escapeHtml(categoryLabel)}`,
    `📊 <b>Confidence:</b> ${evalResult.confidence}%`,
    `📜 <b>Qualification:</b> ${escapeHtml(evalResult.qualification_assessment)}`,
  ];

  if (job.specialite) {
    lines.push(`🎯 <b>Spécialité:</b> ${escapeHtml(job.specialite)}`);
  }

  if (job.deadline) {
    lines.push(`⏰ <b>Deadline:</b> ${escapeHtml(job.deadline)}`);
  }

  lines.push('');
  lines.push(`💡 <b>Reasoning:</b> ${escapeHtml(evalResult.reasons)}`);

  if (isMaybe && evalResult.missing_information && evalResult.missing_information !== 'None') {
    lines.push(`❓ <b>Missing Information:</b> ${escapeHtml(evalResult.missing_information)}`);
  }

  lines.push('');
  lines.push(`🔗 <a href="${job.url}">View Original Job Announcement</a>`);

  return lines.join('\n');
}

/**
 * Formats a prefiltered job announcement when AI inference is unavailable/quota exhausted.
 */
export function formatPrefilterTelegramMessage(
  job: ScrapedJob,
  reason: string
): string {
  const lines = [
    '📋 <b>[IT OPPORTUNITY FOUND - PREFILTERED]</b>',
    '<i>(AI inference offline: Hugging Face free credits exhausted)</i>',
    '',
    `💼 <b>Title:</b> ${escapeHtml(job.title)}`,
    `🏢 <b>Employer:</b> ${escapeHtml(job.employer)}`,
    `📍 <b>Location:</b> ${escapeHtml(job.location)}`,
    `💡 <b>Detection:</b> ${escapeHtml(reason)}`,
  ];

  if (job.deadline) {
    lines.push(`⏰ <b>Deadline:</b> ${escapeHtml(job.deadline)}`);
  }

  lines.push('');
  lines.push(`🔗 <a href="${job.url}">View Original Job Announcement</a>`);

  return lines.join('\n');
}
