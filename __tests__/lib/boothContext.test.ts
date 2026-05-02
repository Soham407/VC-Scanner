import { getActiveBoothId, setActiveBoothId } from '../../src/lib/boothContext';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn()
  }
}));

describe('boothContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads active booth id for the authenticated user', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });

    const maybeSingle = jest.fn().mockResolvedValue({
      data: { booth_id: 'booth-123' },
      error: null
    });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(getActiveBoothId()).resolves.toBe('booth-123');

    expect(supabase.from).toHaveBeenCalledWith('user_booth_contexts');
    expect(select).toHaveBeenCalledWith('booth_id');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('returns null when no authenticated user is present', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null
    });

    await expect(getActiveBoothId()).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('persists active booth id via upsert', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });

    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    await setActiveBoothId('booth-123');

    expect(supabase.from).toHaveBeenCalledWith('user_booth_contexts');
    expect(upsert).toHaveBeenCalledWith(
      {
        booth_id: 'booth-123',
        user_id: 'user-123'
      },
      {
        onConflict: 'user_id'
      }
    );
  });

  it('clears active booth context when booth id is null', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });

    const eq = jest.fn().mockResolvedValue({ error: null });
    const deleteRow = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: deleteRow });

    await setActiveBoothId(null);

    expect(supabase.from).toHaveBeenCalledWith('user_booth_contexts');
    expect(deleteRow).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('user_id', 'user-123');
  });
});
