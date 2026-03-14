import { Hono } from "hono";
import type { PoolClient, QueryResultRow } from "pg";

import { withTransaction } from "../db";
import { importAttendeesForEvent } from "../services/attendee-import";
import { parseCSV } from "../services/csv";
import { sendQREmail } from "../services/mailer";
import { generateQRImage } from "../services/qr";
import { isUuid } from "../utils/uuid";

interface EventRow extends QueryResultRow {
  id: string;
}

interface AttendeeListRow extends QueryResultRow {
  id: string;
  name: string;
  email: string;
  university: string | null;
  profile_link: string | null;
  email_sent: boolean;
  created_at: string | Date;
  checked_in_at: string | Date | null;
}

interface AttendeeEmailRow extends QueryResultRow {
  id: string;
  name: string;
  email: string;
  qr_token: string;
}

function toIsoString(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

const attendees = new Hono();

attendees.post("/import", async (c) => {
  const formData = await c.req.formData();
  const eventIdValue = formData.get("eventId");
  const csvValue = formData.get("csv");

  if (typeof eventIdValue !== "string" || !eventIdValue.trim()) {
    return c.json({ error: "eventId is required" }, 400);
  }

  if (!(csvValue instanceof File)) {
    return c.json({ error: "csv file is required" }, 400);
  }

  const eventId = eventIdValue.trim();

  if (!isUuid(eventId)) {
    return c.json({ error: "eventId must be a valid UUID" }, 400);
  }

  const csvBuffer = Buffer.from(await csvValue.arrayBuffer());
  const rows = parseCSV(csvBuffer);

  const imported = await withTransaction(async (client: PoolClient) => {
    const event = await client.query<EventRow>("SELECT id FROM events WHERE id = $1", [eventId]);

    if (event.rowCount === 0) {
      throw new Error("Event not found");
    }

    return importAttendeesForEvent({ client, eventId, rows });
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Failed to import attendees";
    throw new Error(message);
  });

  return c.json(imported, 201);
});

attendees.get("/:eventId", async (c) => {
  const eventId = c.req.param("eventId");

  if (!isUuid(eventId)) {
    return c.json({ error: "eventId must be a valid UUID" }, 400);
  }

  const result = await withTransaction(async (client: PoolClient) => {
    const event = await client.query<EventRow>("SELECT id FROM events WHERE id = $1", [eventId]);

    if (event.rowCount === 0) {
      throw new Error("Event not found");
    }

    return client.query<AttendeeListRow>(
      `SELECT
         a.id,
         a.name,
         a.email,
         a.university,
         a.profile_link,
         a.email_sent,
         a.created_at,
         c.checked_in_at
       FROM attendees a
       LEFT JOIN checkins c ON c.attendee_id = a.id
       WHERE a.event_id = $1
       ORDER BY a.created_at ASC`,
      [eventId],
    );
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Failed to fetch attendees";
    throw new Error(message);
  });

  return c.json(
    result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      university: row.university,
      profileLink: row.profile_link,
      emailSent: row.email_sent,
      createdAt: toIsoString(row.created_at),
      checkedIn: row.checked_in_at !== null,
      checkedInAt: toIsoString(row.checked_in_at),
    })),
  );
});

attendees.post("/:eventId/resend", async (c) => {
  const eventId = c.req.param("eventId");

  if (!isUuid(eventId)) {
    return c.json({ error: "eventId must be a valid UUID" }, 400);
  }

  const attendeesForEmail = await withTransaction(async (client: PoolClient) => {
    const event = await client.query<EventRow>("SELECT id FROM events WHERE id = $1", [eventId]);

    if ((event.rowCount ?? 0) === 0) {
      throw new Error("Event not found");
    }

    return client.query<AttendeeEmailRow>(
      `SELECT id, name, email, qr_token
       FROM attendees
       WHERE event_id = $1
       ORDER BY created_at ASC`,
      [eventId],
    );
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Failed to fetch attendees";
    throw new Error(message);
  });

  for (const attendee of attendeesForEmail.rows) {
    const qrBase64 = await generateQRImage({
      attendee_id: attendee.id,
      event_id: eventId,
      hmac: attendee.qr_token,
    });

    await sendQREmail(attendee.email, attendee.name, qrBase64);
  }

  return c.json({ resent: attendeesForEmail.rows.length });
});

export default attendees;
