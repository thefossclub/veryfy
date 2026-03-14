import { Pressable, StyleSheet, Text, View } from "react-native";

interface HomeScreenProps {
  onOpenAdmin: () => void;
  onOpenScanner: () => void;
}

export default function HomeScreen({ onOpenAdmin, onOpenScanner }: HomeScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Veryfy Console</Text>
        <Text style={styles.title}>Choose a check-in mode</Text>
        <Text style={styles.description}>
          Use scanner mode for volunteer QR scans. Use admin mode to see who checked in, who is pending, and each attendee's profile details.
        </Text>
      </View>

      <View style={styles.cardStack}>
        <Pressable style={[styles.card, styles.primaryCard]} onPress={onOpenScanner}>
          <Text style={[styles.cardEyebrow, styles.primaryCardEyebrow]}>Volunteer</Text>
          <Text style={[styles.cardTitle, styles.primaryCardTitle]}>Scanner</Text>
          <Text style={[styles.cardText, styles.primaryCardText]}>Scan attendee QR codes and record check-ins instantly.</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={onOpenAdmin}>
          <Text style={styles.cardEyebrow}>Organizer</Text>
          <Text style={styles.cardTitle}>Admin list</Text>
          <Text style={styles.cardText}>Browse events, filter checked-in attendees, and open profile links.</Text>
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
