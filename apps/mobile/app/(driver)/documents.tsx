import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, radius } from "../../constants/theme";

interface DocItem {
  type: string;
  label: string;
  uri: string | null;
  status: "not_uploaded" | "pending" | "approved" | "rejected";
}

const initialDocs: DocItem[] = [
  { type: "license", label: "Driver's License", uri: null, status: "not_uploaded" },
  { type: "id_card", label: "National ID Card", uri: null, status: "not_uploaded" },
  { type: "insurance", label: "Insurance", uri: null, status: "not_uploaded" },
  { type: "vehicle_registration", label: "Vehicle Registration", uri: null, status: "not_uploaded" },
];

export default function DocumentsScreen() {
  const [docs, setDocs] = useState<DocItem[]>(initialDocs);

  async function pickImage(index: number) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera roll permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setDocs((prev) =>
        prev.map((d, i) =>
          i === index ? { ...d, uri: result.assets[0].uri, status: "pending" } : d
        )
      );
      // TODO: Upload to API when endpoint is ready
      Alert.alert("Uploaded", "Document will be reviewed by admin.");
    }
  }

  function statusBadge(status: string) {
    switch (status) {
      case "approved":
        return { bg: "#dcfce7", text: "#166534", label: "Approved" };
      case "rejected":
        return { bg: "#fef2f2", text: "#991b1b", label: "Rejected" };
      case "pending":
        return { bg: "#fef3c7", text: "#92400e", label: "Pending" };
      default:
        return { bg: colors.surface, text: colors.textMuted, label: "Not uploaded" };
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.description}>
        Upload the required documents to get verified and start accepting rides.
      </Text>

      {docs.map((doc, i) => {
        const badge = statusBadge(doc.status);
        return (
          <View key={doc.type} style={styles.docCard}>
            <View style={styles.docHeader}>
              <Text style={styles.docLabel}>{doc.label}</Text>
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
              </View>
            </View>

            {doc.uri && (
              <Image source={{ uri: doc.uri }} style={styles.docPreview} />
            )}

            <Pressable style={styles.uploadButton} onPress={() => pickImage(i)}>
              <Text style={styles.uploadButtonText}>
                {doc.uri ? "Replace" : "Upload"}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  docCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  docHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  docLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  docPreview: {
    width: "100%",
    height: 120,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  uploadButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
  uploadButtonText: { fontSize: 14, fontWeight: "600", color: colors.text },
});
