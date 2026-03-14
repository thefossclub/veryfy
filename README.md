# veryfy

Local-first event check-in system:

- organiser creates an event
- organiser imports attendees from CSV
- backend generates HMAC-signed QR payloads
- backend emails QR codes through MailHog
- volunteers scan QR codes in the Expo app
- backend records check-ins in PostgreSQL

Everything runs locally. No external services are required.

## Stack

- Backend: Bun + Hono
- Database: PostgreSQL
- Email: MailHog
- Mobile: Expo + React Native + `expo-camera`

## Prerequisites

Install these first:

- Bun
- PostgreSQL
- Go or Docker for running MailHog
- Node.js or Bun for the Expo app

## Project structure

```text
veryfy/
├── backend/
├── expo-app/
└── README.md
```

## 1. PostgreSQL setup

Make sure PostgreSQL is running on `localhost:5432`.

If you do not already have the project database and user, create them.

### Option A: you know the `postgres` password

```bash
psql -h localhost -U postgres
```

Then run:

```sql
CREATE USER eventuser WITH PASSWORD 'eventpass';
CREATE DATABASE eventdb OWNER eventuser;
\q
```

### Option B: you do not know the `postgres` password

Use the local postgres system account:

```bash
sudo -iu postgres psql
```

Then run:

```sql
CREATE USER eventuser WITH PASSWORD 'eventpass';
CREATE DATABASE eventdb OWNER eventuser;
\q
```

## 2. Backend environment

From the repo root:

```bash
cp backend/.env.example backend/.env
```

Expected contents of `backend/.env`:

```env
DATABASE_URL=postgres://eventuser:eventpass@localhost:5432/eventdb
HMAC_SECRET=change_this_to_a_random_secret
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@event.local
AUTO_IMPORT_ATTENDEES_CSV=true
AUTO_IMPORT_EVENT_NAME=CSV Imported Event
AUTO_IMPORT_EVENT_DATE=2026-04-30
PORT=3000
```

Important:

- the backend reads env vars from `Bun.env`
- if `DATABASE_URL is not set`, you forgot to create `backend/.env`

## 3. Load the database schema

From the repo root:

```bash
psql -h localhost -U eventuser -d eventdb -f backend/src/schema.sql
```

If you are already inside `backend/`, use this path instead:

```bash
psql -h localhost -U eventuser -d eventdb -f src/schema.sql
```

Do not use `backend/src/schema.sql` while already inside `backend/`.

## 4. Start MailHog

### Option A: with Go

Install once:

```bash
go install github.com/mailhog/MailHog@latest
```

Run MailHog:

```bash
~/go/bin/MailHog
```

### Option B: with Docker

```bash
docker run --rm -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

MailHog URLs:

- SMTP: `localhost:1025`
- UI: `http://localhost:8025`

Important:

- `MailHog: command not found` means it is not installed or not on your `PATH`
- if you used `go install`, run `~/go/bin/MailHog`

## 5. Start the backend

Open a new terminal:

```bash
cd backend
bun install
bun run dev
```

Verify the API:

```bash
curl http://localhost:3000/
```

Expected response:

```json
{"status":"ok","service":"event-checkin"}
```

## 6. Create an event

From the repo root:

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{"name":"Launch Night","date":"2026-04-30"}'
```

Example response:

```json
{"id":"08c02b88-e318-4c65-a420-67049bd3354c","name":"Launch Night","date":"2026-04-30","createdAt":"2026-03-14T10:30:00.000Z"}
```

Copy the returned `id`. You need the real UUID in later commands.

Important:

- do not send `NEW_EVENT_ID_HERE` literally
- replace placeholders with the actual event id from the response

## 7. Create the attendee CSV

From the repo root:

```bash
printf "name,email,university,profile_link\nAda Lovelace,ada@example.com,University of London,https://linkedin.com/in/ada\nGrace Hopper,grace@example.com,Yale University,https://linkedin.com/in/grace\n" > attendees.csv
```

CSV format must be:

```csv
name,email,university,profile_link
Ada Lovelace,ada@example.com,University of London,https://linkedin.com/in/ada
Grace Hopper,grace@example.com,Yale University,https://linkedin.com/in/grace
```

When the backend starts, it now auto-syncs repo-root [attendees.csv](/home/v8v88v8v88/Projects/veryfy/attendees.csv) into the default event from `AUTO_IMPORT_EVENT_NAME` and `AUTO_IMPORT_EVENT_DATE`.
Existing attendees for the same event and email are skipped, so restarts do not duplicate rows.

## 8. Import attendees

Replace `EVENT_ID` with the real UUID returned by `POST /events`.

```bash
curl -X POST http://localhost:3000/attendees/import \
  -F "eventId=EVENT_ID" \
  -F "csv=@attendees.csv"
