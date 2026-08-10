'use client';

import { useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';

// Loaded once and reused — loadStripe() is safe to call multiple times (it
// memoizes internally) but there's no reason to re-trigger the script load
// per modal open.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error('[EmbeddedCheckoutModal] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set');
      stripePromise = Promise.resolve(null);
    } else {
      stripePromise = loadStripe(key);
    }
  }
  return stripePromise;
}

type Props = {
  /** Client secret from a Checkout Session created with ui_mode: 'embedded_page'. */
  clientSecret: string;
  /** Fired when the Checkout Session completes successfully (card charged/
   *  authorized). The webhook is still the authoritative DB writer — this
   *  is purely "close the modal and show something optimistic." */
  onComplete: () => void;
  /** Fired when the viewer dismisses the modal without completing payment
   *  (backdrop click, close button, Escape). Caller is responsible for any
   *  cleanup of the now-abandoned pending row (e.g. viewer-deny). */
  onClose: () => void;
};

/**
 * Modal host for Stripe Embedded Checkout. Mounts inline on casi.gg instead
 * of the full-page redirect-to-Stripe-hosted-Checkout flow — see the
 * comments in stripe/authorize/route.ts and flashes/create/route.ts for why
 * (the domain jump plus the connected account's own Stripe branding reads
 * as a scam page to a first-time viewer).
 */
export default function EmbeddedCheckoutModal({ clientSecret, onComplete, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<StripeEmbeddedCheckout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stripe = await getStripe();
      if (cancelled) return;
      if (!stripe) {
        setError('Payment form failed to load — please try again.');
        return;
      }
      try {
        const checkout = await stripe.createEmbeddedCheckoutPage({
          fetchClientSecret: async () => clientSecret,
          onComplete,
        });
        if (cancelled) {
          checkout.destroy();
          return;
        }
        checkoutRef.current = checkout;
        if (containerRef.current) checkout.mount(containerRef.current);
      } catch (err) {
        if (!cancelled) {
          console.error('[EmbeddedCheckoutModal] createEmbeddedCheckoutPage failed:', err);
          setError('Payment form failed to load — please try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
      // destroy(), not unmount() — this instance is going away for good
      // (the modal is closing), not being temporarily hidden.
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
    // clientSecret identifies the Checkout Session; onComplete is expected
    // to be referentially stable from the caller (or the effect would
    // re-mount Checkout on every parent render, which is wrong here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Complete payment"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9500,
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--casi-surface)',
          border: '1px solid var(--casi-border-2)',
          borderRadius: '14px',
          padding: '16px',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close payment form"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: '1px solid var(--casi-border-2)',
            background: 'var(--casi-surface-2)',
            color: 'var(--casi-text-mid)',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          ✕
        </button>

        {error ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--casi-text-mid)', fontSize: '13px' }}>
            {error}
          </div>
        ) : (
          <div ref={containerRef} style={{ minHeight: '420px' }} />
        )}
      </div>
    </div>
  );
}
