export type AssignmentState = 'assigned' | 'done' | 'needs_review';

export type AccessibleTeam = {
  createdAt: string;
  createdBy: string;
  id: string;
  name: string;
};

export type TeamMember = {
  createdAt: string;
  email: string;
  isLeader: boolean;
  userId: string;
};

export type TeamInvite = {
  createdAt: string;
  id: string;
  invitedEmail: string;
  teamId?: string;
  teamName?: string | null;
};

export type Lead = {
  address: string | null;
  assignedAt: string | null;
  assignedToUserId: string | null;
  assignmentState: AssignmentState | null;
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
  rawText: string | null;
  teamId: string | null;
};

export type PendingBatch = {
  batchId: string;
  scanCount: number;
  items: Array<{
    createdAt: string;
    scannedLeadId: string;
  }>;
};

export type TeamAccess = {
  canManageTeam: boolean;
  teamId: string | null;
  teamName: string | null;
};
