# Shine — Pro feature: live video calls (on-stream guest slots + private consultations)

> **Status**: design only. Not implemented. Do not start building until the
> triggers in "When to build" are hit.

**Shine** is the live-video variant of the existing Beam primitive — same
family as Beam (time-vested image/video tip) and Flash (one-shot tip), just
delivered over real-time WebRTC instead of static media. It covers two
bookable products, **open to every streamer, no Pro gate, no entitlement
flag** — same availability as beams/flashes today. (Earlier drafts of this
plan gated it behind a Pro flag; both proposed justifications — cost
recovery, then a custom-UI upsell — were dropped, and no gate survived
without a justification behind it. See Decisions below.)

1. **Shine (on-stream)** — a viewer pays to join the streamer live, on
   camera, in front of the whole stream audience. A live-video variant of
   the existing beam mechanic — it belongs on the canvas.
2. **Shine (consultation)** — a viewer books a 1:1 pay-per-minute video
   call with a creator (coaching / consulting), off-stream, no audience. A
   different product with a different UI shape: calendar booking + a call
   room, not an overlay canvas.

Both reuse the same escrow/payment backend (`casi-escrow` Beam primitive on
Solana, Stripe Connect Direct Charges on fiat) that already powers today's
beams — **streamer keeps 100% of the price, same as every other CASI
product.** No platform fee, no `application_fee_amount`, no on-chain fee
split. See "No fee — CASI absorbs the vendor cost" below for why, and note
this also means both payment rails ship together — there's no Solana-side
blocker anymore (see "Payment rails" below).

## Design principle: an in-between, not a focal point

