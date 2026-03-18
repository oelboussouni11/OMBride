import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { apiFetch } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

interface RideItem {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  fare: number | null;
  status: string;
  created_at: string;
}

export default function RideHistoryScreen() {
  const [rides, setRides] = useState<RideItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Note: This endpoint would need to be created for rider-specific history
    // For now we show an empty state
    setLoading(false);
  }, []);

  function statusColor(status: string) {
    switch (status) {
      case "completed":
        return colors.success;
      case "cancelled":
        return colors.danger;
      default:
        return colors.warning;
    }
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
          <Text style={{ fontSize: 48 }}>&#x1F697;</Text>
          <Text style={styles.emptyTitle}>No rides yet</Text>
          <Text style={styles.emptySubtext}>Your ride history will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.rideCard}>
              <View style={styles.rideHeader}>
                <View
                  style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]}
                />
                <Text style={styles.rideDate}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
                {item.fare != null && (
                  <Text style={styles.rideFare}>{item.fare} DH</Text>
                )}
              </View>
              <Text style={styles.rideRoute} numberOfLines={1}>
                {item.pickup_address}
              </Text>
              <Text style={styles.rideRoute} numberOfLines={1}>
                → {item.dropoff_address}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  rideCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rideHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  rideDate: { flex: 1, fontSize: 13, color: colors.textMuted },
  rideFare: { fontSize: 16, fontWeight: "700", color: colors.text },
  rideRoute: { fontSize: 14, color: colors.textSecondary, marginLeft: spacing.md },
});
