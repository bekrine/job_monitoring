import { describe, it, expect } from 'vitest';
import { prefilterJob, deduplicateJobs } from '../matching/prefilter.ts';
import { ScrapedJob } from '../matching/types.ts';

describe('Job Prefilter & Deduplication', () => {
  it('passes obvious IT jobs (Technicien Informatique)', () => {
    const job: ScrapedJob = {
      id: 'job-1',
      title: 'Technicien de 3ème grade spécialité Informatique',
      employer: 'Ministère de la Transition Numérique',
      location: 'Rabat',
      url: 'https://example.com/job-1',
      description: 'Administration réseau et maintenance informatique Bac+2 DTS.',
    };
    const res = prefilterJob(job);
    expect(res.passed).toBe(true);
  });

  it('passes general IT software engineer jobs', () => {
    const job: ScrapedJob = {
      id: 'job-2',
      title: 'Senior Fullstack Software Developer (React / Node.js)',
      employer: 'Tech Hub Casablanca',
      location: 'Casablanca',
      url: 'https://example.com/job-2',
      description: 'Développement d’applications web, API REST, cloud DevOps.',
    };
    const res = prefilterJob(job);
    expect(res.passed).toBe(true);
  });

  it('rejects medical professions without IT context', () => {
    const job: ScrapedJob = {
      id: 'job-3',
      title: 'Concours de recrutement Infirmier polyvalent',
      employer: 'CHU Ibn Sina',
      location: 'Rabat',
      url: 'https://example.com/job-3',
      description: 'Soins infirmiers en milieu hospitalier, service cardiologie.',
    };
    const res = prefilterJob(job);
    expect(res.passed).toBe(false);
  });

  it('rejects civil engineering / BTP jobs', () => {
    const job: ScrapedJob = {
      id: 'job-4',
      title: 'Conducteur de travaux Génie Civil et Bâtiment',
      employer: 'Société BTP Maroc',
      location: 'Tanger',
      url: 'https://example.com/job-4',
      description: 'Suivi de chantiers de construction gros œuvre et voirie.',
    };
    const res = prefilterJob(job);
    expect(res.passed).toBe(false);
  });

  it('deduplicates identical jobs by ID and title+employer', () => {
    const jobs: ScrapedJob[] = [
      {
        id: 'dup-1',
        title: 'Développeur Python',
        employer: 'Maroc Telecom',
        location: 'Rabat',
        url: 'https://example.com/p1',
        description: 'Python back-end',
      },
      {
        id: 'dup-1', // same id
        title: 'Développeur Python',
        employer: 'Maroc Telecom',
        location: 'Rabat',
        url: 'https://example.com/p1',
        description: 'Python back-end',
      },
      {
        id: 'dup-2',
        title: 'Développeur Python',
        employer: 'Maroc Telecom', // same title & employer
        location: 'Rabat',
        url: 'https://example.com/p2',
        description: 'Python back-end',
      },
      {
        id: 'unique-3',
        title: 'Technicien Réseaux',
        employer: 'ONCF',
        location: 'Rabat',
        url: 'https://example.com/p3',
        description: 'Support télécom',
      },
    ];

    const deduplicated = deduplicateJobs(jobs);
    expect(deduplicated.length).toBe(2);
    expect(deduplicated.map((j) => j.id)).toEqual(['dup-1', 'unique-3']);
  });
});
