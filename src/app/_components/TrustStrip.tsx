import type { ReactNode } from 'react';

function CardShell({
  num,
  title,
  visual,
  body,
}: {
  num: string;
  title: string;
  visual: ReactNode;
  body: ReactNode;
}) {
  return (
    <article
      className="flex flex-col"
      style={{
        padding: '28px 26px 30px',
        border: '1px solid var(--casi-border)',
        borderRadius: '18px',
        background: 'var(--casi-surface)',
        gap: '22px',
        minHeight: '280px',
      }}
    >
      <div
        className="font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.24em',
          color: 'var(--casi-accent)',
        }}
      >
        {num}
      </div>

      <div>{visual}</div>

      <div>
        <h4
          className="font-bold"
          style={{
            fontSize: '20px',
            letterSpacing: '-0.5px',
            marginBottom: '10px',
            color: 'var(--casi-text)',
          }}
        >
          {title}
        </h4>
        <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--casi-text-dim)' }}>{body}</p>
      </div>
    </article>
  );
}

function ZeroFeeVisual() {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="font-extrabold"
        style={{
          fontSize: '72px',
          lineHeight: 0.9,
          letterSpacing: '-4px',
          color: 'var(--casi-accent)',
        }}
      >
        0%
      </span>
      <span
        className="font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.2em',
          color: 'var(--casi-text-mid)',
        }}
      >
        platform
        <br />
        fee
      </span>
    </div>
  );
}

function RailPill({
  mark,
  label,
  hint,
  tone,
}: {
  mark: ReactNode;
  label: string;
  hint?: string;
  tone: 'accent' | 'accent2' | 'muted';
}) {
  const tones: Record<string, { fg: string; bg: string; border: string }> = {
    accent: {
      fg: 'var(--casi-accent)',
      bg: 'rgba(var(--casi-accent-rgb), 0.08)',
      border: 'rgba(var(--casi-accent-rgb), 0.25)',
    },
    accent2: {
      fg: 'var(--casi-accent2)',
      bg: 'rgba(var(--casi-accent2-rgb), 0.08)',
      border: 'rgba(var(--casi-accent2-rgb), 0.25)',
    },
    muted: {
      fg: 'var(--casi-text-mid)',
      bg: 'var(--casi-bg)',
      border: 'var(--casi-border-2)',
    },
  };
  const t = tones[tone];
  return (
    <div
      className="flex items-center gap-2.5"
      style={{
        padding: '9px 12px',
        borderRadius: '10px',
        background: t.bg,
        border: `1px solid ${t.border}`,
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center font-mono"
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '5px',
          background: t.bg,
          color: t.fg,
          fontSize: '12px',
        }}
      >
        {mark}
      </span>
      <span
        className="font-semibold"
        style={{ fontSize: '13px', color: 'var(--casi-text)' }}
      >
        {label}
      </span>
      {hint ? (
        <span
          className="ml-auto font-mono uppercase"
          style={{
            fontSize: '9px',
            letterSpacing: '0.18em',
            color: 'var(--casi-text-faint)',
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function PayRailsVisual() {
  return (
    <div className="flex flex-col gap-1.5">
      <RailPill mark="$" label="Cards via Stripe" hint="2.9%" tone="accent" />
      <RailPill mark="◎" label="USDC on Solana" hint="on-chain" tone="accent2" />
      <RailPill mark="♡" label="Free tier" hint="off by default" tone="muted" />
    </div>
  );
}

function ApprovalChipVisual() {
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="inline-flex items-center gap-2 self-start"
        style={{
          padding: '8px 12px',
          borderRadius: '999px',
          background: 'rgba(var(--casi-accent2-rgb), 0.1)',
          border: '1px solid rgba(var(--casi-accent2-rgb), 0.35)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--casi-accent2)',
            boxShadow: '0 0 10px rgba(var(--casi-accent2-rgb), 0.7)',
          }}
        />
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '11px',
            letterSpacing: '0.14em',
            color: 'var(--casi-accent2)',
          }}
        >
          approved · 4s
        </span>
      </div>
      <div
        className="inline-flex items-center gap-2 self-start font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.18em',
          color: 'var(--casi-text-mid)',
        }}
      >
        <span aria-hidden style={{ color: 'var(--casi-text-faint)' }}>
          ↩
        </span>
        denied → full refund
      </div>
      <div
        className="inline-flex items-center gap-2 self-start font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.18em',
          color: 'var(--casi-text-mid)',
        }}
      >
        <span aria-hidden style={{ color: 'var(--casi-text-faint)' }}>
          ⏲
        </span>
        stopped → prorated back
      </div>
    </div>
  );
}

export default function TrustStrip() {
  return (
    <section
      className="mx-auto casi-grid-trust casi-trust-pad"
      style={{ maxWidth: '1200px' }}
    >
      <CardShell
        num="01"
        visual={<ZeroFeeVisual />}
        title="We don't touch your money"
        body={
          <>
            Cards flow through Stripe straight to the streamer. USDC sits in an on-chain escrow
            contract. Casi is software — not a bank, not a processor. Every euro lands in the
            streamer&apos;s account.
          </>
        }
      />
      <CardShell
        num="02"
        visual={<PayRailsVisual />}
        title="Pay any way"
        body={
          <>
            Cards via Stripe, USDC on Solana, or a free tier for streamers who want to grow first,
            earn second. One booking flow, two rails, one signature.
          </>
        }
      />
      <CardShell
        num="03"
        visual={<ApprovalChipVisual />}
        title="Streamer taps yes — or the money comes back"
        body={
          <>
            Nothing goes on screen without approval. Denied in seconds? Full refund, automatically.
            Stopped mid-beam? You get the unused portion back, prorated to the second.
          </>
        }
      />
    </section>
  );
}
