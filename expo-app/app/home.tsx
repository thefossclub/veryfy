import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BASE_URL } from "../constants/config";
import type { CheckpointRecord, EventSummary } from "../types/admin";
import { getLatestCreatedEvent } from "../utils/events";

interface HomeScreenProps {
  onOpenAdmin: () => void;
  onOpenScanner: () => void;
}

interface ErrorResponse {
  error?: string;
}

function normalizeError(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return "Unexpected response from backend.";
  }

  const errorPayload = payload as ErrorResponse;
  return typeof errorPayload.error === "string" ? errorPayload.error : "Unexpected response from backend.";
}

function isEventSummaryArray(payload: unknown): payload is EventSummary[] {
  return (
    Array.isArray(payload) &&
    payload.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.date === "string" &&
        typeof item.createdAt === "string",
    )
  );
}

function isCheckpointRecordArray(payload: unknown): payload is CheckpointRecord[] {
  return (
    Array.isArray(payload) &&
    payload.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.eventId === "string" &&
        typeof item.code === "string" &&
        typeof item.name === "string" &&
        typeof item.sortOrder === "number" &&
        typeof item.createdAt === "string" &&
        typeof item.attendeeCount === "number" &&
        typeof item.checkedInCount === "number",
    )
  );
}

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function getCheckpointState(checkpoint: CheckpointRecord): "done" | "live" | "upcoming" {
  if (checkpoint.attendeeCount > 0 && checkpoint.checkedInCount >= checkpoint.attendeeCount) {
    return "done";
  }

  if (checkpoint.checkedInCount > 0) {
    return "live";
  }

  return "upcoming";
}

