import * as cheerio from 'cheerio';
import { ScrapedJob } from '../matching/types.ts';
import { ScraperSource } from './types.ts';

export const EMPLOI_PUBLIC_BASE_URL = 'https://www.emploi-public.ma';
export const EMPLOI_PUBLIC_CONCOURS_URL = `${EMPLOI_PUBLIC_BASE_URL}/ar/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA`;

export class EmploiPublicScraper implements ScraperSource {
  public readonly name = 'Emploi-Public.ma';
  public readonly url = EMPLOI_PUBLIC_CONCOURS_URL;
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  public async fetchJobs(): Promise<ScrapedJob[]> {
    const response = await this.fetchFn(this.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr,ar;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Emploi-Public page: HTTP ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const jobs: ScrapedJob[] = [];

    // Parse links targeting /تفاصيل/المباريات/ or /details/
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const isConcoursDetail =
        href.includes('%D8%AA%D9%81%D8%A7%D8%B5%D9%8A%D9%84') ||
        href.includes('/details/') ||
        href.includes('/detail/');

      if (isConcoursDetail) {
        const fullUrl = href.startsWith('http')
          ? href
          : `${EMPLOI_PUBLIC_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

        // Extract ID from URL path (e.g. UUID at end)
        const pathSegments = href.split('/').filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1] || '';
        const id = `ep-${lastSegment || Math.random().toString(36).substring(2, 9)}`;

        const container = $(el).closest('.row, [class*="item"], .card, div');
        const containerText = container.text().replace(/\s+/g, ' ').trim();
        const linkText = $(el).text().replace(/\s+/g, ' ').trim();

        // Title and employer heuristics
        const rawTitle = linkText || containerText.slice(0, 120);
        let title = rawTitle;
        let employer = 'Administration Publique Marocaine';
        let deadline = '';

        // Try extracting deadline (e.g. "آخر أجل : ...")
        const deadlineMatch = containerText.match(/آخر أجل[^:]*:\s*([^–\n\r]+)/i);
        if (deadlineMatch && deadlineMatch[1]) {
          deadline = deadlineMatch[1].trim();
        }

        // Try extracting employer from text after title or dash
        if (containerText.includes('وزارة') || containerText.includes('جماعة') || containerText.includes('المكتب')) {
          const empMatch = containerText.match(/(وزارة [^\s–]+(?: [^\s–]+){0,4}|جماعة [^\s–]+|المكتب [^\s–]+)/);
          if (empMatch && empMatch[1]) {
            employer = empMatch[1].trim();
          }
        }

        // Prevent duplicate IDs in the scrape batch
        if (!jobs.some((j) => j.id === id || j.url === fullUrl)) {
          jobs.push({
            id,
            title: title.slice(0, 200),
            employer,
            location: 'Maroc',
            url: fullUrl,
            deadline: deadline || undefined,
            description: containerText || title,
            rawText: containerText,
          });
        }
      }
    });

    return jobs;
  }

  public async fetchJobDetails(job: ScrapedJob): Promise<ScrapedJob> {
    try {
      const response = await this.fetchFn(job.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching detail page`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove script/style tags
      $('script, style, noscript, iframe').remove();

      // Extract main content area or body
      const mainContent =
        $('main, .content, .container, #content, body').first().text().replace(/\s+/g, ' ').trim() ||
        job.description;

      return {
        ...job,
        description: mainContent.slice(0, 4000),
      };
    } catch (err) {
      // Re-throw so caller knows detail retrieval failed and keeps it retryable
      throw new Error(`Failed to fetch detail for ${job.url}: ${(err as Error).message}`);
    }
  }
}
