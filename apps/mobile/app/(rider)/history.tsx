import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fetchRideHistory, type RideResponse } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

export default function RideHistoryScreen() {
  const [rides, setRides] = useState<RideResponse[]>([]);
  const [loading, setLoading] = useState(true);

  function loadRides() {
    setLoading(true);
    fetchRideHistory()
      .then((data) => setRides(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadRides(); }, []);

  const completedCount = rides.filter((r) => r.status === "completed").length;
  const cancelledCount = rides.filter((r) => r.status === "cancelled").length;
  const totalSpent = rides
    .filter((r) => r.status === "completed" && r.fare)
    .reduce((sum, r) => sum + (r.fare || 0), 0);

  function statusIcon(status: string): keyof typeof Ionicons.glyphMap {
    if (status === "completed") return "checkmark-circle";
    if (status === "cancelled") return "close-circle";
    if (status === "in_progress") return "car";
    return "time";
  }

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
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {rides.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No rides yet</Text>
          <Text style={styles.emptySubtext}>Your ride history will appear here</Text>
          <Pressable style={styles.refreshBtn} onPress={loadRides}>
            <Ionicons name="refresh-outline" size={16} color={colors.text} />
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          onRefresh={loadRides}
          refreshing={loading}
          data={rides}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                <Text style={styles.statValue}>{completedCount}</Text>
                <Text style={styles.statLabel}>Rides</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                <Text style={styles.statValue}>{cancelledCount}</Text>
                <Text style={styles.statLabel}>Cancelled</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="cash-outline" size={18} color={colors.primary} />
                <Text style={styles.statValue}>{totalSpent.toFixed(0)}</Text>
                <Text style={styles.statLabel}>Total (DH)</Text>
              </View>
            </View>
          }
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.rideCard}>
              <View style={styles.rideHeader}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + "15" }]}>
                  <Ionicons name={statusIcon(item.status)} size={14} color={statusColor(item.status)} />
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
                <View style={styles.footerItem}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.rideDate}>{formatDate(item.created_at)}</Text>
                </View>
                {item.distance_km ? (
                  <View style={styles.footerItem}>
                    <Ionicons name="speedometer-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.rideMeta}>{item.distance_km} km</Text>
                  </View>
                ) : null}
                {item.duration_min ? (
                  <View style={styles.footerItem}>
                    <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.rideMeta}>{item.duration_min} min</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.surface, justifyContent: "center", alignItems: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  emptySubtext: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  refreshBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: spacing.lg,
  },
  refreshBtnText: { fontSize: 14, fontWeight: "600", color: colors.text },
  statsRow: {
    flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md,
  },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.sm + 2, alignItems: "center", gap: 2,
  },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted },
  rideCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  rideHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 4,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  rideFare: { fontSize: 18, fontWeight: "800", color: colors.text },
  routeWrap: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  routeDots: { alignItems: "center", width: 12, paddingTop: 4 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  routeAddr: { fontSize: 14, color: colors.textSecondary },
  rideFooter: {
    flexDirection: "row", gap: spacing.md,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  rideDate: { fontSize: 12, color: colors.textMuted },
  rideMeta: { fontSize: 12, color: colors.textMuted },
});
