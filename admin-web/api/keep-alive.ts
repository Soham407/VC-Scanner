export default async function handler(req: any, res: any) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Missing Supabase env vars" });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/scanned_leads?limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status}`);
    }

    res.status(200).json({ status: 'ok', message: 'Supabase pinged successfully' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
}
