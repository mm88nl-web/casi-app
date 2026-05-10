# Pro tier — planning notes

**Status**: brainstorm / spec, not shipping. Per [AGENTS.md](./AGENTS.md): no new Pro-tier features ship pre-mainnet. This doc captures the design we'd build *when* SaaS upsell becomes the next focus, so the menu is ready and the schema is plannable.

**Branch**: `claude/pro-tier-monetization-ruTuJ`

---

## Strategic principles (read these first)

These are non-negotiable framing decisions. Everything else flows from them.

### 1. Streamers pay, viewers don't — ever

CASI's pitch is "100% of every booking flows direct viewer→streamer, no protocol fees, ever." A viewer-side subscription is a take-rate by another name on a different surface. Same brand contradiction.

**Implication**: there is no `viewer.tier` column. Tier lives on `profiles` (streamers only). Viewer-facing UI reads `streamer.tier` to decide what capabilities to show.

### 2. Streamer pays for *capabilities*; viewers get to use them on that streamer's channel

Mental model: same as Twitch Bits / channel emotes / Patreon perks. The channel pays, viewers get richer interaction with that specific channel. CASI's Pro is **not** a feature unlock for a single streamer's own dashboard — it's an unlock for *what their viewers can do when interacting with them*.

Examples of how this composes:
- Streamer turns on TTS flashes → all that streamer's viewers can pay extra to have their flash message read aloud
- Streamer turns on Discord role sync → all that streamer's viewers who book auto-get a "Beam Buyer" role
- Streamer turns on custom shapes → all that streamer's viewers see their freehand-drawn slot outlines and crop their media to fit

### 3. CASI is a phone-side companion, not a destination

Viewers watch the actual stream on their main device (TV, desktop, browser). They open CASI on their phone alongside it as the booking/tipping interface. **Time-on-CASI for viewers should be low.** In and out, back to the stream.

**Implication for Pro**:
- Viewer-side features should be **speed unlocks** (saved cards, one-tap rebook, push notifications) — and these are **universal free**, not Pro
- Streamer-side features can be rich (analytics, draw tool, auto-approve rules) — they use the dashboard as a tool
- No content discovery feeds, leaderboard browsing, in-app stream embeds on the viewer surface

### 4. Companion-utility positioning is the App Store defense

Apple's IAP rule applies when (a) digital content is consumed inside the app and (b) the app aggregates payments to third parties. CASI is structurally exempt from both:
- **Service is rendered on the stream** (Twitch / Kick / YouTube), outside iOS
- **CASI never holds funds** — Stripe Connect Direct Charges land on the streamer's connected account; Solana goes wallet→PDA. Same legal model that lets Patreon, Cameo, Buy Me a Coffee, Substack, and Twitch's external-payment donation flow skip IAP.

**This works only if the viewer-side UI doesn't drift into "in-app subscriptions / digital goods" territory.** A viewer Pro tier breaks the defense. Universal-free viewer features keep it intact.

**Recommended path: PWA + push notifications + Add-to-Home-Screen.** Skips App Review entirely, ~95% of native UX, no IAP risk. Native iOS/Android later if and when it's justified by real revenue.

### 5. Pre-mainnet, this is paper only

Audit must clear, mainnet must launch, first cohort must onboard. *Then* SaaS upsell. Until then, this doc is the menu, not the build queue.

---

## Tier matrix

### Free tier (default for every streamer)

- Up to **3 slots** on canvas
- Shapes: **`rect` + `rounded`** only
- Standard pricing (per-minute, streamer-set)
- Standard moderation (manual approve/deny per booking)
- Standard upload limits
- Stripe + Solana booking rails
- Standard `/s/[username]` share page
- All viewer-facing features (universal — see below)

### Pro tier (target: ~$19/mo)

Anchored on the three features that do most of the conversion work in similar SaaS (Streamlabs Ultra, StreamElements Pro):

1. **Auto-approve rules engine** — whitelist trusted viewers, auto-approve under $X, auto-deny by file size / dimensions / keywords, auto-approve repeat customers (>N successful beams). Optional NSFW image classifier.
2. **Custom shapes** — freehand draw tool + 15-20 preset gallery (star, diamond, heart, shield, etc.) + viewer-side crop UI
3. **Analytics** — top-spender LTV, beam-completion rate, refund rate, peak-hours, conversion funnel from `/s/[username]` → booking. Free tier sees last 7 days; Pro sees full history + CSV export.