Casi.gg is not where the streamer's or viewer's attention lives — the
platform they're actually streaming/watching to (Twitch/YouTube/Kick) is,
and stays, the focal point. Shine exists to monetize the *extra
interaction* on top of that, not to become a destination or a production
surface in its own right. This is why the delivery mechanism reuses the
existing OBS browser source instead of replacing OBS the way StreamYard or
Restream Studio do, and why the streamer's touch with it is a brief
interrupt (approve → glance at a preview → click) rather than a dashboard
they keep open. Any future addition to Shine should be checked against
this: does it stay a quick, notification-driven utility, or does it start
asking the streamer to actively run a second screen? The multi-guest
"lobby" idea discussed below is exactly the kind of feature that risks the
latter if built as a persistent queue-management UI — if it's ever built,
it should stay interrupt-driven (a ping: "someone's waiting, admit or
reject"), not a screen someone has to monitor.

## Precedent check — is this already a thing?

Both halves exist separately, not combined:

- **Pay-per-minute video consulting** is an established category —
  Clarity.fm, Popcall, Loki, AtomChat. All charge a straight platform cut
  (Popcall keeps 20%, Loki 15%) and settle after the fact off a payment
  processor; none use a trust-minimized escrow with pro-rata,
  drop-protected settlement the way `casi-escrow`'s Beam already does for
  on-stream tipping.
- **"Bring a guest onto your live stream"** is also established —
  StreamYard, Restream Studio, Riverside — all browser-based, WebRTC-first
  studios built for planned interviews/podcasts. None of them are built
  for a random viewer to *pay their way onto* someone else's stream, and
  none use escrow.

The combination Shine describes — trust-minimized, pro-rata-settled,
viewer-initiated paid video, on-stream or private, **and zero platform
take** — doesn't have a direct match in what turned up. Consistent with
the gap `AGENTS.md`'s "Competitive context" section already identifies for
the beam mechanic generally.

---

## Payment rails: both ship together now

Earlier drafts of this plan gated the Solana rail behind a not-yet-built
per-escrow fee split (`programs/casi-escrow/FEE_MODEL.md`), because
covering the video vendor's bill seemed to require collecting a fee, and
the Solana side of that fee mechanism needed a new Anchor program deploy —
which conflicts with the program being frozen pending audit.

That's moot now: **there is no fee**, on either rail. Shine's Solana
bookings just call `initialize_escrow` exactly like an ordinary beam does
today — zero program changes, zero new deploy, zero conflict with the
audit freeze. The only real reason to sequence Stripe slightly ahead of
Solana is engineering pragmatism (one rail to build/test before adding the
second), not an external gate. A team that wants to ship both at once
should feel free to.

---

## No fee — CASI absorbs the vendor cost

The founder's actual constraint was narrower than "recover the cost from
someone": it was "don't make CASI hold funds or collect a platform cut to
manage this." A percentage fee (the earlier draft used 5% of the settled
amount) technically kept the streamer at 100% of *their* price, but the
fee itself still landed in CASI's own Stripe balance — real platform
revenue, and the first time CASI would take any cut of a booking at all
(everything else is explicit 100% passthrough per `AGENTS.md`: "no
protocol fees, ever"). That's a bigger shift than it looked like on paper,
and worth not doing just to solve a cost problem that's mostly theoretical
at current volume.

**Instead**: treat the video vendor's bill like every other tool CASI
already pays for without a matching fee — Vercel, Supabase, Stripe's own
processing fees. Directly analogous to the existing precedent in
`FEE_MODEL.md` for the Solana cranker: *"platform cranker eats the
~$7.50/month fee cost. It's noise."* Same logic here:

- At pre-traction volume, the realistic vendor bill is **$0** — both Daily
  (10k free participant-minutes/month) and LiveKit (5k free/month, exact
  unit tbd) likely absorb everything Shine generates for a long while.
- If Shine ever gets enough real usage that the bill stops being noise,
  that's a good problem, solvable later with actual usage data — not
  something to pre-build fee-collection infrastructure for now.
- This also removes an entire category of "is the fee sized right"
  questions (short calls, free bookings, resolution-based cost spread)
  that existed only to make a fee model fair. No fee, no fairness problem.

Streamer keeps 100%. Viewer pays exactly the price the streamer set,
nothing more. CASI pays a normal, currently-near-zero vendor bill, same
posture as its other infrastructure costs.

---

## Vendor: LiveKit (Cloud)

Chosen over Daily for the open-source alignment, now that cost is no
longer the deciding factor between them (see below).

- **License, confirmed**: the LiveKit server (SFU), SIP/Egress/Ingress
  services, and all client/server SDKs are Apache License 2.0 across the
  board. Apache 2.0 is permissive — free to use, modify, and build on
  commercially, no obligation to open-source CASI's own code as a result
  (that's a separate, already-settled choice — `casi-app` is Apache-2.0
  because CASI chose that, not because consuming an Apache-2.0 dependency
  requires it), no "share-alike" virality. The only real obligation is
  standard: preserve copyright/license notices in any LiveKit source
  actually redistributed. Using LiveKit Cloud (the hosted product) as a
  dependency via its SDK doesn't even meaningfully invoke this — it's the
  same shape as consuming any other library. Practically: **use whatever
  pieces make sense, don't feel obligated to self-host the whole stack or
  use every component** — the client SDK + Cloud-hosted server is a
  legitimate, fully-licensed way to consume it.
- **Real optionality this buys**: unlike a fully closed vendor, if LiveKit
  Cloud's pricing or terms ever became a problem, the same Apache-2.0 core
  can be self-hosted without a rewrite. Not needed now (self-hosting is
  real ops burden CASI doesn't want pre-traction), but it's a genuine
  future escape hatch that a closed SaaS vendor can never offer.
- **Pricing** (now non-blocking, since CASI absorbs it, but worth knowing):
  metered per track, not per participant — audio $0.004/track-min, video
  $0.006–$0.024/track-min depending on resolution. For a realistic
  webcam-quality 2-person call this lands around $0.010/participant-min
  (~$0.60 for a 30-min call), noticeably more than Daily's flat
  $0.004/participant-min ($0.24 for the same call) — but since nobody's
  trying to recover this via a fee anymore, the gap doesn't matter for the
  build decision. **Do cap the requested video resolution server-side**
  when creating rooms (no reason a guest-slot webcam needs above ~720p) —
  keeps the (still-near-zero) cost predictable regardless.
- **Webhooks, verified against Shine's actual needs**: `room_started`
  (fires when the first participant joins an empty room) = the green-room
  join trigger; `room_finished` (room closes) = the settlement trigger;
  `participant_joined` / `participant_left` = same shape as Daily's
  equivalents. Maps essentially 1:1 onto the trigger architecture below —
  confirm exact payload fields and the webhook signature-verification
  mechanism (a signed JWT via the API key/secret, not a separate shared
  webhook secret like Daily uses) against current LiveKit docs at build
  time.
- **Join mechanism is different from Daily's, worth designing for
  correctly**: Daily hands back a static joinable room URL. LiveKit
  instead requires minting a short-lived, per-participant **access token**
  (a signed JWT via the server SDK, scoped to a specific room + identity +
  permissions) at connect time — there's no single static "room URL" to
  store. Concretely: store `livekit_room_name` on the booking row (not a
  URL), and the CASI-hosted join page (`/call/[bookingId]`) calls a CASI
  API route to mint a fresh token for that specific viewer/streamer at the
  moment they open the link, then the client SDK connects using
  `LIVEKIT_URL` + that token. This is more moving parts than Daily's
  "here's a URL" model, but it's also more secure by construction — tokens
  can be scoped (e.g., view-only, no-publish for the passive OBS surface)
  and short-lived rather than a durable guessable URL.
- **Alternative considered — Daily**: simpler join mechanism (static URL),
  flat cheaper pricing, longer track record specifically as a hosted API
  company (2016, ~10 years). Would still be the pick if the open-source
  angle didn't matter to the founder — genuinely close call, not a
  blowout, and worth revisiting if LiveKit's webhook/token model turns out
  to add real integration friction during the build.
- **Alternative considered — 100ms**: similar price point to Daily, but no
  free tier and no public self-serve pricing (sales-gated) — worse fit for
  a pre-traction self-serve build than either Daily or LiveKit.
- **Alternative considered — self-hosting LiveKit's OSS core directly**
  (skip Cloud entirely): possible given the license, but real SFU ops
  burden CASI doesn't want to take on pre-traction. LiveKit Cloud now,
  self-host later only if it's ever actually worth it.

---

## Shine (on-stream) — the guest-slot half

Reuses ~90% of the existing beam/overlay system. The only new thing is the
*content type* of a slot — a live call feed instead of an uploaded
image/video.

- **Data model**: extend the `bookings` type discriminator (the column
  that already distinguishes beams from backdrops — confirm its exact name
  against the live schema; a plain `CREATE TABLE` grep didn't find it, it
  predates the migrations directory or was set up via the dashboard) with
  a new value, `shine`. Add a `livekit_room_name` column (nullable, only
  populated for `shine` rows) — see the join-mechanism note above for why
  this is a room name, not a URL.
- **Booking flow — a two-step approve**: viewer picks the slot, pays,
  streamer approves via the existing `/studio` queue (`approveBooking` in
  `src/lib/streamer-moderation.ts`). Approval **only provisions the room
  and sends the viewer a join link** — it does not put anyone on the
  broadcast and does not start the vesting clock. That happens at a
  second, new step below.
- **Preview / vet before going on-air (the "green room")**: when the guest
  opens their join link, a CASI route mints them a LiveKit access token
  and they connect into the *same* room the streamer's studio tab is
  already in — a normal two-way call between streamer and guest — but that
  feed is **not yet routed to OBS and the payment clock has not started.**
  The streamer sees/hears exactly who showed up, on a private preview in
  the studio tab, and gets one of two actions:
  - **"Admit to stream"** — the OBS-facing surface (below) connects to the
    same room and starts rendering/capturing it, *and* this click is what
    fires `start_beam` / captures-on-approve, using the same
    delegate/session-key no-popup path `approveBooking` already uses
    today. This is the moment the paid service — appearing on the
    broadcast — actually begins, so it's the correct moment to start
    metering it.
  - **"Reject"** — same effect as today's `denyBooking`: full refund, no
    beam ever starts (the escrow is still `Pending`, so on the Solana rail
    this needs no new refund logic at all — a `Pending` escrow the
    provider never started is already 100% viewer-reclaimable by design).
    The guest sees a plain "the streamer wasn't able to bring you on this
    time — you've been refunded" message, room closes.
  This reuses the *existing* Pending → Active state machine exactly as
  designed — "vet, then start" was already the shape of `approve` →
  `start_beam` for ordinary beams, Shine just inserts a live look at the
  guest between them instead of trusting a static upload.
- **Delivery**: `overlay/page.tsx` (the OBS browser-source render target)
  renders a LiveKit call view for the active slot once admitted, instead
  of the `<img>`/`<video>` it renders for ordinary beams. Before
  admission, that slot shows nothing on the public overlay — there's no
  content to broadcast yet.
- **Settlement trigger**: `room_finished` (or `participant_left` when only
  the guest remains and leaves) triggers the existing `endBeamEarly` /
  `settleOrClearSolanaEscrow` pro-rata settlement via the LiveKit webhook —
  no new settlement logic, just a new trigger for logic that already
  exists.
- **No-show / stall handling, two separate timeouts**:
  1. Guest never joins the green room within **5 minutes** of the
     streamer's initial approval → refund in full (same shape as today's
     Stripe denied-chip / stale-pending recovery).
  2. Guest joins the green room but the streamer never admits or rejects
     within **5 minutes** → refund in full and close the room. This
     protects the viewer from a streamer who gets distracted or stalls
     indefinitely in "vetting" — same timeout value as (1), same refund
     path, just a different starting event.

### OBS + audio architecture (the hard part of Shine's on-stream half)

This is specific to Shine on-stream — Shine consultations are just an
ordinary two-party call in a browser tab on both sides, no stream or OBS
involved, nothing below applies to them.

OBS Browser Sources render page content and **automatically capture
whatever audio that page plays** (this already works for CASI today — it's
how any browser-source-based overlay produces sound, no special plugin).
That covers *receiving* the guest's voice. It does **not** solve the other
direction: getting the streamer's own mic into the call so the guest can
hear them back, and it shouldn't be solved by making the OBS source itself
interactive — a live browser-source is the wrong place for the streamer to
be clicking mute buttons or granting mic permissions mid-show.

**Recommended: two separate surfaces, not one.**

1. **The streamer's "studio" tab** — a normal, non-OBS browser tab (or a
   small popup window) at a new route, e.g. `/studio/live/shine/
   [bookingId]`. The streamer joins the LiveKit room here as a real
   participant: camera **off** (their face is already on stream through
   their normal webcam/OBS source — no need to double it), mic **on**,
   using the *same physical microphone device* they already use for the
   stream. Modern OS audio stacks (Windows WASAPI shared mode, Linux
   PipeWire) generally allow one physical input device to be read by two
   applications at once, so in the common case the streamer just picks
   their existing mic as the input here — no virtual-cable software
   required. Flag as a fallback: if a streamer's specific audio driver
   doesn't support shared capture, a virtual audio cable (VB-Cable /
   VoiceMeeter on Windows, a loopback module on Linux/Mac) routes the same
   mic signal into two destinations. Don't build this fallback up front —
   just document it as a troubleshooting step if a streamer reports "guest
   can't hear me."
