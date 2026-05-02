import { invokeScanCard, ScanCardInvokeError } from '../../src/lib/scanCard';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn()
    }
  }
}));

describe('invokeScanCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes scan-card with rawText, imagePath, leadId, and boothId and returns parsed payload', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: {
        ok: true,
        parseStatus: 'parsed',
        parsed: {
          companyName: 'Acme Corp',
          email: 'john@acme.com',
          fullName: 'John Doe',
          jobTitle: 'Sales Manager',
          phoneNumber: '+1 555 111 2222'
        }
      },
      error: null
    });

    await expect(
      invokeScanCard({
        boothId: '4d2b274e-c0df-4f8a-a440-9db95d130f18',
        imagePath: 'card-images/user-123/lead-456.jpg',
        leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
        rawText: 'John Doe\\nAcme Corp\\nSales Manager'
      })
    ).resolves.toEqual({
      parseStatus: 'parsed',
      parsed: {
        companyName: 'Acme Corp',
        email: 'john@acme.com',
        fullName: 'John Doe',
        jobTitle: 'Sales Manager',
        phoneNumber: '+1 555 111 2222'
      }
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('scan-card', {
      body: {
        boothId: '4d2b274e-c0df-4f8a-a440-9db95d130f18',
        imagePath: 'card-images/user-123/lead-456.jpg',
        leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
        rawText: 'John Doe\\nAcme Corp\\nSales Manager'
      }
    });
  });

  it('throws ScanCardInvokeError when invoke returns an error', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' }
    });

    await expect(
      invokeScanCard({
        boothId: null,
        imagePath: 'card-images/user-123/lead-456.jpg',
        leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
        rawText: 'John Doe\\nAcme Corp\\nSales Manager'
      })
    ).rejects.toEqual(new ScanCardInvokeError('Network request failed'));
  });
});