Plus the supporting features:

- **Unlimited slots** on canvas (free is capped at 3)
- **Custom branding** — remove "Powered by CASI" footer; custom domain support (`book.streamer.tv`); custom font upload; full skin customization beyond the 7 presets
- **Multi-seat mod accounts** — approve-only role for managers, audit log of who approved what
- **Higher upload limits** — image MB, video duration, max beam minutes
- **Outbound webhooks** — beam start/end events for OBS scene switches, Discord bot announcements, Streamer.bot integrations
- **Annual earnings report** — auto-generated tax-prep summary (relevant for Dutch streamers given founder is in NL)
- **Slot canvases / scenes** — save multiple canvas presets, switch by game/scene (free = 1 canvas)
- **Smart pricing** — surge pricing (queue depth multiplier), time-of-day curves, game-mode-aware pricing
- **Goal bar / leaderboard / ticker widgets** — separate OBS browser sources for milestone progress, top tippers, recent flashes scrolling marquee
- **Slot sponsorship mode** — fixed-rate brand-deal slots (brand pays $X/week to occupy a slot continuously) instead of per-minute. Opens advertising revenue category mentioned in AGENTS.md.
- **Discord role sync** — viewer who books a beam auto-gets a "Beam Buyer" role on the streamer's Discord. Uses existing Discord OAuth.
- **Loyalty tiers + badges** — "5+ beams = gold badge shown on viewer's beam frame." Streamer configures thresholds.
- **TTS read-aloud on flashes** — viewer pays a small premium to have their flash message read by an AI voice. Streamer chooses voice.
- **Sound effect library on flashes** — full library on Pro, 3 default sounds on free
- **Custom flash animations** — entrance/exit transitions (slide, bounce, glitch). Pro picks from gallery.
- **Promo codes** — `LAUNCH50` for 50% off. Marketing/onboarding tool.
- **Beam bundles** — streamer offers "10-pack of 1-min beams, $X" at a discount
- **Beam clip download** — every beam recorded server-side, viewer gets a downloadable MP4 post-beam (free streamer-side marketing — every viewer tweets "I was on @streamer's stream")
- **Embeddable booking widget** — iframe of the booking flow on `streamername.com/book`
- **CSV / API export** — bookings, revenue, viewer list

### Pro Plus tier (later, if justified)

- **SVG shape upload** (Pro is freehand + gallery only)
- **Custom branded frame overlays** (transparent PNG layered on top of beams)
- **Scheduled beams** — viewer books "appear at 8pm Friday" instead of immediate
- **Subscription / recurring beams** — viewer schedules a weekly beam
- **Reverse-auction / bid-up** — multiple viewers bid for the same slot, highest wins
- **Replay / clip recording for streamer** — full session VOD
- **Full white-label** — own domain, own branding, no CASI mentions anywhere

---

## Universal viewer features (always free, ship for everyone)

These are conversion accelerators, not gates. Putting them behind a paywall costs the *streamer* booking revenue, which is exactly backwards. Ship for free:

- Saved payment methods (Stripe + Solana wallet remembered)
- One-tap rebook (last booking + same media + same crop)
- Push notifications (queue advancement, beam going live, refund issued)
- Crop / pan / zoom presets per slot
- Recent uploads suggestion
- Refund chip ("✕ Denied — refund on the way") within `STRIPE_DENIED_WINDOW_MS`
- "Clean up ended" sweep for stale Solana ghosts (already exists in `/api/bookings/cleanup-stale-solana`)

---

## Feature deep-dive: custom shapes (freehand + gallery + viewer crop)

The marquee Pro feature. Most discussion went here, so it gets the most detail.

### Why this is the marquee

- **No competitor does it.** Streamlabs, StreamElements, Tangia, Blerp — all have rectangular media. CASI freehand is unique-on-stream.
- **Visually demoable.** Streamers will tweet screenshots of their custom-shaped beams; that's free marketing.
- **Architecturally cheap.** Existing shape system is already a switch statement on `overlay_elements.shape` rendering via CSS `clip-path`. Adding `custom` is one more case.

### Two halves of the feature

1. **Streamer side** (in `/studio/live`): freehand draw tool that produces a custom polygon for any slot
2. **Viewer side** (in `/overlay` booking flow): pan/zoom crop tool so their image fits the streamer's custom shape without chopping their face

Both must ship together. Without the crop tool, aggressive shapes destroy viewer media and the feature becomes a footgun.

