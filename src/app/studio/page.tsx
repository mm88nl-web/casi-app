'use client';

import { useState } from 'react';
import Link from 'next/link';
import CasiLogo from '@/components/CasiLogo';
import AiringNow, { type AiringItem } from './_components/AiringNow';
import ApprovalQueue, { type QueueItem } from './_components/ApprovalQueue';
import FlashesLog, { type FlashLogItem } from './_components/FlashesLog';

// Mock data — real values come from Supabase / escrow in the data-wiring pass.
const SLUG = 'pixel_hana';
const EARNED_TODAY = '€142';

const AIRING: AiringItem[] = [
  { id: 'a1', icon: '⚡', name: 'rina_42 · "happy bday pixel"', subtitle: 'Flash · €1', remaining: '0:12' },
  { id: 'a2', icon: '🌊', name: 'bluefin · animated logo', subtitle: 'Beam · €18', remaining: '2:47' },
];

const QUEUE: QueueItem[] = [
  { id: 'q1', kind: 'beam', name: 'CoolTiger42 · product shot', subtitle: 'Just now · paid · image 1.2MB', priceLabel: '€15' },
  { id: 'q2', kind: 'beam', name: 'ali_gg · short loop',         subtitle: '32s ago · USDC · video 6s · backdrop', priceLabel: '€24' },
  { id: 'q3', kind: 'beam', name: 'm_r · brand banner',          subtitle: '48s ago · paid · image', priceLabel: '€25' },
  { id: 'q4', kind: 'flash', name: 'nova · "gg from berlin"',    subtitle: '1m ago · paid · text only', priceLabel: '€3' },
];

const FLASHES: FlashLogItem[] = [
  { id: 'l1', time: 'just now', who: 'MegaFox38',   message: 'waaaaaa',                     chip: { kind: 'usdc', label: '2 USDC' } },
  { id: 'l2', time: '19:22',    who: 'MegaFox38',   message: 'eeeee',                       chip: { kind: 'free', label: 'Free' } },
  { id: 'l3', time: '19:12',    who: 'MegaFox38',   message: 'lllll',                       chip: { kind: 'usdc', label: '5 USDC' }, pinned: true },
  { id: 'l4', time: '18:45',    who: 'nova',        message: 'gg from berlin 🍻',           chip: { kind: 'usdc', label: '2 USDC' } },
  { id: 'l5', time: '18:30',    who: 'spam_guy_42', message: 'buy nft drop --> scam.link',  chip: { kind: 'usdc', label: '10 USDC' }, refunded: true },
  { id: 'l6', time: '18:20',    who: 'ali_gg',      message: 'ooooooo',                     chip: { kind: 'usdc', label: '10 USDC' }, pinned: true },
  { id: 'l7', time: '17:48',    who: 'rina_42',     message: 'sick setup mate 🔥',          chip: { kind: 'eur',  label: '€5' } },
  { id: 'l8', time: '17:15',    who: 'MegaFox38',   message: 'qqqq',                        chip: { kind: 'usdc', label: '1 USDC' } },
];

export default function StudioPage() {
  const [queue, setQueue] = useState<QueueItem[]>(QUEUE);
  const resolveQueue = (id: string) => setQueue((prev) => prev.filter((q) => q.id !== id));

  return (
    <main className="min-h-screen" style={{ background: 'var(--casi-bg)', color: 'var(--casi-text)' }}>
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
            style={{ fontFamily: 'var(--font-casi-sans)', fontSize: '22px', letterSpacing: '-1px' }}
          >
            casi
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            title="Classic studio (current production)"
            className="font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              textDecoration: 'none',
              color: 'var(--casi-text-dim)',
              padding: '5px 10px',
              borderRadius: '999px',
              border: '1px solid var(--casi-border-2)',
            }}
          >
            ↩ Classic studio
          </Link>
          <span
            className="font-mono uppercase"
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              background: 'rgba(var(--casi-accent-rgb), 0.08)',
              border: '1px solid rgba(var(--casi-accent-rgb), 0.3)',
              color: 'var(--casi-accent)',
              fontSize: '11px',
              letterSpacing: '0.14em',
            }}
          >
            Studio · beta
          </span>
        </div>
      </nav>

      <div
        className="mx-auto flex flex-col gap-5 casi-page-pad"
        style={{ maxWidth: '1080px' }}
      >
        {/* Compact headline — only what a streamer needs glanceable mid-stream. */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="font-extrabold"
              style={{
                fontSize: '22px',
                letterSpacing: '-0.8px',
                color: 'var(--casi-text)',
              }}
            >
              @{SLUG}
            </span>
            <LiveChip viewers={2147} />
            <StatChip label="Today" value={EARNED_TODAY} />
            <StatChip label="Pending" value={String(queue.length)} tone="accent2" />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/studio/setup"
              className="font-mono uppercase"
              style={{
                fontSize: '10px',
                letterSpacing: '0.15em',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--casi-border-2)',
                color: 'var(--casi-text-dim)',
              }}
            >
              Configure slots →
            </Link>
            <button
              type="button"
              className="font-mono uppercase"
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--casi-border-2)',
                background: 'transparent',
                color: 'var(--casi-text-dim)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                cursor: 'pointer',
              }}
            >
              End stream ⏹
            </button>
          </div>
        </header>

        <AiringNow items={AIRING} />
        <ApprovalQueue items={queue} onApprove={resolveQueue} onReject={resolveQueue} />
        <FlashesLog items={FLASHES} totals={{ count: 38, eur: '€52', usdc: '18 USDC' }} />
      </div>
    </main>
  );
}

function LiveChip({ viewers }: { viewers: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono uppercase"
      style={{
        padding: '6px 12px',
        borderRadius: '999px',
        background: 'rgba(var(--casi-accent2-rgb), 0.1)',
        border: '1px solid rgba(var(--casi-accent2-rgb), 0.3)',
        fontSize: '10px',
        letterSpacing: '0.14em',
        color: 'var(--casi-accent2)',
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
      Live · {viewers.toLocaleString()} viewers
    </span>
  );
}

function StatChip({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'accent2' }) {
  const colour =
    tone === 'accent2' ? 'var(--casi-accent2)' : tone === 'accent' ? 'var(--casi-accent)' : 'var(--casi-text)';
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono uppercase"
      style={{
        padding: '6px 10px',
        borderRadius: '8px',
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        fontSize: '10px',
        letterSpacing: '0.14em',
        color: 'var(--casi-text-faint)',
      }}
    >
      {label}
      <span style={{ color: colour, fontWeight: 500, letterSpacing: '-0.2px' }}>{value}</span>
    </span>
  );
}
