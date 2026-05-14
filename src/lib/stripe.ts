import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY!;

// Block silent test-mode regressions in production: if Vercel says we're on
// the production environment but the key is still sk_test_, every booking
// would succeed in the dashboard yet move zero euros. Better to crash on
// boot than to discover this from a streamer complaint.
if (process.env.VERCEL_ENV === 'production' && secretKey?.startsWith('sk_test_')) {
  throw new Error(
    '[stripe] Refusing to boot: VERCEL_ENV=production but STRIPE_SECRET_KEY is a test key (sk_test_…). ' +
      'Swap to the live secret in Vercel → Project Settings → Environment Variables → Production.'
  );
}

export const stripe = new Stripe(secretKey, {
  apiVersion: '2026-03-25.dahlia',
});
