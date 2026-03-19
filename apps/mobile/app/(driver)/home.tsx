import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../context/AuthContext";
import { useWebSocket } from "../../context/WebSocketContext";
import { acceptRide, arrivingRide, startRide, completeRide, cancelRide, fetchMe, rateRide, fetchActiveRide } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

type DriverState = "offline" | "online" | "ride_offer" | "navigating_pickup" | "at_pickup" | "in_ride" | "completed";

export default function DriverHomeScreen() {
  const { user } = useAuth();
  const { lastMessage, sendMessage } = useWebSocket();


  const [driverState, setDriverState] = useState<DriverState>("offline");
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [driverStatus, setDriverStatus] = useState<string>("loading");
  const [loading, setLoading] = useState(false);
  const [rideOffer, setRideOffer] = useState<any>(null);
  const [countdown, setCountdown] = useState(15);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);
  // Cancel timer: driver can cancel after 4 min (240s) of waiting
  const CANCEL_WAIT_SECONDS = 240;
  const [rideElapsed, setRideElapsed] = useState(0);
  const rideTimerRef = useRef<ReturnType<typeof setInterval>>();

  // Recover state when user returns to app
  useEffect(() => {
    if (typeof document === "undefined") return;
    function onVisible() {
      if (document.visibilityState === "visible" && currentRideId) {
        fetchActiveRide().then((data) => {
          if (!data.ride) { setCurrentRideId(null); setCurrentRide(null); setDriverState("online"); return; }
          const statusMap: Record<string, DriverState> = {
            matched: "navigating_pickup", arriving: "at_pickup", in_progress: "in_ride",
          };
          const s = statusMap[data.ride.status];
          if (s) setDriverState(s);
        }).catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [currentRideId]);

  useEffect(() => {
    fetchMe().then((me) => {
      if (me.driver) {
        setCreditBalance(me.driver.credit_balance);
        setDriverStatus(me.driver.status || "pending");
      }
    }).catch((err) => { console.log("fetchMe failed:", err); setDriverStatus("error"); });

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
    } else if (lastMessage.type === "ride_status" && lastMessage.data.status === "cancelled") {
      // Rider cancelled — reset to online (toast notification handled by WebSocketContext)
      setCurrentRideId(null);
      setCurrentRide(null);
      setRideOffer(null);
      setDriverState("online");
    }
  }, [lastMessage]);

  // Poll active ride status every 3s — recovers state when returning to app
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    const shouldPoll = driverState === "navigating_pickup" || driverState === "at_pickup" || driverState === "in_ride";
    if (shouldPoll) {
      pollRef.current = setInterval(async () => {
        try {
          const data = await fetchActiveRide();
          if (!data.ride) {
            // Ride gone (cancelled)
            setCurrentRideId(null);
            setCurrentRide(null);
            setDriverState("online");
            return;
          }
          const r = data.ride;
          const statusMap: Record<string, DriverState> = {
            matched: "navigating_pickup",
            arriving: "at_pickup",
            in_progress: "in_ride",
            completed: "completed",
            cancelled: "online",
          };
          const newState = statusMap[r.status];
          if (newState && newState !== driverState) {
            if (newState === "online") { setCurrentRideId(null); setCurrentRide(null); }
            setDriverState(newState);
          }
        } catch {}
      }, 3000);
      return () => clearInterval(pollRef.current);
    } else {
      clearInterval(pollRef.current);
    }
  }, [driverState]);

  // Ride elapsed timer — starts when driver accepts, enables cancel after 4 min
  useEffect(() => {
    if (driverState === "navigating_pickup" || driverState === "at_pickup") {
      setRideElapsed(0);
      rideTimerRef.current = setInterval(() => {
        setRideElapsed((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(rideTimerRef.current);
    } else {
      clearInterval(rideTimerRef.current);
      setRideElapsed(0);
    }
  }, [driverState]);

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
    // Try Expo Location
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        locationWatchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
          (loc) => sendMessage({ type: "location_update", data: { lat: loc.coords.latitude, lng: loc.coords.longitude } })
        );
        setDriverState("online");
        return;
      }
    } catch {}
    // Try browser native geolocation
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        sendMessage({ type: "location_update", data: { lat, lng } });
        // Watch position
        const watchId = navigator.geolocation.watchPosition(
          (p) => sendMessage({ type: "location_update", data: { lat: p.coords.latitude, lng: p.coords.longitude } }),
          () => {},
          { enableHighAccuracy: true }
        );
        locationWatchRef.current = { remove: () => navigator.geolocation.clearWatch(watchId) } as any;
        setDriverState("online");
        return;
      } catch {}
    }
    // No GPS available — go online anyway with fallback location
    // On production with HTTPS, real GPS will work
    sendMessage({ type: "location_update", data: { lat: 33.9716, lng: -6.8498 } });
    const interval = setInterval(() => {
      sendMessage({ type: "location_update", data: { lat: 33.9716, lng: -6.8498 } });
    }, 5000);
    locationWatchRef.current = { remove: () => clearInterval(interval) } as any;
    setDriverState("online");
  }

  function goOffline() {
    try { locationWatchRef.current?.remove(); } catch {}
    locationWatchRef.current = null;
    sendMessage({ type: "go_offline" });
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

  async function handleDriverCancel() {
    if (!currentRideId) return;
    Alert.alert(
      "Cancel Ride?",
      "Are you sure you want to cancel this ride? This affects your score.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelRide(currentRideId);
              setCurrentRideId(null);
              setCurrentRide(null);
              setDriverState("online");
            } catch (err: any) {
              Alert.alert("Error", err.message || "Could not cancel ride");
            }
          },
        },
      ]
    );
  }

  function formatTimer(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

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
          <View style={s.greetingRow}>
            <View>
              <Text style={s.greeting}>Hello, {user?.name?.split(" ")[0] || "Driver"}</Text>
              <Text style={s.offlineStatus}>You are offline</Text>
            </View>
            <View style={s.offlineAvatar}>
              <Text style={s.offlineAvatarText}>{(user?.name || "D")[0].toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={s.offlineContent}>
          {(driverStatus === "pending" || driverStatus === "rejected") && (
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
              <View style={s.balanceIconWrap}>
                <Ionicons name="wallet" size={24} color="rgba(255,255,255,0.8)" />
              </View>
            </View>
            {creditBalance < 5 && (
              <View style={s.lowCreditRow}>
                <Ionicons name="warning-outline" size={14} color="#fbbf24" />
                <Text style={s.lowCreditText}>Low credits — top up to accept rides</Text>
              </View>
            )}
          </View>

          {/* Quick stats */}
          <View style={s.quickStats}>
            <View style={s.quickStatItem}>
              <Ionicons name="car-outline" size={20} color={colors.textSecondary} />
              <Text style={s.quickStatLabel}>Ready to drive?</Text>
            </View>
          </View>

          <TouchableOpacity style={s.goOnlineBtn} onPress={goOnline} activeOpacity={0.7}>
            <Ionicons name="power" size={22} color={colors.white} />
            <Text style={s.goOnlineBtnText}>Go Online</Text>
          </TouchableOpacity>
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
          <View style={s.onlineStatsGrid}>
            <View style={s.onlineStatCard}>
              <Ionicons name="wallet-outline" size={22} color={colors.primary} />
              <Text style={s.onlineStatValue}>{creditBalance.toFixed(2)}</Text>
              <Text style={s.onlineStatLabel}>Credits (DH)</Text>
            </View>
            <View style={s.onlineStatCard}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.success} />
              <Text style={s.onlineStatValue}>{driverStatus}</Text>
              <Text style={s.onlineStatLabel}>Status</Text>
            </View>
          </View>
          <TouchableOpacity style={s.goOfflineBtn} onPress={goOffline} activeOpacity={0.7}>
            <Ionicons name="power" size={18} color={colors.danger} />
            <Text style={[s.goOfflineBtnText, { color: colors.danger }]}>Go Offline</Text>
          </TouchableOpacity>
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
              <View style={{ flex: 1 }}>
                <Text style={s.routeText} numberOfLines={1}>{rideOffer.pickup_address || "Pickup"}</Text>
                {rideOffer.pickup_lat ? (
                  <Text style={s.routeCoord}>{rideOffer.pickup_lat.toFixed(5)}, {rideOffer.pickup_lng.toFixed(5)}</Text>
                ) : null}
              </View>
            </View>
            <View style={s.routeLine} />
            <View style={s.routeRow}>
              <View style={[s.routeDot, { backgroundColor: colors.danger }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.routeText} numberOfLines={1}>{rideOffer.dropoff_address || "Dropoff"}</Text>
                {rideOffer.dropoff_lat ? (
                  <Text style={s.routeCoord}>{rideOffer.dropoff_lat.toFixed(5)}, {rideOffer.dropoff_lng.toFixed(5)}</Text>
                ) : null}
              </View>
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
                <Text style={s.offerDetailLabel}>Trip</Text>
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
    const canCancel = rideElapsed >= CANCEL_WAIT_SECONDS;
    const remaining = Math.max(0, CANCEL_WAIT_SECONDS - rideElapsed);
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
            <Text style={s.rideTimer}>{formatTimer(rideElapsed)}</Text>
          </View>
          <Text style={s.rideSheetAddress}>{currentRide?.pickup_address}</Text>
          {currentRide?.pickup_lat ? <Text style={s.rideSheetCoord}>{currentRide.pickup_lat.toFixed(5)}, {currentRide.pickup_lng.toFixed(5)}</Text> : null}
          {currentRide?.fare && <Text style={s.rideSheetFare}>{currentRide.fare} DH</Text>}
          <View style={s.actionRow}>
            <Pressable style={s.wazeBtn} onPress={() => openWaze(currentRide?.pickup_lat || 0, currentRide?.pickup_lng || 0)}>
              <Ionicons name="navigate-outline" size={16} color={colors.text} />
              <Text style={s.wazeBtnText}>Waze</Text>
            </Pressable>
            {currentRide?.rider_phone && (
              <Pressable style={s.callBtn} onPress={() => Linking.openURL(`tel:${currentRide.rider_phone}`)}>
                <Ionicons name="call-outline" size={16} color={colors.text} />
                <Text style={s.wazeBtnText}>Call Rider</Text>
              </Pressable>
            )}
          </View>
          <Pressable style={s.rideActionBtn} onPress={handleArriving} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={s.rideActionText}>Arrived at Pickup</Text>}
          </Pressable>
          {canCancel ? (
            <Pressable style={s.cancelBtn} onPress={handleDriverCancel}>
              <Text style={s.cancelBtnText}>Cancel Ride</Text>
            </Pressable>
          ) : (
            <Text style={s.cancelNote}>Cancel available in {formatTimer(remaining)}</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── AT PICKUP ───────────────────────────────────────────────────────────
  if (driverState === "at_pickup") {
    const canCancel = rideElapsed >= CANCEL_WAIT_SECONDS;
    const remaining = Math.max(0, CANCEL_WAIT_SECONDS - rideElapsed);
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
            <Text style={s.rideTimer}>{formatTimer(rideElapsed)}</Text>
          </View>
          <Text style={s.rideSheetAddress}>{currentRide?.pickup_address}</Text>
          <Pressable style={s.rideActionBtn} onPress={handleStartRide} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={s.rideActionText}>Start Ride</Text>}
          </Pressable>
          {canCancel ? (
            <Pressable style={s.cancelBtn} onPress={handleDriverCancel}>
              <Text style={s.cancelBtnText}>Cancel Ride</Text>
            </Pressable>
          ) : (
            <Text style={s.cancelNote}>Cancel available in {formatTimer(remaining)}</Text>
          )}
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
          {currentRide?.dropoff_lat ? <Text style={s.rideSheetCoord}>{currentRide.dropoff_lat.toFixed(5)}, {currentRide.dropoff_lng.toFixed(5)}</Text> : null}
          {currentRide?.fare && <Text style={s.rideSheetFare}>{currentRide.fare} DH</Text>}
          <View style={s.actionRow}>
            <Pressable style={s.wazeBtn} onPress={() => openWaze(currentRide?.dropoff_lat || 0, currentRide?.dropoff_lng || 0)}>
              <Ionicons name="navigate-outline" size={16} color={colors.text} />
              <Text style={s.wazeBtnText}>Waze</Text>
            </Pressable>
            {currentRide?.rider_phone && (
              <Pressable style={s.callBtn} onPress={() => Linking.openURL(`tel:${currentRide.rider_phone}`)}>
                <Ionicons name="call-outline" size={16} color={colors.text} />
                <Text style={s.wazeBtnText}>Call Rider</Text>
              </Pressable>
            )}
          </View>
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
              <Pressable key={star} onPress={() => setSelectedRating(star)} style={s.starBtn}>
                <Ionicons name={star <= selectedRating ? "star" : "star-outline"} size={36} color={star <= selectedRating ? colors.warning : colors.border} />
              </Pressable>
            ))}
          </View>

          {selectedRating > 0 ? (
            <Pressable style={s.submitRatingBtn} onPress={submitRating}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
              <Text style={s.submitRatingText}>Submit Rating</Text>
            </Pressable>
          ) : null}
          <Pressable style={s.skipBtn} onPress={resetToOnline}>
            <Text style={s.skipBtnText}>{selectedRating > 0 ? "Skip" : "Skip Rating"}</Text>
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
  greetingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontSize: 26, fontWeight: "800", color: colors.text },
  offlineStatus: { fontSize: 15, color: colors.textMuted, marginTop: 2 },
  offlineAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.surface, justifyContent: "center", alignItems: "center",
  },
  offlineAvatarText: { fontSize: 20, fontWeight: "700", color: colors.text },
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
  balanceIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center",
  },
  balanceAmount: { fontSize: 36, fontWeight: "800", color: colors.white, marginTop: spacing.xs },
  lowCreditRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  lowCreditText: { fontSize: 12, color: "#fbbf24" },
  goOnlineBtn: {
    flexDirection: "row", backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: 18, alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  goOnlineBtnText: { color: colors.white, fontSize: 18, fontWeight: "700" },
  quickStats: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md, alignItems: "center",
  },
  quickStatItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  quickStatLabel: { fontSize: 15, color: colors.textSecondary, fontWeight: "500" },
  btnDisabled: { opacity: 0.4 },

  // Online
  onlineTop: { flex: 1, justifyContent: "center", alignItems: "center" },
  pulseWrap: { position: "relative", width: 48, height: 48, justifyContent: "center", alignItems: "center", marginBottom: spacing.lg },
  pulseDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.success },
  pulseRing: { position: "absolute", width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.success, opacity: 0.3 },
  onlineTitle: { fontSize: 24, fontWeight: "700", color: colors.text },
  onlineSub: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs },
  onlineContent: { padding: spacing.lg },
  onlineStatsGrid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  onlineStatCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, alignItems: "center", gap: spacing.xs,
  },
  onlineStatValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  onlineStatLabel: { fontSize: 11, color: colors.textMuted },
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
  routeText: { fontSize: 15, fontWeight: "600", color: colors.text },
  routeCoord: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
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
  rideSheetAddress: { fontSize: 15, color: colors.textSecondary, marginBottom: 2 },
  rideSheetCoord: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  rideSheetFare: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  wazeBtn: {
    flex: 1, flexDirection: "row", borderWidth: 2, borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: 12, alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  wazeBtnText: { fontSize: 15, fontWeight: "600", color: colors.text },
  rideTimer: { fontSize: 14, fontWeight: "700", color: colors.textMuted, marginLeft: "auto" },
  rideActionBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: "center", marginTop: spacing.xs,
  },
  rideActionText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  cancelBtn: {
    borderWidth: 2, borderColor: colors.danger, borderRadius: radius.md,
    paddingVertical: 12, alignItems: "center", marginTop: spacing.sm,
  },
  cancelBtnText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
  cancelNote: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },

  // Completed
  completedContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  completedTitle: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  completedFare: { fontSize: 40, fontWeight: "800", color: colors.text, marginTop: spacing.sm },
  completedNote: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  completedBalance: { fontSize: 16, fontWeight: "600", color: colors.textSecondary, marginTop: spacing.sm },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  callBtn: {
    flex: 1, flexDirection: "row", borderWidth: 2, borderColor: colors.success, borderRadius: radius.sm,
    paddingVertical: 12, alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  ratePrompt: { fontSize: 16, fontWeight: "600", color: colors.textSecondary, marginTop: spacing.xl },
  starsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg },
  starBtn: { padding: spacing.xs },
  submitRatingBtn: {
    flexDirection: "row", backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: 16, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center", gap: spacing.sm, width: "100%",
  },
  submitRatingText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  skipBtn: { paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  skipBtnText: { fontSize: 15, fontWeight: "500", color: colors.textMuted },
});
