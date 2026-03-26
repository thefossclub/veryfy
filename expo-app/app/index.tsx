import { CameraView, type BarcodeScanningResult, useCameraPermissions } from "expo-camera";
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
import type { CheckinResponse } from "../types/checkin";
import { getLatestCreatedEvent } from "../utils/events";

interface ScanScreenProps {
  onBack: () => void;
  onResult: (result: CheckinResponse) => void;
}

interface ErrorResponse {
  error?: string;
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

function isQrPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.attendee_id === "string" &&
    typeof payload.event_id === "string" &&
    typeof payload.hmac === "string"
  );
}

function normalizeError(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return "Unexpected response from backend.";
  }

  const errorPayload = payload as ErrorResponse;
  return typeof errorPayload.error === "string" ? errorPayload.error : "Unexpected response from backend.";
}

function isCheckinResponse(payload: unknown): payload is CheckinResponse {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const response = payload as Record<string, unknown>;
  return (
    response.status === "ok" ||
    response.status === "already_checked_in" ||
    response.status === "invalid_token"
  );
}

export default function ScanScreen({ onBack, onResult }: ScanScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isLoadingSetup, setIsLoadingSetup] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadEvents() {
      setIsLoadingSetup(true);
      setSetupError(null);

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

        const latestEvent = getLatestCreatedEvent(payload);

        setEvents(payload);
        setSelectedEventId((current) => current ?? latestEvent?.id ?? null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : "Could not load events.";
        setSetupError(message);
      } finally {
        if (isActive) {
          setIsLoadingSetup(false);
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
      setCheckpoints([]);
      setSelectedCheckpointId(null);
      return;
    }

    let isActive = true;

    async function loadCheckpoints() {
      setSetupError(null);

      try {
        const response = await fetch(`${BASE_URL}/checkpoints/${selectedEventId}`);
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(normalizeError(payload));
        }

        if (!isCheckpointRecordArray(payload)) {
          throw new Error("Invalid checkpoints response.");
        }

        if (!isActive) {
          return;
        }

        setCheckpoints(payload);
        setSelectedCheckpointId((current) => {
          if (current && payload.some((checkpoint) => checkpoint.id === current)) {
            return current;
          }

          return payload[0]?.id ?? null;
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : "Could not load checkpoints.";
        setSetupError(message);
      }
    }

    loadCheckpoints();

    return () => {
      isActive = false;
    };
  }, [selectedEventId]);

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (isSubmitting) {
      return;
    }

    if (!selectedCheckpointId) {
      onResult({
        status: "invalid_token",
        message: "Select a checkpoint before scanning.",
      });
      return;
    }

    setIsSubmitting(true);

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(data) as unknown;
    } catch {
      onResult({
        status: "invalid_token",
        message: "Invalid QR payload. Expected signed JSON.",
      });
      return;
    }

    if (!isQrPayload(parsedPayload)) {
      onResult({
        status: "invalid_token",
        message: "QR code is missing required attendee fields.",
      });
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ checkpointId: selectedCheckpointId, token: data }),
      });

      const payload = (await response.json()) as unknown;

      if (isCheckinResponse(payload)) {
        onResult(payload);
        return;
      }

      onResult({
        status: "invalid_token",
        message: normalizeError(payload),
      });
    } catch {
      onResult({
        status: "invalid_token",
        message: "Could not reach the backend. Check BASE_URL and local network access.",
      });
    }
  };

  if (!permission) {
    return (
      <View style={styles.centeredPanel}>
        <ActivityIndicator size="large" color="#1b4d3e" />
        <Text style={styles.panelTitle}>Checking camera permission</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centeredPanel}>
        <Text style={styles.eyebrow}>Camera access required</Text>
        <Text style={styles.panelTitle}>This device needs camera permission to scan attendee QR codes.</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonLabel}>Enable camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonLabel}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Event Check-In</Text>
        <Text style={styles.title}>Scan attendee badge</Text>
        <Text style={styles.description}>
          Select the event and checkpoint first, then point the camera at an attendee QR. One attendee QR now works across multiple checkpoints.
        </Text>
      </View>

      {isLoadingSetup ? (
        <View style={styles.setupBox}>
          <ActivityIndicator size="small" color="#1b4d3e" />
          <Text style={styles.setupText}>Loading events and checkpoints...</Text>
        </View>
      ) : null}

      {setupError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{setupError}</Text>
        </View>
      ) : null}

      {events.length > 0 ? (
        <View style={styles.selectorSection}>
          <Text style={styles.selectorTitle}>Event</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroller}>
            <View style={styles.selectorRow}>
              {events.map((event) => {
                const isSelected = event.id === selectedEventId;

                return (
                  <Pressable
                    key={event.id}
                    style={[styles.selectorChip, isSelected ? styles.selectorChipActive : null]}
                    onPress={() => setSelectedEventId(event.id)}
                  >
                    <Text style={[styles.selectorChipText, isSelected ? styles.selectorChipTextActive : null]}>
                      {event.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {checkpoints.length > 0 ? (
        <View style={styles.selectorSection}>
          <Text style={styles.selectorTitle}>Checkpoint</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroller}>
            <View style={styles.selectorRow}>
              {checkpoints.map((checkpoint) => {
                const isSelected = checkpoint.id === selectedCheckpointId;

                return (
                  <Pressable
                    key={checkpoint.id}
                    style={[styles.selectorChip, isSelected ? styles.selectorChipActive : null]}
                    onPress={() => setSelectedCheckpointId(checkpoint.id)}
                  >
                    <Text style={[styles.selectorChipText, isSelected ? styles.selectorChipTextActive : null]}>
                      {checkpoint.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.cameraShell}>
        <CameraView
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          facing="back"
          onBarcodeScanned={isSubmitting ? undefined : handleBarcodeScanned}
          style={styles.camera}
        />
        <View pointerEvents="none" style={styles.scanFrame} />
        {isSubmitting ? (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#fff7ed" />
            <Text style={styles.overlayText}>Checking in attendee...</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.tipBox}>
        <Text style={styles.tipTitle}>Setup reminder</Text>
        <Text style={styles.tipText}>
          `BASE_URL` should point to your hosted backend, for example `https://veryfy-backend.onrender.com`.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f3efe6",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  header: {
    gap: 10,
    marginBottom: 20,
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#fff7ed",
    borderColor: "#d8c7aa",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonLabel: {
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
  setupBox: {
    alignItems: "center",
    backgroundColor: "#fff7ed",
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginBottom: 16,
    padding: 14,
  },
  setupText: {
    color: "#4f5d50",
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: "#fde7e2",
    borderRadius: 18,
    marginBottom: 16,
    padding: 14,
  },
  errorText: {
    color: "#8a2d1c",
    fontSize: 14,
    lineHeight: 20,
  },
  selectorSection: {
    gap: 8,
    marginBottom: 14,
  },
  selectorTitle: {
    color: "#102a1f",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  selectorScroller: {
    marginHorizontal: -2,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 2,
  },
  selectorChip: {
    backgroundColor: "#eadfcd",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectorChipActive: {
    backgroundColor: "#1b4d3e",
  },
  selectorChipText: {
    color: "#5d5146",
    fontSize: 13,
    fontWeight: "700",
  },
  selectorChipTextActive: {
    color: "#fff7ed",
  },
  cameraShell: {
    flex: 1,
    minHeight: 360,
    backgroundColor: "#102a1f",
    borderRadius: 28,
    overflow: "hidden",
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  scanFrame: {
    position: "absolute",
    top: "24%",
    left: "13%",
    right: "13%",
    bottom: "24%",
    borderColor: "#fff7ed",
    borderRadius: 28,
    borderWidth: 3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(16, 42, 31, 0.72)",
    gap: 12,
    justifyContent: "center",
  },
  overlayText: {
    color: "#fff7ed",
    fontSize: 16,
    fontWeight: "700",
  },
  tipBox: {
    backgroundColor: "#fff7ed",
    borderRadius: 18,
    marginTop: 18,
    padding: 16,
  },
  tipTitle: {
    color: "#102a1f",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  tipText: {
    color: "#5f6b61",
    fontSize: 14,
    lineHeight: 20,
  },
  centeredPanel: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#f3efe6",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  panelTitle: {
    color: "#102a1f",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#1b4d3e",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonLabel: {
    color: "#fff7ed",
    fontSize: 15,
    fontWeight: "700",
  },
});