2. **The OBS-facing surface** — the existing `/overlay` page (or a
   dedicated sibling route if isolating it is cleaner) connects to the
   *same* LiveKit room as a second, silent participant: mic **muted**,
   camera **off**, view-only — mint this participant's access token with
   subscribe-only permissions (no `canPublish`), which LiveKit's token
   grants support directly, so it's enforced server-side, not just a UI
   convention. Its only job is rendering the guest's incoming video+audio
   so OBS's Browser Source captures it onto the stream. Because this
   participant never sends audio into the room, there's no feedback loop
   between the two surfaces. **It only joins once the streamer clicks
   "Admit to stream"** (see the green-room step above) — before that, the
   guest is only ever in a private call with the streamer's studio tab,
   never routed to the broadcast.

This mirrors how professional multi-guest tools (Restream Studio,
StreamYard, Riverside) are built — always a separate host-facing "studio"
control surface plus a passive broadcast output, never one browser context
doing both jobs.

### Latency & seamlessness

The concern worth separating into two different questions, because they
have different answers:

1. **Does the audience see the guest lagging behind the rest of the
   stream?** No — and this isn't specific to Shine, it's true of the whole
   product today. OBS composites everything (streamer's camera, the guest
   feed, every other overlay) into one signal *before* it goes to
   Twitch/YouTube/Kick. The platform's own broadcast delay (typically
   several seconds, same as it is for every stream with or without a
   guest) applies uniformly to the whole composited picture. StreamYard's
   own writeup on their own guest calls confirms the same architecture:
   "the conversation experience feels similar to a video call, while the
   audience watches... with a small additional delay driven mostly by
   [the destination] platform," not by the call itself.
