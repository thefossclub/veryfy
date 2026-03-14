import type { QueryResultRow } from "pg";

import { withTransaction } from "../db";
import { importAttendeesForEvent } from "./attendee-import";
import { parseCSV } from "./csv";

interface EventRow extends QueryResultRow {
  id: string;
}

function isAutoImportEnabled(): boolean {
  const value = Bun.env.AUTO_IMPORT_ATTENDEES_CSV?.trim().toLowerCase();

  if (!value) {
    return true;
  }

  return value !== "false" && value !== "0" && value !== "no";
}

function getDefaultEventName(): string {
  const eventName = Bun.env.AUTO_IMPORT_EVENT_NAME?.trim();
  return eventName || "CSV Imported Event";
}

function getDefaultEventDate(): string {
  const eventDate = Bun.env.AUTO_IMPORT_EVENT_DATE?.trim();
  return eventDate || new Date().toISOString().slice(0, 10);
}

export async function bootstrapAttendeesFromCsv(): Promise<void> {
  if (!isAutoImportEnabled()) {
    return;
  }

  const csvFile = Bun.file(new URL("../../../attendees.csv", import.meta.url));

  if (!(await csvFile.exists())) {
    return;
  }

  const csvBuffer = Buffer.from(await csvFile.arrayBuffer());
  const rows = parseCSV(csvBuffer);

  if (rows.length === 0) {
    console.log("[bootstrap] attendees.csv is empty, skipping import");
    return;
  }

  const eventName = getDefaultEventName();
  const eventDate = getDefaultEventDate();

  const result = await withTransaction(async (client) => {
    const existingEvent = await client.query<EventRow>(
      `SELECT id
       FROM events
       WHERE name = $1 AND date = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [eventName, eventDate],
    );

    const eventId =
      existingEvent.rows[0]?.id ??
      (
        await client.query<EventRow>(
          `INSERT INTO events (name, date)
           VALUES ($1, $2)
           RETURNING id`,
          [eventName, eventDate],
        )
      ).rows[0]?.id;

    if (!eventId) {
      throw new Error("Failed to create bootstrap event");
    }

    return importAttendeesForEvent({ client, eventId, rows });
  });

  console.log(
    `[bootstrap] attendees.csv synced to "${eventName}" (${eventDate}): imported=${result.imported}, skipped=${result.skipped}`,
  );
}
