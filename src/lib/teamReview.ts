import { supabase } from './supabase';
import type { AssignmentState } from './teamAssignments';

export type TeamReviewItem = {
  assignedToUserId: string | null;
  teamId: string | null;
  assignedAt: string | null;
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
  rawText: string;
};

export type TeamReviewResult = {
  activeTeamId: string | null;
  teamName: string | null;
  items: TeamReviewItem[];
  mode: 'leader-inbox' | 'worker-history';
};

type ActiveTeamContextRow = {
  team_id: string;
};

type TeamRow = {
  created_by: string;
  id: string;
  name: string;
};

type TeamLeaderRow = {
  user_id: string;
};

type ScannedLeadRow = {
  team_id: string | null;
  company_name: string | null;
  created_at: string;
  email: string | null;
  full_name: string | null;
  id: string;
  image_url: string | null;
  job_title: string | null;
  parse_status: 'parsed' | 'unparsed';
  phone_number: string | null;
  raw_ocr_text: string;
  user_id: string;
};

type AssignedLeadRow = {
  assigned_at: string;
  assignment_state: AssignmentState;
  assigned_to_user_id: string | null;
  scanned_leads: ScannedLeadRow | ScannedLeadRow[] | null;
};

const LEAD_SELECT_FIELDS = [
  'id',
  'team_id',
  'user_id',
  'full_name',
  'job_title',
  'company_name',
  'email',
  'phone_number',
  'image_url',
  'raw_ocr_text',
  'parse_status',
  'created_at'
].join(', ');

function mapLeadRow(row: ScannedLeadRow): TeamReviewItem {
  return {
    assignedToUserId: null,
    teamId: row.team_id,
    assignedAt: null,
    assignmentState: null,
    capturedByUserId: row.user_id,
    companyName: row.company_name,
    createdAt: row.created_at,
    email: row.email,
    fullName: row.full_name,
    id: row.id,
    imagePath: row.image_url,
    jobTitle: row.job_title,
    parseStatus: row.parse_status,
    phoneNumber: row.phone_number,
    rawText: row.raw_ocr_text
  };
}

async function loadUserHistory(userId: string): Promise<TeamReviewItem[]> {
  const { data, error } = await supabase
    .from('scanned_leads')
    .select(LEAD_SELECT_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as ScannedLeadRow[]).map(mapLeadRow);
}

async function loadWorkerAssignedWork(userId: string, activeTeamId: string): Promise<TeamReviewItem[]> {
  const { data, error } = await supabase
    .from('lead_assignments')
    .select(`assigned_at, assignment_state, scanned_leads!inner(${LEAD_SELECT_FIELDS})`)
    .eq('assigned_to_user_id', userId)
    .eq('team_id', activeTeamId)
    .order('assigned_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows: Array<TeamReviewItem | null> = ((data ?? []) as unknown as AssignedLeadRow[]).map((row): TeamReviewItem | null => {
      const lead = Array.isArray(row.scanned_leads) ? row.scanned_leads[0] : row.scanned_leads;
      return lead
        ? {
            ...mapLeadRow(lead),
            assignedAt: row.assigned_at,
            assignmentState: row.assignment_state
          }
        : null;
    });

  return rows.filter((item): item is TeamReviewItem => item !== null);
}

async function loadActiveTeamId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_team_contexts')
    .select('team_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ActiveTeamContextRow | null)?.team_id ?? null;
}

async function loadTeam(activeTeamId: string): Promise<TeamRow | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, created_by')
    .eq('id', activeTeamId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as TeamRow | null;
}

async function isTeamLeader(team: TeamRow, userId: string): Promise<boolean> {
  if (team.created_by === userId) {
    return true;
  }

  const { data: teamLeaderData, error: teamLeaderError } = await supabase
    .from('team_leaders')
    .select('user_id')
    .eq('team_id', team.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (teamLeaderError) {
    throw teamLeaderError;
  }

  return Boolean((teamLeaderData as TeamLeaderRow | null)?.user_id);
}

async function loadLeaderInbox(activeTeamId: string): Promise<TeamReviewItem[]> {
  const { data, error } = await supabase
    .from('scanned_leads')
    .select(`${LEAD_SELECT_FIELDS}, lead_assignments!left(assigned_at, assignment_state, assigned_to_user_id)`)
    .eq('team_id', activeTeamId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as Array<ScannedLeadRow & {
    lead_assignments?: AssignedLeadRow | AssignedLeadRow[] | null;
  }>).map((row) => {
    const lead = mapLeadRow(row);
    const assignment = Array.isArray(row.lead_assignments)
      ? row.lead_assignments[0]
      : row.lead_assignments;

    if (!assignment) {
      return lead;
    }

    return {
      ...lead,
      assignedAt: assignment.assigned_at,
      assignedToUserId: assignment.assigned_to_user_id,
      assignmentState: assignment.assignment_state
    };
  });
}

export async function loadTeamReview(userId: string): Promise<TeamReviewResult> {
  const activeTeamId = await loadActiveTeamId(userId);
  if (!activeTeamId) {
    return {
      activeTeamId: null,
      teamName: null,
      items: await loadUserHistory(userId),
      mode: 'worker-history'
    };
  }

  const team = await loadTeam(activeTeamId);
  if (!team) {
    return {
      activeTeamId,
      teamName: null,
      items: await loadUserHistory(userId),
      mode: 'worker-history'
    };
  }

  if (!(await isTeamLeader(team, userId))) {
    return {
      activeTeamId,
      teamName: team.name,
      items: await loadWorkerAssignedWork(userId, activeTeamId),
      mode: 'worker-history'
    };
  }

  return {
    activeTeamId,
    teamName: team.name,
    items: await loadLeaderInbox(activeTeamId),
    mode: 'leader-inbox'
  };
}