### Streamer-side draw tool

**Library pick**: `simplify-js` (~3 KB) for the Ramer-Douglas-Peucker simplification step. Everything else is raw pointer events + ~30 lines of Catmull-Rom math. Rejected alternatives: `perfect-freehand` (produces stroke outlines, not closed regions), `paper.js` (overkill, ~80 KB), `react-konva` / `fabric.js` (massive overkill).

**Output format**: array of `[x%, y%]` percentages of the slot's bounding box, stored as JSONB. Curves are derived at render time, not stored — keeps the data simple, makes editing intuitive ("drag a vertex" vs "wrestle with Bezier handles").

**Three quality knobs** that control whether shapes feel organic (Instagram Stories vibe) or stiff (90s vector-tool vibe):

1. **Vertex count after simplification.** Target 40-80 vertices (RDP epsilon ~0.3%). Fewer = polygonal. More = noise.
2. **Curve interpolation at render.** Use `clip-path: path('M ... Q ...')` with Catmull-Rom-derived quadratic curves, not `clip-path: polygon(...)` straight segments. Browser support is green (Chrome 86+, Safari 14.1+, Firefox 97+).
3. **Real-time pointer smoothing.** Rolling-average low-pass filter on the last N pointer positions while drawing (~10 lines). This is what makes Procreate / Figma pen / Instagram brush feel "professional" — the line follows intent, not tremor.

**Two draw modes**:
- **Freehand** — drag, get an organic blob. Default.
- **Vertex** — click-to-place individual points, get a precise polygon. For star / geometric shapes streamers want sharp.

Both produce the same point-array output.

### Viewer-side crop tool

In the booking flow on `/overlay`, after media upload:

1. Show the slot's bounding box with the streamer's clip-path overlaid
2. Render the viewer's media inside, default transform = identity (scale 1, no offset)
3. Pan = drag, zoom = scroll/pinch
4. Optional "Fit to shape" auto-button — picks a starting scale where the media fully covers the polygon's bbox
5. Submit captures `{ scale, offsetX, offsetY }` to `bookings.media_transform JSONB`

No library — raw pointer events + CSS transform on the inner `<img>` / `<video>`. ~50-100 lines.

**Important**: snapshot the streamer's shape at booking time. Streamer can edit the freehand shape any time; if a viewer tuned their crop for shape v1 and the streamer changes to shape v2 before the beam goes live, the framing is now wrong. Add `bookings.shape_snapshot JSONB` — copy the polygon points at create time. Overlay renders the snapshot, not the live `overlay_elements` value.

### Data model additions

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_custom_shapes.sql
ALTER TABLE overlay_elements
  ADD COLUMN custom_shape_points JSONB;  -- array of [x%, y%]

ALTER TABLE bookings
  ADD COLUMN media_transform JSONB,       -- { scale, offsetX, offsetY }
  ADD COLUMN shape_snapshot JSONB;        -- frozen copy of points at booking time
```

`shape` column extends with new value `'custom'` (no enum constraint to update — it's TEXT today).

### Render-side integration

Existing shape switch lives in three places:
- `overlay/page.tsx:1629-1634` — viewer-facing OBS render
- `admin/page.tsx:1487-1492` — streamer canvas preview
- `studio/_components/StudioLiveEditor.tsx` — studio canvas preview

Each gets one new case (~5-8 lines):

```tsx
el.shape === 'custom' && el.custom_shape_points
  ? `path('${pointsToSvgPath(el.custom_shape_points)}')`
  : ...
