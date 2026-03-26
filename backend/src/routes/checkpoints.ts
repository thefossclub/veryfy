import { Hono } from "hono";
import type { QueryResultRow } from "pg";

import { query } from "../db";
import { isUuid } from "../utils/uuid";

interface EventRow extends QueryResultRow {
  id: string;
}

interface CheckpointRow extends QueryResultRow {
  id: string;
  event_id: string;
  code: string;
  name: string;
  sort_order: number;
  created_at: string | Date;
  attendee_count?: number;
  checked_in_count?: number;
}

interface CreateCheckpointBody {
  code?: string;
  name: string;
  sortOrder?: number;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isCreateCheckpointBody(value: unknown): value is CreateCheckpointBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeBody = value as Record<string, unknown>;
  return (
    typeof maybeBody.name === "string" &&
    (typeof maybeBody.code === "string" || typeof maybeBody.code === "undefined") &&
    (typeof maybeBody.sortOrder === "number" || typeof maybeBody.sortOrder === "undefined")
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const checkpoints = new Hono();

checkpoints.get("/:eventId", async (c) => {
  const eventId = c.req.param("eventId");

  if (!isUuid(eventId)) {
    return c.json({ error: "eventId must be a valid UUID" }, 400);
  }

  const event = await query<EventRow>("SELECT id FROM events WHERE id = $1", [eventId]);

  if ((event.rowCount ?? 0) === 0) {
    return c.json({ error: "Event not found" }, 404);
  }

  const result = await query<CheckpointRow>(
    `SELECT
       cp.id,
       cp.event_id,
       cp.code,
       cp.name,
       cp.sort_order,
       cp.created_at,
       COUNT(DISTINCT a.id)::int AS attendee_count,
       COUNT(c.id)::int AS checked_in_count
     FROM checkpoints cp
     LEFT JOIN attendees a ON a.event_id = cp.event_id
     LEFT JOIN checkins c ON c.checkpoint_id = cp.id
     WHERE cp.event_id = $1
     GROUP BY cp.id, cp.event_id, cp.code, cp.name, cp.sort_order, cp.created_at
     ORDER BY cp.sort_order ASC, cp.created_at ASC`,
    [eventId],
  );

  return c.json(
    result.rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      code: row.code,
      name: row.name,
      sortOrder: row.sort_order,
      createdAt: toIsoString(row.created_at),
      attendeeCount: row.attendee_count ?? 0,
      checkedInCount: row.checked_in_count ?? 0,
    })),
  );
});

checkpoints.post("/:eventId", async (c) => {
  const eventId = c.req.param("eventId");

  if (!isUuid(eventId)) {
    return c.json({ error: "eventId must be a valid UUID" }, 400);
  }

  const body = await c.req.json<unknown>().catch(() => null);

  if (!isCreateCheckpointBody(body)) {
    return c.json({ error: "Body must include name, with optional code and sortOrder" }, 400);
  }

  const event = await query<EventRow>("SELECT id FROM events WHERE id = $1", [eventId]);

  if ((event.rowCount ?? 0) === 0) {
    return c.json({ error: "Event not found" }, 404);
  }

  const name = body.name.trim();
  const code = slugify(body.code?.trim() || body.name);
  const sortOrder = body.sortOrder ?? 0;

  if (!name) {
    return c.json({ error: "Checkpoint name is required" }, 400);
  }

  if (!code) {
    return c.json({ error: "Checkpoint code is invalid" }, 400);
  }

  const result = await query<CheckpointRow>(
    `INSERT INTO checkpoints (event_id, code, name, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, event_id, code, name, sort_order, created_at`,
    [eventId, code, name, sortOrder],
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Failed to create checkpoint";

    if (message.includes("checkpoints_event_id_code_key")) {
      throw new Error("Checkpoint code already exists for this event");
    }

    throw error;
  });

  const checkpoint = result.rows[0];

  if (!checkpoint) {
    return c.json({ error: "Failed to create checkpoint" }, 500);
  }

  return c.json(
    {
      id: checkpoint.id,
      eventId: checkpoint.event_id,
      code: checkpoint.code,
      name: checkpoint.name,
      sortOrder: checkpoint.sort_order,
      createdAt: toIsoString(checkpoint.created_at),
      attendeeCount: 0,
      checkedInCount: 0,
    },
    201,
  );
});

export default checkpoints;
