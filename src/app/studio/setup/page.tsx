'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The canvas editor now lives inline at /studio under the "Live" mode
 * toggle. This route stays as a redirect so old bookmarks / the link in
 * /admin/settings → "Configure slots →" keep working.
 */
export default function StudioSetupRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio');
  }, [router]);
  return null;
}