export default function HomeScreen({ onOpenAdmin, onOpenScanner }: HomeScreenProps) {
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadHomeData() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const eventsResponse = await fetch(`${BASE_URL}/events`);
        const eventsPayload = (await eventsResponse.json()) as unknown;

        if (!eventsResponse.ok) {
          throw new Error(normalizeError(eventsPayload));
        }

        if (!isEventSummaryArray(eventsPayload)) {
          throw new Error("Invalid events response.");
        }

        const latestEvent = getLatestCreatedEvent(eventsPayload);

        if (!latestEvent) {
          if (!isActive) {
            return;
          }

          setSelectedEvent(null);
          setCheckpoints([]);
          return;
        }

        const checkpointsResponse = await fetch(`${BASE_URL}/checkpoints/${latestEvent.id}`);
        const checkpointsPayload = (await checkpointsResponse.json()) as unknown;

        if (!checkpointsResponse.ok) {
          throw new Error(normalizeError(checkpointsPayload));
        }

        if (!isCheckpointRecordArray(checkpointsPayload)) {
          throw new Error("Invalid checkpoints response.");
        }

        if (!isActive) {
          return;
        }

        setSelectedEvent(latestEvent);
        setCheckpoints(checkpointsPayload);
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : "Could not load event overview.";
        setErrorMessage(message);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadHomeData();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Veryfy Console</Text>
        <Text style={styles.title}>Choose a check-in mode</Text>
        <Text style={styles.description}>
          Use scanner mode for volunteer QR scans. Use admin mode to inspect live attendance and export event reports.
        </Text>
      </View>

      <View style={styles.eventBoard}>
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#1b4d3e" />
            <Text style={styles.loadingText}>Loading event board...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : selectedEvent ? (
          <>
            <View style={styles.eventHeading}>
              <Text style={styles.eventEyebrow}>Live Event</Text>
              <Text style={styles.eventTitle}>{selectedEvent.name}</Text>
              <Text style={styles.eventDate}>{formatEventDate(selectedEvent.date)}</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileRow}>
              {checkpoints.map((checkpoint) => {
                const state = getCheckpointState(checkpoint);

                return (
                  <View
                    key={checkpoint.id}
                    style={[
                      styles.tile,
                      state === "done" ? styles.tileDone : null,
                      state === "live" ? styles.tileLive : null,
                      state === "upcoming" ? styles.tileUpcoming : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tileBadge,
                        state === "done" ? styles.tileBadgeDone : null,
                        state === "live" ? styles.tileBadgeLive : null,
                        state === "upcoming" ? styles.tileBadgeUpcoming : null,
                      ]}
                    >
                      {state === "done" ? "Done" : state === "live" ? "Live" : "Upcoming"}
                    </Text>
                    <Text style={styles.tileTitle}>{checkpoint.name}</Text>
                    <Text style={styles.tileMeta}>
                      {checkpoint.checkedInCount}/{checkpoint.attendeeCount} checked in
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No event loaded</Text>
            <Text style={styles.emptyText}>Create an event and add checkpoints to see the live event board here.</Text>
          </View>
        )}
      </View>

      <View style={styles.cardStack}>
        <Pressable style={[styles.card, styles.primaryCard]} onPress={onOpenScanner}>
          <Text style={[styles.cardEyebrow, styles.primaryCardEyebrow]}>Volunteer</Text>
          <Text style={[styles.cardTitle, styles.primaryCardTitle]}>Scanner</Text>
          <Text style={[styles.cardText, styles.primaryCardText]}>Scan attendee QR codes and record checkpoint entries instantly.</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={onOpenAdmin}>
          <Text style={styles.cardEyebrow}>Organizer</Text>
          <Text style={styles.cardTitle}>Admin list</Text>
          <Text style={styles.cardText}>Browse checkpoints, filter attendees, search metadata, and export attendance CSV.</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f3efe6",
  },
  content: {
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
  },
  header: {
    gap: 12,
  },
  eyebrow: {
    color: "#7f5539",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: "#102a1f",
    fontSize: 32,
    fontWeight: "800",
  },
  description: {
    color: "#4f5d50",
    fontSize: 15,
    lineHeight: 22,
  },
  eventBoard: {
    backgroundColor: "#fffaf3",
    borderColor: "#ddcfb8",
    borderRadius: 34,
    borderWidth: 1,
    gap: 18,
    minHeight: 260,
    padding: 20,
  },
  eventHeading: {
    gap: 6,
  },
  eventEyebrow: {
    color: "#7f5539",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  eventTitle: {
    color: "#102a1f",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 34,
  },
  eventDate: {
    color: "#5b675f",
    fontSize: 15,
    fontWeight: "600",
  },
  tileRow: {
    gap: 12,
    paddingRight: 8,
  },
  tile: {
    borderRadius: 24,
    gap: 10,
    minHeight: 132,
    padding: 16,
    width: 212,
  },
  tileDone: {
    backgroundColor: "#dcefe2",
  },
  tileLive: {
    backgroundColor: "#f8e4cf",
  },
  tileUpcoming: {
    backgroundColor: "#efe4d5",
  },
  tileBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: "uppercase",
  },
  tileBadgeDone: {
    backgroundColor: "#1d6b4b",
    color: "#fff7ed",
  },
  tileBadgeLive: {
    backgroundColor: "#9a6700",
    color: "#fff7ed",
  },
  tileBadgeUpcoming: {
    backgroundColor: "#d7c4a9",
    color: "#5d5146",
  },
  tileTitle: {
    color: "#102a1f",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22,
  },
  tileMeta: {
    color: "#47534a",
    fontSize: 14,
    lineHeight: 20,
  },
  loadingBox: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  loadingText: {
    color: "#4f5d50",
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: "#fde7e2",
    borderRadius: 20,
    padding: 16,
  },
  errorText: {
    color: "#8a2d1c",
    fontSize: 14,
    lineHeight: 20,
  },
  emptyBox: {
    gap: 8,
    justifyContent: "center",
  },
  emptyTitle: {
    color: "#102a1f",
    fontSize: 22,
    fontWeight: "800",
  },
  emptyText: {
    color: "#4f5d50",
    fontSize: 15,
    lineHeight: 22,
  },
  cardStack: {
    gap: 16,
  },
  card: {
    backgroundColor: "#fffaf3",
    borderColor: "#d8c7aa",
    borderRadius: 28,
    borderWidth: 1,
    gap: 8,
    padding: 22,
  },
  primaryCard: {
    backgroundColor: "#1b4d3e",
    borderColor: "#1b4d3e",
  },
  cardEyebrow: {
    color: "#9d6b53",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cardTitle: {
    color: "#102a1f",
    fontSize: 24,
    fontWeight: "800",
  },
  cardText: {
    color: "#4f5d50",
    fontSize: 15,
    lineHeight: 22,
  },
  primaryCardEyebrow: {
    color: "#d5e8dc",
  },
  primaryCardTitle: {
    color: "#fff7ed",
  },
  primaryCardText: {
    color: "#dcefe2",
  },
});
