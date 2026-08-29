// Verifies a Supabase session access token WITHOUT calling Supabase's Auth
// API — needed because the Auth API is part of the same REST gateway that's
// 402ing during the egress-quota outage (see src/lib/db-direct.ts). Supabase's
// legacy JWT auth signs session tokens with the project's JWT secret (HS256),
// so the signature can be checked locally: same trust boundary as asking
// Supabase "is this token valid", just without the network round-trip.
//
// Only used by outage-workaround write routes. Safe to delete once the
// normal supabase.auth.getUser() path is reliable again.
import jwt from 'jsonwebtoken';

export function verifySessionLocal(authHeader: string | null): { userId: string } | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not set — cannot verify sessions locally');

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as { sub?: string };
    if (!payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null; // expired, malformed, or bad signature
  }
}
