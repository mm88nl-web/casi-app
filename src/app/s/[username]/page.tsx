import type { Metadata } from 'next';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import StreamerProfile from './_components/StreamerProfile';

export const dynamic = 'force-dynamic';

type ProfileMeta = {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_live: boolean | null;
};

// Cached so generateMetadata and the page body share a single query per request.
const getProfile = cache(async (username: string): Promise<ProfileMeta | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key);
  const { data } = await supabase
    .from('profiles')
    .select('username, display_name, bio, avatar_url, is_live')
    .eq('username', username)
    .maybeSingle();
  return (data as ProfileMeta) ?? null;
});

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> },
): Promise<Metadata> {
  const { username } = await params;
  const p = await getProfile(username);
  if (!p) {
    return { title: `@${username}`, robots: { index: false } };
  }
  const name = p.display_name?.trim() || `@${p.username}`;
  const live = p.is_live ? ' (live now)' : '';
  const title = name;
  const description =
    p.bio?.trim() ||
    `Get on ${name}'s live stream${live}. Pay by the minute to place your clip, image, or banner on stream — ${name} approves every one.`;
  const canonical = `/s/${p.username}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'profile',
      url: `https://www.casi.gg${canonical}`,
      title: `${name} · casi`,
      description,
      images: p.avatar_url ? [{ url: p.avatar_url }] : undefined,
    },
    twitter: { card: 'summary_large_image', title: `${name} · casi`, description },
  };
}

export default async function StreamerPage(
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const p = await getProfile(username);

  const jsonLd = p
    ? {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        dateModified: new Date().toISOString(),
        mainEntity: {
          '@type': 'Person',
          name: p.display_name?.trim() || `@${p.username}`,
          alternateName: `@${p.username}`,
          url: `https://www.casi.gg/s/${p.username}`,
          ...(p.avatar_url ? { image: p.avatar_url } : {}),
          ...(p.bio?.trim() ? { description: p.bio.trim() } : {}),
        },
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <StreamerProfile />
    </>
  );
}
