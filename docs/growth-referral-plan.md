# Growth: attribution + referral plan

Two growth mechanics, neither of which touches the payment flow or adds a fee
(the 0%-cut / "software, not payments" posture is non-negotiable — see AGENTS.md).

## 1. On-stream attribution (shipped)

A subtle `▸ get on stream · casi.gg` tag renders on the **beams** OBS layer
(`/obs?layer=beams`) whenever a beam is live (`src/app/obs/page.tsx`).
Every paid beam is seen by the streamer's whole audience, so each one is a
discovery moment. `pointer-events:none`, accent-coloured arrow, low-opacity.

**Pro hook:** the planned Pro tier's "custom branding" = hide/replace this tag.
Free streamers spread casi; paying streamers can remove it. Gate later via a
`profiles` flag (e.g. `hide_branding boolean default false`) — do **not** build
the Pro gating until Pro ships (post-mainnet, post first-cohort).

## 2. Streamer referral → Pro perks (NOT yet — needs Pro tier first)

When the Pro tier exists, add a referral loop that pays in **product, not cash**
(no transaction cut, no token — both would break the regulatory posture):

- Streamer shares a referral link/code.
- A referred streamer who connects payouts + goes live once → **both** get
  Pro free for 1 month.
- Track with a `referrals` table (referrer_id, referred_id, status, reward_granted_at).
- Recognition layer (cheap, can predate Pro): referral leaderboard, a
  "founding streamer" badge, featured placement in `/search` for early adopters.

**Explicitly avoid:** paying referrers a % of bookings (makes casi a payment
processor + breaks the 0%-cut promise) and referral tokens/airdrops (securities
risk + wrecks the grant story).

## Sequencing

Attribution works from the first live beam — it's the only growth mechanic that
doesn't need an existing user base. The referral loop *amplifies* happy users,
so it comes after the first cohort is real and Pro exists.
