import { useState, useEffect, useMemo } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fetchRideHistory, type RideResponse } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

const TIME_FILTERS = ["All", "Today", "Week", "Month"] as const;
const STATUS_FILTERS = ["All", "Completed", "Cancelled"] as const;

function isToday(d: Date) { return d.toDateString() === new Date().toDateString(); }
function isThisWeek(d: Date) { return d >= new Date(Date.now() - 7 * 86400000); }
function isThisMonth(d: Date) { const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }

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

  const filtered = useMemo(() => rides.filter((r) => {
    const d = new Date(r.created_at);
    if (timeFilter === "Today" && !isToday(d)) return false;
    if (timeFilter === "Week" && !isThisWeek(d)) return false;
    if (timeFilter === "Month" && !isThisMonth(d)) return false;
    if (statusFilter === "Completed" && r.status !== "completed") return false;
    if (statusFilter === "Cancelled" && r.status !== "cancelled") return false;
    return true;
  }), [rides, timeFilter, statusFilter]);

  const stats = useMemo(() => ({
    completed: filtered.filter((r) => r.status === "completed").length,
    cancelled: filtered.filter((r) => r.status === "cancelled").length,
    spent: filtered.filter((r) => r.status === "completed" && r.fare).reduce((s, r) => s + (r.fare || 0), 0),
  }), [filtered]);

  function sColor(status: string) { return status === "completed" ? colors.success : status === "cancelled" ? colors.danger : colors.warning; }
  function sIcon(status: string): keyof typeof Ionicons.glyphMap { return status === "completed" ? "checkmark-circle" : status === "cancelled" ? "close-circle" : "time"; }
  function sLabel(status: string) { return status === "completed" ? "Completed" : status === "cancelled" ? "Cancelled" : status.replace("_", " "); }
  function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      {rides.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyCircle}><Ionicons name="receipt-outline" size={28} color={colors.textMuted} /></View>
          <Text style={s.emptyTitle}>No rides yet</Text>
          <Text style={s.emptySub}>Your ride history will appear here</Text>
          <Pressable style={s.emptyBtn} onPress={loadRides}><Ionicons name="refresh" size={14} color={colors.primary} /><Text style={s.emptyBtnText}>Refresh</Text></Pressable>
        </View>
      ) : (
        <FlatList
          onRefresh={loadRides} refreshing={loading}
          data={filtered} keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}
          ListHeaderComponent={
            <>
              {/* Summary card */}
              <View style={s.summaryCard}>
                <View style={s.summaryRow}>
                  <View style={s.summaryItem}>
                    <Text style={s.summaryNum}>{stats.completed}</Text>
                    <Text style={s.summaryLabel}>rides</Text>
                  </View>
                  <View style={s.summaryDivider} />
                  <View style={s.summaryItem}>
                    <Text style={s.summaryNum}>{stats.cancelled}</Text>
                    <Text style={s.summaryLabel}>cancelled</Text>
                  </View>
                  <View style={s.summaryDivider} />
                  <View style={s.summaryItem}>
                    <Text style={s.summaryNum}>{stats.spent.toFixed(0)}</Text>
                    <Text style={s.summaryLabel}>DH spent</Text>
                  </View>
                </View>
              </View>
              {/* Filters */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
                {TIME_FILTERS.map((f) => (
                  <Pressable key={f} onPress={() => setTimeFilter(f)} style={[s.chip, timeFilter === f && s.chipOn]}>
                    <Text style={[s.chipText, timeFilter === f && s.chipTextOn]}>{f}</Text>
                  </Pressable>
                ))}
                <View style={s.chipSep} />
                {STATUS_FILTERS.map((f) => (
                  <Pressable key={f} onPress={() => setStatusFilter(f)} style={[s.chip, statusFilter === f && s.chipOn]}>
                    <Text style={[s.chipText, statusFilter === f && s.chipTextOn]}>{f}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {filtered.length > 0 && <Text style={s.count}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</Text>}
            </>
          }
          ListEmptyComponent={<View style={s.noRes}><Ionicons name="filter-outline" size={20} color={colors.textMuted} /><Text style={s.noResText}>No rides match</Text></View>}
          renderItem={({ item }) => (
            <View style={s.card}>
              {/* Top: status + fare */}
              <View style={s.cardTop}>
                <View style={[s.badge, { backgroundColor: sColor(item.status) + "12" }]}>
                  <Ionicons name={sIcon(item.status)} size={13} color={sColor(item.status)} />
                  <Text style={[s.badgeText, { color: sColor(item.status) }]}>{sLabel(item.status)}</Text>
                </View>
                {item.fare != null && <Text style={s.fare}>{item.fare.toFixed(2)} DH</Text>}
              </View>
              {/* Route */}
              <View style={s.route}>
                <View style={s.dots}><View style={[s.dot, { backgroundColor: colors.success }]} /><View style={s.line} /><View style={[s.dot, { backgroundColor: colors.danger }]} /></View>
                <View style={s.addrs}>
                  <Text style={s.addr} numberOfLines={1}>{item.pickup_address}</Text>
                  <Text style={s.addr} numberOfLines={1}>{item.dropoff_address}</Text>
                </View>
              </View>
              {/* Bottom */}
              <View style={s.cardBot}>
                <Text style={s.meta}>{fmtDate(item.created_at)}</Text>
                {item.distance_km ? <Text style={s.meta}>{item.distance_km} km</Text> : null}
                {item.duration_min ? <Text style={s.meta}>{item.duration_min} min</Text> : null}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  emptyCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingVertical: 8, paddingHorizontal: 20, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary },
  emptyBtnText: { fontSize: 14, fontWeight: "600", color: colors.primary },
  // Summary
  summaryCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, marginBottom: spacing.md },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryNum: { fontSize: 22, fontWeight: "800", color: colors.white },
  summaryLabel: { fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  summaryDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.15)" },
  // Filters
  filterRow: { marginBottom: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.white, marginRight: 6, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  chipTextOn: { color: colors.white },
  chipSep: { width: 1, height: 20, backgroundColor: colors.border, marginRight: 6, alignSelf: "center" },
  count: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  noRes: { alignItems: "center", paddingVertical: spacing.xl, gap: 8 },
  noResText: { fontSize: 14, color: colors.textMuted },
  // Card
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  fare: { fontSize: 17, fontWeight: "800", color: colors.text },
  route: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  dots: { alignItems: "center", width: 10, paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 1.5, flex: 1, backgroundColor: colors.border, marginVertical: 3 },
  addrs: { flex: 1, justifyContent: "space-between", gap: spacing.sm },
  addr: { fontSize: 14, color: colors.textSecondary },
  cardBot: { flexDirection: "row", gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  meta: { fontSize: 12, color: colors.textMuted },
});
