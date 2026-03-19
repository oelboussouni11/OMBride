import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../context/AuthContext";
import { useWebSocket } from "../../context/WebSocketContext";
import { acceptRide, arrivingRide, startRide, completeRide, fetchMe, rateRide, fetchActiveRide } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

type DriverState = "offline" | "online" | "ride_offer" | "navigating_pickup" | "at_pickup" | "in_ride" | "completed";

export default function DriverHomeScreen() {
  const { user } = useAuth();
  const { lastMessage, sendMessage } = useWebSocket();

  const [driverState, setDriverState] = useState<DriverState>("offline");
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [driverStatus, setDriverStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(false);
  const [rideOffer, setRideOffer] = useState<any>(null);
  const [countdown, setCountdown] = useState(15);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);

  useEffect(() => {
    fetchMe().then((me) => {
      if (me.driver) {
        setCreditBalance(me.driver.credit_balance);
        setDriverStatus(me.driver.status);
      }
    }).catch(() => {});

    // Restore active ride state on mount (survives refresh)
    fetchActiveRide().then((data) => {
      if (data.ride && data.ride.driver_id) {
        const r = data.ride;
        setCurrentRideId(r.id);
        setCurrentRide({
          ride_id: r.id,
          pickup_address: r.pickup_address,
          dropoff_address: r.dropoff_address,
          fare: r.fare,
          distance_km: r.distance_km,
          duration_min: r.duration_min,
        });
        const statusMap: Record<string, DriverState> = {
          matched: "navigating_pickup",
          arriving: "at_pickup",
          in_progress: "in_ride",
        };
        const mapped = statusMap[r.status];
        if (mapped) setDriverState(mapped);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === "ride_request") {
      setRideOffer(lastMessage.data);
      setCountdown(15);
      setDriverState("ride_offer");
    } else if (lastMessage.type === "ride_expired") {
      setRideOffer(null);
      setDriverState("online");
    }
  }, [lastMessage]);

  useEffect(() => {
    if (driverState === "ride_offer") {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(countdownRef.current); setRideOffer(null); setDriverState("online"); return 15; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdownRef.current);
    }
  }, [driverState]);

  async function goOnline() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Location is required."); return; }
    locationWatchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (loc) => sendMessage({ type: "location_update", data: { lat: loc.coords.latitude, lng: loc.coords.longitude } })
    );
    setDriverState("online");
  }

  function goOffline() {
    try { locationWatchRef.current?.remove(); } catch {}
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
      setCurrentRide({ ...rideOffer, status: ride.status, fare: ride.fare });
      setDriverState("navigating_pickup");
    } catch (err: any) { Alert.alert("Error", err.message); setDriverState("online"); }
    finally { setLoading(false); setRideOffer(null); }
  }

  function handleDecline() { clearInterval(countdownRef.current); setRideOffer(null); setDriverState("online"); }

  async function handleArriving() {
    if (!currentRideId) return; setLoading(true);
    try { await arrivingRide(currentRideId); setDriverState("at_pickup"); }
    catch (err: any) { Alert.alert("Error", err.message); }
    finally { setLoading(false); }
  }

  async function handleStartRide() {
    if (!currentRideId) return; setLoading(true);
    try { await startRide(currentRideId); setDriverState("in_ride"); }
    catch (err: any) { Alert.alert("Error", err.message); }
    finally { setLoading(false); }
  }

  async function handleComplete() {
    if (!currentRideId) return; setLoading(true);
    try {
      const ride = await completeRide(currentRideId);
      setCurrentRide((prev: any) => ({ ...prev, fare: ride.fare, status: "completed" }));
      setDriverState("completed");
      fetchMe().then((me) => { if (me.driver) setCreditBalance(me.driver.credit_balance); });
    } catch (err: any) { Alert.alert("Error", err.message); }
    finally { setLoading(false); }
  }

  function resetToOnline() { setCurrentRideId(null); setCurrentRide(null); setSelectedRating(0); setDriverState("online"); }

  function openWaze(lat: number, lng: number) {
    Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`).catch(() => Alert.alert("Error", "Could not open Waze"));
  }

  // ── OFFLINE ─────────────────────────────────────────────────────────────
  if (driverState === "offline") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.offlineTop}>
          <Text style={s.greeting}>Hello, {user?.name?.split(" ")[0] || "Driver"}</Text>
          <Text style={s.offlineStatus}>You are offline</Text>
        </View>

        <View style={s.offlineContent}>
          {driverStatus !== "verified" && (
            <View style={s.alertCard}>
              <Ionicons name="alert-circle-outline" size={20} color="#92400e" />
              <Text style={s.alertText}>
                Account {driverStatus}. {driverStatus === "pending" ? "Awaiting verification." : "Contact support."}
              </Text>
            </View>
          )}

          <View style={s.balanceCard}>
            <View style={s.balanceRow}>
              <View>
                <Text style={s.balanceLabel}>Credit Balance</Text>
                <Text style={s.balanceAmount}>{creditBalance.toFixed(2)} DH</Text>
              </View>
              <Ionicons name="wallet" size={32} color="rgba(255,255,255,0.3)" />
            </View>
            {creditBalance < 5 && (
              <View style={s.lowCreditRow}>
                <Ionicons name="warning-outline" size={14} color="#fbbf24" />
                <Text style={s.lowCreditText}>Low credits — top up to accept rides</Text>
              </View>
            )}
          </View>

          <Pressable
            style={[s.goOnlineBtn, driverStatus !== "verified" && s.btnDisabled]}
            onPress={goOnline}
            disabled={driverStatus !== "verified"}
          >
            <Ionicons name="power" size={22} color={colors.white} />
            <Text style={s.goOnlineBtnText}>Go Online</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── ONLINE ──────────────────────────────────────────────────────────────
  if (driverState === "online") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.onlineTop}>
          <View style={s.pulseWrap}>
            <View style={s.pulseDot} />
            <View style={s.pulseRing} />
          </View>
          <Text style={s.onlineTitle}>You are online</Text>
          <Text style={s.onlineSub}>Waiting for ride requests</Text>
        </View>
        <View style={s.onlineContent}>
          <View style={s.onlineStatsRow}>
            <View style={s.onlineStat}>
              <Ionicons name="wallet-outline" size={20} color={colors.textSecondary} />
              <Text style={s.onlineStatValue}>{creditBalance.toFixed(2)} DH</Text>
              <Text style={s.onlineStatLabel}>Credits</Text>
            </View>
          </View>
          <Pressable style={s.goOfflineBtn} onPress={goOffline}>
            <Ionicons name="power" size={18} color={colors.textSecondary} />
            <Text style={s.goOfflineBtnText}>Go Offline</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── RIDE OFFER ──────────────────────────────────────────────────────────
  if (driverState === "ride_offer" && rideOffer) {
    const progress = countdown / 15;
    return (
      <SafeAreaView style={s.container}>
        <View style={s.offerTop}>
          <Text style={s.offerLabel}>NEW RIDE REQUEST</Text>
          <View style={s.countdownWrap}>
            <Text style={s.countdownNum}>{countdown}</Text>
            <Text style={s.countdownUnit}>sec</Text>
          </View>
          {/* Progress bar */}
          <View style={s.countdownBar}>
            <View style={[s.countdownFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>

        <View style={s.offerContent}>
          {/* Route */}
          <View style={s.routeCard}>
            <View style={s.routeRow}>
              <View style={[s.routeDot, { backgroundColor: colors.success }]} />
              <Text style={s.routeText} numberOfLines={1}>{rideOffer.pickup_address || "Pickup"}</Text>
            </View>
            <View style={s.routeLine} />
            <View style={s.routeRow}>
              <View style={[s.routeDot, { backgroundColor: colors.danger }]} />
              <Text style={s.routeText} numberOfLines={1}>{rideOffer.dropoff_address || "Dropoff"}</Text>
            </View>
          </View>

          {/* Details */}
          <View style={s.offerDetailsRow}>
            {rideOffer.fare ? (
              <View style={s.offerDetailBox}>
                <Text style={s.offerDetailValue}>{rideOffer.fare} DH</Text>
                <Text style={s.offerDetailLabel}>Fare</Text>
              </View>
            ) : null}
            {rideOffer.distance_km ? (
              <View style={s.offerDetailBox}>
                <Text style={s.offerDetailValue}>{rideOffer.distance_km} km</Text>
                <Text style={s.offerDetailLabel}>Distance</Text>
              </View>
            ) : null}
            {rideOffer.duration_min ? (
              <View style={s.offerDetailBox}>
                <Text style={s.offerDetailValue}>{rideOffer.duration_min} min</Text>
                <Text style={s.offerDetailLabel}>Duration</Text>
              </View>
            ) : null}
          </View>

          <Pressable style={s.acceptBtn} onPress={handleAccept} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : (
              <><Ionicons name="checkmark-circle-outline" size={20} color={colors.white} /><Text style={s.acceptBtnText}>Accept Ride</Text></>
            )}
          </Pressable>
          <Pressable style={s.declineBtn} onPress={handleDecline}>
            <Text style={s.declineBtnText}>Decline</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── NAVIGATING TO PICKUP ────────────────────────────────────────────────
  if (driverState === "navigating_pickup") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.rideMapArea}>
          <Ionicons name="navigate-outline" size={40} color={colors.textMuted} />
          <Text style={s.rideMapLabel}>Navigate to pickup</Text>
        </View>
        <View style={s.rideSheet}>
          <View style={s.rideSheetHandle} />
          <View style={s.rideStatusRow}>
            <View style={[s.rideStatusDot, { backgroundColor: colors.primary }]} />
            <Text style={s.rideStatusText}>Heading to pickup</Text>
          </View>
          <Text style={s.rideSheetAddress}>{currentRide?.pickup_address}</Text>
          {currentRide?.fare && <Text style={s.rideSheetFare}>{currentRide.fare} DH</Text>}
          <Pressable style={s.wazeBtn} onPress={() => openWaze(0, 0)}>
            <Ionicons name="navigate-outline" size={16} color={colors.text} />
            <Text style={s.wazeBtnText}>Open in Waze</Text>
          </Pressable>
          <Pressable style={s.rideActionBtn} onPress={handleArriving} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={s.rideActionText}>Arrived at Pickup</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── AT PICKUP ───────────────────────────────────────────────────────────
  if (driverState === "at_pickup") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.rideMapArea}>
          <Ionicons name="location" size={40} color={colors.warning} />
          <Text style={s.rideMapLabel}>At pickup location</Text>
        </View>
        <View style={s.rideSheet}>
          <View style={s.rideSheetHandle} />
          <View style={s.rideStatusRow}>
            <View style={[s.rideStatusDot, { backgroundColor: colors.warning }]} />
            <Text style={s.rideStatusText}>Waiting for rider</Text>
          </View>
          <Text style={s.rideSheetAddress}>{currentRide?.pickup_address}</Text>
          <Pressable style={s.rideActionBtn} onPress={handleStartRide} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={s.rideActionText}>Start Ride</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── IN RIDE ─────────────────────────────────────────────────────────────
  if (driverState === "in_ride") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.rideMapArea}>
          <Ionicons name="car" size={40} color={colors.success} />
          <Text style={s.rideMapLabel}>Ride in progress</Text>
        </View>
        <View style={s.rideSheet}>
          <View style={s.rideSheetHandle} />
          <View style={s.rideStatusRow}>
            <View style={[s.rideStatusDot, { backgroundColor: colors.success }]} />
            <Text style={s.rideStatusText}>In progress</Text>
          </View>
          <Text style={s.rideSheetAddress}>{currentRide?.dropoff_address}</Text>
          {currentRide?.fare && <Text style={s.rideSheetFare}>{currentRide.fare} DH</Text>}
          <Pressable style={s.wazeBtn} onPress={() => openWaze(0, 0)}>
            <Ionicons name="navigate-outline" size={16} color={colors.text} />
            <Text style={s.wazeBtnText}>Open in Waze</Text>
          </Pressable>
          <Pressable style={[s.rideActionBtn, { backgroundColor: colors.success }]} onPress={handleComplete} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={s.rideActionText}>Complete Ride</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── COMPLETED ───────────────────────────────────────────────────────────
  if (driverState === "completed") {
    async function submitRating() {
      if (selectedRating === 0 || !currentRideId) return;
      try {
        await rateRide(currentRideId, selectedRating);
      } catch (err: any) {
        Alert.alert("Rating failed", err.message || "Could not submit rating.");
      }
      resetToOnline();
    }

    return (
      <SafeAreaView style={s.container}>
        <View style={s.completedContent}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <Text style={s.completedTitle}>Ride Complete</Text>
          {currentRide?.fare && <Text style={s.completedFare}>{currentRide.fare} DH</Text>}
          <Text style={s.completedNote}>Commission deducted</Text>
          <Text style={s.completedBalance}>Balance: {creditBalance.toFixed(2)} DH</Text>

          <Text style={s.ratePrompt}>Rate the rider</Text>
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setSelectedRating(star)}>
                <Ionicons name={star <= selectedRating ? "star" : "star-outline"} size={32} color={star <= selectedRating ? colors.warning : colors.border} />
              </Pressable>
            ))}
          </View>

          <Pressable style={s.rideActionBtn} onPress={selectedRating > 0 ? submitRating : resetToOnline}>
            <Text style={s.rideActionText}>{selectedRating > 0 ? "Submit & Continue" : "Skip & Continue"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Offline
  offlineTop: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  greeting: { fontSize: 28, fontWeight: "800", color: colors.text },
  offlineStatus: { fontSize: 15, color: colors.textMuted, marginTop: 2 },
  offlineContent: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  alertCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: "#fef3c7", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  alertText: { fontSize: 13, color: "#92400e", flex: 1 },
  balanceCard: {
    backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg,
  },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.5 },
  balanceAmount: { fontSize: 36, fontWeight: "800", color: colors.white, marginTop: spacing.xs },
  lowCreditRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  lowCreditText: { fontSize: 12, color: "#fbbf24" },
  goOnlineBtn: {
    flexDirection: "row", backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: 18, alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  goOnlineBtnText: { color: colors.white, fontSize: 18, fontWeight: "700" },
  btnDisabled: { opacity: 0.4 },

  // Online
  onlineTop: { flex: 1, justifyContent: "center", alignItems: "center" },
  pulseWrap: { position: "relative", width: 48, height: 48, justifyContent: "center", alignItems: "center", marginBottom: spacing.lg },
  pulseDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.success },
  pulseRing: { position: "absolute", width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.success, opacity: 0.3 },
  onlineTitle: { fontSize: 24, fontWeight: "700", color: colors.text },
  onlineSub: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs },
  onlineContent: { padding: spacing.lg },
  onlineStatsRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  onlineStat: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  onlineStatValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  onlineStatLabel: { fontSize: 13, color: colors.textMuted },
  goOfflineBtn: {
    flexDirection: "row", borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  goOfflineBtnText: { fontSize: 16, fontWeight: "600", color: colors.textSecondary },

  // Ride offer
  offerTop: { backgroundColor: colors.primary, padding: spacing.lg, paddingTop: spacing.xl },
  offerLabel: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  countdownWrap: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: spacing.sm },
  countdownNum: { fontSize: 48, fontWeight: "800", color: colors.white },
  countdownUnit: { fontSize: 16, color: "rgba(255,255,255,0.5)" },
  countdownBar: { height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, marginTop: spacing.md, overflow: "hidden" },
  countdownFill: { height: "100%", backgroundColor: colors.white, borderRadius: 2 },
  offerContent: { flex: 1, padding: spacing.lg },
  routeCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  routeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, height: 16, backgroundColor: colors.border, marginLeft: 4, marginVertical: 2 },
  routeText: { fontSize: 15, fontWeight: "600", color: colors.text, flex: 1 },
  offerDetailsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  offerDetailBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm + 2, alignItems: "center" },
  offerDetailValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  offerDetailLabel: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  acceptBtn: {
    flexDirection: "row", backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: 16, alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  acceptBtnText: { color: colors.white, fontSize: 18, fontWeight: "700" },
  declineBtn: { paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  declineBtnText: { fontSize: 16, color: colors.textMuted, fontWeight: "500" },

  // Ride states (shared)
  rideMapArea: { flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" },
  rideMapLabel: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm },
  rideSheet: {
    backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  rideSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  rideStatusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  rideStatusDot: { width: 10, height: 10, borderRadius: 5 },
  rideStatusText: { fontSize: 16, fontWeight: "700", color: colors.text },
  rideSheetAddress: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.sm },
  rideSheetFare: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  wazeBtn: {
    flexDirection: "row", borderWidth: 2, borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: 12, alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.sm,
  },
  wazeBtnText: { fontSize: 15, fontWeight: "600", color: colors.text },
  rideActionBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: "center", marginTop: spacing.xs,
  },
  rideActionText: { color: colors.white, fontSize: 16, fontWeight: "700" },

  // Completed
  completedContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  completedTitle: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  completedFare: { fontSize: 40, fontWeight: "800", color: colors.text, marginTop: spacing.sm },
  completedNote: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  completedBalance: { fontSize: 16, fontWeight: "600", color: colors.textSecondary, marginTop: spacing.sm },
  ratePrompt: { fontSize: 16, fontWeight: "600", color: colors.textSecondary, marginTop: spacing.xl },
  starsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.xl },
});
