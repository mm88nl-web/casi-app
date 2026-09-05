'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy /studio/live route. The canvas editor is merged into /studio now
 * (matching the design-source prototype's single-screen studio — see
 * StudioLiveEditor.tsx / studio/page.tsx). This sticks around as a
 * redirect so old bookmarks and any external links (Discord bot, dev
 * screen switcher history, etc.) keep working.
 */
export default function StudioLiveRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio');
  }, [router]);
  return null;
}
