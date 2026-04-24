'use client';

import { useState } from 'react';
import Link from 'next/link';
import CasiLogo from '@/components/CasiLogo';
import StudioHeadline from './_components/StudioHeadline';
import ModeToggle, { type StudioMode } from './_components/ModeToggle';
import EarningsStrip from './_components/EarningsStrip';
import StudioCanvas, { type CanvasSlot } from './_components/StudioCanvas';
import SlotConfigurator from './_components/SlotConfigurator';
import AiringNow, { type AiringItem } from './_components/AiringNow';
import ApprovalQueue, { type QueueItem } from './_components/ApprovalQueue';
import FlashesLog, { type FlashLogItem } from './_components/FlashesLog';

// Mock data — real values come from Supabase / escrow in the data-wiring pass.
const SLUG = 'pixel_hana';

const CANVAS_SLOTS: CanvasSlot[] = [
  {
    id: 'right-panel',
    tag: 'Beam · rect · selected',
    price: '€5–50',
    state: 'selected',
    top: '6%',
    right: '6%',
    width: '26%',
    height: '56%',
  },
  {
    id: 'backdrop',
    tag: 'Beam · backdrop',
    price: '€12–80',
    state: 'idle',
    bottom: '8%',
    left: '6%',
    width: '44%',
    height: '28%',
  },
  {
    id: 'banner',
    tag: 'Beam · banner · off',
    price: 'disabled',
    state: 'off',
    bottom: '8%',
    right: '6%',
    width: '26%',
    height: '9%',
  },
];

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
  const [mode, setMode] = useState<StudioMode>('monitor');
  const [queue, setQueue] = useState<QueueItem[]>(QUEUE);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>('right-panel');

  const resolveQueue = (id: string) => setQueue((prev) => prev.filter((q) => q.id !== id));
  const selectedSlot = CANVAS_SLOTS.find((s) => s.id === selectedSlotId) ?? null;

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
          Studio
        </span>
      </nav>

      <div
        className="mx-auto flex flex-col gap-5"
        style={{ maxWidth: '1240px', padding: '28px 32px 60px' }}
      >
        <StudioHeadline username={SLUG} viewers={2147} isLive />

        <ModeToggle mode={mode} onChange={setMode} pendingCount={queue.length} />

        <EarningsStrip
          slug={SLUG}
          earnedToday="€142"
          earnedMonth="€3,284"
          pendingCount={queue.length}
        />

        <div
          className="grid items-start gap-5"
          style={{
            gridTemplateColumns:
              mode === 'setup' ? 'minmax(0, 1.5fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
          }}
        >
          {mode === 'setup' ? (
            <div className="flex flex-col gap-4">
              <StudioCanvas
                slots={CANVAS_SLOTS}
                selectedId={selectedSlotId}
                onSelect={setSelectedSlotId}
              />
              {selectedSlot ? (
                <SlotConfigurator
                  slotName={`${selectedSlot.tag.split(' · ')[0]} slot · ${selectedSlot.id.replace('-', ' ')}`}
                  dimensions="500×560 · image or video · mask picks the shape"
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-5">
            <AiringNow items={AIRING} />
            {mode === 'monitor' ? (
              <>
                <ApprovalQueue
                  items={queue}
                  onApprove={resolveQueue}
                  onReject={resolveQueue}
                />
                <FlashesLog
                  items={FLASHES}
                  totals={{ count: 38, eur: '€52', usdc: '18 USDC' }}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
