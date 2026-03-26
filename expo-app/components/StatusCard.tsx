import { StyleSheet, Text, View } from "react-native";

import type { CheckinStatus } from "../types/checkin";

interface StatusCardProps {
  status: CheckinStatus;
  name?: string;
  checkedInAt?: string;
  event?: string;
  checkpoint?: string;
  message?: string;
}

interface Tone {
  accent: string;
  background: string;
  icon: string;
  title: string;
}

function getTone(status: CheckinStatus): Tone {
  switch (status) {
    case "ok":
      return {
        accent: "#1d6b4b",
        background: "#ecfdf3",
        icon: "✓",
        title: "Checked in successfully",
      };
    case "already_checked_in":
      return {
        accent: "#9a6700",
        background: "#fff8db",
        icon: "⚠",
        title: "Already checked in",
      };
    case "invalid_token":
      return {
        accent: "#b42318",
        background: "#fef3f2",
        icon: "✗",
        title: "Invalid QR",
      };
  }
}

function formatTimestamp(value?: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function StatusCard({
  checkedInAt,
  checkpoint,
  event,
  message,
  name,
  status,
}: StatusCardProps) {
  const tone = getTone(status);
  const formattedTimestamp = formatTimestamp(checkedInAt);

  return (
    <View style={[styles.card, { backgroundColor: tone.background, borderColor: tone.accent }]}>
      <View style={[styles.badge, { backgroundColor: tone.accent }]}>
        <Text style={styles.badgeText}>{tone.icon}</Text>
      </View>
      <Text style={[styles.title, { color: tone.accent }]}>{tone.title}</Text>
      {name ? <Text style={styles.name}>{name}</Text> : null}
      {event ? <Text style={styles.meta}>Event: {event}</Text> : null}
      {checkpoint ? <Text style={styles.meta}>Checkpoint: {checkpoint}</Text> : null}
      {formattedTimestamp ? <Text style={styles.meta}>Timestamp: {formattedTimestamp}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 2,
    marginVertical: 28,
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  badge: {
    alignItems: "center",
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    marginBottom: 18,
    width: 56,
  },
  badgeText: {
    color: "#fffdf8",
    fontSize: 28,
    fontWeight: "900",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 10,
  },
  name: {
    color: "#102a1f",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  meta: {
    color: "#4f5d50",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  message: {
    color: "#4f5d50",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
});
