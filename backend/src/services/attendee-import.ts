import { randomUUID } from "node:crypto";

import type { PoolClient, QueryResultRow } from "pg";

import type { CsvAttendeeRow } from "./csv";
import { sendQREmail } from "./mailer";
import { buildQrPayload, generateQRImage } from "./qr";

interface ExistingAttendeeRow extends QueryResultRow {
  id: string;
}

export interface ImportAttendeesResult {
  imported: number;
  skipped: number;
}

interface ImportAttendeesInput {
  client: PoolClient;
  eventId: string;
  rows: CsvAttendeeRow[];
}

function isSendEmailsEnabled(): boolean {
  const value = Bun.env.SEND_EMAILS?.trim().toLowerCase();
  if (!value) return true;
  return value !== "false" && value !== "0" && value !== "no";
}

export async function importAttendeesForEvent({
  client,
  eventId,
  rows,
}: ImportAttendeesInput): Promise<ImportAttendeesResult> {
  let imported = 0;
  let skipped = 0;
  const sendEmails = isSendEmailsEnabled();

  for (const row of rows) {
    const existing = await client.query<ExistingAttendeeRow>(
      `SELECT id
       FROM attendees
       WHERE event_id = $1 AND LOWER(email) = LOWER($2)
       LIMIT 1`,
      [eventId, row.email],
    );

    if ((existing.rowCount ?? 0) > 0) {
      skipped += 1;
      continue;
    }

    const attendeeId = randomUUID();
    const payload = buildQrPayload(attendeeId, eventId);
    const qrBase64 = sendEmails ? await generateQRImage(payload) : null;

    await client.query(
      `INSERT INTO attendees (id, event_id, name, email, university, profile_link, qr_token, email_sent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
      [attendeeId, eventId, row.name, row.email, row.university, row.profileLink, payload.hmac],
    );

    if (sendEmails && qrBase64) {
      await sendQREmail(row.email, row.name, qrBase64);
      await client.query("UPDATE attendees SET email_sent = true WHERE id = $1", [attendeeId]);
    }
    imported += 1;
  }

  return { imported, skipped };
}
