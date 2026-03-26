import { Pressable, StyleSheet, Text, View } from "react-native";

import StatusCard from "../components/StatusCard";
import type { CheckinResponse } from "../types/checkin";

interface ResultScreenProps {
  onDone: () => void;
  result: CheckinResponse;
  onScanAgain: () => void;
}

function getHeading(status: CheckinResponse["status"]): string {
  switch (status) {
    case "ok":
      return "Check-in recorded";
    case "already_checked_in":
      return "Guest already checked in";
    case "invalid_token":
      return "Scan failed";
  }
}

export default function ResultScreen({ onDone, result, onScanAgain }: ResultScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Scan Result</Text>
        <Text style={styles.title}>{getHeading(result.status)}</Text>
      </View>

      <StatusCard
        checkedInAt={result.checkedInAt}
        checkpoint={result.checkpoint}
        event={result.event}
        message={result.message}
        name={result.name}
        status={result.status}
      />

      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={onScanAgain}>
          <Text style={styles.buttonLabel}>Scan next attendee</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onDone}>
          <Text style={styles.secondaryButtonLabel}>Back to modes</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f3efe6",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
  },
  header: {
    gap: 10,
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
  button: {
    alignItems: "center",
    backgroundColor: "#1b4d3e",
    borderRadius: 999,
    paddingVertical: 16,
  },
  buttonLabel: {
    color: "#fff7ed",
    fontSize: 16,
    fontWeight: "700",
  },
  actions: {
    gap: 12,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#fff7ed",
    borderColor: "#d8c7aa",
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 16,
  },
  secondaryButtonLabel: {
    color: "#102a1f",
    fontSize: 16,
    fontWeight: "700",
  },
});
