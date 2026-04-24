'use client';

import { useState } from 'react';
import Link from 'next/link';
import CasiLogo from '@/components/CasiLogo';
import StudioCanvas, { type CanvasSlot } from '../_components/StudioCanvas';
import SlotConfigurator from '../_components/SlotConfigurator';

const CANVAS_SLOTS: CanvasSlot[] = [
  {
    id: 'right-panel',
    tag: 'Beam · rect',
    displayName: 'Beam slot · right panel',
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
    displayName: 'Beam slot · full backdrop',
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
    displayName: 'Beam slot · lower banner',
    price: 'disabled',
    state: 'off',
    bottom: '8%',
    right: '6%',
    width: '26%',
    height: '9%',
  },
];

export default function StudioSetupPage() {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>('right-panel');
  const selectedSlot = CANVAS_SLOTS.find((s) => s.id === selectedSlotId) ?? null;

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
            href="/studio"
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
            ← Live monitor
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
            Setup · beta
          </span>
        </div>
      </nav>

      <div
        className="mx-auto flex flex-col gap-5 casi-page-pad"
        style={{ maxWidth: '1080px' }}
      >
        <header>
          <h1
            className="font-extrabold"
            style={{ fontSize: '28px', letterSpacing: '-1px', color: 'var(--casi-text)' }}
          >
            Slots & canvas
          </h1>
          <p className="mt-1" style={{ fontSize: '14px', color: 'var(--casi-text-dim)' }}>
            Arrange where booked beams land. Click a slot in the preview to edit its shape,
            price range, and auto-block rules. Streamer-facing settings (profile, payouts,
            OBS keys, moderation) live in{' '}
            <Link
              href="/admin/settings"
              style={{ color: 'var(--casi-accent)', textDecoration: 'none' }}
            >
              Settings
            </Link>
            .
          </p>
        </header>

        <StudioCanvas
          slots={CANVAS_SLOTS}
          selectedId={selectedSlotId}
          onSelect={setSelectedSlotId}
        />

        {selectedSlot ? (
          <SlotConfigurator
            slotName={selectedSlot.displayName}
            dimensions="500×560 · image or video · mask picks the shape"
          />
        ) : (
          <div
            className="font-mono uppercase text-center"
            style={{
              padding: '32px 16px',
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: 'var(--casi-text-faint)',
              background: 'var(--casi-surface)',
              border: '1px solid var(--casi-border)',
              borderRadius: '14px',
            }}
          >
            Select a slot above to edit its config
          </div>
        )}
      </div>
    </main>
  );
}
