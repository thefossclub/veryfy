import { Hono } from "hono";
import type { PoolClient, QueryResultRow } from "pg";

import { withTransaction } from "../db";
import { importAttendeesForEvent } from "../services/attendee-import";
import { parseCSV } from "../services/csv";
import { buildCsv } from "../services/export";
import { sendQREmail } from "../services/mailer";
import { generateQRImage } from "../services/qr";
import { isUuid } from "../utils/uuid";

interface EventRow extends QueryResultRow {
  id: string;
  name?: string;
}

interface AttendeeListRow extends QueryResultRow {
  id: string;
  name: string;
  email: string;
  university: string | null;
  profile_link: string | null;
  email_sent: boolean;
  created_at: string | Date;
  checkin_count: number;
  checked_in_at: string | Date | null;
}

interface AttendeeEmailRow extends QueryResultRow {
  id: string;
  name: string;
  email: string;
  qr_token: string;
}

interface CheckpointExportRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
}

interface AttendeeExportRow extends QueryResultRow {
  attendee_id: string;
  name: string;
  email: string;
  university: string | null;
  profile_link: string | null;
  email_sent: boolean;
  checkpoint_id: string | null;
  checkpoint_code: string | null;
  checked_in_at: string | Date | null;
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
  const checkpointId = c.req.query("checkpointId");

  if (!isUuid(eventId)) {
    return c.json({ error: "eventId must be a valid UUID" }, 400);
  }

  if (checkpointId && !isUuid(checkpointId)) {
    return c.json({ error: "checkpointId must be a valid UUID" }, 400);
  }

  const result = await withTransaction(async (client: PoolClient) => {
    const event = await client.query<EventRow>("SELECT id FROM events WHERE id = $1", [eventId]);

    if (event.rowCount === 0) {
      throw new Error("Event not found");
    }

    if (checkpointId) {
      const checkpoint = await client.query<EventRow>(
        "SELECT id FROM checkpoints WHERE id = $1 AND event_id = $2",
        [checkpointId, eventId],
      );

      if ((checkpoint.rowCount ?? 0) === 0) {
        throw new Error("Checkpoint not found");
      }
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
         COUNT(c.id)::int AS checkin_count,
         MAX(c.checked_in_at) AS checked_in_at
       FROM attendees a
       LEFT JOIN checkins c
         ON c.attendee_id = a.id
        AND ($2::uuid IS NULL OR c.checkpoint_id = $2::uuid)
       WHERE a.event_id = $1
       GROUP BY a.id, a.name, a.email, a.university, a.profile_link, a.email_sent, a.created_at
       ORDER BY a.created_at ASC`,
      [eventId, checkpointId ?? null],
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
      checkedIn: row.checkin_count > 0,
      checkedInCheckpointCount: row.checkin_count,
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

attendees.get("/:eventId/export.csv", async (c) => {
  const eventId = c.req.param("eventId");

  if (!isUuid(eventId)) {
    return c.json({ error: "eventId must be a valid UUID" }, 400);
  }

  const exportData = await withTransaction(async (client: PoolClient) => {
    const event = await client.query<EventRow>("SELECT id, name FROM events WHERE id = $1", [eventId]);

    if ((event.rowCount ?? 0) === 0) {
      throw new Error("Event not found");
    }

    const checkpoints = await client.query<CheckpointExportRow>(
      `SELECT id, code, name, sort_order
       FROM checkpoints
       WHERE event_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [eventId],
    );

    const attendeesForExport = await client.query<AttendeeExportRow>(
      `SELECT
         a.id AS attendee_id,
         a.name,
         a.email,
         a.university,
         a.profile_link,
         a.email_sent,
         cp.id AS checkpoint_id,
         cp.code AS checkpoint_code,
         c.checked_in_at
       FROM attendees a
       LEFT JOIN checkins c ON c.attendee_id = a.id
       LEFT JOIN checkpoints cp ON cp.id = c.checkpoint_id
       WHERE a.event_id = $1
       ORDER BY a.created_at ASC, cp.sort_order ASC NULLS LAST`,
      [eventId],
    );

    return {
      attendees: attendeesForExport.rows,
      checkpoints: checkpoints.rows,
      eventName: event.rows[0]?.name ?? "event",
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Failed to export attendees";
    throw new Error(message);
  });

  const checkpointHeaders = exportData.checkpoints.map((checkpoint) => `${checkpoint.code}_checked_in_at`);
  const headers = [
    "attendee_id",
    "name",
    "email",
    "university",
    "profile_link",
    "email_sent",
    "total_checkpoints_checked_in",
    "last_checked_in_at",
    ...checkpointHeaders,
  ];

  const attendeeMap = new Map<
    string,
    {
      attendeeId: string;
      name: string;
      email: string;
      university: string | null;
      profileLink: string | null;
      emailSent: boolean;
      lastCheckedInAt: string | null;
      scans: Map<string, string | null>;
    }
  >();

  for (const row of exportData.attendees) {
    const existing =
      attendeeMap.get(row.attendee_id) ??
      {
        attendeeId: row.attendee_id,
        name: row.name,
        email: row.email,
        university: row.university,
        profileLink: row.profile_link,
        emailSent: row.email_sent,
        lastCheckedInAt: null,
        scans: new Map<string, string | null>(),
      };

    if (row.checkpoint_code) {
      existing.scans.set(row.checkpoint_code, toIsoString(row.checked_in_at));
    }

    const checkedInAt = toIsoString(row.checked_in_at);

    if (checkedInAt && (!existing.lastCheckedInAt || checkedInAt > existing.lastCheckedInAt)) {
      existing.lastCheckedInAt = checkedInAt;
    }

    attendeeMap.set(row.attendee_id, existing);
  }

  const rows = Array.from(attendeeMap.values()).map((attendee) => [
    attendee.attendeeId,
    attendee.name,
    attendee.email,
    attendee.university,
    attendee.profileLink,
    attendee.emailSent,
    attendee.scans.size,
    attendee.lastCheckedInAt,
    ...exportData.checkpoints.map((checkpoint) => attendee.scans.get(checkpoint.code) ?? null),
  ]);

  const csv = buildCsv(headers, rows);
  const filename = `${exportData.eventName.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "event"}_attendance.csv`;

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);

  return c.body(csv);
});

export default attendees;
