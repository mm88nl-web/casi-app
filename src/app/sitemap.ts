import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BASE = 'https://www.casi.gg';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE}/solitaire`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/casicut`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/words`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/legal/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/legal/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/legal/aup`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/legal/imprint`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/legal/dmca`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // All public streamer profiles. Best-effort: if Supabase is unreachable at
  // build/request time, still return the static routes rather than failing.
  let profiles: MetadataRoute.Sitemap = [];
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const supabase = createClient(url, key);
      const { data } = await supabase.from('profiles').select('username').limit(5000);
      profiles = (data ?? [])
        .filter((r): r is { username: string } => !!r.username)
        .map((r) => ({
          url: `${BASE}/s/${r.username}`,
          lastModified: now,
          changeFrequency: 'daily' as const,
          priority: 0.6,
        }));
    }
  } catch {
    // ignore — return static routes only
  }

  return [...staticRoutes, ...profiles];
}
