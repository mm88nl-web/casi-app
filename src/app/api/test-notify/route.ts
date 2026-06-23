/**
 * GET /api/test-notify
 * Debug-only: fires a test Discord notification and reports env var state.
 * Protected by SUPABASE_SERVICE_ROLE_KEY presence (server-only).
 * DELETE THIS FILE before going fully public.
 */
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { notifyBeam } from '@/lib/notify';

export async function GET() {
  const webhookSet = !!process.env.DISCORD_NOTIFY_WEBHOOK_URL;
  const profileSet = !!process.env.DISCORD_NOTIFY_PROFILE_ID;
  const webhookPrefix = process.env.DISCORD_NOTIFY_WEBHOOK_URL?.slice(0, 40) ?? '(not set)';
  const profileId    = process.env.DISCORD_NOTIFY_PROFILE_ID ?? '(not set)';

  let notifyResult = 'skipped';
  if (webhookSet) {
    try {
      await notifyBeam({
        event: 'purchased',
        viewer_name: 'TestViewer',
        element_label: 'Circle',
        price_display: 'free',
        duration_minutes: 5,
        message: 'test notification from /api/test-notify',
        payment_method: 'free',
        booking_id: 0,
      });
      notifyResult = 'sent (no error thrown)';
    } catch (e) {
      notifyResult = `threw: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json({
    DISCORD_NOTIFY_WEBHOOK_URL: webhookSet ? `set (${webhookPrefix}…)` : '❌ NOT SET',
    DISCORD_NOTIFY_PROFILE_ID:  profileSet ? profileId : '❌ NOT SET',
    notifyResult,
  });
}
