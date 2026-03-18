import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function RoleSelectScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How will you use OMBdrive?</Text>
      <Text style={styles.subtitle}>You can always change this later</Text>

      <Pressable
        style={styles.card}
        onPress={() => router.push("/(auth)/register?role=rider")}
      >
        <Text style={styles.cardTitle}>Rider</Text>
        <Text style={styles.cardDescription}>
          Request rides and get where you need to go
        </Text>
      </Pressable>

      <Pressable
        style={styles.card}
        onPress={() => router.push("/(auth)/register?role=driver")}
      >
        <Text style={styles.cardTitle}>Driver</Text>
        <Text style={styles.cardDescription}>
          Earn money by giving rides in your area
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    color: "#111",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 40,
    color: "#666",
  },
  card: {
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: "#666",
  },
});
