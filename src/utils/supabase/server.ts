/**
 * Server-side Supabase client for App Router route handlers + server
 * components. Reads/writes the session cookie so the user's auth state
 * survives across requests.
 *
 * Browser-side code keeps using `@/utils/supabase/client` — that one runs
 * in the user's tab and stores the session in localStorage by default.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll throws inside server components (you can only set
            // cookies in route handlers / server actions). The middleware
            // path (when we add it) covers that gap; for the auth callback
            // route — which IS a route handler — this just works.
          }
        },
      },
    },
  );
}
