import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import CasiCut from './_components/CasiCut';

export const metadata: Metadata = {
  title: 'CasiCut — Stream to Shorts | Casi',
  description: 'Upload your stream recording. AI finds the best rap moments, renders vertical clips, posts to YouTube Shorts and TikTok.',
  openGraph: {
    title: 'CasiCut — Stream to Shorts',
    description: 'Drop your VOD. We find the clips.',
    url: 'https://www.casi.gg/casicut',
  },
  alternates: { canonical: 'https://www.casi.gg/casicut' },
};

export default async function CasiCutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <CasiCut userId={user.id} />;
}
