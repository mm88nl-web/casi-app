// Outage-workaround write route — see src/lib/db-direct.ts for why this
// exists. Mirrors the overlay_elements writes StudioLiveEditor.tsx normally
// makes via supabase-js (updateLayer / addBeam), but over a direct Postgres
// connection instead of PostgREST.
//
// This connects as the `postgres` role, which bypasses RLS entirely — so
// this route has to replicate RLS's job itself: every write is scoped to
// the caller's own profile_id, derived from a locally-verified session
// token (see verify-session-local.ts), never trusted from the request body.
// An `update` targeting a row that isn't the caller's own is a WHERE-clause
// no-op (0 rows affected), same effective outcome as RLS silently denying it.
import { NextRequest, NextResponse } from 'next/server';
import { getDirectPool } from '@/lib/db-direct';
import { verifySessionLocal } from '@/lib/verify-session-local';

export const dynamic = 'force-dynamic';

// Columns a streamer is allowed to write on their own overlay_elements rows.
// Deliberately excludes id / profile_id / created_at — ownership and
// identity are never taken from the request body.
const WRITABLE_COLUMNS = [
  'image_url', 'pos_x', 'pos_y', 'width', 'height', 'is_background',
  'price_value', 'price_unit', 'expires_at', 'max_duration_minutes',
  'locked', 'shape', 'glow_on_start', 'prices', 'min_duration_minutes',
  'cooldown_secs', 'corner_radius', 'clip_path_svg',
] as const;

function pickWritable(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of WRITABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

export async function POST(req: NextRequest) {
  const session = verifySessionLocal(req.headers.get('authorization'));
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.action) {
    return NextResponse.json({ error: 'missing action' }, { status: 400 });
  }

  const pool = getDirectPool();

  if (body.action === 'update') {
    const { id, updates } = body;
    if (!id || typeof updates !== 'object') {
      return NextResponse.json({ error: 'missing id/updates' }, { status: 400 });
    }
    const patch = pickWritable(updates);
    const cols = Object.keys(patch);
    if (cols.length === 0) {
      return NextResponse.json({ error: 'no writable fields in updates' }, { status: 400 });
    }
    // $1 = id, $2 = caller's profile_id (ownership check), $3.. = values
    const setClause = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');
    const values = cols.map((c) => patch[c]);
    const result = await pool.query(
      `UPDATE overlay_elements SET ${setClause} WHERE id = $1 AND profile_id = $2 RETURNING *`,
      [id, session.userId, ...values]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'not found or not owned by caller' }, { status: 404 });
    }
    return NextResponse.json({ data: result.rows[0] });
  }

  if (body.action === 'insert') {
    const patch = pickWritable(body.data ?? {});
    // profile_id always comes from the verified session, never the client.
    const cols = ['profile_id', ...Object.keys(patch)];
    const values = [session.userId, ...Object.keys(patch).map((c) => patch[c])];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO overlay_elements (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return NextResponse.json({ data: result.rows[0] });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
