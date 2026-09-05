'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The canvas editor lives at /studio (merged with the dashboard — no more
 * separate /studio/live route). This route stays as a redirect so old
 * bookmarks / the link in /admin/settings → "Configure slots →" keep
 * working.
 */
export default function StudioSetupRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio');
  }, [router]);
  return null;
}
