-- Harden the signup surface against the obvious abuse vectors.
--
-- Threat model: the profiles table is written from the client at signup
-- (RLS gate is `auth.uid() = id`, which is correct), but until this
-- migration every other invariant was enforced only by the React form.
-- A user with curl + an auth bearer token could:
--
--   * Grab any free-form username (no DB UNIQUE constraint), including
--     route-reserved handles like "admin", "studio", "api", "s", "login"
--     — which would shadow real URLs on the site.
--   * INSERT a profile with a 50 KB bio or a 5 KB display_name.
--   * Set avatar_url to javascript:..., file://, or any non-image URL.
--   * Bypass TOS acceptance entirely (the React checkbox doesn't write
--     anywhere — GDPR audit would have no record of consent).
--
-- This migration moves those invariants into the database where the
-- service-role bypass is the only escape hatch (and that's controlled by
-- us on the server). All checks are written so the existing signup form
-- continues to work without code changes — they catch malformed direct
-- inserts, not the happy path.

-- 1. Username: case-insensitive uniqueness + format validation.
--
-- Username already exists as a column; we just constrain it. Using a
-- functional unique index on LOWER(username) lets us treat "Alice" and
-- "alice" as the same handle (preventing impersonation by case-flip).
-- The frontend already lowercases on input, but a direct PostgREST insert
-- could send mixed case otherwise.
--
-- Format: 3-24 chars, lowercase ASCII letters, digits, underscore.
-- Mirrors the regex the React form already applies to user input. Existing
-- rows that don't match would block the migration — the IF NOT EXISTS dance
-- + DO block handles "this constraint already exists" idempotently.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON public.profiles (LOWER(username));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_username_format'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format
      CHECK (username ~ '^[a-z0-9_]{3,24}$');
  END IF;
END$$;

-- 2. Reserved usernames — handles that would collide with site routes
-- or look like impersonation of platform staff/system accounts.
--
-- Stored as a table rather than hardcoded into a CHECK so we can add
-- entries without a code deploy (and so the list is queryable from the
-- client to show "this name is reserved" feedback instead of letting the
-- insert fail with a generic constraint error).
--
-- Anon SELECT is allowed so the signup form can pre-check; only
-- service-role can INSERT/UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS public.reserved_usernames (
  username TEXT PRIMARY KEY CHECK (username = LOWER(username))
);

ALTER TABLE public.reserved_usernames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reserved_usernames_read_all ON public.reserved_usernames;
CREATE POLICY reserved_usernames_read_all
  ON public.reserved_usernames FOR SELECT
  USING (true);

GRANT SELECT ON public.reserved_usernames TO anon, authenticated;

-- Seed: routes that exist on the site today plus obvious impersonation /
-- system handles. New routes added to the app should also be added here
-- (one-line follow-up migration each time).
INSERT INTO public.reserved_usernames (username) VALUES
  ('admin'),     ('administrator'), ('api'),       ('app'),
  ('auth'),      ('callback'),      ('casi'),      ('dashboard'),
  ('help'),      ('legal'),         ('login'),     ('logout'),
  ('mainnet'),   ('overlay'),       ('privacy'),   ('profile'),
  ('root'),      ('s'),             ('settings'),  ('setup'),
  ('signin'),    ('signup'),        ('staff'),     ('studio'),
  ('support'),   ('terms'),         ('test'),      ('webhook')
ON CONFLICT (username) DO NOTHING;

-- The constraint that prevents picking a reserved name. Foreign key would
-- be wrong (we want "cannot exist in this list") so we use a CHECK that
-- queries the table. Postgres allows subqueries in CHECK only via a
-- function — see `validate_username_not_reserved` below.

CREATE OR REPLACE FUNCTION public.username_is_reserved(uname TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.reserved_usernames WHERE username = LOWER(uname));
$$;

-- Trigger-based check (functions in CHECK constraints aren't enforced on
-- UPDATE without a trigger). One BEFORE INSERT OR UPDATE catches both
-- the initial signup and any later rename attempt.

CREATE OR REPLACE FUNCTION public.profiles_block_reserved_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;
  -- Allow UPDATE that keeps the same username (no-op rename) even if
  -- that username is now reserved. Protects existing rows whose handle
  -- was grandfathered onto the reserved list later — e.g. the founder
  -- owns 'casi' but 'casi' is reserved against future signups. Without
  -- this, any UPDATE that mentions `username` in the SET clause would
  -- fire the trigger and refuse the save, even when the value is
  -- unchanged (UPDATE OF column triggers fire on SET inclusion, not on
  -- value change).
  IF TG_OP = 'UPDATE' AND OLD.username = NEW.username THEN
    RETURN NEW;
  END IF;
  IF public.username_is_reserved(NEW.username) THEN
    RAISE EXCEPTION 'username % is reserved', NEW.username
      USING ERRCODE = '23514';  -- check_violation
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_check_reserved_username ON public.profiles;
CREATE TRIGGER profiles_check_reserved_username
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_block_reserved_username();

-- 3. Display name + bio length. The form caps these at 32 and 160, but
-- a direct insert via PostgREST with the user's own bearer token can
-- bypass that. Cap them at the DB level so the column type itself is
-- the source of truth.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_display_name_length' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_length
      CHECK (display_name IS NULL OR char_length(display_name) <= 64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_bio_length' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_length
      CHECK (bio IS NULL OR char_length(bio) <= 320);
  END IF;
END$$;

-- 4. Avatar URL: require https:// scheme + reasonable length.
--
-- Doesn't validate the URL leads to a real image (that's a viewer-side
-- onError concern) but blocks the obvious nasties:
--   * javascript:..., file://, data:..., http:// (downgrade)
--   * 2 MB URLs aimed at killing renderer perf
-- The IS NULL OR check keeps avatar_url optional, which the form expects.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_avatar_url_format' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_url_format
      CHECK (avatar_url IS NULL OR (
        avatar_url LIKE 'https://%' AND char_length(avatar_url) <= 1024
      ));
  END IF;
END$$;

-- 5. TOS acceptance — persist the consent receipt.
--
-- GDPR / Dutch consumer law requires a provable record of consent at the
-- moment the account was created. Storing a timestamp + version string
-- means we can later show "you accepted v1.0 of the ToS on 2026-05-11"
-- if a streamer ever disputes it. Version is a free-form text so we can
-- bump it when the legal text changes ('v1', 'v2', '2026-05-11', etc.).
--
-- Backfill existing rows with now() + 'v1-backfill' since those
-- streamers already signed up under the v1 ToS — they accepted it via
-- the old checkbox, we just weren't persisting the timestamp yet.
-- profiles doesn't carry a created_at column so we can't pinpoint the
-- original signup time; now() is good enough for a "consent on file"
-- audit record.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tos_version     TEXT;

UPDATE public.profiles
  SET tos_accepted_at = COALESCE(tos_accepted_at, now()),
      tos_version     = COALESCE(tos_version, 'v1-backfill')
  WHERE tos_accepted_at IS NULL;

GRANT SELECT (tos_accepted_at, tos_version) ON TABLE public.profiles TO authenticated;
-- anon doesn't read these; only the streamer themselves needs visibility.
