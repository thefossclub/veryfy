import { Hono } from "hono";
import type { QueryResultRow } from "pg";

import { query } from "../db";
import type { QrPayload } from "../services/qr";
import { verifyToken } from "../services/qr";

interface CheckinBody {
  checkpointId: string;
  token: string;
}

interface AttendeeLookupRow extends QueryResultRow {
  id: string;
  name: string;
  qr_token: string;
  event_name: string;
  checkpoint_name: string;
}

interface CheckinInsertRow extends QueryResultRow {
  checked_in_at: string | Date;
}

interface ExistingCheckinRow extends QueryResultRow {
  checked_in_at: string | Date;
}

function isCheckinBody(value: unknown): value is CheckinBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeBody = value as Record<string, unknown>;
  return typeof maybeBody.token === "string" && typeof maybeBody.checkpointId === "string";
}

function isQrPayload(value: unknown): value is QrPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybePayload = value as Record<string, unknown>;
  return (
    typeof maybePayload.attendee_id === "string" &&
    typeof maybePayload.event_id === "string" &&
    typeof maybePayload.hmac === "string"
  );
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

const checkin = new Hono();

checkin.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);

  if (!isCheckinBody(body)) {
    return c.json({ error: "Body must include token and checkpointId" }, 400);
  }

  if (!body.checkpointId.trim()) {
    return c.json({ error: "checkpointId is required" }, 400);
  }

  const parsed = (() => {
    try {
      return JSON.parse(body.token) as unknown;
    } catch {
      return null;
    }
  })();

  if (!isQrPayload(parsed)) {
    return c.json({ status: "invalid_token" }, 401);
  }

  if (!verifyToken(parsed.attendee_id, parsed.event_id, parsed.hmac)) {
    return c.json({ status: "invalid_token" }, 401);
  }

  const attendee = await query<AttendeeLookupRow>(
    `SELECT
       a.id,
       a.name,
       a.qr_token,
       e.name AS event_name,
       cp.name AS checkpoint_name
     FROM attendees a
     INNER JOIN events e ON e.id = a.event_id
     INNER JOIN checkpoints cp ON cp.id = $3 AND cp.event_id = e.id
     WHERE a.id = $1 AND a.event_id = $2`,
    [parsed.attendee_id, parsed.event_id, body.checkpointId.trim()],
  );

  const attendeeRow = attendee.rows[0];

  if (!attendeeRow || attendeeRow.qr_token !== parsed.hmac) {
    return c.json({ status: "invalid_token" }, 401);
  }

  const inserted = await query<CheckinInsertRow>(
    `INSERT INTO checkins (attendee_id, checkpoint_id)
     VALUES ($1, $2)
     ON CONFLICT (attendee_id, checkpoint_id) DO NOTHING
     RETURNING checked_in_at`,
    [attendeeRow.id, body.checkpointId.trim()],
  );

  if (inserted.rowCount === 0) {
    const existing = await query<ExistingCheckinRow>(
      "SELECT checked_in_at FROM checkins WHERE attendee_id = $1 AND checkpoint_id = $2",
      [attendeeRow.id, body.checkpointId.trim()],
    );

    const checkedInAt = existing.rows[0]?.checked_in_at;

    return c.json({
      status: "already_checked_in",
      name: attendeeRow.name,
      checkpoint: attendeeRow.checkpoint_name,
      checkedInAt: checkedInAt ? toIsoString(checkedInAt) : undefined,
    });
  }

  const insertedRow = inserted.rows[0];

  if (!insertedRow) {
    return c.json({ error: "Failed to persist check-in" }, 500);
  }

  return c.json({
    status: "ok",
    name: attendeeRow.name,
    event: attendeeRow.event_name,
    checkpoint: attendeeRow.checkpoint_name,
    checkedInAt: toIsoString(insertedRow.checked_in_at),
  });
});

export default checkin;
