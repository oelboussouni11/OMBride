import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useAuth } from "../../context/AuthContext";
import { useWebSocket } from "../../context/WebSocketContext";
import { acceptRide, arrivingRide, startRide, completeRide, fetchMe } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";
import { WS_BASE_URL } from "../../constants/api";

type DriverState = "offline" | "online" | "ride_offer" | "navigating_pickup" | "at_pickup" | "in_ride" | "completed";

export default function DriverHomeScreen() {
  const { user, token } = useAuth();
  const { lastMessage } = useWebSocket();

  const [driverState, setDriverState] = useState<DriverState>("offline");
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [driverStatus, setDriverStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(false);

  // Ride offer
  const [rideOffer, setRideOffer] = useState<any>(null);
  const [countdown, setCountdown] = useState(15);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  // Current ride
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [currentRide, setCurrentRide] = useState<any>(null);

  // Location sending
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);

  // Fetch driver info on mount
  useEffect(() => {
    fetchMe()
      .then((me) => {
        if (me.driver) {
          setCreditBalance(me.driver.credit_balance);
          setDriverStatus(me.driver.status);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for WS messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case "ride_request":
        setRideOffer(lastMessage.data);
        setCountdown(15);
        setDriverState("ride_offer");
        break;
      case "ride_expired":
        setRideOffer(null);
        setDriverState("online");
        break;
    }
  }, [lastMessage]);

  // Countdown for ride offer
  useEffect(() => {
    if (driverState === "ride_offer") {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            setRideOffer(null);
            setDriverState("online");
            return 15;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdownRef.current);
    }
  }, [driverState]);

  async function goOnline() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Location permission is required to go online.");
      return;
    }

    // Start watching location and send via WebSocket
    locationWatchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (loc) => {
        // Location is sent through the WebSocket context automatically
        // We'd need to send it manually here — but the WS is rider-based
        // For now the driver WS handles location_update messages
      }
    );

    setDriverState("online");
  }

  function goOffline() {
    locationWatchRef.current?.remove();
    locationWatchRef.current = null;
    setDriverState("offline");
  }

  async function handleAccept() {
    if (!rideOffer) return;
    clearInterval(countdownRef.current);
    setLoading(true);
    try {
      const ride = await acceptRide(rideOffer.ride_id);
      setCurrentRideId(rideOffer.ride_id);
      setCurrentRide({
        ...rideOffer,
        status: ride.status,
        fare: ride.fare,
      });
      setDriverState("navigating_pickup");
    } catch (err: any) {
      Alert.alert("Error", err.message);
      setDriverState("online");
    } finally {
      setLoading(false);
      setRideOffer(null);
    }
  }

  function handleDecline() {
    clearInterval(countdownRef.current);
    setRideOffer(null);
    setDriverState("online");
  }

  async function handleArriving() {
    if (!currentRideId) return;
    setLoading(true);
    try {
      await arrivingRide(currentRideId);
      setDriverState("at_pickup");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartRide() {
    if (!currentRideId) return;
    setLoading(true);
    try {
      await startRide(currentRideId);
      setDriverState("in_ride");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!currentRideId) return;
    setLoading(true);
    try {
      const ride = await completeRide(currentRideId);
      setCurrentRide((prev: any) => ({ ...prev, fare: ride.fare, status: "completed" }));
      setDriverState("completed");
      // Refresh balance
      fetchMe().then((me) => {
        if (me.driver) setCreditBalance(me.driver.credit_balance);
      });
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetToOnline() {
    setCurrentRideId(null);
    setCurrentRide(null);
    setDriverState("online");
  }

  function openWaze(lat: number, lng: number) {
    Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`).catch(() =>
      Alert.alert("Error", "Could not open Waze")
    );
  }

  // ── OFFLINE ───────────────────────────────────────────────────────────────
  if (driverState === "offline") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.brandText}>omb</Text>
          <Text style={styles.statusLabel}>You are offline</Text>

          {driverStatus !== "verified" && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                Account status: {driverStatus}. {driverStatus === "pending" ? "Awaiting verification." : ""}
              </Text>
            </View>
          )}

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Credit Balance</Text>
            <Text style={styles.balanceValue}>{creditBalance.toFixed(2)} DH</Text>
            {creditBalance < 5 && (
              <Text style={styles.lowCreditWarning}>Low credits — top up to accept rides</Text>
            )}
          </View>

          <Pressable
            style={[styles.goOnlineButton, driverStatus !== "verified" && styles.buttonDisabled]}
            onPress={goOnline}
            disabled={driverStatus !== "verified"}
          >
            <Text style={styles.goOnlineText}>Go Online</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── ONLINE (waiting for rides) ────────────────────────────────────────────
  if (driverState === "online") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineTitle}>You are online</Text>
          <Text style={styles.onlineSubtext}>Waiting for ride requests...</Text>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Credits</Text>
            <Text style={styles.balanceValue}>{creditBalance.toFixed(2)} DH</Text>
          </View>

          <Pressable style={styles.goOfflineButton} onPress={goOffline}>
            <Text style={styles.goOfflineText}>Go Offline</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── RIDE OFFER ────────────────────────────────────────────────────────────
  if (driverState === "ride_offer" && rideOffer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <View style={styles.countdownCircle}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
          <Text style={styles.offerTitle}>New Ride Request</Text>

          <View style={styles.offerCard}>
            <Text style={styles.offerAddress}>{rideOffer.pickup_address}</Text>
            <Text style={styles.offerArrow}>→</Text>
            <Text style={styles.offerAddress}>{rideOffer.dropoff_address}</Text>
            <View style={styles.offerDetails}>
              {rideOffer.fare && (
                <Text style={styles.offerFare}>{rideOffer.fare} DH</Text>
              )}
              {rideOffer.distance_km && (
                <Text style={styles.offerDetail}>{rideOffer.distance_km} km</Text>
              )}
            </View>
          </View>

          <Pressable style={styles.acceptButton} onPress={handleAccept} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.acceptButtonText}>Accept</Text>
            )}
          </Pressable>
          <Pressable style={styles.declineButton} onPress={handleDecline}>
            <Text style={styles.declineButtonText}>Decline</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── NAVIGATING TO PICKUP ──────────────────────────────────────────────────
  if (driverState === "navigating_pickup") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>Navigate to pickup</Text>
        </View>
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>Heading to pickup</Text>
          <Text style={styles.rideAddress}>{currentRide?.pickup_address}</Text>

          <Pressable style={styles.wazeButton} onPress={() => openWaze(0, 0)}>
            <Text style={styles.wazeButtonText}>Open in Waze</Text>
          </Pressable>

          <Pressable style={styles.primaryButton} onPress={handleArriving} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Arrived at Pickup</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── AT PICKUP ─────────────────────────────────────────────────────────────
  if (driverState === "at_pickup") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={{ fontSize: 48 }}>&#x1F4CD;</Text>
          <Text style={styles.atPickupTitle}>Waiting for rider</Text>
          <Text style={styles.rideAddress}>{currentRide?.pickup_address}</Text>

          <Pressable style={[styles.primaryButton, { width: "80%", marginTop: 32 }]} onPress={handleStartRide} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Start Ride</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── IN RIDE ───────────────────────────────────────────────────────────────
  if (driverState === "in_ride") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>Ride in progress</Text>
        </View>
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>Ride in progress</Text>
          <Text style={styles.rideAddress}>→ {currentRide?.dropoff_address}</Text>

          <Pressable style={styles.wazeButton} onPress={() => openWaze(0, 0)}>
            <Text style={styles.wazeButtonText}>Open in Waze</Text>
          </Pressable>

          <Pressable style={styles.primaryButton} onPress={handleComplete} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Complete Ride</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── COMPLETED ─────────────────────────────────────────────────────────────
  if (driverState === "completed") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={{ fontSize: 48 }}>&#x2705;</Text>
          <Text style={styles.completedTitle}>Ride Complete</Text>
          {currentRide?.fare && (
            <Text style={styles.completedFare}>{currentRide.fare} DH</Text>
          )}
          <Text style={styles.commissionNote}>1 DH commission deducted</Text>
          <Text style={styles.newBalance}>Balance: {creditBalance.toFixed(2)} DH</Text>

          <Pressable style={[styles.primaryButton, { width: "80%", marginTop: 32 }]} onPress={resetToOnline}>
            <Text style={styles.primaryButtonText}>Continue Driving</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  brandText: { fontSize: 36, fontWeight: "900", color: colors.text, letterSpacing: -2, marginBottom: spacing.sm },
  statusLabel: { fontSize: 16, color: colors.textMuted, marginBottom: spacing.xl },
  warningBanner: {
    backgroundColor: "#fef3c7",
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    width: "100%",
  },
  warningText: { fontSize: 13, color: "#92400e", textAlign: "center" },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.lg,
  },
  balanceLabel: { fontSize: 13, color: colors.textMuted },
  balanceValue: { fontSize: 32, fontWeight: "800", color: colors.text, marginTop: spacing.xs },
  lowCreditWarning: { fontSize: 12, color: colors.danger, marginTop: spacing.sm },
  goOnlineButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 48,
  },
  goOnlineText: { color: colors.white, fontSize: 18, fontWeight: "700" },
  buttonDisabled: { opacity: 0.4 },
  onlineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    marginBottom: spacing.md,
  },
  onlineTitle: { fontSize: 22, fontWeight: "700", color: colors.text },
  onlineSubtext: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xl },
  goOfflineButton: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  goOfflineText: { fontSize: 16, fontWeight: "600", color: colors.textSecondary },
  countdownCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  countdownText: { fontSize: 28, fontWeight: "800", color: colors.white },
  offerTitle: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: spacing.lg },
  offerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    width: "100%",
    marginBottom: spacing.lg,
  },
  offerAddress: { fontSize: 15, fontWeight: "600", color: colors.text },
  offerArrow: { fontSize: 18, color: colors.textMuted, marginVertical: spacing.xs },
  offerDetails: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  offerFare: { fontSize: 18, fontWeight: "700", color: colors.text },
  offerDetail: { fontSize: 14, color: colors.textMuted, alignSelf: "center" },
  acceptButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 16,
    alignItems: "center",
    width: "100%",
  },
  acceptButtonText: { color: colors.white, fontSize: 18, fontWeight: "700" },
  declineButton: {
    paddingVertical: 14,
    alignItems: "center",
    width: "100%",
    marginTop: spacing.sm,
  },
  declineButtonText: { fontSize: 16, color: colors.textMuted, fontWeight: "500" },
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
  sheetTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  rideAddress: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.md },
  wazeButton: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  wazeButtonText: { fontSize: 15, fontWeight: "600", color: colors.text },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  atPickupTitle: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  completedTitle: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  completedFare: { fontSize: 32, fontWeight: "800", color: colors.text, marginTop: spacing.sm },
  commissionNote: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  newBalance: { fontSize: 16, fontWeight: "600", color: colors.textSecondary, marginTop: spacing.sm },
});
