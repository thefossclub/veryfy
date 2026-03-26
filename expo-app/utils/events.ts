import type { EventSummary } from "../types/admin";

export function getLatestCreatedEvent(events: EventSummary[]): EventSummary | null {
  let latest: EventSummary | null = null;

  for (const event of events) {
    if (!latest || new Date(event.createdAt).getTime() > new Date(latest.createdAt).getTime()) {
      latest = event;
    }
  }

  return latest;
}
