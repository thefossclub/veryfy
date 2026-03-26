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

CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID REFERENCES attendees(id) ON DELETE CASCADE,
  checkpoint_id UUID REFERENCES checkpoints(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendees_event_id_idx ON attendees (event_id);
CREATE INDEX IF NOT EXISTS checkpoints_event_id_idx ON checkpoints (event_id);
CREATE INDEX IF NOT EXISTS checkins_attendee_id_idx ON checkins (attendee_id);
CREATE INDEX IF NOT EXISTS checkins_checkpoint_id_idx ON checkins (checkpoint_id);

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS university TEXT;

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS profile_link TEXT;

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS checkpoint_id UUID REFERENCES checkpoints(id) ON DELETE CASCADE;

INSERT INTO checkpoints (event_id, code, name, sort_order)
SELECT id, 'main_entry', 'Main Entry', 0
FROM events
ON CONFLICT (event_id, code) DO NOTHING;

UPDATE checkins c
SET checkpoint_id = cp.id
FROM attendees a
JOIN checkpoints cp
  ON cp.event_id = a.event_id
 AND cp.code = 'main_entry'
WHERE c.attendee_id = a.id
  AND c.checkpoint_id IS NULL;

ALTER TABLE checkins
  ALTER COLUMN checkpoint_id SET NOT NULL;

ALTER TABLE checkins
  DROP CONSTRAINT IF EXISTS checkins_attendee_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS checkins_attendee_checkpoint_uidx
ON checkins (attendee_id, checkpoint_id);
