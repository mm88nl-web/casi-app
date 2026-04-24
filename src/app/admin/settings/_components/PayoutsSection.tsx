'use client';

import { useState } from 'react';
import SettingsSection from './SettingsSection';
import FieldRow, { settingsInputStyle } from './FieldRow';
import GhostButton from './GhostButton';

type ConnectedCardProps = {
  logo: React.ReactNode;
  title: React.ReactNode;
  meta: React.ReactNode;
  action: React.ReactNode;
};

function ConnectedCard({ logo, title, meta, action }: ConnectedCardProps) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{
        padding: '14px 16px',
        background: 'var(--casi-bg)',
        border: '1px solid var(--casi-border-2)',
        borderRadius: '10px',
      }}
    >
      <div className="flex items-center gap-3.5">
        {logo}
        <div>
          <div className="font-semibold" style={{ fontSize: '14px', color: 'var(--casi-text)' }}>
            {title}
          </div>
          <div
            className="mt-0.5 font-mono uppercase"
            style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--casi-text-dim)' }}
          >
            {meta}
          </div>
        </div>
      </div>
      {action}
    </div>
  );
}

function StatusDot({ kind }: { kind: 'ok' | 'warn' }) {
  return (
    <span
      className="mr-1.5 inline-block"
      style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: kind === 'ok' ? 'var(--casi-accent2)' : '#f59e0b',
      }}
    />
  );
}

export default function PayoutsSection() {
  const [minPayout, setMinPayout] = useState('50');
  const [taxRegion, setTaxRegion] = useState('de');

  return (
    <SettingsSection
      id="payouts"
      title="Payouts"
      desc="Casi takes 0%. Cards settle through Stripe weekly (Stripe's own fee ~2.9% + €0.25 per tip). USDC hits your wallet instantly on approval — near-zero on-chain fees."
    >
      <div
        className="mb-3.5 flex items-start gap-3"
        style={{
          background: 'rgba(var(--casi-accent2-rgb), 0.04)',
          border: '1px solid rgba(var(--casi-accent2-rgb), 0.2)',
          borderRadius: '10px',
          padding: '12px 14px',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center font-mono font-semibold"
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '5px',
            background: 'rgba(var(--casi-accent2-rgb), 0.15)',
            color: 'var(--casi-accent2)',
            fontSize: '12px',
            marginTop: '1px',
          }}
        >
          ♦
        </div>
        <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'var(--casi-text-mid)' }}>
          <strong style={{ color: 'var(--casi-text)', fontFamily: 'var(--font-casi-sans)' }}>
            Casi never holds your money.
          </strong>{' '}
          Card payments flow directly to your Stripe account. USDC sits in an on-chain escrow contract
          (open-source) and pays out to your wallet. We&apos;re software, not a bank — no regulatory
          exposure, no custody risk on our end.
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <ConnectedCard
          logo={
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '9px',
                background: '#635BFF',
                color: '#fff',
                fontFamily: 'var(--font-casi-sans)',
                fontWeight: 800,
                fontSize: '10px',
                letterSpacing: '-0.2px',
              }}
            >
              stripe
            </div>
          }
          title="Stripe — connected"
          meta={
            <>
              <StatusDot kind="ok" />
              acct_••••7fA2 · EUR · no real payouts until audit clears
            </>
          }
          action={<GhostButton type="button">Manage</GhostButton>}
        />

        <ConnectedCard
          logo={
            <div
              className="flex shrink-0 items-center justify-center font-mono"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #9945FF, #14F195)',
                color: '#0a0a0a',
                fontSize: '18px',
              }}
            >
              ◎
            </div>
          }
          title="Solana wallet — linked"
          meta={
            <>
              <StatusDot kind="ok" />
              7kT9...qBvX · USDC auto-claim on · testnet tokens only
            </>
          }
          action={<GhostButton type="button">Replace</GhostButton>}
        />
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: '18px' }}
      >
        <FieldRow label="Minimum payout · EUR">
          <input
            value={minPayout}
            onChange={(e) => setMinPayout(e.target.value)}
            style={settingsInputStyle}
          />
        </FieldRow>
        <FieldRow label="Tax region">
          <select
            value={taxRegion}
            onChange={(e) => setTaxRegion(e.target.value)}
            style={settingsInputStyle}
          >
            <option value="de">Germany · VAT collected by Stripe</option>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
            <option value="eu">Other EU</option>
          </select>
        </FieldRow>
      </div>
    </SettingsSection>
  );
}
