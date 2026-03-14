import { Hono } from "hono";
import type { QueryResultRow } from "pg";

import { query } from "../db";

interface CreateEventBody {
  name: string;
  date: string;
}

interface EventRow extends QueryResultRow {
  id: string;
  name: string;
  date: string;
  created_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isCreateEventBody(value: unknown): value is CreateEventBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeBody = value as Record<string, unknown>;
  return typeof maybeBody.name === "string" && typeof maybeBody.date === "string";
}

function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
}

const events = new Hono();

events.get("/", async (c) => {
  const result = await query<EventRow>(
    `SELECT id, name, date::text, created_at
     FROM events
     ORDER BY date DESC, created_at DESC`,
  );

  return c.json(
    result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      date: row.date,
      createdAt: toIsoString(row.created_at),
    })),
  );
});

events.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);

  if (!isCreateEventBody(body)) {
    return c.json({ error: "Body must include name and date" }, 400);
  }

  const name = body.name.trim();
  const date = body.date.trim();

  if (!name) {
    return c.json({ error: "Event name is required" }, 400);
  }

  if (!isIsoDate(date)) {
    return c.json({ error: "Date must be in YYYY-MM-DD format" }, 400);
  }

  const result = await query<EventRow>(
    `INSERT INTO events (name, date)
     VALUES ($1, $2)
     RETURNING id, name, date::text, created_at`,
    [name, date],
  );

  const event = result.rows[0];

  if (!event) {
    return c.json({ error: "Failed to create event" }, 500);
  }

  return c.json(
    {
      id: event.id,
      name: event.name,
      date: event.date,
      createdAt: toIsoString(event.created_at),
    },
    201,
  );
});

export default events;
