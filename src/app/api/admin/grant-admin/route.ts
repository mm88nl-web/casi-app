import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST { target_id: string, grant: boolean }
// Requires caller to be an admin.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!caller?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { target_id, grant } = await req.json() as { target_id: string; grant: boolean };
  if (!target_id) return NextResponse.json({ error: 'target_id required' }, { status: 400 });

  const { error } = await service
    .from('profiles')
    .update({ is_admin: grant })
    .eq('id', target_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
