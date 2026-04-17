# CASI

A streamer monetization platform with three earn-surfaces — **flashes** (paid
chat), **beams** (time-rented slot overlays), and **backdrops** (full-frame
rentals) — each payable via Stripe (manual-capture + prorated refund), Solana
USDC (via the in-house [casi-escrow](./programs/casi-escrow/README.md) Anchor
program), or a free tier gated by the streamer.

The Anchor program is Apache-2.0 and designed to be reusable by any Solana
project that needs trust-minimised escrow with linear vesting and anti-grief
settlement guarantees. See
[`programs/casi-escrow/README.md`](./programs/casi-escrow/README.md) for the
on-chain design, audit scope, test coverage, and error codes.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# casi-app
