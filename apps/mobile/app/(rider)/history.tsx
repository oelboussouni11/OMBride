import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fetchRideHistory, type RideResponse } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

const TIME_FILTERS = ["All", "Today", "This Week", "This Month"] as const;
const STATUS_FILTERS = ["All", "Completed", "Cancelled"] as const;

function isToday(d: Date) {
  const now = new Date();
  return d.toDateString() === now.toDateString();
}
function isThisWeek(d: Date) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  return d >= weekAgo;
}
function isThisMonth(d: Date) {
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function RideHistoryScreen() {
  const [rides, setRides] = useState<RideResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<typeof TIME_FILTERS[number]>("All");
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]>("All");

  function loadRides() {
    setLoading(true);
    fetchRideHistory().then(setRides).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { loadRides(); }, []);

  const filtered = useMemo(() => {
    return rides.filter((r) => {
      const d = new Date(r.created_at);
      if (timeFilter === "Today" && !isToday(d)) return false;
      if (timeFilter === "This Week" && !isThisWeek(d)) return false;
      if (timeFilter === "This Month" && !isThisMonth(d)) return false;
      if (statusFilter === "Completed" && r.status !== "completed") return false;
      if (statusFilter === "Cancelled" && r.status !== "cancelled") return false;
      return true;
    });
  }, [rides, timeFilter, statusFilter]);

  const completedCount = filtered.filter((r) => r.status === "completed").length;
  const cancelledCount = filtered.filter((r) => r.status === "cancelled").length;
  const totalSpent = filtered
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
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return <View style={st.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={st.container} edges={["bottom"]}>
      {rides.length === 0 ? (
        <View style={st.center}>
          <View style={st.emptyIcon}><Ionicons name="receipt-outline" size={32} color={colors.textMuted} /></View>
          <Text style={st.emptyTitle}>No rides yet</Text>
          <Text style={st.emptySubtext}>Your ride history will appear here</Text>
          <Pressable style={st.refreshBtn} onPress={loadRides}>
            <Ionicons name="refresh-outline" size={16} color={colors.text} />
            <Text style={st.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          onRefresh={loadRides}
          refreshing={loading}
          data={filtered}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View>
              {/* Time filters */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filterScroll}>
                {TIME_FILTERS.map((f) => (
                  <Pressable key={f} style={[st.filterChip, timeFilter === f && st.filterChipActive]} onPress={() => setTimeFilter(f)}>
                    <Text style={[st.filterChipText, timeFilter === f && st.filterChipTextActive]}>{f}</Text>
                  </Pressable>
                ))}
                <View style={st.filterDivider} />
                {STATUS_FILTERS.map((f) => (
                  <Pressable key={f} style={[st.filterChip, statusFilter === f && st.filterChipActive]} onPress={() => setStatusFilter(f)}>
                    <Text style={[st.filterChipText, statusFilter === f && st.filterChipTextActive]}>{f}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {/* Stats */}
              <View style={st.statsRow}>
                <View style={st.statCard}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                  <Text style={st.statValue}>{completedCount}</Text>
                  <Text style={st.statLabel}>Rides</Text>
                </View>
                <View style={st.statCard}>
                  <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                  <Text style={st.statValue}>{cancelledCount}</Text>
                  <Text style={st.statLabel}>Cancelled</Text>
                </View>
                <View style={st.statCard}>
                  <Ionicons name="cash-outline" size={18} color={colors.primary} />
                  <Text style={st.statValue}>{totalSpent.toFixed(0)}</Text>
                  <Text style={st.statLabel}>Total (DH)</Text>
                </View>
              </View>
              <Text style={st.resultCount}>{filtered.length} ride{filtered.length !== 1 ? "s" : ""}</Text>
            </View>
          }
          contentContainerStyle={{ padding: spacing.md }}
          ListEmptyComponent={
            <View style={st.noResults}>
              <Ionicons name="search-outline" size={24} color={colors.textMuted} />
              <Text style={st.noResultsText}>No rides match this filter</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={st.rideCard}>
              <View style={st.rideHeader}>
                <View style={[st.statusBadge, { backgroundColor: statusColor(item.status) + "15" }]}>
                  <Ionicons name={statusIcon(item.status)} size={14} color={statusColor(item.status)} />
                  <Text style={[st.statusText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
                </View>
                {item.fare != null && <Text style={st.rideFare}>{item.fare.toFixed(2)} DH</Text>}
              </View>
              <View style={st.routeWrap}>
                <View style={st.routeDots}>
                  <View style={[st.routeDot, { backgroundColor: colors.success }]} />
                  <View style={st.routeLine} />
                  <View style={[st.routeDot, { backgroundColor: colors.danger }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.routeAddr} numberOfLines={1}>{item.pickup_address}</Text>
                  <Text style={[st.routeAddr, { marginTop: spacing.sm }]} numberOfLines={1}>{item.dropoff_address}</Text>
                </View>
              </View>
              <View style={st.rideFooter}>
                <View style={st.footerItem}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                  <Text style={st.rideMeta}>{formatDate(item.created_at)}</Text>
                </View>
                {item.distance_km ? <View style={st.footerItem}><Ionicons name="speedometer-outline" size={12} color={colors.textMuted} /><Text style={st.rideMeta}>{item.distance_km} km</Text></View> : null}
                {item.duration_min ? <View style={st.footerItem}><Ionicons name="time-outline" size={12} color={colors.textMuted} /><Text style={st.rideMeta}>{item.duration_min} min</Text></View> : null}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  emptySubtext: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: spacing.lg },
  refreshBtnText: { fontSize: 14, fontWeight: "600", color: colors.text },
  filterScroll: { marginBottom: spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surface, marginRight: spacing.sm },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  filterChipTextActive: { color: colors.white },
  filterDivider: { width: 1, height: 24, backgroundColor: colors.border, marginRight: spacing.sm, alignSelf: "center" },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm + 2, alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted },
  resultCount: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  noResults: { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  noResultsText: { fontSize: 14, color: colors.textMuted },
  rideCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  rideHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  rideFare: { fontSize: 18, fontWeight: "800", color: colors.text },
  routeWrap: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  routeDots: { alignItems: "center", width: 12, paddingTop: 4 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  routeAddr: { fontSize: 14, color: colors.textSecondary },
  rideFooter: { flexDirection: "row", gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  rideMeta: { fontSize: 12, color: colors.textMuted },
});
