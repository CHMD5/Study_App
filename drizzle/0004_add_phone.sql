-- Add phone number to profiles table for student phone-based login
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_idx ON profiles (phone) WHERE phone IS NOT NULL;

-- Backfill demo Student account with default phone number
UPDATE profiles SET phone = '+919876543210' WHERE username = 'Student' AND phone IS NULL;
