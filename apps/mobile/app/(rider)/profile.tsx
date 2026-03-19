import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../context/AuthContext";
import { fetchStats, switchRole, deleteAccount, type UserStats } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

function StarRow({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? "star" : "star-outline"}
          size={14}
          color={i <= Math.round(rating) ? colors.warning : colors.textMuted}
        />
      ))}
    </View>
  );
}

export default function RiderProfileScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<UserStats>({});
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || "");
  const [editEmail, setEditEmail] = useState(user?.email || "");

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, []);

  const riderStats = stats.rider;

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/login");
  }

  async function handleSwitchToDriver() {
    try {
      await switchRole();
      router.replace("/(driver)/home");
    } catch (err: any) {
      if (Platform.OS === "web") window.alert(err.message || "Failed to switch");
      else Alert.alert("Error", err.message);
    }
  }

  async function handleDeleteAccount() {
    const msg = "This will permanently deactivate your account. You won't be able to log in. Continue?";
    let confirmed = false;
    if (Platform.OS === "web") {
      confirmed = window.confirm(msg);
    } else {
      confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert("Delete Account?", msg, [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Delete", style: "destructive", onPress: () => resolve(true) },
        ]);
      });
    }
    if (!confirmed) return;
    try {
      await deleteAccount();
      await logout();
      router.replace("/(auth)/login");
    } catch (err: any) {
      if (Platform.OS === "web") window.alert(err.message || "Failed");
      else Alert.alert("Error", err.message);
    }
  }

  function handleSaveProfile() {
    setEditing(false);
    Alert.alert("Saved", "Profile updated.");
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name || "U")[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{user?.name ?? "Rider"}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{riderStats?.completed_rides ?? 0}</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{riderStats?.score?.toFixed(1) ?? "5.0"}</Text>
            <Text style={styles.statLabel}>Score</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <StarRow rating={riderStats?.average_rating ?? 5} />
            <Text style={styles.statLabel}>{riderStats?.average_rating?.toFixed(1) ?? "5.0"} Rating</Text>
          </View>
        </View>

        {/* Account Info */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Pressable onPress={() => setEditing(!editing)}>
            <Text style={styles.editLink}>{editing ? "Cancel" : "Edit"}</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.infoRowLeft}>
              <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.infoLabel}>Name</Text>
            </View>
            {editing ? (
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your name"
              />
            ) : (
              <Text style={styles.infoValue}>{user?.name}</Text>
            )}
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoRowLeft}>
              <Ionicons name="call-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.infoLabel}>Phone</Text>
            </View>
            <Text style={styles.infoValue}>{user?.phone}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoRowLeft}>
              <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.infoLabel}>Email</Text>
            </View>
            {editing ? (
              <TextInput
                style={styles.editInput}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="your@email.com"
                keyboardType="email-address"
              />
            ) : (
              <Text style={styles.infoValue}>{user?.email || "Not set"}</Text>
            )}
          </View>
        </View>

        {editing && (
          <Pressable style={styles.saveButton} onPress={handleSaveProfile}>
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </Pressable>
        )}

        {/* Become a Driver */}
        <View style={styles.driverPromo}>
          <Ionicons name="car-sport-outline" size={28} color={colors.text} />
          <Text style={styles.driverPromoTitle}>Want to drive?</Text>
          <Text style={styles.driverPromoDesc}>
            Switch to driver mode to start earning. Upload documents and get verified.
          </Text>
          <Pressable style={styles.switchButton} onPress={handleSwitchToDriver}>
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
            <Text style={styles.switchText}>Switch to Driver Mode</Text>
          </Pressable>
        </View>

        {/* Logout */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.white} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>

        <Pressable style={styles.deleteButton} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteText}>Delete Account</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  header: { alignItems: "center", marginTop: spacing.md, marginBottom: spacing.lg },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: "center", alignItems: "center",
    marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 30, fontWeight: "700", color: colors.white },
  name: { fontSize: 22, fontWeight: "700", color: colors.text },
  phone: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  statsRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editLink: { fontSize: 14, fontWeight: "600", color: colors.primary },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  editInput: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
    minWidth: 120,
    textAlign: "right",
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  saveButtonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  driverPromo: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: "center",
  },
  driverPromoTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs },
  driverPromoDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md, textAlign: "center" },
  switchButton: {
    flexDirection: "row",
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  switchText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  logoutButton: {
    flexDirection: "row",
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  logoutText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  deleteButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, paddingVertical: 14, marginTop: spacing.md,
  },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: "500" },
});
