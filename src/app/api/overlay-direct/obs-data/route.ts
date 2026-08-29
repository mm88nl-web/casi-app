// Outage-workaround read route — see src/lib/db-direct.ts for why this
// exists. Mirrors exactly what /obs/page.tsx normally fetches via
// supabase-js (profile + overlay_elements + active bookings for one
// streamer), but over a direct Postgres connection instead of PostgREST.
//
// No auth check: this replicates data that's already public under the
// existing anon RLS policies (the OBS browser source itself is an
// unauthenticated URL). The bookings column list is copied verbatim from
// obs/page.tsx's existing query — cancel_token is deliberately excluded,
// same as the normal path.
import { NextRequest, NextResponse } from 'next/server';
import { getDirectPool } from '@/lib/db-direct';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'missing username' }, { status: 400 });
  }

  const pool = getDirectPool();

  const profRes = await pool.query(
    `SELECT id, ink_color, theme_color, skin FROM profiles WHERE username = $1 LIMIT 1`,
    [username]
  );
  const profile = profRes.rows[0] ?? null;
  if (!profile) {
    return NextResponse.json({ profile: null, elements: [], bookings: [] });
  }

  const [elRes, bkRes] = await Promise.all([
    pool.query(`SELECT * FROM overlay_elements WHERE profile_id = $1`, [profile.id]),
    pool.query(
      `SELECT id, element_id, message, status, banner_font_px, banner_speed_secs,
              media_offset_x, media_offset_y, media_zoom
       FROM bookings WHERE profile_id = $1 AND status = 'active'`,
      [profile.id]
    ),
  ]);

  return NextResponse.json({
    profile,
    elements: elRes.rows,
    bookings: bkRes.rows,
  });
}
