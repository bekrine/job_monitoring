import { JudgeEvaluation } from '../matching/types.ts';

export interface SeenJobRecord {
  id: string;
  url: string;
  title: string;
  employer: string;
  firstSeenAt: string;
  lastUpdatedAt: string;
  detailFetched: boolean;
  prefilterPassed?: boolean;
  evaluated: boolean;
  evaluation?: JudgeEvaluation;
  evaluationFailedAt?: string;
  evaluationError?: string;
  notified: boolean;
  notifiedAt?: string;
  notificationError?: string;
}

export interface SeenState {
  version: number;
  lastRunAt: string;
  totalJobsSeen: number;
  jobs: Record<string, SeenJobRecord>;
}
