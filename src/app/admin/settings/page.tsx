'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy /admin/settings route. Settings live at /studio/settings now;
 * /admin/settings sticks around as a redirect so old bookmarks keep
 * working.
 */
export default function AdminSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio/settings');
  }, [router]);
  return null;
}
