import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BASE_URL } from "../constants/config";
import type { AttendeeRecord, EventSummary } from "../types/admin";

type Filter = "all" | "checked_in" | "pending";

interface ErrorResponse {
  error?: string;
}

interface AdminScreenProps {
  onBack: () => void;
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

function isAttendeeRecordArray(payload: unknown): payload is AttendeeRecord[] {
  return (
    Array.isArray(payload) &&
    payload.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.email === "string" &&
        (typeof item.university === "string" || item.university === null) &&
        (typeof item.profileLink === "string" || item.profileLink === null) &&
        typeof item.checkedIn === "boolean" &&
        (typeof item.checkedInAt === "string" || item.checkedInAt === null),
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

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminScreen({ onBack }: AdminScreenProps) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadEvents() {
      setIsLoadingEvents(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`${BASE_URL}/events`);
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(normalizeError(payload));
        }

        if (!isEventSummaryArray(payload)) {
          throw new Error("Invalid events response.");
        }

        if (!isActive) {
          return;
        }

        setEvents(payload);
        setSelectedEventId((current) => current ?? payload[0]?.id ?? null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : "Could not load events.";
        setErrorMessage(message);
      } finally {
        if (isActive) {
          setIsLoadingEvents(false);
        }
      }
    }

    loadEvents();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedEventId) {
      setAttendees([]);
      return;
    }

    let isActive = true;

