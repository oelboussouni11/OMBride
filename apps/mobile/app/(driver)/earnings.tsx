import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fetchCredits, fetchMe, requestTopup, type CreditTransaction } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

const TIME_FILTERS = ["All", "Today", "This Week", "This Month"] as const;
const TYPE_FILTERS = ["All", "Earned", "Commission", "Top-up"] as const;

function isToday(d: Date) { return d.toDateString() === new Date().toDateString(); }
function isThisWeek(d: Date) { return d >= new Date(Date.now() - 7 * 86400000); }
function isThisMonth(d: Date) { const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }

export default function EarningsScreen() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<typeof TIME_FILTERS[number]>("All");
  const [typeFilter, setTypeFilter] = useState<typeof TYPE_FILTERS[number]>("All");
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [referenceCode, setReferenceCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [me, txns] = await Promise.all([fetchMe(), fetchCredits()]);
      if (me.driver) setBalance(me.driver.credit_balance);
      setTransactions(txns);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.created_at);
      if (timeFilter === "Today" && !isToday(d)) return false;
      if (timeFilter === "This Week" && !isThisWeek(d)) return false;
      if (timeFilter === "This Month" && !isThisMonth(d)) return false;
      if (typeFilter === "Earned" && t.type !== "ride_earned") return false;
      if (typeFilter === "Commission" && t.type !== "ride_fee") return false;
      if (typeFilter === "Top-up" && t.type !== "topup") return false;
      return true;
    });
  }, [transactions, timeFilter, typeFilter]);

  const todayRides = transactions.filter(
    (t) => t.type === "ride_earned" && isToday(new Date(t.created_at))
  ).length;

  const totalEarned = filtered
    .filter((t) => t.type === "ride_earned")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalCommission = filtered
    .filter((t) => t.type === "ride_fee")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  async function handleTopup() {
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Error", "Enter a valid amount");
      return;
    }
    if (!referenceCode.trim()) {
      Alert.alert("Error", "Please enter your proof of payment (receipt or reference number)");
      return;
    }
    setSubmitting(true);
    try {
      await requestTopup({
        amount,
        payment_method: paymentMethod,
        reference_code: referenceCode.trim(),
      });
      Alert.alert("Request Sent", "Your top-up request has been submitted and will be reviewed by admin.");
      setShowTopup(false);
      setTopupAmount("");
      setReferenceCode("");
      loadData();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSubmitting(false);
    }
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

  function txnIcon(type: string): keyof typeof Ionicons.glyphMap {
    return type === "ride_earned" ? "trending-up" : type === "topup" ? "add-circle" : "remove-circle";
  }
  function txnColor(amount: number) { return amount > 0 ? colors.success : colors.danger; }
  function txnLabel(type: string) { return type === "ride_earned" ? "Ride Earned" : type === "topup" ? "Top-up" : "Commission"; }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        onRefresh={loadData}
        refreshing={loading}
        ListHeaderComponent={
          <>
            {/* Balance */}
            <View style={styles.balanceCard}>
              <View style={styles.balanceTop}>
                <Text style={styles.balanceLabel}>Credit Balance</Text>
                <Pressable style={styles.topupBtn} onPress={() => setShowTopup(true)}>
                  <Ionicons name="add" size={16} color={colors.white} />
                  <Text style={styles.topupBtnText}>Top Up</Text>
                </Pressable>
              </View>
              <Text style={styles.balanceAmount}>{balance.toFixed(2)} DH</Text>
              <View style={styles.balanceStats}>
                <View style={styles.bStat}>
                  <Text style={styles.bStatNum}>{todayRides}</Text>
                  <Text style={styles.bStatLabel}>rides today</Text>
                </View>
                <View style={styles.bStatDiv} />
                <View style={styles.bStat}>
                  <Text style={styles.bStatNum}>{totalEarned.toFixed(0)}</Text>
                  <Text style={styles.bStatLabel}>earned</Text>
                </View>
                <View style={styles.bStatDiv} />
                <View style={styles.bStat}>
                  <Text style={styles.bStatNum}>{totalCommission.toFixed(0)}</Text>
                  <Text style={styles.bStatLabel}>commission</Text>
                </View>
              </View>
            </View>
            {/* Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {TIME_FILTERS.map((f) => (
                <Pressable key={f} onPress={() => setTimeFilter(f)} style={[styles.chip, timeFilter === f && styles.chipOn]}>
                  <Text style={[styles.chipText, timeFilter === f && styles.chipTextOn]}>{f}</Text>
                </Pressable>
              ))}
              <View style={styles.chipSep} />
              {TYPE_FILTERS.map((f) => (
                <Pressable key={f} onPress={() => setTypeFilter(f)} style={[styles.chip, typeFilter === f && styles.chipOn]}>
                  <Text style={[styles.chipText, typeFilter === f && styles.chipTextOn]}>{f}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {filtered.length > 0 && <Text style={styles.txnCount}>{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</Text>}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={24} color={colors.textMuted} />
            <Text style={styles.emptyText}>{transactions.length === 0 ? "No transactions yet" : "No matches"}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.txnCard}>
            <View style={[styles.txnIconWrap, { backgroundColor: txnColor(item.amount) + "12" }]}>
              <Ionicons name={txnIcon(item.type)} size={18} color={txnColor(item.amount)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.txnType}>{txnLabel(item.type)}</Text>
              <Text style={styles.txnDate}>{formatDate(item.created_at)}</Text>
              {item.reference_code ? <Text style={styles.txnRef} numberOfLines={1}>{item.reference_code}</Text> : null}
            </View>
            <Text style={[styles.txnAmt, { color: txnColor(item.amount) }]}>
              {item.amount > 0 ? "+" : ""}{item.amount.toFixed(2)}
            </Text>
          </View>
        )}
      />

      {/* Topup Modal */}
      <Modal visible={showTopup} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Top Up Credits</Text>
            <Text style={styles.modalSubtitle}>
              Pay via bank transfer or cash, then submit your proof of payment below.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount (DH)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 50"
                placeholderTextColor={colors.textMuted}
                value={topupAmount}
                onChangeText={setTopupAmount}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Method</Text>
              <View style={styles.methodRow}>
                {(["bank_transfer", "cash"] as const).map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.methodButton, paymentMethod === m && styles.methodActive]}
                    onPress={() => setPaymentMethod(m)}
                  >
                    <Text style={[styles.methodText, paymentMethod === m && styles.methodTextActive]}>
                      {m === "bank_transfer" ? "Bank Transfer" : "Cash"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Proof of Payment *</Text>
              <TextInput
                style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
                placeholder="Receipt number, transfer reference, or payment details"
                placeholderTextColor={colors.textMuted}
                value={referenceCode}
                onChangeText={setReferenceCode}
                multiline
              />
              <Text style={styles.inputHint}>Required — enter your receipt or reference number</Text>
            </View>

            <Pressable
              style={[styles.submitButton, submitting && { opacity: 0.6 }]}
              onPress={handleTopup}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.submitText}>Submit Top-up Request</Text>
              )}
            </Pressable>

            <Pressable style={styles.modalCancel} onPress={() => setShowTopup(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  // Balance
  balanceCard: {
    backgroundColor: colors.primary, margin: spacing.md,
    borderRadius: radius.lg, padding: spacing.lg,
  },
  balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.5 },
  topupBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 14 },
  topupBtnText: { color: colors.white, fontSize: 13, fontWeight: "600" },
  balanceAmount: { fontSize: 38, fontWeight: "800", color: colors.white, marginTop: spacing.xs },
  balanceStats: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  bStat: { flex: 1, alignItems: "center" },
  bStatNum: { fontSize: 17, fontWeight: "700", color: colors.white },
  bStatLabel: { fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1, textTransform: "uppercase", letterSpacing: 0.3 },
  bStatDiv: { width: 1, height: 22, backgroundColor: "rgba(255,255,255,0.15)" },
  // Filters
  filterRow: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.white, marginRight: 6, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  chipTextOn: { color: colors.white },
  chipSep: { width: 1, height: 20, backgroundColor: colors.border, marginRight: 6, alignSelf: "center" },
  txnCount: { fontSize: 12, color: colors.textMuted, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  emptyState: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 14, color: colors.textMuted },
  // Transaction card
  txnCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.white, marginHorizontal: spacing.md, marginBottom: spacing.xs,
    borderRadius: radius.md, padding: spacing.md,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  txnIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  txnType: { fontSize: 14, fontWeight: "600", color: colors.text },
  txnDate: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  txnRef: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  txnAmt: { fontSize: 16, fontWeight: "800" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  modalSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  inputGroup: { marginBottom: spacing.md },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  methodRow: { flexDirection: "row", gap: spacing.sm },
  methodButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
  methodActive: { borderColor: colors.primary, backgroundColor: colors.surface },
  methodText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  methodTextActive: { color: colors.text },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  submitText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  modalCancel: { paddingVertical: 14, alignItems: "center", marginTop: spacing.xs },
  modalCancelText: { fontSize: 16, color: colors.textSecondary, fontWeight: "500" },
});
