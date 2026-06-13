import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { clip_id?: string };
  if (!body.clip_id) return NextResponse.json({ error: 'clip_id required' }, { status: 400 });

  const { data: clip, error } = await supabase
    .from('casicut_clips')
    .select('id, clip_path, title')
    .eq('id', body.clip_id)
    .eq('user_id', user.id)
    .single();

  if (error || !clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  if (!clip.clip_path) return NextResponse.json({ error: 'Clip not yet rendered' }, { status: 409 });

  // TikTok Content Posting API — requires TIKTOK_ACCESS_TOKEN env var and app audit approval
  return NextResponse.json(
    { error: 'TikTok credentials not configured. Set TIKTOK_ACCESS_TOKEN and complete app audit.' },
    { status: 501 }
  );
}
