import { supabase } from './supabase';

export type BoothInboxItem = {
  id: string;
  boothId: string | null;
  capturedByUserId: string;
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  email: string | null;
  phoneNumber: string | null;
  imagePath: string | null;
  rawText: string;
  parseStatus: 'parsed' | 'unparsed';
  createdAt: string;
};

export type BoothInboxReview = {
  mode: 'leader-inbox' | 'worker-history';
  activeBoothId: string | null;
  boothName: string | null;
  items: BoothInboxItem[];
};

type ActiveBoothContextRow = {
  booth_id: string;
};

type BoothRow = {
  id: string;
  created_by: string;
  name: string;
};

type ScannedLeadRow = {
  id: string;
  booth_id: string | null;
  user_id: string;
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  email: string | null;
  phone_number: string | null;
  image_url: string | null;
  raw_ocr_text: string;
  parse_status: 'parsed' | 'unparsed';
  created_at: string;
};

const LEAD_SELECT_FIELDS = [
  'id',
  'booth_id',
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

function mapLeadRow(row: ScannedLeadRow): BoothInboxItem {
  return {
    boothId: row.booth_id,
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

async function loadUserHistory(userId: string): Promise<BoothInboxItem[]> {
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

export async function loadBoothInboxReview(userId: string): Promise<BoothInboxReview> {
  const { data: activeBoothData, error: activeBoothError } = await supabase
    .from('user_booth_contexts')
    .select('booth_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (activeBoothError) {
    throw activeBoothError;
  }

  const activeBoothId = (activeBoothData as ActiveBoothContextRow | null)?.booth_id ?? null;
  if (!activeBoothId) {
    const items = await loadUserHistory(userId);

    return {
      activeBoothId: null,
      boothName: null,
      items,
      mode: 'worker-history'
    };
  }

  const { data: boothData, error: boothError } = await supabase
    .from('booths')
    .select('id, name, created_by')
    .eq('id', activeBoothId)
    .maybeSingle();

  if (boothError) {
    throw boothError;
  }

  const booth = boothData as BoothRow | null;
  const isLeader = booth?.created_by === userId;

  if (!isLeader) {
    const items = await loadUserHistory(userId);

    return {
      activeBoothId,
      boothName: booth?.name ?? null,
      items,
      mode: 'worker-history'
    };
  }

  const { data: inboxData, error: inboxError } = await supabase
    .from('scanned_leads')
    .select(LEAD_SELECT_FIELDS)
    .eq('booth_id', activeBoothId)
    .order('created_at', { ascending: false });

  if (inboxError) {
    throw inboxError;
  }

  return {
    activeBoothId,
    boothName: booth?.name ?? null,
    items: ((inboxData ?? []) as unknown as ScannedLeadRow[]).map(mapLeadRow),
    mode: 'leader-inbox'
  };
}
