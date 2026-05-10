'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The canvas editor lives at /studio/live under v7. This route stays as
 * a redirect so old bookmarks / the link in /admin/settings →
 * "Configure slots →" keep working.
 */
export default function StudioSetupRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio/live');
  }, [router]);
  return null;
}
