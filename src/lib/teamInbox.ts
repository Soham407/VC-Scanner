import { loadTeamReview } from './teamReview';

export type TeamInboxItem = {
  address: string | null;
  assignedToUserId: string | null;
  teamId: string | null;
  assignedAt: string | null;
  assignmentState: 'assigned' | 'done' | 'needs_review' | null;
  capturedByUserId: string;
  companyName: string | null;
  createdAt: string;
  email: string | null;
  fullName: string | null;
  id: string;
  imagePath: string | null;
  jobTitle: string | null;
  parseStatus: 'parsed' | 'unparsed';
  phoneNumber: string | null;
  productServices: string | null;
  rawText: string;
};

export type TeamInboxReview = {
  teamId: string | null;
  teamName: string | null;
  items: TeamInboxItem[];
  mode: 'leader-inbox' | 'worker-history';
};

export async function loadTeamInboxReview(userId: string): Promise<TeamInboxReview> {
  return loadTeamReview(userId);
}