2. **Does the conversation between the streamer and the guest feel laggy
   to *them*?** This is the real, unavoidable constraint — bounded by
   ordinary WebRTC round-trip time between the two participants via
   LiveKit's media servers, typically well under 300ms for two reasonably-
   connected participants, same as any Zoom/Meet/FaceTime call. Not a risk
   specific to CASI's architecture — the same floor every pay-per-minute
   consulting competitor and every "guest on stream" tool ships with.

One risk specific to the two-surface design above: the streamer's
interactive "studio" tab and the OBS-facing passive tab are two separate
connections into the same room, so their exact timing could drift by some
small amount relative to each other. In practice this is a non-issue — OBS
Browser Sources render via an internal, headless Chromium process and pipe
audio straight into OBS's mixer, they don't play through the streamer's
physical speakers at all, so there's no double-audio/echo risk between the
two tabs. Any few-hundred-ms drift between the two connections is
swallowed by the multi-second platform broadcast delay from point 1.
Standard practice still applies: the streamer should monitor the studio
tab on headphones, same reason any streamer already avoids playing desktop
audio through open speakers into their mic.

### Viewer (guest) join UX, including cam on/off

The guest never touches OBS or the studio tab — they get a CASI-hosted
join link (`/call/[bookingId]?role=guest`, token-gated like other viewer
actions) that they open on their own device; opening it triggers a CASI
API call that mints them a fresh LiveKit access token server-side.

- LiveKit's client SDK (`livekit-client` / `@livekit/components-react`)
  supports camera on/off toggling out of the box, both in a pre-join lobby
  and mid-call — standard WebRTC device-toggle pattern, not custom-built.
  Wire it into a CASI-branded wrapper rather than any default UI the SDK
  ships with.
  Mic access still requires the normal browser `getUserMedia` permission
  prompt — standard, since the guest is in their own regular browser, not
  a restricted OBS context.
- **Audio-only rendering on the stream side**: when the guest has their
  camera off, the OBS-facing surface has no video frame to show for that
  participant. Render a fallback card in that slot (streamer avatar
  placeholder, a waveform, or just the guest's display name on the
  existing slot background) rather than a blank/broken video element —
  small UI branch, not a structural change.

### Future extension: multiple simultaneous guests (not in v1 scope)

"Multiple callers" splits into two different cases with very different
answers — worth being precise about which one is meant before ever
building either.

- **Independent concurrent guests** (different viewers, different slots,
  not interacting with each other) — already works today with **zero new
  architecture**. It's just N parallel instances of the 1:1 flow above,
  one per Shine-enabled slot. Nothing to build.
- **One shared group segment** (multiple guests + streamer in a single
  conversation — a panel, a group chat) — genuinely new architecture, and
  explicitly **out of v1 scope** per the design principle above (it risks
  turning the studio surface into a production dashboard). If ever built:
  - The room decouples from the booking — multiple separate paid bookings
    (each still its own escrow/vesting clock) connect into one shared
    on-air room.
  - **Keep each waiting guest in their own private preview**, not
    together — the green room's job is vetting a random paying viewer
    before exposing them to anyone, and letting two unvetted strangers
    interact before either is screened is new abuse surface Shine doesn't
    need. The streamer's side becomes a short *list* of who's waiting
    (interrupt-driven per the principle above, not a dashboard), not one
    shared pre-show room.
  - **Settlement trigger changes**: `room_finished` (whole room ends) stops
    being the right per-booking trigger once multiple guests share a room
    — it won't fire until *everyone* leaves. The correct trigger becomes
    `participant_left` for that specific guest, which LiveKit already
    fires per-person. `room_finished` still matters for cleanup once the
    room is fully empty, just not for billing any individual guest.
  - Each admitted guest still needs to land in *their own*
    `overlay_elements` slot position (reusing the existing multi-slot
    canvas, not a mosaic tile) — the OBS-facing surface needs to subscribe
    to specific participants by identity and route each to a specific
    slot.
  - Moderation needs per-guest granularity — kicking one guest out of a
    live multi-guest segment without ending it for everyone else, a
    scoped version of the existing manual "End call."

---

## Shine (consultation) — the calendar half

Genuinely new surface — no canvas, no OBS, no live stream involved.

