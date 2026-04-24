'use client';

import { useMemo, useState } from 'react';
import SlotPicker, { type Slot } from './SlotPicker';
import DurationPicker, { type Duration } from './DurationPicker';
import PayRailPicker, { type PayMethod } from './PayRailPicker';
import CreativePicker, { type CreativeMode } from './CreativePicker';

type Tab = 'flash' | 'beam';

const SLOTS: Slot[] = [
  { id: 'right-panel', name: 'Right panel', shape: 'hex', priceRange: '€5–50' },
  { id: 'mascot', name: 'Mascot', shape: 'circle', priceRange: '€3–30' },
  { id: 'banner', name: 'Top banner', shape: 'banner', priceRange: '€2–20' },
  { id: 'sponsor', name: 'Sponsor card', shape: 'rounded', priceRange: '€4–40' },
  { id: 'lower-third', name: 'Lower third', shape: 'rect', priceRange: '€5–40', taken: { remainingLabel: '2m left' } },
  { id: 'backdrop', name: 'Full backdrop', shape: 'backdrop', priceRange: '€15–80' },
];

const DURATIONS: Duration[] = [
  { minutes: 1, priceLabel: '€5' },
  { minutes: 3, priceLabel: '€15' },
  { minutes: 5, priceLabel: '€25' },
  { minutes: 10, priceLabel: '€50' },
];

const FLASH_PRICE = { priceLabel: '€2', amount: 2 };

export default function BookingPanel() {
  const [tab, setTab] = useState<Tab>('beam');
  const [slotId, setSlotId] = useState(SLOTS[0].id);
  const [mode, setMode] = useState<CreativeMode>('file');
  const [name, setName] = useState('CoolTiger42');
  const [durationMinutes, setDurationMinutes] = useState(3);
  const [payMethod, setPayMethod] = useState<PayMethod>('card');
  const [textValue, setTextValue] = useState('happy bday pixel ✨');
  const [clickThrough, setClickThrough] = useState('');

  const duration = useMemo(
    () => DURATIONS.find((d) => d.minutes === durationMinutes) ?? DURATIONS[1],
    [durationMinutes],
  );

  const priceLabel = tab === 'beam' ? duration.priceLabel : FLASH_PRICE.priceLabel;
  const usdcAmountLabel =
    tab === 'beam'
      ? `${(parseFloat(duration.priceLabel.replace(/[^\d.]/g, '')) || 15).toFixed(2)} USDC`
      : `${FLASH_PRICE.amount.toFixed(2)} USDC`;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '18px',
      }}
    >
      {/* Tabs */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          borderBottom: '1px solid var(--casi-border)',
        }}
      >
        {(['flash', 'beam'] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="text-center transition-colors"
              style={{
                padding: '18px 14px',
                fontFamily: 'var(--font-casi-sans)',
                fontWeight: 700,
                fontSize: '15px',
                color: active ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
                background: active ? 'rgba(var(--casi-accent-rgb), 0.04)' : 'transparent',
                cursor: 'pointer',
                border: 'none',
                borderBottom: `3px solid ${active ? 'var(--casi-accent)' : 'transparent'}`,
              }}
            >
              {t === 'flash' ? 'Flash' : 'Beam'}
              <span
                className="block font-mono uppercase"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: active ? 'var(--casi-accent)' : 'var(--casi-text-faint)',
                  opacity: active ? 0.7 : 1,
                  marginTop: '3px',
                  fontWeight: 400,
                }}
              >
                {t === 'flash' ? 'One-shot · 15s' : 'Timed slot'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Beam-only slot picker */}
      {tab === 'beam' ? (
        <SlotPicker slots={SLOTS} selectedId={slotId} onSelect={setSlotId} />
      ) : null}

      {/* Body */}
      <div
        className="flex flex-col flex-1"
        style={{ padding: '28px', gap: '22px' }}
      >
        <Field label={`1 · Your ${tab === 'flash' ? 'flash message' : 'creative'}`}>
          <CreativePicker
            mode={tab === 'flash' ? 'text' : mode}
            onModeChange={setMode}
            textValue={textValue}
            onTextChange={setTextValue}
            clickThrough={clickThrough}
            onClickThroughChange={setClickThrough}
          />
        </Field>

        <Field label={`${tab === 'flash' ? '2' : '2'} · Your name (shown on stream)`}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CoolTiger42"
            className="w-full outline-none transition-colors"
            style={{
              background: 'var(--casi-bg)',
              border: '1px solid var(--casi-border-2)',
              color: 'var(--casi-text)',
              padding: '14px 16px',
              borderRadius: '10px',
              fontFamily: 'var(--font-casi-sans)',
              fontSize: '15px',
              fontWeight: 500,
            }}
          />
        </Field>

        {tab === 'beam' ? (
          <Field label="3 · How long">
            <DurationPicker
              options={DURATIONS}
              selectedMinutes={durationMinutes}
              onSelect={setDurationMinutes}
            />
          </Field>
        ) : null}

        <Field label={`${tab === 'beam' ? '4' : '3'} · Pay with`}>
          <PayRailPicker
            selected={payMethod}
            onSelect={setPayMethod}
            usdcAmountLabel={usdcAmountLabel}
          />
        </Field>
      </div>

      {/* CTA */}
      <button
        type="button"
        className="flex items-center justify-between font-bold transition-transform"
        style={{
          margin: '0 20px 20px',
          padding: '18px 22px',
          borderRadius: '14px',
          background: 'var(--casi-accent)',
          color: '#050505',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-casi-sans)',
          boxShadow: '0 12px 32px rgba(var(--casi-accent-rgb), 0.25)',
        }}
      >
        <span className="flex flex-col items-start">
          <span style={{ fontSize: '17px', letterSpacing: '-0.2px' }}>
            Confirm {tab === 'flash' ? 'Flash' : 'Beam'}
          </span>
          <span
            className="font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.12em',
              fontWeight: 500,
              opacity: 0.7,
              marginTop: '2px',
            }}
          >
            Streamer approves in &lt; 30s
          </span>
        </span>
        <span style={{ fontSize: '22px', letterSpacing: '-0.5px' }}>{priceLabel}</span>
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.2em',
          color: 'var(--casi-text-dim)',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
