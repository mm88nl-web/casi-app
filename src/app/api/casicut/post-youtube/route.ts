import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { clip_id?: string };
  if (!body.clip_id) return NextResponse.json({ error: 'clip_id required' }, { status: 400 });

  // Verify clip belongs to this user
  const { data: clip, error } = await supabase
    .from('casicut_clips')
    .select('id, clip_path, title')
    .eq('id', body.clip_id)
    .eq('user_id', user.id)
    .single();

  if (error || !clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  if (!clip.clip_path) return NextResponse.json({ error: 'Clip not yet rendered' }, { status: 409 });

  // YouTube OAuth credentials not yet configured — wire up in a follow-up
  return NextResponse.json(
    { error: 'YouTube credentials not configured. Add client_secret.json and run the OAuth setup.' },
    { status: 501 }
  );
}
