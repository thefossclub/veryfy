CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  university TEXT,
  profile_link TEXT,
  qr_token TEXT UNIQUE NOT NULL,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID REFERENCES attendees(id) ON DELETE CASCADE UNIQUE,
  checked_in_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendees_event_id_idx ON attendees (event_id);
CREATE INDEX IF NOT EXISTS checkins_attendee_id_idx ON checkins (attendee_id);

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS university TEXT;

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS profile_link TEXT;