- **New table `shine_consultations`** — not an extension of `bookings`.
  `AGENTS.md`'s "don't build a second booking surface" rule is about not
  duplicating the *on-stream* booking flow across `/overlay` and
  `/s/[username]`; a consultation is a structurally different product
  (time-ranged, not slot-occupying), and forcing it into `bookings` means
  a pile of columns that don't apply to beams. Mirror `bookings`' payment
  plumbing where the concept transfers (`payment_intent_id`, `price_value`,
  `payment_method`, `status`) and replace `element_id` with `starts_at` /
  `duration_minutes` / `livekit_room_name` / `provider_profile_id` /
  `viewer_*`.
- **Availability model — keep it simple for v1**: don't build a
  recurring-availability/timezone engine. Mirror the existing overlay
  "slot" mental model instead — the consultant manually creates a short
  list of open time windows via a lightweight admin UI, and viewers pick
  from that list. A real recurring-calendar system (Cal.com-style) is a
  distinct, much bigger project — don't fold it into this one.
- **New pages**:
  - `/shine/[username]` — public booking page: lists the consultant's open
    slots, price, duration; viewer picks one and pays (same manual-capture
    PaymentIntent pattern as `/api/stripe/authorize` today).
  - `/call/[bookingId]` — the call room itself, token-gated, mints a fresh
    LiveKit access token on open. Renders the call once the booking's
    start time has arrived.
- **Trigger wiring — same admit-gate as Shine on-stream, lighter weight**:
  the consultant joining the room does not by itself start the vesting
  clock. `room_started` flips the booking into a brief "ready" state and
  shows the consultant a one-click **"Start session"** once they see who's
  there — that click is what fires `start_beam` / captures the
  PaymentIntent, mirroring the on-stream green room but without a separate
  admit/reject UI (a consultation was already calendar-confirmed at
  booking time; this step exists mainly so the meter doesn't start before
  both sides are actually present and ready, not as a vetting gate the way
  the public on-stream case needs). `room_finished` settles pro-rata, same
  shared trigger as Shine on-stream. No-show (either side never joins, or
  the consultant never clicks Start within the grace window) refunds in
  full — see updated windows below.
- **Moderation**: no live approval queue needed — the booking is
  pre-confirmed at calendar-pick time (payment authorized, captured on
  delivery, same pattern Stripe beams already use). A new small lib,
  `src/lib/shine-lifecycle.ts`, should hold this logic — don't bolt it
  onto `streamer-moderation.ts`, which is scoped to the live-queue
  moderation model and shouldn't grow a second, differently-shaped
  lifecycle inside it.

---

## Shared infrastructure

- **No entitlement gate.** Shine ships open to every streamer, same
  availability as beams/flashes — no `profiles` column, no admin toggle,
  no `/studio` settings check. Both proposed reasons to gate it (cost
  recovery, then a custom-UI upsell) were dropped; nothing replaced them,
  so there's no gate. `SkinProvider`/theme customization on Shine's pages
  was considered as a Pro perk and rejected as not worth building — Shine
  just inherits the streamer's existing skin/accent like `/overlay` and
  `/s/[username]` already do, no special-casing needed.
- **Room creation + token minting**: a small `src/lib/livekit.ts` wrapping
  the server SDK (`livekit-server-sdk`) — room creation and per-participant
  access-token minting (with scoped grants: `canPublish`/`canSubscribe`
  per role, matching the two-surface OBS design above) — same shape as
  `src/lib/stripe.ts`'s SDK singleton pattern.
- **Webhook handler**: `src/app/api/webhooks/livekit/route.ts` — verify
  the signed webhook per LiveKit's mechanism (confirm exact verification
  approach against current docs at build time), look up the
  booking/consultation by room name, dispatch to the right start/settle
  helper depending on which table the room belongs to.
- **Reconciliation cron**: Hobby-plan cron is daily-cadence only
  (`vercel.json` already has 3 daily crons — count headroom isn't a
  concern, Vercel lifted the per-project cap to 100 on every plan as of
  Jan 2026). A `shine-reconciler` cron catches anything the webhook
  missed — approved Shine rows whose room never started within the
  no-show window, mirroring `solana-reconciler`'s existing pattern.

---

## Data model changes (summary)

| Table | Change |
|---|---|
| `bookings` | new type value `shine`; new nullable `livekit_room_name` column |
| `shine_consultations` (new) | `id`, `provider_profile_id`, `viewer_*`, `starts_at`, `duration_minutes`, `price_value`, `payment_method`, `payment_intent_id`, `tx_signature`, `escrow_pda`, `livekit_room_name`, `status` |

## New/changed routes

