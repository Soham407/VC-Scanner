import { loadBoothInboxReview } from '../../src/lib/boothInbox';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

describe('boothInbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns leader inbox rows for all scans in the active booth', async () => {
    const activeBoothEq = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { booth_id: 'booth-1' },
        error: null
      })
    });
    const activeBoothSelect = jest.fn().mockReturnValue({ eq: activeBoothEq });

    const boothEq = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          created_by: 'leader-1',
          id: 'booth-1',
          name: 'North Hall'
        },
        error: null
      })
    });
    const boothSelect = jest.fn().mockReturnValue({ eq: boothEq });

    const inboxOrder = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'lead-2',
          booth_id: 'booth-1',
          user_id: 'worker-2',
          full_name: 'Ada Lovelace',
          job_title: 'Engineer',
          company_name: 'Acme',
          email: 'ada@example.com',
          phone_number: null,
          image_url: 'worker-2/lead-2.jpg',
          raw_ocr_text: 'Ada',
          parse_status: 'parsed',
          created_at: '2026-05-01T12:00:00Z'
        },
        {
          id: 'lead-1',
          booth_id: 'booth-1',
          user_id: 'leader-1',
          full_name: 'Grace Hopper',
          job_title: 'Captain',
          company_name: 'Navy',
          email: 'grace@example.com',
          phone_number: null,
          image_url: 'leader-1/lead-1.jpg',
          raw_ocr_text: 'Grace',
          parse_status: 'parsed',
          created_at: '2026-05-01T11:00:00Z'
        }
      ],
      error: null
    });
    const inboxEq = jest.fn().mockReturnValue({ order: inboxOrder });
    const inboxSelect = jest.fn().mockReturnValue({ eq: inboxEq });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce({ select: activeBoothSelect })
      .mockReturnValueOnce({ select: boothSelect })
      .mockReturnValueOnce({ select: inboxSelect });

    await expect(loadBoothInboxReview('leader-1')).resolves.toEqual({
      activeBoothId: 'booth-1',
      boothName: 'North Hall',
      items: [
        {
          boothId: 'booth-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Ada'
        },
        {
          boothId: 'booth-1',
          capturedByUserId: 'leader-1',
          companyName: 'Navy',
          createdAt: '2026-05-01T11:00:00Z',
          email: 'grace@example.com',
          fullName: 'Grace Hopper',
          id: 'lead-1',
          imagePath: 'leader-1/lead-1.jpg',
          jobTitle: 'Captain',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Grace'
        }
      ],
      mode: 'leader-inbox'
    });

    expect(activeBoothEq).toHaveBeenCalledWith('user_id', 'leader-1');
    expect(boothEq).toHaveBeenCalledWith('id', 'booth-1');
    expect(inboxEq).toHaveBeenCalledWith('booth_id', 'booth-1');
  });

  it('returns worker history rows scoped to the signed-in worker', async () => {
    const activeBoothEq = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { booth_id: 'booth-1' },
        error: null
      })
    });
    const activeBoothSelect = jest.fn().mockReturnValue({ eq: activeBoothEq });

    const boothEq = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          created_by: 'leader-1',
          id: 'booth-1',
          name: 'North Hall'
        },
        error: null
      })
    });
    const boothSelect = jest.fn().mockReturnValue({ eq: boothEq });

    const historyOrder = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'lead-3',
          booth_id: 'booth-1',
          user_id: 'worker-7',
          full_name: 'Worker User',
          job_title: null,
          company_name: 'Acme',
          email: null,
          phone_number: null,
          image_url: 'worker-7/lead-3.jpg',
          raw_ocr_text: 'Worker',
          parse_status: 'parsed',
          created_at: '2026-05-01T13:00:00Z'
        }
      ],
      error: null
    });
    const historyEq = jest.fn().mockReturnValue({ order: historyOrder });
    const historySelect = jest.fn().mockReturnValue({ eq: historyEq });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce({ select: activeBoothSelect })
      .mockReturnValueOnce({ select: boothSelect })
      .mockReturnValueOnce({ select: historySelect });

    await expect(loadBoothInboxReview('worker-7')).resolves.toEqual({
      activeBoothId: 'booth-1',
      boothName: 'North Hall',
      items: [
        {
          boothId: 'booth-1',
          capturedByUserId: 'worker-7',
          companyName: 'Acme',
          createdAt: '2026-05-01T13:00:00Z',
          email: null,
          fullName: 'Worker User',
          id: 'lead-3',
          imagePath: 'worker-7/lead-3.jpg',
          jobTitle: null,
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Worker'
        }
      ],
      mode: 'worker-history'
    });

    expect(historyEq).toHaveBeenCalledWith('user_id', 'worker-7');
  });
});
