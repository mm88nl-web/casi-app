-- Admin role and account suspension support.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- Grant founder admin. Runs idempotently — no-op if already set.
UPDATE profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'mm88nl@gmail.com' LIMIT 1
);

-- anon needs to read these so client-side pages can gate themselves
-- (suspended check on /s/[username] and /overlay, is_admin for the
-- settings rail — neither column is sensitive).
GRANT SELECT (is_admin, suspended_at) ON profiles TO anon;
GRANT SELECT (is_admin, suspended_at) ON profiles TO authenticated;
