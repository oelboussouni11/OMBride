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

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Credit Balance</Text>
        <Text style={styles.balanceAmount}>{balance.toFixed(2)} DH</Text>
        <View style={styles.statsRow}>
          <View style={styles.miniStat}>
            <Text style={styles.miniStatValue}>{todayRides}</Text>
            <Text style={styles.miniStatLabel}>Rides Today</Text>
          </View>
          <View style={styles.miniStatDivider} />
          <View style={styles.miniStat}>
            <Text style={styles.miniStatValue}>{totalEarned.toFixed(0)}</Text>
            <Text style={styles.miniStatLabel}>Earned (DH)</Text>
          </View>
          <View style={styles.miniStatDivider} />
          <View style={styles.miniStat}>
            <Text style={styles.miniStatValue}>{totalCommission.toFixed(0)}</Text>
            <Text style={styles.miniStatLabel}>Commission (DH)</Text>
          </View>
        </View>
        <Pressable style={styles.topupButton} onPress={() => setShowTopup(true)}>
          <Text style={styles.topupButtonText}>+ Top Up Credits</Text>
        </Pressable>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {TIME_FILTERS.map((f) => (
          <Pressable key={f} style={[styles.filterChip, timeFilter === f && styles.filterChipActive]} onPress={() => setTimeFilter(f)}>
            <Text style={[styles.filterChipText, timeFilter === f && styles.filterChipTextActive]}>{f}</Text>
          </Pressable>
        ))}
        <View style={styles.filterDivider} />
        {TYPE_FILTERS.map((f) => (
          <Pressable key={f} style={[styles.filterChip, typeFilter === f && styles.filterChipActive]} onPress={() => setTypeFilter(f)}>
            <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Transactions ({filtered.length})</Text>

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={24} color={colors.textMuted} />
          <Text style={styles.emptyText}>{transactions.length === 0 ? "No transactions yet" : "No matches for this filter"}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={styles.txnRow}>
              <View style={[styles.txnIcon,
                item.type === "ride_earned" ? styles.txnIconEarned :
                item.type === "topup" ? styles.txnIconTopup : styles.txnIconFee
              ]}>
                <Text style={[styles.txnIconText, {
                  color: item.amount > 0 ? colors.success : colors.danger
                }]}>
                  {item.amount > 0 ? "+" : "-"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnType}>
                  {item.type === "ride_earned" ? "Ride Earned" :
                   item.type === "topup" ? "Credit Top-up" : "Commission"}
                </Text>
                <Text style={styles.txnDate}>{formatDate(item.created_at)}</Text>
                {item.reference_code ? (
                  <Text style={styles.txnRef}>Ref: {item.reference_code}</Text>
                ) : null}
              </View>
              <Text style={[styles.txnAmount, item.amount > 0 ? styles.txnPositive : styles.txnNegative]}>
                {item.amount > 0 ? "+" : ""}{item.amount.toFixed(2)} DH
              </Text>
            </View>
          )}
        />
      )}

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
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  balanceCard: {
    backgroundColor: colors.primary,
    margin: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
  },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.5 },
  balanceAmount: { fontSize: 40, fontWeight: "800", color: colors.white, marginTop: spacing.xs },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  miniStat: { alignItems: "center", paddingHorizontal: spacing.lg },
  miniStatValue: { fontSize: 18, fontWeight: "700", color: colors.white },
  miniStatLabel: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 },
  miniStatDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.2)" },
  topupButton: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  topupButtonText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  filterScroll: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surface, marginRight: spacing.sm },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  filterChipTextActive: { color: colors.white },
  filterDivider: { width: 1, height: 24, backgroundColor: colors.border, marginRight: spacing.sm, alignSelf: "center" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.sm },
  emptyText: { fontSize: 15, color: colors.textMuted },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txnIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  txnIconEarned: { backgroundColor: "#dbeafe" },
  txnIconTopup: { backgroundColor: "#dcfce7" },
  txnIconFee: { backgroundColor: "#fee2e2" },
  txnIconText: { fontSize: 18, fontWeight: "700" },
  txnType: { fontSize: 15, fontWeight: "600", color: colors.text },
  txnDate: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  txnRef: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  txnAmount: { fontSize: 16, fontWeight: "700" },
  txnPositive: { color: colors.success },
  txnNegative: { color: colors.danger },
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
