import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import attendees from "./routes/attendees";
import checkin from "./routes/checkin";
import events from "./routes/events";
import qr from "./routes/qr";
import { bootstrapAttendeesFromCsv } from "./services/bootstrap";

const app = new Hono();

app.get("/", (c) => c.json({ status: "ok", service: "event-checkin" }));

app.route("/events", events);
app.route("/attendees", attendees);
app.route("/checkin", checkin);
app.route("/qr", qr);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  if (error instanceof SyntaxError) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  const status = message === "Event not found" ? 404 : 500;

  if (status === 500) {
    console.error(error);
  }

  return c.json({ error: message }, status);
});

const port = Number(Bun.env.PORT ?? "3000");

void bootstrapAttendeesFromCsv().catch((error) => {
  console.error("[bootstrap] failed to import attendees.csv", error);
});

export { app };

export default {
  port,
  fetch: app.fetch,
};