```

Plus a small `pointsToSvgPath()` helper in `src/lib/shapes.ts` (Catmull-Rom → quadratic curves, ~30 lines).

### File / size impact

| File | New / edit | Lines |
|---|---|---|
| `studio/_components/ShapeDrawTool.tsx` | new | ~200 |
| `overlay/_components/ShapeCropTool.tsx` | new | ~100 |
| `src/lib/shapes.ts` | new | ~50 (Catmull-Rom + simplify wiring) |
| `studio/_components/StudioLiveEditor.tsx` | edit | +10 |
| `overlay/_components/BookingForm.tsx` | edit | +15 |
| `admin/page.tsx` | edit | +5 |
| `overlay/page.tsx` | edit | +8 |
| `src/components/ShapeButtonGroup.tsx` | edit | +3 |
| Migration | new | ~10 |

Spine files (`admin/page.tsx`, `overlay/page.tsx`) gain ~13 lines combined. Both stay under the ~2k ceiling AGENTS.md calls out.

### Effort estimate

- Streamer draw tool: ~1 day
- Viewer crop tool: ~1 day
- Snapshot + render path: ~half day
- Gallery preset shapes: ~half day (one-line `polygon()` entries each)
- **Total: ~3 days end-to-end**

### Effort breakdown for the gallery alone (cheapest sub-deliverable)

15-20 preset clip-path polygons (star, diamond, heart, shield, badge, gem, leaf, speech-bubble, octagon, parallelogram, etc.) added to `SHAPE_CSS` as one-line entries. Gated by `streamer.tier`. Could ship in an afternoon. Build this first if you want to test market appetite before investing in the draw tool.

---

## Feature deep-dive: auto-approve rules engine

The other half of the conversion-driving Pro pitch. Streamers who get >5 bookings/day are drowning in manual approval; this is when they upgrade.

**Rule types to support**:
- Whitelist: viewer wallet / username always auto-approves
- Auto-approve under $X (per booking)
- Auto-approve repeat customers (>N successful prior beams from this viewer)
- Auto-deny: file size > X MB, dimensions outside range, video > X seconds
- Auto-deny: keyword match in viewer's message field
- Optional: NSFW image classifier (third-party API; Sightengine / AWS Rekognition)

**Architecture**: rules evaluator runs in `/api/bookings/*/authorize` before the booking lands as `pending`. If rule matches "approve" → status goes straight to `active` (with payment-gate check still enforced). If rule matches "deny" → status goes straight to `denied`, refund issued. Otherwise → `pending` for manual review.

**Storage**: `streamer_auto_rules` table, JSONB rule body per row, ordered evaluation. UI in settings page lets streamer build rules visually.

**Effort**: ~3-4 days for the engine + UI. NSFW classifier integration is +1 day.

---

## Feature deep-dive: OBS widgets (goal bar, leaderboard, ticker)

Each widget is its own browser-source URL — same pattern as the existing `/overlay` route. Streamer copies a URL into OBS, adds it as a Browser Source, configures size/position.

| Widget | Route | What it shows |
|---|---|---|
| Goal bar | `/widget/goal?s=username` | Progress bar toward streamer-defined milestone ($X / $Y to "new keyboard") |
| Leaderboard | `/widget/leaderboard?s=username` | Top tippers / top beam buyers, configurable timeframe |
| Ticker | `/widget/ticker?s=username` | Scrolling marquee of recent flash messages |

All three are Pro-only. Free streamers see "Upgrade to Pro to enable" in their OBS Sources settings list.

**Why this matters**: Streamlabs sells these as their core widget product. Streamers expect them. Once they're set up in OBS, they're sticky — switching costs are real (reconfigure scene layouts, retest layout on stream).

**Effort**: ~2 days per widget. Can ship one at a time.

---

## Feature deep-dive: Discord role sync

Viewer who books a beam auto-gets a configured Discord role on the streamer's server. Drives community building / retention. Streamer can configure tier-based roles ("Beam Buyer", "Frequent Booker 5+", "VIP 10+").

**Architecture**: Streamer does Discord OAuth with bot scope, picks server, picks roles per tier. On booking-success webhook, server-side call to Discord API assigns role.

**Why this is high-leverage**: Discord OAuth is *already wired* in `/login` (per AGENTS.md). Half the integration work is done. Plus it's the kind of feature streamers immediately understand the value of.

**Effort**: ~3 days (OAuth scope expansion + server picker UI + role assignment endpoint + tier evaluation).

---

## Feature ranking by leverage

For when there's eventually a build queue:

1. **Custom shapes (gallery only)** — afternoon to ship, low risk, demoable
2. **Auto-approve rules engine** — biggest churn-reduction lever, drives upgrades from busy streamers
3. **Goal bar widget** — every streamer wants one, low build, high visibility on stream
4. **Custom shapes (full freehand + crop)** — marquee marketing feature, ~3 days
5. **Discord role sync** — uses existing OAuth, massive retention play
6. **Analytics (last-7d free, full Pro)** — table stakes; expected by anyone evaluating upgrade
7. **Custom branding (footer removal + domain)** — easy wins, asked-for by every serious streamer
8. **TTS flashes** — matches competitor table-stakes (Tangia's whole pitch)
9. **Slot sponsorship mode** — opens new revenue category for streamers, unique positioning vs competitors
10. **Beam clip download** — turns viewers into marketers
11. **Multi-seat mod accounts** — only matters for top streamers, lower priority
12. **Embed widget** — power users only, lower priority

---

## What we explicitly rejected

- **Per-beam duration cap on free tier (e.g. 10 min max)** — considered, then rejected. Shifts monetization from "feature unlocks" to "revenue restriction." 10 min is too aggressive given streamer-set pricing varies wildly; for a streamer at $0.20/min, capping at $2/booking pushes them off-platform instead of upgrading. Per-day total cap or slot-count cap scales more naturally with success.
- **Viewer-side Pro tier of any kind** — see strategic principles. Misaligns incentives, contradicts brand pitch, breaks App Store posture.
- **Take-rate on Stripe or Solana rail** — non-negotiable per AGENTS.md.

---

## App Store / iOS posture

### Recommended path: PWA-first

- Skip App Store entirely for the launch window
- Add-to-Home-Screen + push notifications via web
- TWA on Android Play Store (no IAP issues for non-aggregated payments)
- ~95% of native UX, zero App Review risk

### If/when going native iOS

- Companion-utility framing is real but not bulletproof
- The architecture (non-custodial Stripe Connect Direct Charges, wallet→PDA Solana) is what actually grants the IAP exemption — same legal model as Patreon, Cameo, Buy Me a Coffee
- Crypto path may need stripping on iOS-only build (Solana rail draws stricter review)
- Apple's "primary purpose" test is fuzzy; companion-utility framing reduces but doesn't eliminate review risk

### Implications for Pro tier on viewer side

**There is no viewer Pro tier.** Period. This protects the App Store posture — Apple's IAP rule is hardest to dodge for in-app subscriptions to digital services. Universal-free viewer features sidestep it.

Streamer-side Pro subscription is on the streamer's web dashboard (or a streamer-only mobile app, if/when built — most streamers manage their stream from desktop anyway). The streamer subscription billing happens on web, never inside an iOS app surface, never IAP.

---

## Implementation discipline (when this eventually ships)

Per AGENTS.md:

1. **Don't grow the spine files.** `admin/page.tsx` and `overlay/page.tsx` are at the ~2k ceiling. Every new feature lives in `_components/`. If a Pro feature adds more than ~30 lines of JSX to the spine, extract it.
2. **Don't broaden RLS.** Column-level grants for any new sensitive columns (`overlay_elements.custom_shape_points`, `bookings.media_transform`, `bookings.shape_snapshot`).
3. **Don't bypass `streamer-moderation.ts`.** Auto-approve rule engine outcomes must call into the existing `approveBooking` / `denyBooking` lib functions — not reimplement the moderation logic.
4. **Don't auto-promote Solana queue.** Same constraint applies — escrow program isn't wired for it.
5. **Tier check goes in one place.** A `canUseFeature(streamer, feature)` helper in `src/lib/tier.ts`. Don't sprinkle `if (tier === 'pro')` across components.

---

## Open questions

- **Pricing**: $19/mo working assumption, but no validation. Survey existing streamers? Look at conversion data once free tier has scale?
- **Pro Plus**: do we want a real second tier or is it just "we ship more features under Pro over time"? Streamlabs has Ultra; StreamElements has multiple tiers. Tradeoff is conversion clarity vs revenue ceiling.
- **Free tier slot count**: 3 working assumption. Could be 1 (more aggressive upgrade pressure) or 5 (gentler onboarding). Probably depends on how many slots a typical onboarding streamer creates.
- **Custom shape gallery presets**: which 15-20 shapes? Star, diamond, heart, shield, badge, gem, leaf, speech-bubble, octagon, parallelogram, plus what else? Probably easiest to ship 8-10 obvious ones and add more by user request.
- **Annual billing discount**: standard SaaS playbook is ~17% off annual ($190/year vs $228/year). Worth it for cash-flow predictability, but adds a Stripe Subscription line item to manage.
- **Streamer trial period**: 14-day free trial of Pro? Or just "first month free" promo? Probably the latter — simpler to implement, less abuse-prone.

---

## When this gets revisited

- After mainnet launch
- After audit clears
- After first 50-100 onboarded streamers (need a real cohort to design Pro features for)
- Before doing serious paid acquisition (Pro funding revenue is what makes paid acquisition math work)

Until then: this doc is the menu. Don't ship from it.
