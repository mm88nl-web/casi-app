/**
 * POST /api/abuse/report
 *
 * Public endpoint for DMCA notices and AUP-violation reports.
 *
 * Flow:
 *   - Turnstile verification (prevents bot-spam of abuse@casi.gg).
 *   - Light validation: email required, description required, kind in allow-list.
 *   - Insert into abuse_reports via service role (anon cannot read the table).
 *   - IP-hash rate-limit: max 5 reports per IP per hour.
 *   - Per-target_username rate-limit: max 20 reports per hour, added 2026-08-10.
 *     The IP-hash cap alone is bypassable by rotating IPs (same mechanics as
 *     docs/fable-spam-abuse-review-2026-08-10.md Finding 3); since nothing
 *     downstream auto-acts on report volume the practical damage is a real
 *     report (e.g. an actual DMCA notice) getting buried under IP-rotated
 *     noise targeting one streamer. This second, DB-backed cap (not
 *     in-memory — needs to hold across serverless instances) closes that
 *     without touching the per-IP cap's own semantics. 20/hr is well above
 *     any realistic legitimate-report volume for one streamer in an hour.
 *
 * Operators triage reports from the admin tooling or straight from the table.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { verifyTurnstileToken } from '@/lib/turnstile';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED_KINDS = ['dmca', 'illegal', 'harassment', 'other'] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

const MAX_EMAIL_LEN       = 254;
const MAX_NAME_LEN        = 120;
const MAX_URL_LEN         = 600;
const MAX_USERNAME_LEN    = 64;
const MAX_DESCRIPTION_LEN = 4000;
const HOURLY_LIMIT        = 5;
const TARGET_HOURLY_LIMIT = 20;

function getClientIp(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function isEmailShaped(s: string): boolean {
  // Intentionally loose — we validate deliverability by replying, not by regex.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const {
    kind,
    reporter_email,
    reporter_name,
    target_url,
    target_username,
    description,
    turnstile_token,
  } = body as Record<string, unknown>;

  if (typeof kind !== 'string' || !ALLOWED_KINDS.includes(kind as Kind)) {
    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
  }
  if (typeof reporter_email !== 'string' || !isEmailShaped(reporter_email) || reporter_email.length > MAX_EMAIL_LEN) {
    return NextResponse.json({ error: 'Please provide a valid email' }, { status: 400 });
  }
  if (typeof description !== 'string' || description.trim().length < 10) {
    return NextResponse.json({ error: 'Please describe the issue (min 10 characters)' }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LEN) {
    return NextResponse.json({ error: `Description too long (max ${MAX_DESCRIPTION_LEN} chars)` }, { status: 400 });
  }
  if (reporter_name && (typeof reporter_name !== 'string' || reporter_name.length > MAX_NAME_LEN)) {
    return NextResponse.json({ error: 'Name too long' }, { status: 400 });
  }
  if (target_url && (typeof target_url !== 'string' || target_url.length > MAX_URL_LEN)) {
    return NextResponse.json({ error: 'URL too long' }, { status: 400 });
  }
  if (target_username && (typeof target_username !== 'string' || target_username.length > MAX_USERNAME_LEN)) {
    return NextResponse.json({ error: 'Username too long' }, { status: 400 });
  }

  const captcha = await verifyTurnstileToken(
    typeof turnstile_token === 'string' ? turnstile_token : null,
    getClientIp(req),
  );
  if (!captcha.ok) return NextResponse.json({ error: captcha.reason }, { status: 400 });

  const ipHash = hashIp(getClientIp(req));

  // Rate limit: max HOURLY_LIMIT reports per IP per hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('abuse_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_ip_hash', ipHash)
    .gte('created_at', oneHourAgo);

  if ((count ?? 0) >= HOURLY_LIMIT) {
    return NextResponse.json(
      { error: 'Too many reports from your network in the last hour. Email abuse@casi.gg directly.' },
      { status: 429 },
    );
  }

  // Aggregate cap per target, independent of reporter IP — see file header.
  const cleanedTargetUsername = typeof target_username === 'string' ? target_username.trim() : '';
  if (cleanedTargetUsername) {
    const { count: targetCount } = await supabase
      .from('abuse_reports')
      .select('id', { count: 'exact', head: true })
      .eq('target_username', cleanedTargetUsername)
      .gte('created_at', oneHourAgo);
    if ((targetCount ?? 0) >= TARGET_HOURLY_LIMIT) {
      return NextResponse.json(
        { error: 'This streamer has received a lot of reports in the last hour. Try again later, or email abuse@casi.gg directly.' },
        { status: 429 },
      );
    }
  }

  const { error: insertErr } = await supabase.from('abuse_reports').insert({
    kind,
    reporter_email:   reporter_email.trim(),
    reporter_name:    typeof reporter_name    === 'string' ? reporter_name.trim()   || null : null,
    target_url:       typeof target_url       === 'string' ? target_url.trim()      || null : null,
    target_username:  typeof target_username  === 'string' ? target_username.trim() || null : null,
    description:      description.trim(),
    reporter_ip_hash: ipHash,
  });

  if (insertErr) {
    console.error('[abuse/report] insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