| Route | Purpose |
|---|---|
| `/api/webhooks/livekit` | LiveKit event ingest → start/settle dispatch |
| `/api/shine/guest-slot/create` | viewer books a Shine on-stream slot (extends existing bookings-create pattern) |
| `/api/shine/consultations/create` | viewer books a Shine consultation |
| `/api/shine/consultations/[id]/cancel` | viewer/consultant cancel (pre-start only) |
| `/api/shine/token` | mints a scoped LiveKit access token for a given booking + role (streamer studio, guest, or OBS view-only surface) |
| `/api/cron/shine-reconciler` | daily no-show sweep |
| `/shine/[username]` | consultant's public booking calendar page |
| `/call/[bookingId]` | the call room (on-stream slots don't need this — the guest joins via a link that mints a token straight into the room; the streamer sees it inside `overlay/page.tsx`) |

## Env vars

| Name | Notes |
|---|---|
| `LIVEKIT_API_KEY` | server-side, room creation + token minting |
| `LIVEKIT_API_SECRET` | server-side, signs tokens and verifies webhooks |
| `LIVEKIT_URL` | the LiveKit Cloud project's WebSocket URL clients connect to |

## New dependencies

`livekit-client` (browser SDK) / `@livekit/components-react` (optional
prebuilt UI pieces). `livekit-server-sdk` (server-side: room management,
token minting, webhook verification).

---

## Build phases

1. **Phase 1a — Shine (on-stream).** Smallest lift: one new booking type,
   one webhook route, one OBS-render branch. Proves out the LiveKit
   integration before the bigger calendar build. Both Stripe and Solana
   are equally available now (no fee mechanism blocking either) — pick
   whichever's simpler to stand up first for engineering reasons alone.
2. **Phase 1b — Shine (consultation).** New table, new pages, reuses the
   Phase 1a webhook + LiveKit wrapper.

(No separate "Phase 2 — Solana rail" anymore — see "Payment rails" above.)

## Implementation checklist

Ordered, for whoever actually builds this. Each step assumes the ones
before it are done — this is a sequence, not a backlog.

### Phase 1a — Shine (on-stream)

1. Create the LiveKit Cloud project; get `LIVEKIT_API_KEY` /
   `LIVEKIT_API_SECRET` / `LIVEKIT_URL`; add to Vercel (Production +
   Preview).
2. Confirm the exact name of the `bookings` type-discriminator column
   against the live schema (not found via a plain `CREATE TABLE` grep —
   inspect directly via Supabase) and add `shine` as a valid value.
   Migration also adds a nullable `livekit_room_name` column to
   `bookings`.
3. `src/lib/livekit.ts` — server SDK wrapper: `createRoom`,
   `mintToken(bookingId, role)` with scoped grants
   (`canPublish`/`canSubscribe` per role: streamer-studio, guest,
   obs-viewer).
4. `/api/shine/token` — mints a token for a given booking + role.
   Auth: streamer session for studio/obs roles, cancel-token-style auth
   for the guest role (mirrors how other viewer actions are gated).
5. `/api/shine/guest-slot/create` — extends the existing booking-create
   pattern for `booking_type: 'shine'`.
6. Extend `approveBooking` (or a thin Shine-specific wrapper around it) so
   approval calls `createRoom`, stores `livekit_room_name`, and sends the
   viewer a join link — **without** calling `start_beam`. This is the
   step most likely to get rushed into doing too much; keep it strictly
   to room provisioning.
7. Build the green-room UI at `/studio/live/shine/[bookingId]`: streamer
   joins as a real participant (mic on, camera off), sees the guest once
   they connect, gets "Admit to stream" / "Reject" actions.
8. Wire "Admit" to the *existing* `startSolanaBeamOnChain` / Stripe
   capture-on-approve path (reuse `streamer-moderation.ts`, don't
   reimplement) and flip the DB status so the overlay begins rendering.
   Wire "Reject" to the existing `denyBooking` path.
9. `overlay/page.tsx` — add a render branch for `booking_type === 'shine'`
   that mounts a subscribe-only LiveKit participant once admitted.
10. `/api/webhooks/livekit` — verify the signed webhook, handle
    `room_started` / `room_finished` / `participant_joined` /
    `participant_left`, dispatch to the settlement/no-show logic.
11. No-show timeout logic (5 min guest-join, 5 min streamer-admit) —
    prefer checking on webhook receipt where possible, with the daily
    reconciler as backstop for whatever's missed (Hobby cron is
    daily-cadence only).
12. `/api/cron/shine-reconciler` — daily sweep for stuck/abandoned rows.
13. Manual "End call" button in the studio tab, reusing `endBeamEarly`.
14. Extend `/api/abuse/report` to accept the `shine` booking type.
15. Build out the Test Plan and End-to-end Testing sections below as
    actual tests/QA runs before calling Phase 1a done.

### Phase 1b — Shine (consultation)

