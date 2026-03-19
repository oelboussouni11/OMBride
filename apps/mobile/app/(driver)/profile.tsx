import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  TextInput,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useNavigation } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../context/AuthContext";
import { fetchMe, fetchStats, requestReverification, switchRole, deleteAccount, type UserStats } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DocItem {
  type: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  uri: string | null;
}

const verificationDocs: DocItem[] = [
  { type: "selfie", label: "Selfie Photo", icon: "person-outline", uri: null },
  { type: "car_photo", label: "Car Photo", icon: "car-sport-outline", uri: null },
  { type: "matricule", label: "Matricule (Plate Photo)", icon: "pricetag-outline", uri: null },
  { type: "carte_grise", label: "Carte Grise", icon: "document-text-outline", uri: null },
  { type: "licence", label: "Driving Licence", icon: "card-outline", uri: null },
];

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? "star" : "star-outline"}
          size={size}
          color={i <= Math.round(rating) ? colors.warning : colors.textMuted}
        />
      ))}
    </View>
  );
}

export default function DriverProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const navigation = useNavigation<any>();
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [stats, setStats] = useState<UserStats>({});
  const [docs, setDocs] = useState<DocItem[]>(verificationDocs);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editEmail, setEditEmail] = useState(user?.email || "");
  const [pageLoading, setPageLoading] = useState(true);

  // Verification text fields
  const [vehName, setVehName] = useState("");
  const [vehPhone, setVehPhone] = useState("");

  useEffect(() => {
    Promise.all([
      fetchMe().then((me) => {
        setDriverInfo(me.driver);
        setVehName(me.name || "");
        setVehPhone(me.phone || "");
      }),
      fetchStats().then(setStats),
    ]).catch(() => {}).finally(() => setPageLoading(false));
  }, []);

  async function pickImage(index: number) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library access is required.");
      return;
    }
    const isSelfie = docs[index].type === "selfie";
    const result = isSelfie
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, cameraType: ImagePicker.CameraType.front })
          .catch(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 }))
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setDocs((prev) => prev.map((d, i) => i === index ? { ...d, uri } : d));
      if (isSelfie) setSelfieUri(uri);
    }
  }

  function toggleVerification() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVerificationOpen(!verificationOpen);
  }

  function handleSubmitVerification() {
    const allDocsUploaded = docs.every((d) => d.uri !== null);
    if (!allDocsUploaded) {
      if (Platform.OS === "web") window.alert("Please upload all required photos.");
      else Alert.alert("Missing Documents", "Please upload all required photos.");
      return;
    }
    if (!vehName.trim() || !vehPhone.trim()) {
      if (Platform.OS === "web") window.alert("Please fill in your full name and phone number.");
      else Alert.alert("Missing Info", "Please fill in your full name and phone number.");
      return;
    }
    if (Platform.OS === "web") {
      const ok = window.confirm("Your documents and info will be reviewed. This info cannot be changed after verification. Submit?");
      if (ok) {
        window.alert("Your verification request has been sent.");
        setVerificationOpen(false);
      }
    } else {
      Alert.alert(
        "Submit for Verification?",
        "Your documents and info will be reviewed. This info cannot be changed after verification.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Submit",
            onPress: () => {
              Alert.alert("Submitted", "Your verification request has been sent.");
              setVerificationOpen(false);
            },
          },
        ]
      );
    }
  }

  async function handleRequestInfoChange() {
    const msg = "This will reset your verification. You will need to re-upload all documents and get re-verified. You cannot accept rides until verified again. Continue?";
    let confirmed = false;
    if (Platform.OS === "web") {
      confirmed = window.confirm(msg);
    } else {
      confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert("Re-verify Account?", msg, [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Yes, Re-verify", style: "destructive", onPress: () => resolve(true) },
        ]);
      });
    }
    if (!confirmed) return;
    try {
      await requestReverification();
      // Reset local state to show verification form
      setDriverInfo((prev: any) => prev ? { ...prev, status: "pending" } : prev);
      setVerificationOpen(true);
      if (Platform.OS === "web") window.alert("Verification reset. Please re-upload your documents.");
      else Alert.alert("Reset", "Your verification has been reset. Please re-upload documents.");
    } catch (err: any) {
      if (Platform.OS === "web") window.alert(err.message || "Failed to reset verification");
      else Alert.alert("Error", err.message || "Failed to reset verification");
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/login");
  }

  const isVerified = driverInfo?.status === "verified";
  const isPending = driverInfo?.status === "pending";
  const isRejected = driverInfo?.status === "rejected";
  const driverStats = stats.driver;
  const verificationColor = isVerified ? colors.success : isRejected ? colors.danger : colors.warning;
  const verificationBg = isVerified ? "#dcfce7" : isRejected ? "#fef2f2" : "#fef3c7";

  const uploadedCount = docs.filter((d) => d.uri !== null).length;

  if (pageLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            {selfieUri ? (
              <Image source={{ uri: selfieUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>{(user?.name || "D")[0].toUpperCase()}</Text>
              </View>
            )}
            {isVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              </View>
            )}
          </View>
          <Text style={styles.name}>{user?.name ?? "Driver"}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
          {isVerified && (
            <View style={styles.verifiedTag}>
              <Ionicons name="shield-checkmark" size={12} color={colors.success} />
              <Text style={styles.verifiedTagText}>Verified Driver</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{driverStats?.completed_rides ?? 0}</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{driverStats?.score?.toFixed(1) ?? "5.0"}</Text>
            <Text style={styles.statLabel}>Score</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <StarRow rating={driverStats?.average_rating ?? 5} />
            <Text style={styles.statLabel}>{driverStats?.average_rating?.toFixed(1) ?? "5.0"}</Text>
          </View>
        </View>

        {/* Verification Status */}
        {driverInfo && (
          <View style={[styles.verifyBanner, { borderColor: verificationColor }]}>
            <View style={styles.verifyBannerRow}>
              <Ionicons name={isVerified ? "shield-checkmark" : "shield-outline"} size={20} color={verificationColor} />
              <View style={[styles.badge, { backgroundColor: verificationBg }]}>
                <Text style={[styles.badgeText, { color: verificationColor }]}>
                  {driverInfo.status?.toUpperCase() || "PENDING"}
                </Text>
              </View>
            </View>
            <Text style={styles.verifyBannerText}>
              {isVerified ? "Your account is verified."
                : driverInfo.status === "rejected" ? `Rejected: ${driverInfo.rejection_note || "See verification tab"}`
                : "Complete verification to start driving."}
            </Text>
            {!isVerified && (
              <Pressable style={styles.verifyLink} onPress={() => navigation.navigate("documents" as never)}>
                <Text style={styles.verifyLinkText}>Go to Verification</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </Pressable>
            )}
          </View>
        )}

        {/* Driver Info — read-only, from verification */}
        <Text style={styles.sectionTitle}>Driver Information</Text>
        <View style={styles.card}>
          {([
            { icon: "person-outline" as const, label: "Name", value: user?.name },
            { icon: "call-outline" as const, label: "Phone", value: user?.phone },
            { icon: "car-outline" as const, label: "Vehicle", value: driverInfo?.vehicle_model },
            { icon: "wallet-outline" as const, label: "Credits", value: `${driverInfo?.credit_balance?.toFixed(2) || "0.00"} DH` },
          ]).map((item, i, arr) => (
            <View key={item.label} style={[styles.infoRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.infoRowLeft}>
                <Ionicons name={item.icon} size={18} color={colors.textSecondary} />
                <Text style={styles.infoLabel}>{item.label}</Text>
              </View>
              <Text style={[styles.infoValue, item.label === "Credits" && { fontWeight: "800" }]}>
                {item.value || "Not set"}
              </Text>
            </View>
          ))}
        </View>
        {isVerified && (
          <Pressable style={styles.requestChangeBtn} onPress={handleRequestInfoChange}>
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.requestChangeText}>Request Info Change</Text>
          </Pressable>
        )}

        {/* Email — editable */}
        <Text style={styles.sectionTitle}>Email</Text>
        <View style={styles.card}>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoRowLeft}>
              <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.infoLabel}>Email</Text>
            </View>
            {editingEmail ? (
              <View style={styles.emailEditRow}>
                <TextInput
                  style={styles.emailInput}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Pressable onPress={() => { setEditingEmail(false); Alert.alert("Saved", "Email updated."); }}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setEditingEmail(true)} style={styles.emailValueRow}>
                <Text style={styles.infoValue}>{user?.email || "Not set"}</Text>
                <Ionicons name="create-outline" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Actions */}
        <Pressable style={styles.actionButton} onPress={async () => {
          try { await switchRole(); router.replace("/(rider)/home"); }
          catch (e: any) { if (Platform.OS === "web") window.alert(e.message); else Alert.alert("Error", e.message); }
        }}>
          <Ionicons name="swap-horizontal-outline" size={18} color={colors.text} />
          <Text style={styles.actionText}>Switch to Rider Mode</Text>
        </Pressable>
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.white} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
        <Pressable style={styles.deleteAccountBtn} onPress={async () => {
          const msg = "This will permanently deactivate your account. Continue?";
          let ok = Platform.OS === "web" ? window.confirm(msg) : await new Promise<boolean>((r) =>
            Alert.alert("Delete Account?", msg, [{ text: "Cancel", onPress: () => r(false) }, { text: "Delete", style: "destructive", onPress: () => r(true) }]));
          if (!ok) return;
          try { await deleteAccount(); await logout(); router.replace("/(auth)/login"); }
          catch (e: any) { if (Platform.OS === "web") window.alert(e.message); else Alert.alert("Error", e.message); }
        }}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },

  // Header
  header: { alignItems: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  avatarWrap: { position: "relative", marginBottom: spacing.sm },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 28, fontWeight: "700", color: colors.white },
  verifiedBadge: {
    position: "absolute", bottom: -2, right: -2,
    backgroundColor: colors.white, borderRadius: 12, padding: 1,
  },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  phone: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  verifiedTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#dcfce7", borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 3, marginTop: spacing.sm,
  },
  verifiedTagText: { fontSize: 12, fontWeight: "600", color: colors.success },

  // Stats
  statsRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },

  // Dropdown
  dropdownHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: 1,
  },
  dropdownLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dropdownTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  verifyBanner: { borderWidth: 2, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  verifyBannerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  verifyBannerText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  verifyLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  verifyLinkText: { fontSize: 14, fontWeight: "600", color: colors.primary },
  dropdownContent: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderTopWidth: 0, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  dropdownNote: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },

  // Progress
  progressWrap: {
    height: 6, backgroundColor: colors.border, borderRadius: 3,
    marginBottom: spacing.md, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.success, borderRadius: 3 },

  // Doc items
  docItem: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  docIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, justifyContent: "center", alignItems: "center",
  },
  docIconDone: { backgroundColor: colors.success },
  docLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  docThumb: { width: 36, height: 36, borderRadius: radius.sm },

  // Verify fields
  verifyFieldGroup: { marginTop: spacing.md },
  verifyFieldLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.xs },
  verifyInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: colors.surface,
  },
  submitVerifyBtn: {
    flexDirection: "row", backgroundColor: colors.success, borderRadius: radius.sm,
    paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg,
  },
  submitVerifyText: { color: colors.white, fontSize: 15, fontWeight: "700" },

  // Info card
  sectionTitle: { fontSize: 12, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoRowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  lockedNote: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginBottom: spacing.md },
  requestChangeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.md,
  },
  requestChangeText: { fontSize: 14, fontWeight: "600", color: colors.primary },
  emailEditRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  emailInput: {
    fontSize: 14, fontWeight: "600", color: colors.text,
    borderBottomWidth: 1, borderBottomColor: colors.primary,
    paddingVertical: 2, minWidth: 150, textAlign: "right",
  },
  emailValueRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },

  // Actions
  actionButton: {
    flexDirection: "row", borderWidth: 2, borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.sm,
  },
  actionText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  logoutButton: {
    flexDirection: "row", backgroundColor: colors.danger, borderRadius: radius.sm,
    paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  logoutText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  deleteAccountBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: 14, marginTop: spacing.md },
  deleteAccountText: { color: colors.danger, fontSize: 14, fontWeight: "500" },
});
