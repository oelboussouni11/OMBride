import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useRide } from "../../context/RideContext";
import { useWebSocket } from "../../context/WebSocketContext";
import { estimateRide, requestRide, cancelRide, type EstimateResponse, type RideResponse } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

type RideState = "idle" | "entering_destination" | "estimate" | "searching" | "matched" | "arriving" | "in_progress" | "completed";

export default function RiderHomeScreen() {
  const { pickup, dropoff, setPickup, setDropoff, currentRide, setCurrentRide } = useRide();
  const { lastMessage } = useWebSocket();

  const [rideState, setRideState] = useState<RideState>("idle");
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  // Destination input
  const [destAddress, setDestAddress] = useState("");
  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");

  // Driver info from WS
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Get user location on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Location permission is required.");
        return;
      }
      setLocationGranted(true);
      const loc = await Location.getCurrentPositionAsync({});
      setPickup({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        address: "Current Location",
      });
    })();
  }, []);

  // Listen for WS messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case "ride_accepted":
        setDriverInfo(lastMessage.data);
        setRideState("matched");
        break;
      case "ride_status":
        if (lastMessage.data.status === "arriving") setRideState("arriving");
        if (lastMessage.data.status === "in_progress") setRideState("in_progress");
        if (lastMessage.data.status === "completed") {
          setRideState("completed");
        }
        if (lastMessage.data.status === "cancelled") {
          if (lastMessage.data.reason === "no_drivers_available") {
            Alert.alert("No drivers available", "Please try again later.");
          }
          resetRide();
        }
        break;
      case "driver_location":
        setDriverLocation({ lat: lastMessage.data.lat, lng: lastMessage.data.lng });
        break;
    }
  }, [lastMessage]);

  function resetRide() {
    setRideState("idle");
    setEstimate(null);
    setCurrentRide(null);
    setDriverInfo(null);
    setDriverLocation(null);
    setDestAddress("");
    setDestLat("");
    setDestLng("");
    setDropoff(null);
  }

  async function handleEstimate() {
    if (!pickup || !destLat || !destLng) {
      Alert.alert("Error", "Please enter destination coordinates.");
      return;
    }
    setLoading(true);
    try {
      const est = await estimateRide(
        pickup.latitude,
        pickup.longitude,
        parseFloat(destLat),
        parseFloat(destLng)
      );
      setEstimate(est);
      setDropoff({
        latitude: parseFloat(destLat),
        longitude: parseFloat(destLng),
        address: destAddress || "Destination",
      });
      setRideState("estimate");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestRide() {
    if (!pickup || !dropoff) return;
    setLoading(true);
    setRideState("searching");
    try {
      const ride = await requestRide({
        pickup_lat: pickup.latitude,
        pickup_lng: pickup.longitude,
        dropoff_lat: dropoff.latitude,
        dropoff_lng: dropoff.longitude,
        pickup_address: pickup.address || "Pickup",
        dropoff_address: dropoff.address || "Destination",
      });
      setCurrentRide({
        id: ride.id,
        riderId: ride.rider_id,
        driverId: ride.driver_id || undefined,
        pickup,
        dropoff,
        status: "requested",
        fare: ride.fare || undefined,
        distance: ride.distance_km || undefined,
        duration: ride.duration_min || undefined,
        createdAt: ride.created_at,
        updatedAt: ride.created_at,
      });
    } catch (err: any) {
      Alert.alert("Error", err.message);
      setRideState("estimate");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!currentRide) {
      resetRide();
      return;
    }
    try {
      await cancelRide(currentRide.id);
    } catch {}
    resetRide();
  }

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (rideState === "idle") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>
            {locationGranted
              ? `${pickup?.latitude.toFixed(4) ?? "..."}, ${pickup?.longitude.toFixed(4) ?? "..."}`
              : "Waiting for location..."}
          </Text>
        </View>
        <View style={styles.bottomSheet}>
          <Pressable
            style={styles.whereToButton}
            onPress={() => setRideState("entering_destination")}
          >
            <Text style={styles.whereToIcon}>&#x1F50D;</Text>
            <Text style={styles.whereToText}>Where to?</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── ENTERING DESTINATION ──────────────────────────────────────────────────
  if (rideState === "entering_destination") {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.destinationContainer}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Text style={styles.sheetTitle}>Enter Destination</Text>
          <TextInput
            style={styles.input}
            placeholder="Destination address"
            placeholderTextColor={colors.textMuted}
            value={destAddress}
            onChangeText={setDestAddress}
          />
          <View style={styles.coordRow}>
            <TextInput
              style={[styles.input, styles.coordInput]}
              placeholder="Latitude"
              placeholderTextColor={colors.textMuted}
              value={destLat}
              onChangeText={setDestLat}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, styles.coordInput]}
              placeholder="Longitude"
              placeholderTextColor={colors.textMuted}
              value={destLng}
              onChangeText={setDestLng}
              keyboardType="decimal-pad"
            />
          </View>
          <Pressable style={styles.primaryButton} onPress={handleEstimate} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Get Estimate</Text>
            )}
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setRideState("idle")}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── ESTIMATE ──────────────────────────────────────────────────────────────
  if (rideState === "estimate" && estimate) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>
            {pickup?.address} → {dropoff?.address}
          </Text>
        </View>
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>Ride Estimate</Text>
          <View style={styles.estimateRow}>
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>{estimate.distance_km} km</Text>
              <Text style={styles.estimateLabel}>Distance</Text>
            </View>
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>{estimate.duration_min} min</Text>
              <Text style={styles.estimateLabel}>Duration</Text>
            </View>
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>{estimate.estimated_fare} DH</Text>
              <Text style={styles.estimateLabel}>Fare</Text>
            </View>
          </View>
          <Pressable style={styles.primaryButton} onPress={handleRequestRide} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Request Ride</Text>
            )}
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={resetRide}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── SEARCHING ─────────────────────────────────────────────────────────────
  if (rideState === "searching") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.searchingTitle}>Finding your driver...</Text>
          <Text style={styles.searchingSubtext}>This may take a moment</Text>
          <Pressable style={[styles.secondaryButton, { marginTop: 32 }]} onPress={handleCancel}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── MATCHED / ARRIVING / IN PROGRESS ──────────────────────────────────────
  if (rideState === "matched" || rideState === "arriving" || rideState === "in_progress") {
    const statusText =
      rideState === "matched"
        ? "Driver is on the way"
        : rideState === "arriving"
        ? "Driver arriving"
        : "On the way to destination";

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapPlaceholder}>
          {driverLocation && (
            <Text style={styles.mapText}>
              Driver: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
            </Text>
          )}
        </View>
        <View style={styles.bottomSheet}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>

          {driverInfo && (
            <View style={styles.driverCard}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {(driverInfo.driver_name || "D")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{driverInfo.driver_name}</Text>
                <Text style={styles.driverVehicle}>
                  {driverInfo.vehicle_model} · {driverInfo.plate_number}
                </Text>
                <Text style={styles.driverPhone}>{driverInfo.driver_phone}</Text>
              </View>
            </View>
          )}

          {currentRide?.fare && (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Fare</Text>
              <Text style={styles.fareValue}>{currentRide.fare} DH</Text>
            </View>
          )}

          <Pressable style={styles.dangerButton} onPress={handleCancel}>
            <Text style={styles.dangerButtonText}>Cancel Ride</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── COMPLETED ─────────────────────────────────────────────────────────────
  if (rideState === "completed") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={{ fontSize: 48 }}>&#x2705;</Text>
          <Text style={styles.completedTitle}>Ride Complete</Text>
          {currentRide?.fare && (
            <Text style={styles.completedFare}>{currentRide.fare} DH</Text>
          )}
          <Text style={styles.completedRoute}>
            {pickup?.address} → {dropoff?.address}
          </Text>
          <Pressable style={[styles.primaryButton, { marginTop: 32, width: "80%" }]} onPress={resetRide}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  mapText: { fontSize: 14, color: colors.textSecondary },
  bottomSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  whereToButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  whereToIcon: { fontSize: 18 },
  whereToText: { fontSize: 18, fontWeight: "600", color: colors.textSecondary },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  destinationContainer: {
    flex: 1,
    backgroundColor: colors.white,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  coordRow: { flexDirection: "row", gap: spacing.sm },
  coordInput: { flex: 1 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  secondaryButtonText: { color: colors.textSecondary, fontSize: 16, fontWeight: "500" },
  dangerButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.md,
  },
  dangerButtonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  estimateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  estimateItem: { alignItems: "center", flex: 1 },
  estimateValue: { fontSize: 20, fontWeight: "700", color: colors.text },
  estimateLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  searchingTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
  },
  searchingSubtext: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  statusBadge: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: "flex-start",
    marginBottom: spacing.md,
  },
  statusText: { fontSize: 14, fontWeight: "600", color: colors.text },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  driverAvatarText: { fontSize: 20, fontWeight: "700", color: colors.white },
  driverName: { fontSize: 16, fontWeight: "700", color: colors.text },
  driverVehicle: { fontSize: 14, color: colors.textSecondary },
  driverPhone: { fontSize: 13, color: colors.textMuted },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  fareLabel: { fontSize: 16, color: colors.textSecondary },
  fareValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  completedTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.md,
  },
  completedFare: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
    marginTop: spacing.sm,
  },
  completedRoute: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: "center",
  },
});
