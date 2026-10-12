import { ScrapedJob } from '../matching/types.ts';

export interface ScraperSource {
  name: string;
  url: string;
  fetchJobs(): Promise<ScrapedJob[]>;
  fetchJobDetails?(job: ScrapedJob): Promise<ScrapedJob>;
}
