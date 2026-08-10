'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy /join route. Used to insert a bare `profiles` row with no username
 * selection, producing orphan accounts (see AGENTS.md). /login is the
 * canonical signup surface now — redirect old bookmarks/links there instead
 * of deleting the route outright, same pattern as /admin -> /studio.
 */
export default function JoinRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login?tab=signup');
  }, [router]);
  return null;
}
