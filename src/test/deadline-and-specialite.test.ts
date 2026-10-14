import { describe, it, expect } from 'vitest';
import {
  parseMoroccanDate,
  isDeadlinePassed,
  isCandidatureClosed,
} from '../matching/deadline-filter.ts';
import {
  checkSpecialiteText,
  evaluateJobSpecialite,
} from '../matching/specialite-filter.ts';
import { prefilterJob } from '../matching/prefilter.ts';
import { ScrapedJob } from '../matching/types.ts';

describe('Délai de Dépôt des Candidatures (Deadline Filter)', () => {
  const referenceDate = new Date('2026-10-14T12:00:00Z');

  it('correctly parses Arabic written dates with time', () => {
    const parsed = parseMoroccanDate('30 أكتوبر 2026 - 16:30');
    expect(parsed).not.toBeNull();
    expect(parsed!.getUTCFullYear()).toBe(2026);
    expect(parsed!.getUTCMonth()).toBe(9); // October is index 9
    expect(parsed!.getUTCDate()).toBe(30);
  });

  it('correctly parses Arabic written dates without time defaulting to end of day', () => {
    const parsed = parseMoroccanDate('15 أكتوبر 2026');
    expect(parsed).not.toBeNull();
    expect(parsed!.getUTCDate()).toBe(15);
    expect(parsed!.getUTCHours()).toBe(22); // 23:59:59 Morocco UTC+1 is 22:59:59 UTC
  });

  it('correctly parses French written dates', () => {
    const parsed = parseMoroccanDate('25 Octobre 2026');
    expect(parsed).not.toBeNull();
    expect(parsed!.getUTCFullYear()).toBe(2026);
    expect(parsed!.getUTCMonth()).toBe(9);
    expect(parsed!.getUTCDate()).toBe(25);
  });

  it('correctly parses numeric slash format DD/MM/YYYY', () => {
    const parsed = parseMoroccanDate('20/10/2026');
    expect(parsed).not.toBeNull();
    expect(parsed!.getUTCDate()).toBe(20);
    expect(parsed!.getUTCMonth()).toBe(9);
  });

  it('identifies deadlines that have passed the current date', () => {
    // 7 October 2026 has passed on 14 October 2026
    const passed = isDeadlinePassed('7 أكتوبر 2026 - 16:30', referenceDate);
    expect(passed).toBe(true);

    const passedSeptember = isDeadlinePassed('30 شتنبر 2026 - 16:30', referenceDate);
    expect(passedSeptember).toBe(true);
  });

  it('identifies deadlines that have not passed the current date', () => {
    // 30 October 2026 has not passed on 14 October 2026
    const passed = isDeadlinePassed('30 أكتوبر 2026 - 16:30', referenceDate);
    expect(passed).toBe(false);

    const passedNextMonth = isDeadlinePassed('15 Novembre 2026', referenceDate);
    expect(passedNextMonth).toBe(false);
  });

  it('marks announcements as closed if deadline has passed', () => {
    const job: ScrapedJob = {
      id: 'job-closed-01',
      title: 'مباراة لتوظيف مهندس دولة من الدرجة الأولى',
      employer: 'وزارة التربية الوطنية',
      location: 'Rabat',
      url: 'https://example.com/expired-job',
      deadline: '7 أكتوبر 2026 - 16:30',
      description: 'Concours ingénieur',
    };

    const res = isCandidatureClosed(job, referenceDate);
    expect(res.isClosed).toBe(true);
    expect(res.reason).toContain('Délai de dépôt des candidatures dépassé');
  });

  it('marks announcements as closed if title indicates convocation or results phase', () => {
    const job: ScrapedJob = {
      id: 'job-convocation-02',
      title: 'لائحة المدعوين لإجراء الاختبار الكتابي لمباراة توظيف مهندس دولة',
      employer: 'وزارة الداخلية',
      location: 'Rabat',
      url: 'https://example.com/convocation',
      deadline: '25 أكتوبر 2026', // Even if an exam date was parsed as deadline
      description: 'Convocation aux épreuves écrites.',
    };

    const res = isCandidatureClosed(job, referenceDate);
    expect(res.isClosed).toBe(true);
    expect(res.reason).toContain('Candidatures closes');
  });

  it('keeps active jobs open if deadline is in the future', () => {
    const job: ScrapedJob = {
      id: 'job-active-03',
      title: 'مباراة لتوظيف مهندس دولة من الدرجة الأولى',
      employer: 'المندوبية السامية للتخطيط',
      location: 'Rabat',
      url: 'https://example.com/active',
      deadline: '30 أكتوبر 2026 - 16:30',
      description: 'Concours ouvert pour candidatures.',
    };

    const res = isCandidatureClosed(job, referenceDate);
    expect(res.isClosed).toBe(false);
  });
});