    async function loadAttendees() {
      setIsLoadingAttendees(true);
      setErrorMessage(null);
      setAttendees([]);

      try {
        const response = await fetch(`${BASE_URL}/attendees/${selectedEventId}`);
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(normalizeError(payload));
        }

        if (!isAttendeeRecordArray(payload)) {
          throw new Error("Invalid attendees response.");
        }

        if (!isActive) {
          return;
        }

        setAttendees(payload);
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : "Could not load attendees.";
        setErrorMessage(message);
      } finally {
        if (isActive) {
          setIsLoadingAttendees(false);
        }
      }
    }

    loadAttendees();

    return () => {
      isActive = false;
    };
  }, [selectedEventId]);

  const checkedInCount = attendees.filter((attendee) => attendee.checkedIn).length;
  const counts = {
    total: attendees.length,
    checkedIn: checkedInCount,
    pending: attendees.length - checkedInCount,
  };

  const filteredAttendees = (() => {
    switch (filter) {
      case "checked_in":
        return attendees.filter((attendee) => attendee.checkedIn);
      case "pending":
        return attendees.filter((attendee) => !attendee.checkedIn);
      default:
        return attendees;
    }
  })();

  const handleOpenProfile = async (profileLink: string | null) => {
    if (!profileLink) {
      return;
    }

    await Linking.openURL(profileLink);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.headerRow}>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonLabel}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Admin List</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Attendee check-in status</Text>
        <Text style={styles.description}>
          Select an event to see who has checked in, who is pending, and each attendee's university and profile link.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{counts.total}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{counts.checkedIn}</Text>
          <Text style={styles.summaryLabel}>Checked in</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{counts.pending}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Events</Text>
        {isLoadingEvents ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#1b4d3e" />
            <Text style={styles.loadingText}>Loading events...</Text>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No events found yet.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventScroller}>
            <View style={styles.eventRow}>
              {events.map((event) => {
                const isSelected = event.id === selectedEventId;

                return (
                  <Pressable
                    key={event.id}
                    style={[styles.eventCard, isSelected ? styles.eventCardSelected : null]}
                    onPress={() => setSelectedEventId(event.id)}
                  >
                    <Text style={[styles.eventName, isSelected ? styles.eventNameSelected : null]}>{event.name}</Text>
                    <Text style={[styles.eventDate, isSelected ? styles.eventDateSelected : null]}>
                      {formatEventDate(event.date)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.filterRow}>
          <Text style={styles.sectionTitle}>Attendees</Text>
          <View style={styles.filterTabs}>
            <Pressable
              style={[styles.filterTab, filter === "all" ? styles.filterTabActive : null]}
              onPress={() => setFilter("all")}
            >
              <Text style={[styles.filterText, filter === "all" ? styles.filterTextActive : null]}>All</Text>
            </Pressable>
            <Pressable
              style={[styles.filterTab, filter === "checked_in" ? styles.filterTabActive : null]}
              onPress={() => setFilter("checked_in")}
            >
              <Text style={[styles.filterText, filter === "checked_in" ? styles.filterTextActive : null]}>Checked in</Text>
            </Pressable>
            <Pressable
              style={[styles.filterTab, filter === "pending" ? styles.filterTabActive : null]}
              onPress={() => setFilter("pending")}
            >
              <Text style={[styles.filterText, filter === "pending" ? styles.filterTextActive : null]}>Pending</Text>
            </Pressable>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {isLoadingAttendees ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#1b4d3e" />
            <Text style={styles.loadingText}>Loading attendees...</Text>
          </View>
        ) : filteredAttendees.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No attendees match this filter.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredAttendees.map((attendee) => (
              <View key={attendee.id} style={styles.attendeeCard}>
                <View style={styles.attendeeHeader}>
                  <View style={styles.attendeeIdentity}>
                    <Text style={styles.attendeeName}>{attendee.name}</Text>
                    <Text style={styles.attendeeEmail}>{attendee.email}</Text>
                  </View>
                  <View style={[styles.statusPill, attendee.checkedIn ? styles.statusCheckedIn : styles.statusPending]}>
                    <Text style={[styles.statusText, attendee.checkedIn ? styles.statusTextCheckedIn : styles.statusTextPending]}>
                      {attendee.checkedIn ? "Checked in" : "Pending"}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaBlock}>
                  <Text style={styles.metaLabel}>University</Text>
                  <Text style={styles.metaValue}>{attendee.university ?? "Not provided"}</Text>
                </View>

                <View style={styles.metaBlock}>
                  <Text style={styles.metaLabel}>Checked in at</Text>
                  <Text style={styles.metaValue}>{formatDateTime(attendee.checkedInAt)}</Text>
                </View>

                <Pressable
                  disabled={!attendee.profileLink}
                  style={[styles.linkButton, !attendee.profileLink ? styles.linkButtonDisabled : null]}
                  onPress={() => handleOpenProfile(attendee.profileLink)}
                >
                  <Text style={styles.linkButtonLabel}>
                    {attendee.profileLink ? "Open profile" : "No profile link"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 18,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  secondaryButton: {
    backgroundColor: "#fffaf3",
    borderColor: "#d8c7aa",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonLabel: {
    color: "#102a1f",
    fontSize: 14,
    fontWeight: "700",
  },
  eyebrow: {
    color: "#7f5539",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  header: {
    gap: 10,
  },
  title: {
    color: "#102a1f",
    fontSize: 30,
    fontWeight: "800",
  },
  description: {
    color: "#4f5d50",
    fontSize: 15,
    lineHeight: 22,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#fffaf3",
    borderRadius: 22,
    gap: 4,
    padding: 16,
  },
  summaryValue: {
    color: "#102a1f",
    fontSize: 26,
    fontWeight: "800",
  },
  summaryLabel: {
    color: "#6f665a",
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: "#102a1f",
    fontSize: 20,
    fontWeight: "800",
  },
  loadingBox: {
    alignItems: "center",
    backgroundColor: "#fffaf3",
    borderRadius: 22,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    padding: 16,
  },
  loadingText: {
    color: "#4f5d50",
    fontSize: 14,
  },
  emptyBox: {
    backgroundColor: "#fffaf3",
    borderRadius: 22,
    padding: 18,
  },
  emptyText: {
    color: "#4f5d50",
    fontSize: 14,
  },
  eventScroller: {
    marginHorizontal: -2,
  },
  eventRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 2,
  },
  eventCard: {
    backgroundColor: "#fffaf3",
    borderColor: "#d8c7aa",
    borderRadius: 22,
    borderWidth: 1,
    gap: 6,
    minWidth: 180,
    padding: 16,
  },
  eventCardSelected: {
    backgroundColor: "#1b4d3e",
    borderColor: "#1b4d3e",
  },
  eventName: {
    color: "#102a1f",
    fontSize: 16,
    fontWeight: "700",
  },
  eventNameSelected: {
    color: "#fff7ed",
  },
  eventDate: {
    color: "#6f665a",
    fontSize: 13,
  },
  eventDateSelected: {
    color: "#d9ebdf",
  },
  filterRow: {
    gap: 10,
  },
  filterTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  filterTab: {
    backgroundColor: "#eadfcd",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterTabActive: {
    backgroundColor: "#1b4d3e",
  },
  filterText: {
    color: "#5d5146",
    fontSize: 13,
    fontWeight: "700",
  },
  filterTextActive: {
    color: "#fff7ed",
  },
  errorBox: {
    backgroundColor: "#fde7e2",
    borderRadius: 18,
    padding: 14,
  },
  errorText: {
    color: "#8a2d1c",
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: 14,
  },
  attendeeCard: {
    backgroundColor: "#fffaf3",
    borderRadius: 24,
    gap: 14,
    padding: 18,
  },
  attendeeHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  attendeeIdentity: {
    flex: 1,
    gap: 4,
  },
  attendeeName: {
    color: "#102a1f",
    fontSize: 18,
    fontWeight: "800",
  },
  attendeeEmail: {
    color: "#5c675f",
    fontSize: 14,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusCheckedIn: {
    backgroundColor: "#dcefe2",
  },
  statusPending: {
    backgroundColor: "#f8e4cf",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusTextCheckedIn: {
    color: "#21573c",
  },
  statusTextPending: {
    color: "#8a4c14",
  },
  metaBlock: {
    gap: 4,
  },
  metaLabel: {
    color: "#7f5539",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#102a1f",
    fontSize: 15,
    lineHeight: 21,
  },
  linkButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#1b4d3e",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  linkButtonDisabled: {
    backgroundColor: "#b7b1a8",
  },
  linkButtonLabel: {
    color: "#fff7ed",
    fontSize: 14,
    fontWeight: "700",
  },
});
