import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { fetchMe } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

export default function DriverProfileScreen() {
  const { user, logout } = useAuth();
  const [driverInfo, setDriverInfo] = useState<any>(null);

  useEffect(() => {
    fetchMe()
      .then((me) => setDriverInfo(me.driver))
      .catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name || "D")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name ?? "Driver"}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role</Text>
          <Text style={styles.infoValue}>Driver</Text>
        </View>
        {driverInfo && (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Vehicle</Text>
              <Text style={styles.infoValue}>{driverInfo.vehicle_model}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Plate</Text>
              <Text style={styles.infoValue}>{driverInfo.plate_number}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={[styles.infoValue, {
                color: driverInfo.status === "verified" ? colors.success
                  : driverInfo.status === "rejected" ? colors.danger
                  : colors.warning,
              }]}>
                {driverInfo.status}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Credits</Text>
              <Text style={styles.infoValue}>{driverInfo.credit_balance.toFixed(2)} DH</Text>
            </View>
          </>
        )}
      </View>

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  avatarContainer: { alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.xl },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: 28, fontWeight: "700", color: colors.white },
  name: { fontSize: 22, fontWeight: "700", color: colors.text },
  phone: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  logoutButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: "center",
  },
  logoutText: { color: colors.white, fontSize: 16, fontWeight: "600" },
});
