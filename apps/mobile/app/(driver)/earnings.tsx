import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { fetchCredits, fetchMe, type CreditTransaction } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

export default function EarningsScreen() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchCredits(), fetchMe()])
      .then(([txns, me]) => {
        setTransactions(txns);
        if (me.driver) setBalance(me.driver.credit_balance);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const todayRides = transactions.filter(
    (t) =>
      t.type === "ride_fee" &&
      new Date(t.created_at).toDateString() === new Date().toDateString()
  ).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{todayRides}</Text>
          <Text style={styles.statLabel}>Rides Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{balance.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Credits (DH)</Text>
        </View>
      </View>

      {/* How to buy credits */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How to Buy Credits</Text>
        <Text style={styles.infoText}>
          Visit any CashPlus or WafaCash agent and provide your phone number.
          You can also top up via wire transfer. Contact admin for details.
        </Text>
      </View>

      {/* Transaction list */}
      <Text style={styles.sectionTitle}>Transaction History</Text>
      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No transactions yet</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.txnRow}>
              <View style={styles.txnLeft}>
                <View
                  style={[
                    styles.txnDot,
                    { backgroundColor: item.type === "topup" ? colors.success : colors.danger },
                  ]}
                />
                <View>
                  <Text style={styles.txnType}>
                    {item.type === "topup" ? "Top Up" : "Ride Fee"}
                  </Text>
                  <Text style={styles.txnDate}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.txnAmount,
                  { color: item.amount >= 0 ? colors.success : colors.danger },
                ]}
              >
                {item.amount >= 0 ? "+" : ""}
                {item.amount.toFixed(2)} DH
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
  },
  statValue: { fontSize: 28, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoTitle: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  emptyState: { alignItems: "center", padding: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted },
  txnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txnLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  txnDot: { width: 8, height: 8, borderRadius: 4 },
  txnType: { fontSize: 14, fontWeight: "600", color: colors.text },
  txnDate: { fontSize: 12, color: colors.textMuted },
  txnAmount: { fontSize: 16, fontWeight: "700" },
});
