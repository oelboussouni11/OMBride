import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fetchRideHistory, type RideResponse } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

export default function RideHistoryScreen() {
  const [rides, setRides] = useState<RideResponse[]>([]);
  const [loading, setLoading] = useState(true);

  function loadRides() {
    setLoading(true);
    fetchRideHistory()
      .then((data) => { setRides(data); })
      .catch((err) => { console.log("History error:", err); })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRides();
  }, []);

  function statusColor(status: string) {
    if (status === "completed") return colors.success;
    if (status === "cancelled") return colors.danger;
    return colors.warning;
  }

  function statusLabel(status: string) {
    if (status === "completed") return "Completed";
    if (status === "cancelled") return "Cancelled";
    if (status === "in_progress") return "In Progress";
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {rides.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No rides yet</Text>
          <Text style={styles.emptySubtext}>Your ride history will appear here</Text>
          <Pressable style={styles.refreshBtn} onPress={loadRides}>
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          onRefresh={loadRides}
          refreshing={loading}
          data={rides}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.rideCard}>
              <View style={styles.rideHeader}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + "20" }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                    {statusLabel(item.status)}
                  </Text>
                </View>
                {item.fare != null && (
                  <Text style={styles.rideFare}>{item.fare.toFixed(2)} DH</Text>
                )}
              </View>
              <View style={styles.routeWrap}>
                <View style={styles.routeDots}>
                  <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
                  <View style={styles.routeLine} />
                  <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeAddr} numberOfLines={1}>{item.pickup_address}</Text>
                  <Text style={[styles.routeAddr, { marginTop: spacing.sm }]} numberOfLines={1}>{item.dropoff_address}</Text>
                </View>
              </View>
              <View style={styles.rideFooter}>
                <Text style={styles.rideDate}>{formatDate(item.created_at)}</Text>
                {item.distance_km ? <Text style={styles.rideMeta}>{item.distance_km} km</Text> : null}
                {item.duration_min ? <Text style={styles.rideMeta}>{item.duration_min} min</Text> : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  emptySubtext: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  refreshBtn: {
    marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: spacing.lg,
  },
  refreshBtnText: { fontSize: 14, fontWeight: "600", color: colors.text },
  rideCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  rideHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 3,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "600" },
  rideFare: { fontSize: 18, fontWeight: "800", color: colors.text },
  routeWrap: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  routeDots: { alignItems: "center", width: 12, paddingTop: 3 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  routeAddr: { fontSize: 14, color: colors.textSecondary },
  rideFooter: { flexDirection: "row", gap: spacing.md },
  rideDate: { fontSize: 12, color: colors.textMuted },
  rideMeta: { fontSize: 12, color: colors.textMuted },
});
