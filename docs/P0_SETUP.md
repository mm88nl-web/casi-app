# P0 setup — Turnstile, abuse mailbox, env vars

This is the operator setup guide for the P0 hardening layer (captcha, content
moderation, abuse reports, legal pages). It is written for a non-coder —
follow the steps top to bottom.

Everything here is **free**. You do not need a paid Cloudflare plan or a
mail server.

---

## 1. Cloudflare Turnstile (captcha on free booking + free flash + abuse form)

Turnstile is Cloudflare's free captcha. It stops scripted abuse without the
click-the-traffic-light Google reCAPTCHA nonsense.

### 1a. Create a site key

1. Log in to Cloudflare → https://dash.cloudflare.com/
2. In the left nav, click **Turnstile**.
3. Click **Add site** (or **Add widget**).
4. Fill in:
   - **Site name:** `casi`
   - **Hostnames:** add both of:
     - `casi.gg`
     - `localhost` (needed for local dev; if the field won't accept it, use
       `127.0.0.1` instead)
   - **Widget mode:** **Managed** (recommended)
   - **Pre-clearance:** leave off
5. Click **Create**.

Cloudflare will show you two values:

- **Site Key** — public, goes in the browser. Example: `0x4AAA...`
- **Secret Key** — private, goes on the server. Example: `0x4AAA...secret`

### 1b. Add the keys to your environment

Edit `.env.local` in the project root (create the file if it doesn't exist) and
add:

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAA...your_site_key
TURNSTILE_SECRET_KEY=0x4AAA...your_secret_key
```

Add the same two variables to your production deployment's environment
(Vercel → Project → Settings → Environment Variables, or wherever casi runs).

That's it. The app picks them up automatically. If either key is missing, the
app falls back to a "dev-skip" mode and logs a warning — so local development
still works, but production must have both keys set.

---

## 2. `abuse@casi.gg` mailbox (free, via Cloudflare Email Routing)

You do not need to run a mail server. Cloudflare will forward
`abuse@casi.gg` to any inbox you already have (Gmail, ProtonMail, etc.).
This is **receive-only** — replies come from your personal inbox, which is
fine for triage.

### 2a. Enable Email Routing

1. Cloudflare → select the **casi.gg** zone.
2. Left nav → **Email** → **Email Routing**.
3. Click **Get started** / **Enable Email Routing**.
4. Cloudflare will ask permission to add MX and TXT records to your DNS.
   Click **Add and enable**. This takes about 60 seconds.

### 2b. Add a destination address

1. Same page → **Destination addresses** tab.
2. Click **Add destination address**.
3. Enter your real personal inbox (e.g. `yourname@gmail.com`).
4. Check that inbox and click the verification link Cloudflare sends.

### 2c. Create the abuse address

1. Same page → **Routing rules** tab.
2. Click **Create address**.
3. Fill in:
   - **Custom address:** `abuse`   (so it becomes `abuse@casi.gg`)
   - **Destination:** the address you verified in step 2b.
4. Click **Save**.
5. Repeat for `legal@casi.gg`, `privacy@casi.gg`, `security@casi.gg`, and
   `hello@casi.gg` (all pointing to the same destination inbox).

Send a test email to `abuse@casi.gg` from your phone — it should appear in
your personal inbox within a few seconds.

### Replying to abuse reports

Just reply from your personal inbox. It won't come from `@casi.gg` — that's
fine for MVP. If you later want to send **from** `abuse@casi.gg`, you can
upgrade to a real mailbox provider (Fastmail, Migadu, Zoho Mail free tier)
any time; no code changes required.

---

## 3. Database migration

Apply the new migration to Supabase:

```bash
# if you use Supabase CLI:
npx supabase db push

# or run the file manually in Supabase → SQL Editor:
# supabase/migrations/20260419000000_p0_hardening.sql
```

This does two things:

1. Tightens the `bookings` insert policy so anonymous users can no longer
   create free bookings by directly calling Supabase — they must go through
   `/api/bookings/create-free`, which enforces captcha + moderation.
2. Creates the `abuse_reports` table that backs the DMCA form.

---

## 4. Verifying it works

Open the app and check:

1. **Free booking:** click into a free slot on any streamer's overlay, attach
   an image, type a message. The "Send Free Request" button should be
   disabled until a Turnstile widget above it shows a green check.
2. **Profanity filter:** type a slur into the viewer-name field of a free
   slot and submit. You should see an error toast — the booking never hits
   the database.
3. **Abuse form:** visit `/legal/dmca`, scroll to the form, submit a test
   report. You should see "Report received." A row appears in the
   `abuse_reports` table in Supabase.
4. **Legal links:** the site footer and the signup checkbox both link out to
   `/legal/terms`, `/legal/privacy`, `/legal/aup`, `/legal/dmca`.

---

## 5. What's still manual

P0 gives you the **chassis** — captcha, text filter, legal pages,
reporting. It does **not** yet include:

- **Image moderation** (NSFW.js on upload). Planned for P0b.
- **Video moderation** (per-frame scan). Free-tier video uploads are
  currently blocked entirely (see `overlay/page.tsx` and
  `api/bookings/create-free/route.ts`) until this ships.
- **CSAM detection** (PhotoDNA or Thorn Safer). These services require
  a signed agreement; apply once the platform has meaningful traffic.
- **Abuse report admin UI.** Right now you read reports directly from the
  `abuse_reports` table in Supabase. A proper triage UI is P1.

---

## 6. Legal copy

The pages under `/legal/*` are **drafts**, clearly marked as such. Before
public launch you should have an actual lawyer (or a reputable template
service) review and sign off. In particular:

- Governing law and jurisdiction (currently unspecified)
- Exact refund policy
- Data-controller entity name and address (GDPR)
- VAT handling (if applicable)

Until then the drafts are good enough to put the platform behind a
ToS-acceptance checkbox and demonstrate good-faith compliance.