```

Expected response:

```json
{"imported":2,"skipped":0}
```

What this does:

- inserts attendees
- generates signed QR payloads
- sends attendee emails through MailHog

Important:

- this import is transactional
- if one row fails, the attendee insert batch is rolled back
- email sending happens during the import request, so MailHog must already be running

## 9. Check MailHog

Open:

```text
http://localhost:8025
```

You should see the attendee emails there.

## 10. Start the Expo app

This project is set up for Expo Go compatibility on a physical device.
If you upgrade Expo SDK later, confirm that your installed Expo Go app supports that SDK first.

Find your LAN IP:

```bash
ip a
```

Then update [expo-app/constants/config.ts](/home/v8v88v8v88/Projects/veryfy/expo-app/constants/config.ts#L1) with your machine's IP:

```ts
export const BASE_URL = "http://192.168.x.x:3000";
```

Use your real LAN IP, for example:

```ts
export const BASE_URL = "http://192.168.1.5:3000";
```

Then run:

```bash
cd expo-app
bun install
npx expo start
```

Open the app on a device or emulator and scan the QR code from MailHog.
The app now opens in a mode selector, so organisers can switch between `Scanner` and `Admin list`.

## 11. Check attendee status

List all events for the admin picker:

```bash
curl http://localhost:3000/events
```

List all attendees for an event:

```bash
curl http://localhost:3000/attendees/EVENT_ID
```

Each attendee now includes `university`, `profileLink`, `checkedIn`, and `checkedInAt` in the response.

Resend QR emails for an event if MailHog was restarted or its inbox was cleared:

```bash
curl -X POST http://localhost:3000/attendees/EVENT_ID/resend
```

Preview or reprint a QR code:

```bash
curl http://localhost:3000/qr/ATTENDEE_ID --output attendee-qr.png
```

Manual check-in request:

```bash
curl -X POST http://localhost:3000/checkin \
  -H "Content-Type: application/json" \
  -d '{"token":"{\"attendee_id\":\"ATTENDEE_ID\",\"event_id\":\"EVENT_ID\",\"hmac\":\"HMAC_HEX\"}"}'
```

## Common issues

### `password authentication failed for user "postgres"`

You do not know the password for the `postgres` DB role.

Use:

```bash
sudo -iu postgres psql
```

### `fe_sendauth: no password supplied`

You submitted an empty password. Enter the actual password or use the local postgres account.

### `backend/src/schema.sql: No such file or directory`

You were inside `backend/` and used a repo-root path.

Use:

```bash
psql -h localhost -U eventuser -d eventdb -f src/schema.sql
```

### `DATABASE_URL is not set`

You did not create `backend/.env`.

Fix:

```bash
cp backend/.env.example backend/.env
```

### `MailHog: command not found`

Run MailHog with the full Go install path:

```bash
~/go/bin/MailHog
```

or use Docker:

```bash
docker run --rm -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

### `invalid input syntax for type uuid: "NEW_EVENT_ID_HERE"`

You pasted the placeholder string instead of the real event UUID.

Replace it with the actual id returned by `POST /events`.

### Expo app cannot reach backend

Usually one of these:

- `BASE_URL` still has the placeholder IP
- your phone and laptop are not on the same network
- backend is not running on port `3000`

## Git and first push

This repo includes a root [.gitignore](/home/v8v88v8v88/Projects/veryfy/.gitignore) to keep local files out of the first push.

Before pushing, run:

```bash
git status --short
```

You should not commit:

- `backend/.env`
- `backend/node_modules`
- `expo-app/node_modules`
- `attendees.csv`
- `attendee-qr.png`

Typical first commit flow:

```bash
git add .
git status --short
git commit -m "Initial event check-in app"
git branch -M main
git remote add origin YOUR_REPO_URL
git push -u origin main
```

## Notes

- backend uses raw `pg` queries, no ORM
- QR payload format is JSON with `attendee_id`, `event_id`, and `hmac`
- check-in uses `ON CONFLICT DO NOTHING` to detect duplicate scans
- Expo uses `expo-camera` `CameraView` instead of deprecated `expo-barcode-scanner`