1. Migration: create the `shine_consultations` table (see "Data model
   changes").
2. Lightweight admin UI for the consultant to create a short list of open
   time windows (reuse the existing overlay "slot" mental model — no
   recurring-calendar engine).
3. `/shine/[username]` — public booking/calendar page.
4. `/api/shine/consultations/create`.
5. `/call/[bookingId]` — call room page, token-gated, mints a token via
   `/api/shine/token` on open.
6. `src/lib/shine-lifecycle.ts` — the consultation state machine: `ready`
   on `room_started`, `start_beam`/capture on the consultant's "Start
   session" click, settle on `room_finished`.
7. No-show timeouts (10 min to join, 5 min for the consultant to click
   Start after both are present).
8. `/api/shine/consultations/[id]/cancel`.
9. Extend `/api/webhooks/livekit`'s dispatch logic to also check
   `shine_consultations` by room name, not just `bookings`.
10. Extend `shine-reconciler` to sweep `shine_consultations` too.
11. Extend `/api/abuse/report` to accept `shine_consultations` rows.

## Test plan

- `room_started` correctly maps to the right booking/consultation row and
  starts the correct escrow/capture path exactly once (idempotency —
  LiveKit may retry webhook delivery).
- All four no-show/stall timeouts (guest-join, streamer-admit,
  consultation-join, consultant-start) refund in full and leave no
  dangling `Pending` state.
- **Admit vs. reject in the green room**: admit correctly fires
  `start_beam`/capture exactly once and only then makes the OBS surface
  join; reject correctly refunds in full and never starts the clock; a
  double-click of either button doesn't double-fire the on-chain/Stripe
  action (idempotency, same concern as the webhook retry case above).
- Pro-rata settle on early `room_finished` matches the existing
  `settle_beam` / Stripe end-early math already tested elsewhere — don't
  re-derive it, just confirm the trigger wiring calls the existing paths
  correctly.
- Streamer's manual "End call" produces the same settlement result as a
  webhook-driven `room_finished` — one code path, two triggers.
- Token scoping: the OBS-facing surface's minted token cannot publish
  audio/video into the room (verify `canPublish: false` is actually
  enforced server-side, not just assumed from the grant request).

---

## End-to-end testing

Unit-level assertions (above) cover the math; this covers the full
journeys across booking → payment → LiveKit → settlement → payout
together, the way `docs/overlay-qa-checklist.md` does for the existing
overlay. No Playwright/Cypress exists in this repo today — that checklist
is a manual Given/When/Then walkthrough against Stripe test mode + Solana
devnet, and this should follow the same format. Once Shine actually ships,
graduate this into its own `docs/shine-qa-checklist.md` rather than
leaving it buried in a design doc.

### 1. Shine on-stream — happy path

- **Given** a viewer books an open Shine slot and pays,
  **when** the streamer approves from the `/studio` queue,
  **then** a LiveKit room is created, the booking stays `Pending` on-chain
  / uncaptured on Stripe, and the viewer receives a join link — nothing is
  broadcast yet.
- **Given** the viewer opens the join link,
  **when** they connect (a token is minted and `participant_joined`
  fires),
  **then** the streamer's studio tab shows a private preview of the guest,
  and the public `/overlay` shows nothing new for that slot.
- **Given** the streamer clicks "Admit to stream,"
  **when** the action completes,
  **then** the OBS-facing surface connects and the guest becomes
  visible/audible on the broadcast, `start_beam` (or Stripe capture-on-
  admit) fires exactly once, and the vesting clock starts from this
  moment, not from when the guest joined.
- **Given** the call runs the full booked duration,
  **when** `room_finished` fires (or the duration timer elapses),
  **then** the escrow/PaymentIntent settles at 100% to the streamer — no
  fee deduction, full settled amount.

### 2. Shine on-stream — reject in the green room

- **Given** the guest has joined the green room and the streamer previews
  them,
  **when** the streamer clicks "Reject" instead of "Admit,"
  **then** the booking is denied, the viewer is refunded in full (escrow
  was still `Pending`, never started), the guest sees a plain "not
  admitted, you've been refunded" message, and the room closes. The OBS
  surface never joined, so nothing was ever broadcast.

### 3. Shine on-stream — no-show and stall timeouts

- **Given** the streamer approved but the guest never opens the join link,
  **when** 5 minutes elapse,
  **then** the booking auto-refunds in full.
- **Given** the guest joined the green room but the streamer never clicks
  Admit or Reject,
  **when** 5 minutes elapse from the guest's join,
  **then** the booking auto-refunds in full and the room closes.

### 4. Shine on-stream — cut short mid-call

- **Given** an admitted, on-air call,
  **when** the streamer clicks "End call" (or `room_finished` /
  `participant_left` fires) at roughly the midpoint of the booked
  duration,
  **then** the streamer is paid for the elapsed portion, the viewer is
  refunded the unvested remainder, no fee either way.

### 5. Shine on-stream — free ($0) booking

- **Given** a streamer has a $0-priced Shine slot open,
  **when** a viewer books it and the full admit → on-air → end flow
  completes,
  **then** no PaymentIntent capture or on-chain transfer occurs at any
  point — $0 in, $0 out.

### 6. Shine consultation — happy path

- **Given** a viewer books an open time slot on `/shine/[username]` and
  pays,
  **when** the scheduled time arrives and both parties open `/call/
  [bookingId]`,
  **then** both see/hear each other in a normal two-way call, and the
  booking sits in a "ready" state — clock not yet running.
- **Given** the consultant clicks "Start session,"
  **when** the action completes,
  **then** `start_beam`/capture fires exactly once and the vesting clock
  starts.
- **Given** the session runs the full duration,
  **when** it ends,
  **then** the streamer is paid the full settled amount, no fee.

### 7. Shine consultation — no-show and stall variants

- **Given** the scheduled start time arrives and the viewer never joins,
  **when** 10 minutes elapse,
  **then** full refund, consultant's time is freed.
- **Given** the viewer joins on time but the consultant never joins,
  **when** 10 minutes elapse,
  **then** full refund.
- **Given** both join but the consultant never clicks "Start session,"
  **when** 5 minutes elapse from both being present,
  **then** full refund.

### 8. Cross-cutting checks

- **Given** LiveKit retries a webhook delivery,
  **when** the same `room_started`/`room_finished` event arrives twice,
  **then** the second delivery is a no-op — no double-charge, no
  double-refund, no double on-chain call.
- **Given** a guest or viewer misbehaves during a call,
  **when** the streamer/consultant files a report,
  **then** `/api/abuse/report` accepts it for `shine` bookings and
  `shine_consultations` rows the same way it already does for
  beams/flashes.
- **Given** a streamer's manual "End call" and a LiveKit-webhook-driven
  `room_finished` both fire for the same booking (race condition),
  **when** both requests reach the server,
  **then** settlement runs exactly once; the second request is a no-op.

---

## When to build

Don't start Phase 1 before:

- A LiveKit Cloud account exists with billing attached (someone still has
  to hold this vendor relationship even though CASI absorbs the — likely
  $0 — cost, same as any other tool subscription).

---

## Viewer & streamer protections

No fee means several of these fall out for free rather than needing
careful math:

- **Free ($0) bookings cost the viewer nothing, ever** — trivially true
  now, there's no fee formula to check against zero.
- **A short or cut-short call pays proportionally, never the full-session
  amount** — the escrow's existing pro-rata vesting math already
  guarantees this; nothing new needed.
- **No-show / stall refunds are complete.** Four timeout triggers (see
  Decisions below) all lead to the same place: escrow/PaymentIntent still
  `Pending`, nothing captured, nothing to refund beyond the original hold.
- **The streamer/consultant always gets 100% of the price they set** — no
  platform cut on Shine, same as beams and flashes.
- **Streamer/consultant gets the same manual "end it now" control that
  beams already have.** Reuse `endBeamEarly`'s pattern — a visible "End
  call" action in the studio tab settles pro-rata immediately.
- **Abuse reporting extends to both halves of Shine.** The existing
  `/api/abuse/report` pattern (currently scoped to beams/flashes) should
  cover `shine` bookings and `shine_consultations` rows too.

---

## Decisions (resolved — ready to hand off)

1. **No platform fee.** Streamer keeps 100%, same as every other CASI
   product. CASI absorbs the video vendor's bill directly, treated as a
   normal (currently near-$0) tool expense — same posture as the existing
   Solana cranker cost. See "No fee — CASI absorbs the vendor cost" above.
2. **Video vendor: LiveKit (Cloud), not Daily.** Apache-2.0 licensed core,
   confirmed — self-host optionality exists later if ever needed, no
   obligation on CASI's own code either way. Chosen for the open-source
   alignment now that cost is no longer the deciding factor between
   vendors (CASI absorbs either way). Webhook events (`room_started` /
   `room_finished` / `participant_joined` / `participant_left`) verified
   to map cleanly onto Shine's trigger design. Cap requested video
   resolution server-side to keep the (still-near-zero) cost predictable.
3. **Payment rails: both ship together**, no Solana-side blocker — removing
   the fee also removed the only reason Solana needed new Anchor program
   work. Sequence Stripe-then-Solana only if it's simpler to build one
   rail at a time, not because anything external requires it.
4. **No-show / stall windows**:
   - **Shine on-stream**: 5 minutes for the guest to join after streamer
     approval, **and separately** 5 minutes for the streamer to
     admit-or-reject after the guest joins the green room.
   - **Shine consultation**: 10 minutes for either side to join after the
     scheduled start, **and separately** 5 minutes for the consultant to
     click "Start session" after both are present.
5. **Consultant account mode**: no distinct mode, and no toggle at all.
   Any streamer can offer Shine bookings by default, exactly like beams —
   there's no capability to "turn on," just a new booking type that's
   always available.
6. **Naming**: **Shine** — public-facing name for both halves. Internal
   identifiers: `bookings.booking_type = 'shine'`, `shine_consultations`
   (table), `/shine/[username]`, `src/lib/shine-lifecycle.ts`,
   `shine-reconciler` (cron).
7. **No Pro gate, resolved.** Both proposed reasons to restrict Shine —
   cost recovery, then a custom-UI upsell — were considered and dropped in
   this planning pass. Nothing replaced them, so Shine ships open to every
   streamer. Custom theming on Shine's pages isn't a special feature
   either — it just inherits the streamer's existing skin/accent the same
   way `/overlay` and `/s/[username]` already do, no gating logic needed.
   "Pro" as a bundled concept (auto-approve, analytics, team accounts,
   custom branding across the whole product) stays exactly what
   `AGENTS.md` already describes it as — a separate, not-yet-built future
   project, not something this plan needs to wire Shine into.

---

## Open source / licensing

The whole `casi-app` repository is already public on GitHub under
Apache-2.0 (`AGENTS.md`), so the default is that Shine ships in the same
place under the same license, same as every other feature. This is a
separate fact from LiveKit's own license (also Apache-2.0, see "Vendor"
above) — one is CASI's choice about its own code, the other is what
LiveKit permits CASI to do with theirs. Both point the same direction, but
they're independent facts, worth not conflating.

**Recommendation: yes, keep Shine's own code open, no carve-out.**

- **There's no real code-level moat being given away.** The hard parts of
  Shine — the two-surface OBS/audio architecture, the green-room admit
  gate — are design decisions, not secret algorithms. A competent
  competitor could reconstruct all of it by using the product for five
  minutes, open source or not.
- **It reinforces the grant narrative.** `PRIMITIVE.md` already pitches
  "pay-per-minute consulting" to the Solana Foundation as a generalized
  use case of the open escrow primitive. Shine's consultation half is the
  reference implementation of exactly that pitch.
- **It's part of the actual competitive differentiation.** `AGENTS.md`'s
  "Competitive context" section already notes none of CASI's competitors
  ship under a permissive open license.
- **Nothing sensitive needs hiding regardless.** Vendor secrets
  (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) are env vars, never committed,
  same as `STRIPE_SECRET_KEY` today.
