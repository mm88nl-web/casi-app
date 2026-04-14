-- ── Row Level Security ────────────────────────────────────────────────────────
-- Prevents any authenticated user from overwriting another streamer's
-- solana_wallet (which would redirect all USDC payments to themselves).
-- Viewers interact via the anon key and are intentionally allowed to read
-- everything and insert/update bookings (they have no Supabase auth session).

-- ── profiles ──────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Public profile pages and the overlay need to read any profile.
CREATE POLICY "profiles_select_public"
  ON profiles FOR SELECT
  USING (true);

-- Only the account owner can update their own profile row.
-- This is the critical guard: prevents solana_wallet hijacking.
CREATE POLICY "profiles_update_owner"
  ON profiles FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Signup/setup flow inserts the initial profile row.
CREATE POLICY "profiles_insert_owner"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── overlay_elements ──────────────────────────────────────────────────────────
ALTER TABLE overlay_elements ENABLE ROW LEVEL SECURITY;

-- Overlay page reads elements for any streamer.
CREATE POLICY "elements_select_public"
  ON overlay_elements FOR SELECT
  USING (true);

-- Only the streamer who owns the profile can add / reposition / delete elements.
CREATE POLICY "elements_insert_owner"
  ON overlay_elements FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "elements_update_owner"
  ON overlay_elements FOR UPDATE
  USING  (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "elements_delete_owner"
  ON overlay_elements FOR DELETE
  USING (auth.uid() = profile_id);

-- ── bookings ──────────────────────────────────────────────────────────────────
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Overlay and admin both need to read all bookings for a profile.
CREATE POLICY "bookings_select_public"
  ON bookings FOR SELECT
  USING (true);

-- Unauthenticated viewers (anon key, no Supabase session) create bookings.
CREATE POLICY "bookings_insert_public"
  ON bookings FOR INSERT
  WITH CHECK (true);

-- Updates come from two sources:
--   • The streamer (authenticated) — approve / deny via admin dashboard.
--   • The viewer (anon, auth.uid() IS NULL) — cancel / expire their own booking.
-- Authenticated non-owners are blocked; anon viewers are allowed through.
CREATE POLICY "bookings_update_owner_or_anon"
  ON bookings FOR UPDATE
  USING (auth.uid() IS NULL OR auth.uid() = profile_id);
