'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy /admin route. The streamer cockpit lives at /studio now;
 * /admin sticks around as a redirect so old bookmarks and any external
 * links keep working.
 */
export default function AdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio');
  }, [router]);
  return null;
}
