import { invokeScanCard, parseCardPreview, saveParsedCard, ScanCardInvokeError } from '../../src/lib/scanCard';
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

  it('invokes scan-card with rawText, imagePath, leadId, and teamId and returns parsed payload', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: {
        ok: true,
        parseStatus: 'parsed',
        parsed: {
          companyName: 'Acme Corp',
          email: 'john@acme.com',
          fullName: 'John Doe',
          jobTitle: 'Sales Manager',
          productServices: 'Business consulting',
          phoneNumber: '+1 555 111 2222'
        }
      },
      error: null
    });

    await expect(
      invokeScanCard({
        teamId: '4d2b274e-c0df-4f8a-a440-9db95d130f18',
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
        productServices: 'Business consulting',
        phoneNumber: '+1 555 111 2222'
      }
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('scan-card', {
      body: {
        action: 'save',
        teamId: '4d2b274e-c0df-4f8a-a440-9db95d130f18',
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
        teamId: null,
        imagePath: 'card-images/user-123/lead-456.jpg',
        leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
        rawText: 'John Doe\\nAcme Corp\\nSales Manager'
      })
    ).rejects.toEqual(new ScanCardInvokeError('Network request failed'));
  });

  it('requests a parse-only preview without saving the lead', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: {
        ok: true,
        parseStatus: 'parsed',
        parsed: {
          address: null,
          companyName: 'Acme Corp',
          email: null,
          fullName: 'John Doe',
          jobTitle: null,
          productServices: null,
          phoneNumber: null
        }
      },
      error: null
    });

    await parseCardPreview({
      teamId: '4d2b274e-c0df-4f8a-a440-9db95d130f18',
      imagePath: 'card-images/user-123/lead-456.jpg',
      leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
      rawText: 'John Doe\\nAcme Corp'
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('scan-card', {
      body: {
        action: 'parse',
        teamId: '4d2b274e-c0df-4f8a-a440-9db95d130f18',
        imagePath: 'card-images/user-123/lead-456.jpg',
        leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
        rawText: 'John Doe\\nAcme Corp'
      }
    });
  });

  it('saves a corrected parsed card without asking the function to parse again', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: {
        ok: true,
        parseStatus: 'parsed',
        parsed: {
          address: null,
          companyName: 'Acme Corp',
          email: null,
          fullName: 'John Doe',
          jobTitle: 'Owner',
          productServices: 'Industrial automation',
          phoneNumber: null
        }
      },
      error: null
    });

    await saveParsedCard({
      teamId: null,
      imagePath: 'card-images/user-123/lead-456.jpg',
      leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
      parsed: {
        address: null,
        companyName: 'Acme Corp',
        email: null,
        fullName: 'John Doe',
        jobTitle: 'Owner',
        productServices: 'Industrial automation',
        phoneNumber: null
      },
      rawText: 'John Doe\\nAcme Corp\\nOwner'
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('scan-card', {
      body: {
        action: 'saveParsed',
        teamId: null,
        imagePath: 'card-images/user-123/lead-456.jpg',
        leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
        parsed: {
          address: null,
          companyName: 'Acme Corp',
          email: null,
          fullName: 'John Doe',
          jobTitle: 'Owner',
          productServices: 'Industrial automation',
          phoneNumber: null
        },
        rawText: 'John Doe\\nAcme Corp\\nOwner'
      }
    });
  });

  it('surfaces the function response body when invoke returns an HTTP error', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: jest.fn().mockResolvedValue({
            error: 'Image download failed'
          })
        }
      }
    });

    await expect(
      invokeScanCard({
        imagePath: 'card-images/user-123/lead-456.jpg',
        leadId: 'f8f0e7d3-3fd4-49e6-b5f4-2391660bfd3e',
        rawText: 'John Doe\\nAcme Corp\\nSales Manager'
      })
    ).rejects.toEqual(new ScanCardInvokeError('Image download failed'));
  });
});