describe('Spécialité Filter (informatique / technique de développement informatique)', () => {
  it('matches French "informatique" keyword', () => {
    const res = checkSpecialiteText('Spécialité : Informatique et Réseaux');
    expect(res.matches).toBe(true);
  });

  it('matches French "technique de développement informatique" keyword', () => {
    const res = checkSpecialiteText('Spécialité : Techniques de développement informatique');
    expect(res.matches).toBe(true);
  });

  it('matches TDI abbreviation', () => {
    const res = checkSpecialiteText('Diplôme de Technicien Spécialisé option TDI');
    expect(res.matches).toBe(true);
  });

  it('matches Arabic "المعلوميات" keyword', () => {
    const res = checkSpecialiteText('تخصص : المعلوميات والشبكات');
    expect(res.matches).toBe(true);
  });

  it('matches Arabic "تقنيات تطوير المعلوميات" / "تطوير المعلوميات" keyword', () => {
    const res = checkSpecialiteText(
      'تخصص : علم البيانات، البيانات الضخمة والذكاء الاصطناعي، تطوير المعلوميات، الشبكات والأمن'
    );
    expect(res.matches).toBe(true);
  });

  it('rejects non-IT specialities (Agriculture, Pharmacy, Civil Engineering, Management)', () => {
    expect(checkSpecialiteText('تخصص : الهندسة الزراعية').matches).toBe(false);
    expect(checkSpecialiteText('تخصص : الصيدلة').matches).toBe(false);
    expect(checkSpecialiteText('تخصص : تقني متخصص في التقنيات الفلاحية').matches).toBe(false);
    expect(checkSpecialiteText('تخصص : تدبير المقاولات - التجارة').matches).toBe(false);
    expect(checkSpecialiteText('تخصص : تقني في الهندسة المدنية').matches).toBe(false);
  });

  it('evaluates job specialite from explicit field, title, or description', () => {
    const jobWithExplicitSpec: ScrapedJob = {
      id: 'job-spec-1',
      title: 'مباراة لتوظيف متصرف من الدرجة الثانية',
      employer: 'Ministère',
      location: 'Rabat',
      url: 'https://example.com/1',
      specialite: 'هندسة البيانات / البيانات الضخمة / علوم البيانات والنظم التقريرية',
      description: 'Détails du concours...',
    };
    expect(evaluateJobSpecialite(jobWithExplicitSpec).matches).toBe(true);

    const jobWithNonItSpec: ScrapedJob = {
      id: 'job-spec-2',
      title: 'مباراة لتوظيف تقني من الدرجة الثالثة',
      employer: 'Ministère',
      location: 'Rabat',
      url: 'https://example.com/2',
      specialite: 'الإنتاج النباتي والفلاحة البيولوجية',
      description: 'Détails du concours...',
    };
    expect(evaluateJobSpecialite(jobWithNonItSpec).matches).toBe(false);
  });
});

describe('Prefilter Integration with Deadline & Spécialité', () => {
  const currentDate = new Date('2026-10-14T12:00:00Z');

  it('passes an active IT concours with valid deadline and matching specialite', () => {
    const job: ScrapedJob = {
      id: 'ep-active-it-01',
      title: 'مباراة لتوظيف مهندس دولة من الدرجة الأولى تخصص تطوير المعلوميات',
      employer: 'المندوبية السامية للتخطيط',
      location: 'Rabat, Maroc',
      url: 'https://www.emploi-public.ma/ar/concours/1',
      deadline: '30 أكتوبر 2026 - 16:30',
      specialite: 'تطوير المعلوميات، الذكاء الاصطناعي، الشبكات والأمن',
      description: 'Concours de recrutement pour le profil développement informatique.',
    };

    const res = prefilterJob(job, currentDate);
    expect(res.passed).toBe(true);
    expect(res.reason).toContain('Spécialité validée');
  });

  it('rejects an announcement whose deadline has passed (e.g. 7 October 2026)', () => {
    const job: ScrapedJob = {
      id: 'ep-expired-02',
      title: 'مباراة لتوظيف مهندس دولة من الدرجة الأولى - تخصص المعلوميات',
      employer: 'وزارة التربية الوطنية',
      location: 'Rabat, Maroc',
      url: 'https://www.emploi-public.ma/ar/concours/2',
      deadline: '7 أكتوبر 2026 - 16:30',
      specialite: 'المعلوميات',
      description: 'Recrutement ingénieur état.',
    };

    const res = prefilterJob(job, currentDate);
    expect(res.passed).toBe(false);
    expect(res.reason).toContain('Délai de dépôt des candidatures dépassé');
  });

  it('rejects an active announcement whose specialite does not match informatique or technique de developpement informatique', () => {
    const job: ScrapedJob = {
      id: 'ep-non-it-03',
      title: 'مباراة لتوظيف مهندس دولة من الدرجة الأولى - تخصص الهندسة الزراعية',
      employer: 'وزارة الفلاحة',
      location: 'Rabat, Maroc',
      url: 'https://www.emploi-public.ma/ar/concours/3',
      deadline: '30 أكتوبر 2026 - 16:30',
      specialite: 'الهندسة الزراعية',
      description: 'Recrutement ingénieur agronome.',
    };

    const res = prefilterJob(job, currentDate);
    expect(res.passed).toBe(false);
    expect(res.reason).toContain('Spécialité non conforme');
  });

  it('rejects convocations published after submission ended (لائحة المدعوين)', () => {
    const job: ScrapedJob = {
      id: 'ep-convocation-04',
      title: 'لائحة المدعوين لإجراء الاختبار الكتابي لمباراة توظيف تقني من الدرجة الثالثة',
      employer: 'وزارة الداخلية',
      location: 'Rabat, Maroc',
      url: 'https://www.emploi-public.ma/ar/concours/4',
      deadline: '25 أكتوبر 2026',
      specialite: 'تكنولوجيا المعلومات',
      description: 'لائحة المدعوين لاجتياز الامتحان الكتابي.',
    };

    const res = prefilterJob(job, currentDate);
    expect(res.passed).toBe(false);
    expect(res.reason).toContain('Candidature fermée');
  });
});
