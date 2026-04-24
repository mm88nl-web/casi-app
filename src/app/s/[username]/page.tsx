'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import CasiLogo from '@/components/CasiLogo';
import StreamerBar from './_components/StreamerBar';
import StreamPreview from './_components/StreamPreview';
import FlashesFeed, { type Flash } from './_components/FlashesFeed';
import BookingPanel from './_components/BookingPanel';

// Placeholder feed — real data flows in once the page reads from flashes via Supabase.
const SAMPLE_FLASHES: Flash[] = [
  { id: 'f0', time: 'just now', who: 'you',      message: 'waaaaaa', chip: { kind: 'usdc', label: '2 USDC' }, mine: true },
  { id: 'f1', time: '19:22',    who: 'MegaFox38', message: 'eeeee',   chip: { kind: 'free', label: 'Free' } },
  { id: 'f2', time: '19:12',    who: 'MegaFox38', message: 'lllll',   chip: { kind: 'usdc', label: '5 USDC' } },
  { id: 'f3', time: '18:45',    who: 'MegaFox38', message: 'lll',     chip: { kind: 'usdc', label: '2 USDC' } },
  { id: 'f4', time: '18:20',    who: 'MegaFox38', message: 'ooooooo', chip: { kind: 'usdc', label: '10 USDC' } },
  { id: 'f5', time: '17:15',    who: 'MegaFox38', message: 'qqqq',    chip: { kind: 'usdc', label: '1 USDC' } },
  { id: 'f6', time: '14:21',    who: 'MegaFox38', message: 'sssss',   chip: { kind: 'usdc', label: '1 USDC' } },
];

export default function ViewerBookingPage() {
  const params = useParams();
  const username = (params?.username as string) || 'streamer';

  return (
    <main
      className="min-h-screen"
      style={{ background: 'var(--casi-bg)', color: 'var(--casi-text)' }}
    >
      <nav
        className="flex items-center justify-between"
        style={{ padding: '18px 32px', borderBottom: '1px solid var(--casi-border)' }}
      >
        <Link
          href="/"
          className="flex items-center gap-2"
          style={{ color: 'var(--casi-text)', textDecoration: 'none' }}
        >
          <CasiLogo size={72} />
          <span
            className="font-extrabold"
            style={{
              fontFamily: 'var(--font-casi-sans)',
              fontSize: '22px',
              letterSpacing: '-1px',
            }}
          >
            casi
          </span>
        </Link>

        <span
          className="inline-flex items-center gap-2 font-mono uppercase"
          style={{
            padding: '6px 12px',
            borderRadius: '999px',
            background: 'rgba(var(--casi-accent2-rgb), 0.08)',
            border: '1px solid rgba(var(--casi-accent2-rgb), 0.3)',
            color: 'var(--casi-accent2)',
            fontSize: '11px',
            letterSpacing: '0.14em',
          }}
        >
          <span
            aria-hidden
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--casi-accent2)',
              boxShadow: '0 0 8px rgba(var(--casi-accent2-rgb), 0.7)',
            }}
          />
          Live
        </span>
      </nav>

      <div
        className="mx-auto casi-grid-viewer casi-page-pad"
        style={{ maxWidth: '1360px' }}
      >
        <div className="flex flex-col gap-4">
          <StreamerBar
            username={username}
            category="Variety"
            language="EN"
            uptime="00:47:12"
            watching={2147}
          />
          <StreamPreview />
          <FlashesFeed flashes={SAMPLE_FLASHES} />
        </div>

        <BookingPanel />
      </div>
    </main>
  );
}
