'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import LandingNav from './_components/LandingNav';
import LandingSplitDoor from './_components/LandingSplitDoor';
import TrustStrip from './_components/TrustStrip';
import LandingFooter from './_components/LandingFooter';

export default function HomePage() {
  const [liveCount, setLiveCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { count: live } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_live', true);
      setLiveCount(live ?? 0);
    };
    load();
  }, [supabase]);

  return (
    <main
      className="min-h-screen"
      style={{ background: 'var(--casi-bg)', color: 'var(--casi-text)' }}
    >
      <LandingNav liveCount={liveCount} />
      <LandingSplitDoor />
      <TrustStrip />
      <LandingFooter />
    </main>
  );
}
