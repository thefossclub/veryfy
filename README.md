# veryfy

Local-first event check-in system:

- The organiser imports attendees from a CSV
- The backend generates HMAC-signed QR codes and emails them to each attendee,
- Volunteers scan QR codes at the door using the Expo app. Check-ins are recorded in PostgreSQL.

Everything runs locally. No external services are required.

## Contents

- [Stack](#stack)
- [Modes](#modes)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
    - [Automated setup](#automated-setup)
    - [Manual setup](#manual-setup)
- [Environment variables](#environment-variables)
- [Database schema](#database-schema)
- [API reference](#api-reference)
- [Common issues](#common-issues)
- [Git](#git)
- [Notes](#notes)

## Stack

- **Backend:** Bun + Hono, serving a REST API on port 3000
- **Database:** PostgreSQL, storing events, attendees, and check-ins
- **Email:** MailHog (development) or any SMTP server such as Spacemail (production)
- **Mobile:** Expo + React Native, using `expo-camera` for QR scanning

## Modes

The system runs in one of two modes, controlled by `NODE_ENV` in `backend/.env`.

**Development** (`NODE_ENV=development`) uses MailHog as a local SMTP sink.
Emails are not delivered to real inboxes. You can inspect them at
`http://localhost:8025`. No SMTP credentials are required.

**Production** (`NODE_ENV=production`) uses a real SMTP server. You must
provide `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` in `.env`.
Emails are delivered to real attendee inboxes.

## Project structure

```
veryfy/
├── backend/
│   ├── src/
│   │   ├── routes/        # Hono route handlers
│   │   ├── services/      # business logic (import, mailer, QR generation)
│   │   ├── utils/
│   │   ├── db.ts          # PostgreSQL connection pool
│   │   ├── index.ts       # server entry point
│   │   └── schema.sql     # database schema
│   ├── .env.example
│   └── index.ts
├── expo-app/
│   ├── app/               # screens (home, scan, result, admin)
│   ├── components/
│   ├── constants/
│   │   └── config.ts      # BASE_URL pointing at the backend
│   └── types/
├── setup.py               # automated setup script
└── README.md
```

## Prerequisites

The following must be installed before setup.

| Tool       | Purpose                                    |
| ---------- | ------------------------------------------ |
| Bun        | runs the backend and installs dependencies |
| PostgreSQL | stores events, attendees, and check-ins    |
| MailHog    | local SMTP sink for development mode       |
| Node.js    | required by Expo tooling                   |

## Setup

There are two ways to set up the project: automated (recommended) or manual.

---

### Automated setup

The setup script handles PostgreSQL user and database creation, schema loading,
`.env` generation, and dependency installation. It prompts for input at each
step and shows defaults in brackets.

From the repo root:

```bash
python3 setup.py
```

The script will ask whether you are setting up for development or production and
adjust the SMTP configuration accordingly.

---

### Manual setup

#### 1. PostgreSQL

Make sure PostgreSQL is running:

```bash
sudo systemctl start postgresql
```

Create the database user and database. If you do not know the `postgres`
system password, use the local system account instead:

```bash
sudo -iu postgres psql
```

Then run:

```sql
CREATE USER eventuser WITH PASSWORD 'eventpass';
CREATE DATABASE eventdb OWNER eventuser;
\q
```

#### 2. Load the schema

From the repo root:

```bash
psql -h localhost -U eventuser -d eventdb -f backend/src/schema.sql
```

#### 3. Backend environment

Copy the example file:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in the values. See the
[Environment variables](#environment-variables) section below for a description
of each variable.

#### 4. Start MailHog (development only)

```bash
mailhog
```

MailHog listens on `localhost:1025` for SMTP and exposes a web UI at
`http://localhost:8025`.

If MailHog is not on your PATH, find it with `which mailhog` or run it via
Docker:

```bash
docker run --rm -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

#### 5. Install dependencies and start the backend

```bash
cd backend
bun install
bun run dev
```

Verify the server is running:

```bash
curl http://localhost:3000/
# {"status":"ok","service":"event-checkin"}
```

#### 6. Create an event

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{"name":"Launch Night","date":"2026-04-30"}'
```

Response:

```json
{
    "id": "08c02b88-e318-4c65-a420-67049bd3354c",
    "name": "Launch Night",
    "date": "2026-04-30",
    "createdAt": "2026-03-14T10:30:00.000Z"
}
```

Copy the `id`. It is required for the import step.

Each event gets a default checkpoint named `Main Entry`. You can add more
checkpoints like `Lunch`, `Auditorium Entry`, or `Energy Zone` later.

#### 7. Prepare the attendee CSV

Place a file named `attendees.csv` in the repo root. The expected columns are:

```csv
name,email,university,profile_link
```

#### 8. Import attendees

Replace `EVENT_ID` with the UUID from step 6:

```bash
curl -X POST http://localhost:3000/attendees/import \
  -F "eventId=EVENT_ID" \
  -F "csv=@attendees.csv"
```

Expected response:

```json
{"imported":n,"skipped":0}
```

This inserts each attendee, generates a signed QR payload, and sends an email.
Rows with a duplicate email for the same event are skipped. The entire insert
batch is transactional — if any row fails validation, nothing is written.

#### 8a. Add more checkpoints for the same event

Use the event id from step 6:

```bash
curl -X POST http://localhost:3000/checkpoints/EVENT_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"Lunch","code":"lunch","sortOrder":10}'
```

Example for an auditorium checkpoint:

```bash
curl -X POST http://localhost:3000/checkpoints/EVENT_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"Auditorium Entry","code":"auditorium_entry","sortOrder":20}'
```

#### 9. Start the Expo app

Find your machine's LAN IP:

```bash
ip a
```

Update `expo-app/constants/config.ts`:

```ts
export const BASE_URL = "http://192.168.x.x:3000";
```

Then:

```bash
cd expo-app
bun install
npx expo start
```

Scan the Expo QR code with the Expo Go app on your phone, or open an emulator.

---

## Environment variables

All variables are read from `backend/.env` via `Bun.env`.

| Variable                    | Required        | Description                                                                                                                                           |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | yes             | `development` or `production`. Controls SMTP mode.                                                                                                    |
| `DATABASE_URL`              | yes             | PostgreSQL connection string. Format: `postgres://user:pass@host:port/dbname`                                                                         |
| `HMAC_SECRET`               | yes             | Secret key used to sign QR payloads. Use a long random string. Never commit this.                                                                     |
| `SMTP_HOST`                 | yes             | SMTP server hostname. `localhost` for MailHog, `mail.spacemail.com` for Spacemail.                                                                    |
| `SMTP_PORT`                 | yes             | SMTP port. `1025` for MailHog, `465` for SSL, `587` for STARTTLS.                                                                                     |
| `SMTP_FROM`                 | yes             | The sender address that appears in outgoing emails.                                                                                                   |
| `SMTP_USER`                 | production only | SMTP login username, usually the sender email address.                                                                                                |
| `SMTP_PASS`                 | production only | SMTP login password. If the password contains special characters, wrap it in single quotes in `.env`.                                                 |
| `SEND_EMAILS`               | no              | If `true`, send QR emails during import. Set to `false` to import attendees without sending emails. Default: `true`.                               |
| `AUTO_IMPORT_ATTENDEES_CSV` | no              | If `true`, the backend imports `attendees.csv` from the repo root on startup. Existing rows are skipped. Set to `false` to disable. Default: `false`. |
| `AUTO_IMPORT_EVENT_NAME`    | no              | Name of the event created during auto-import. Default: `CSV Imported Event`.                                                                          |
| `AUTO_IMPORT_EVENT_DATE`    | no              | Date of the event created during auto-import. Format: `YYYY-MM-DD`. Default: today.                                                                   |
| `PGSSLMODE`                 | no              | Set to `require` when connecting the backend to hosted PostgreSQL instances that require SSL, such as Render Postgres.                              |
| `PORT`                      | no              | Port the backend listens on. Default: `3000`.                                                                                                         |

---

## Database schema

The schema is in `backend/src/schema.sql`. It uses the `pgcrypto` extension for
UUID generation.

### events

Stores each event. An event is the top-level container for attendees and
check-ins.

| Column       | Type        | Description                  |
| ------------ | ----------- | ---------------------------- |
| `id`         | UUID        | Primary key, auto-generated. |
| `name`       | TEXT        | Event name.                  |
| `date`       | DATE        | Event date.                  |
| `created_at` | TIMESTAMPTZ | Row creation timestamp.      |

### attendees

One row per registered attendee per event.

| Column         | Type        | Description                                                               |
| -------------- | ----------- | ------------------------------------------------------------------------- |
| `id`           | UUID        | Primary key, auto-generated.                                              |
| `event_id`     | UUID        | Foreign key to `events`. Cascades on delete.                              |
| `name`         | TEXT        | Attendee full name.                                                       |
| `email`        | TEXT        | Attendee email address. Used for deduplication (case-insensitive).        |
| `university`   | TEXT        | Optional. Attendee's institution.                                         |
| `profile_link` | TEXT        | Optional. LinkedIn or similar profile URL.                                |
| `qr_token`     | TEXT        | The HMAC hex string embedded in the QR code. Unique across all attendees. |
| `email_sent`   | BOOLEAN     | Set to `true` after the QR email is successfully sent.                    |
| `created_at`   | TIMESTAMPTZ | Row creation timestamp.                                                   |

### checkins

One row per completed attendee check-in per checkpoint.

| Column          | Type        | Description                                             |
| --------------- | ----------- | ------------------------------------------------------- |
| `id`            | UUID        | Primary key, auto-generated.                            |
| `attendee_id`   | UUID        | Foreign key to `attendees`. Cascades on delete.         |
| `checkpoint_id` | UUID        | Foreign key to `checkpoints`. Cascades on delete.       |
| `checked_in_at` | TIMESTAMPTZ | Timestamp of the checkpoint check-in.                   |

### checkpoints

One row per reusable scan location inside an event.

| Column       | Type        | Description                                        |
| ------------ | ----------- | -------------------------------------------------- |
| `id`         | UUID        | Primary key, auto-generated.                       |
| `event_id`   | UUID        | Foreign key to `events`. Cascades on delete.       |
| `code`       | TEXT        | Stable checkpoint id, unique within an event.      |
| `name`       | TEXT        | Human-readable checkpoint name.                    |
| `sort_order` | INTEGER     | Controls checkpoint ordering in scanner/admin UI.  |
| `created_at` | TIMESTAMPTZ | Row creation timestamp.                            |

Two indexes are defined: `attendees_event_id_idx` for fast attendee lookups by
event, `checkpoints_event_id_idx` for fast checkpoint lookups by event, and
`checkins_attendee_id_idx` for fast check-in lookups by attendee.

---

## API reference

### Events

| Method | Path      | Description                                                 |
| ------ | --------- | ----------------------------------------------------------- |
| `GET`  | `/events` | List all events.                                            |
| `POST` | `/events` | Create an event. Body: `{"name":"...","date":"YYYY-MM-DD"}` |

### Checkpoints

| Method | Path                    | Description                                                                    |
| ------ | ----------------------- | ------------------------------------------------------------------------------ |
| `GET`  | `/checkpoints/:eventId` | List checkpoints for an event, including checkpoint-level counts.              |
| `POST` | `/checkpoints/:eventId` | Create a checkpoint. Body: `{"name":"Lunch","code":"lunch","sortOrder":10}` |

### Attendees

| Method | Path                         | Description                                                        |
| ------ | ---------------------------- | ------------------------------------------------------------------ |
| `GET`  | `/attendees/:eventId`        | List attendees for an event. Optional query: `checkpointId=...`    |
| `GET`  | `/attendees/:eventId/export.csv` | Export event attendance as CSV, including checkpoint timestamps. |
| `POST` | `/attendees/import`          | Import attendees from a CSV. Form fields: `eventId`, `csv` (file). |
| `POST` | `/attendees/:eventId/resend` | Resend QR emails for all attendees of an event.                    |

### Check-in

| Method | Path       | Description                                                                                     |
| ------ | ---------- | ----------------------------------------------------------------------------------------------- |
| `POST` | `/checkin` | Verify a QR token and record a checkpoint check-in. Body: `{"token":"...","checkpointId":"..."}` |

### Utilities

| Method | Path              | Description                                         |
| ------ | ----------------- | --------------------------------------------------- |
| `GET`  | `/qr/:attendeeId` | Returns the QR code image for an attendee as a PNG. |

---

## Common issues

### `connect ECONNREFUSED 127.0.0.1:5432`

PostgreSQL is not running.

```bash
sudo systemctl start postgresql
```

### `password authentication failed for user "postgres"`

Use the local system account instead of supplying a password:

```bash
sudo -iu postgres psql
```

### `DATABASE_URL is not set`

`backend/.env` does not exist. Create it:

```bash
cp backend/.env.example backend/.env
```

### `backend/src/schema.sql: No such file or directory`

You are inside `backend/` and used the repo-root path. Use the relative path:

```bash
psql -h localhost -U eventuser -d eventdb -f src/schema.sql
```

### `MailHog: command not found`

MailHog is not on your PATH. Either add the Go bin directory to your PATH or
run it via Docker:

```bash
docker run --rm -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

### `535 authentication failed` from SMTP

The SMTP credentials are wrong, or the password contains special characters
that are being misread. Wrap the value in single quotes in `.env`:

```env
SMTP_PASS='your"password'
```

### `SSL/TLS required` from PostgreSQL

Your hosted PostgreSQL server requires SSL. Use either `PGSSLMODE=require` in
`backend/.env` or append `?sslmode=require` to `DATABASE_URL`.

### Expo app cannot reach backend

- `BASE_URL` in `expo-app/constants/config.ts` still has a placeholder IP
- The phone and the laptop are not on the same network
- The backend is not running

---

## Git

The root `.gitignore` excludes local files from commits. Before pushing, verify
with:

```bash
git status --short
```

The following should not appear in the output:

- `backend/.env`
- `backend/node_modules`
- `expo-app/node_modules`
- `attendees.csv`
- `attendee-qr.png`

---

## Notes

- The backend uses raw `pg` queries, no ORM.
- QR payload format: JSON string `{"attendee_id":"...","event_id":"...","hmac":"..."}`, HMAC-signed with `HMAC_SECRET`.
- The same attendee QR can now be used across multiple checkpoints within the same event.
- Duplicate scans are prevented by a `UNIQUE(attendee_id, checkpoint_id)` index on `checkins`.
- The Expo app uses `expo-camera` `CameraView`. The deprecated `expo-barcode-scanner` is not used.
