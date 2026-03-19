import { useEffect, useState, useRef } from "react";
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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useRide } from "../../context/RideContext";
import { useWebSocket } from "../../context/WebSocketContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { estimateRide, requestRide, cancelRide, rateRide, fetchActiveRide, getSavedLocations, addSavedLocation, deleteSavedLocation, type EstimateResponse, type RideResponse, type SavedLocation } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

type RideState = "idle" | "entering_destination" | "estimate" | "searching" | "matched" | "arriving" | "in_progress" | "completed";

export default function RiderHomeScreen() {
  const { pickup, dropoff, setPickup, setDropoff, currentRide, setCurrentRide } = useRide();
  const { lastMessage } = useWebSocket();

  const [rideState, setRideState] = useState<RideState>("idle");
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  // Pickup input
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);

  // Destination input
  const [destAddress, setDestAddress] = useState("");
  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");

  // Saved locations
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);

  // Search timer
  const [searchSeconds, setSearchSeconds] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setInterval>>();
  const SEARCH_TIMEOUT = 90; // max seconds to wait for a driver

  // Rating
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Active ride ID — use ref to avoid stale closures in cancel handler
  const activeRideIdRef = useRef<string | null>(null);

  // Driver info from WS
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Recover state when user returns to app (tab becomes visible)
  useEffect(() => {
    if (typeof document === "undefined") return;
    function onVisible() {
      if (document.visibilityState === "visible" && activeRideIdRef.current) {
        fetchActiveRide().then((data) => {
          if (!data.ride) { resetRide(); return; }
          const statusMap: Record<string, RideState> = {
            requested: "searching", matched: "matched", arriving: "arriving",
            in_progress: "in_progress", completed: "completed",
          };
          const newState = statusMap[data.ride.status];
          if (newState) setRideState(newState);
          if (data.driver_info) setDriverInfo(data.driver_info);
        }).catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Get user location and saved locations on mount
  useEffect(() => {
    (async () => {
      // Try Expo Location first
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          setLocationGranted(true);
          const loc = await Location.getCurrentPositionAsync({});
          setPickup({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            address: "Current Location",
          });
          return;
        }
      } catch {}
      // Try browser native geolocation (works on HTTPS or some HTTP)
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          setLocationGranted(true);
          setPickup({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            address: "Current Location (GPS)",
          });
          return;
        } catch {}
      }
      // No GPS — use fallback location. On HTTPS, real GPS will work.
      setLocationGranted(true);
      setUseCurrentLocation(true);
      setPickup({
        latitude: 33.9716,
        longitude: -6.8498,
        address: "Current Location (approx)",
      });
    })();
    getSavedLocations().then(setSavedLocations).catch(() => {});

    // Restore active ride state on mount (survives refresh)
    fetchActiveRide().then((data) => {
      if (data.ride) {
        const r = data.ride;
        setActiveRideId(r.id);
        setCurrentRide({
          id: r.id,
          riderId: r.rider_id,
          driverId: r.driver_id || undefined,
          pickup: { latitude: 0, longitude: 0, address: r.pickup_address },
          dropoff: { latitude: 0, longitude: 0, address: r.dropoff_address },
          status: r.status as any,
          fare: r.fare || undefined,
          distance: r.distance_km || undefined,
          duration: r.duration_min || undefined,
          createdAt: r.created_at,
          updatedAt: r.created_at,
        });
        setDropoff({ latitude: 0, longitude: 0, address: r.dropoff_address });
        if (data.driver_info) {
          setDriverInfo(data.driver_info);
        }
        // Map status to rideState
        const statusMap: Record<string, RideState> = {
          requested: "searching",
          matched: "matched",
          arriving: "arriving",
          in_progress: "in_progress",
        };
        setRideState(statusMap[r.status] || "idle");
      }
    }).catch(() => {});
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
        if (lastMessage.data.status === "completed") setRideState("completed");
        if (lastMessage.data.status === "cancelled") {
          // Reset first, toast handles notification
          resetRide();
        }
        break;
      case "search_update":
        // Update search timer from server
        if (lastMessage.data.elapsed) {
          setSearchSeconds(lastMessage.data.elapsed);
        }
        break;
      case "driver_location":
        setDriverLocation({ lat: lastMessage.data.lat, lng: lastMessage.data.lng });
        break;
    }
  }, [lastMessage]);

  // Poll active ride status every 3s as fallback (WS messages can be missed on mobile)
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    const shouldPoll = rideState === "searching" || rideState === "matched" || rideState === "arriving" || rideState === "in_progress";
    if (shouldPoll) {
      pollRef.current = setInterval(async () => {
        try {
          const data = await fetchActiveRide();
          if (!data.ride) {
            // Ride gone (cancelled or completed by server)
            if (rideState === "searching") resetRide();
            return;
          }
          const r = data.ride;
          const statusMap: Record<string, RideState> = {
            requested: "searching",
            matched: "matched",
            arriving: "arriving",
            in_progress: "in_progress",
            completed: "completed",
            cancelled: "idle",
          };
          const newState = statusMap[r.status];
          if (newState && newState !== rideState) {
            if (newState === "idle") { resetRide(); return; }
            setRideState(newState);
            // Update ride data
            if (r.fare) setCurrentRide((prev: any) => prev ? { ...prev, fare: r.fare, distance: r.distance_km, duration: r.duration_min } : prev);
            if (data.driver_info && !driverInfo) setDriverInfo(data.driver_info);
          }
        } catch {}
      }, 3000);
      return () => clearInterval(pollRef.current);
    } else {
      clearInterval(pollRef.current);
    }
  }, [rideState]);

  // Search timer — simple client counter for display, server handles actual timeout
  useEffect(() => {
    if (rideState === "searching") {
      setSearchSeconds(0);
      searchTimerRef.current = setInterval(() => {
        setSearchSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(searchTimerRef.current);
    } else {
      clearInterval(searchTimerRef.current);
      setSearchSeconds(0);
    }
  }, [rideState]);

  function resetRide() {
    setRideState("idle");
    setEstimate(null);
    setCurrentRide(null);
    activeRideIdRef.current = null;
    setDriverInfo(null);
    setDriverLocation(null);
    setPickupAddress("");
    setPickupLat("");
    setPickupLng("");
    setUseCurrentLocation(true);
    setDestAddress("");
    setDestLat("");
    setDestLng("");
    setDropoff(null);
  }

  async function handleEstimate() {
    if (!destLat || !destLng) {
      Alert.alert("Error", "Please enter destination coordinates.");
      return;
    }
    // Resolve pickup coordinates
    let pLat: number, pLng: number, pAddr: string;
    if (useCurrentLocation && pickup) {
      pLat = pickup.latitude;
      pLng = pickup.longitude;
      pAddr = pickup.address || "Current Location";
    } else if (pickupLat && pickupLng) {
      pLat = parseFloat(pickupLat);
      pLng = parseFloat(pickupLng);
      pAddr = pickupAddress || "Custom Pickup";
    } else {
      Alert.alert("Error", "Please enter pickup coordinates or use current location.");
      return;
    }
    // Update pickup in context
    setPickup({ latitude: pLat, longitude: pLng, address: pAddr });

    setLoading(true);
    try {
      const est = await estimateRide(pLat, pLng, parseFloat(destLat), parseFloat(destLng));
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
      activeRideIdRef.current = ride.id;
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
    const rideId = currentRide?.id || activeRideIdRef.current;
    if (!rideId) {
      resetRide();
      return;
    }
    try {
      await cancelRide(rideId);
      resetRide();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not cancel ride");
    }
  }

  function selectSavedLocation(loc: SavedLocation) {
    setDestAddress(loc.address || loc.label);
    setDestLat(String(loc.latitude));
    setDestLng(String(loc.longitude));
    setRideState("entering_destination");
  }

  async function handleSaveLocation() {
    if (!destLat || !destLng) return;
    const label = Platform.OS === "web"
      ? window.prompt("Enter a label (e.g. Home, Work, Gym)")
      : await new Promise<string | null>((resolve) => {
          Alert.prompt?.(
            "Save Location",
            "Enter a label (e.g. Home, Work, Gym)",
            (text) => resolve(text),
          ) ?? resolve(window.prompt("Enter a label (e.g. Home, Work, Gym)"));
        });
    if (!label?.trim()) return;
    try {
      const updated = await addSavedLocation({
        label: label.trim(),
        latitude: parseFloat(destLat),
        longitude: parseFloat(destLng),
        address: destAddress || "Saved location",
      });
      setSavedLocations(updated);
      Alert.alert("Saved", `"${label.trim()}" has been saved.`);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  }

  function handleDeleteSavedLocation(label: string) {
    Alert.alert("Delete location?", `Remove "${label}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await deleteSavedLocation(label);
            setSavedLocations(updated);
          } catch (err: any) {
            Alert.alert("Error", err.message);
          }
        },
      },
    ]);
  }

  function confirmCancel() {
    if (rideState === "matched" || rideState === "arriving") {
      if (Platform.OS === "web") {
        const ok = window.confirm("Your driver is already on the way. Cancel ride?");
        if (ok) handleCancel();
      } else {
        Alert.alert(
          "Cancel ride?",
          "Your driver is already on the way. Are you sure?",
          [
            { text: "No", style: "cancel" },
            { text: "Yes, cancel", style: "destructive", onPress: handleCancel },
          ]
        );
      }
    } else {
      handleCancel();
    }
  }

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (rideState === "idle") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapPlaceholder}>
          <Ionicons name="location" size={32} color={colors.primary} />
          <Text style={styles.mapText}>
            {locationGranted
              ? `${pickup?.latitude.toFixed(4) ?? "..."}, ${pickup?.longitude.toFixed(4) ?? "..."}`
              : "Waiting for location..."}
          </Text>
          {pickup?.address && <Text style={styles.mapSubtext}>{pickup.address}</Text>}
        </View>
        <View style={styles.bottomSheet}>
          <Pressable
            style={styles.whereToButton}
            onPress={() => setRideState("entering_destination")}
          >
            <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.whereToText}>Where to?</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.textMuted} />
          </Pressable>

          {savedLocations.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedTitle}>Saved Places</Text>
              {savedLocations.map((loc) => {
                const iconName = loc.label.toLowerCase() === "home" ? "home-outline" as const
                  : loc.label.toLowerCase() === "work" ? "briefcase-outline" as const
                  : "location-outline" as const;
                return (
                  <Pressable
                    key={loc.label}
                    style={styles.savedItem}
                    onPress={() => selectSavedLocation(loc)}
                    onLongPress={() => handleDeleteSavedLocation(loc.label)}
                  >
                    <View style={styles.savedIcon}>
                      <Ionicons name={iconName} size={18} color={colors.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedLabel}>{loc.label}</Text>
                      <Text style={styles.savedAddress} numberOfLines={1}>{loc.address}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── ENTERING DESTINATION ──────────────────────────────────────────────────
  if (rideState === "entering_destination") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.destinationContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Book a Ride</Text>

          {/* Pickup */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldHeader}>
              <View style={[styles.fieldDot, { backgroundColor: colors.success }]} />
              <Text style={styles.fieldLabel}>Pickup</Text>
            </View>
            <Pressable style={styles.currentLocBtn} onPress={() => setUseCurrentLocation(true)}>
              <Ionicons name="locate" size={16} color={useCurrentLocation ? colors.success : colors.textMuted} />
              <Text style={[styles.currentLocText, useCurrentLocation && { color: colors.success, fontWeight: "600" }]}>
                {useCurrentLocation && pickup ? `Current Location (${pickup.latitude.toFixed(4)}, ${pickup.longitude.toFixed(4)})` : "Use current location"}
              </Text>
            </Pressable>
            {!useCurrentLocation && (
              <>
                <TextInput style={styles.fieldInput} placeholder="Pickup address" placeholderTextColor={colors.textMuted} value={pickupAddress} onChangeText={setPickupAddress} autoFocus={false} />
                <View style={styles.coordRow}>
                  <TextInput style={styles.fieldCoord} placeholder="Latitude" placeholderTextColor={colors.textMuted} value={pickupLat} onChangeText={setPickupLat} keyboardType="decimal-pad" />
                  <TextInput style={styles.fieldCoord} placeholder="Longitude" placeholderTextColor={colors.textMuted} value={pickupLng} onChangeText={setPickupLng} keyboardType="decimal-pad" />
                </View>
              </>
            )}
            {useCurrentLocation && (
              <Pressable onPress={() => setUseCurrentLocation(false)}>
                <Text style={styles.switchLink}>Enter different pickup</Text>
              </Pressable>
            )}
          </View>

          {/* Destination */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldHeader}>
              <View style={[styles.fieldDot, { backgroundColor: colors.danger }]} />
              <Text style={styles.fieldLabel}>Destination</Text>
            </View>
            <TextInput style={styles.fieldInput} placeholder="Destination address" placeholderTextColor={colors.textMuted} value={destAddress} onChangeText={setDestAddress} />
            <View style={styles.coordRow}>
              <TextInput style={styles.fieldCoord} placeholder="Latitude" placeholderTextColor={colors.textMuted} value={destLat} onChangeText={setDestLat} keyboardType="decimal-pad" />
              <TextInput style={styles.fieldCoord} placeholder="Longitude" placeholderTextColor={colors.textMuted} value={destLng} onChangeText={setDestLng} keyboardType="decimal-pad" />
            </View>
          </View>

          <Pressable style={styles.primaryButton} onPress={handleEstimate} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Get Estimate</Text>}
          </Pressable>
          {destLat && destLng ? (
            <Pressable style={styles.saveLocationButton} onPress={handleSaveLocation}>
              <Text style={styles.saveLocationText}>Save destination</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.secondaryButton} onPress={() => setRideState("idle")}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── ESTIMATE ──────────────────────────────────────────────────────────────
  if (rideState === "estimate" && estimate) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapPlaceholder}>
          <Ionicons name="navigate" size={28} color={colors.primary} />
          <Text style={styles.mapText}>
            {pickup?.address} → {dropoff?.address}
          </Text>
        </View>
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>Trip Summary</Text>
          {/* Fare highlight */}
          <View style={styles.fareHighlight}>
            <Text style={styles.fareHighlightAmount}>{estimate.estimated_fare} DH</Text>
            <Text style={styles.fareHighlightLabel}>Estimated fare</Text>
          </View>
          <View style={styles.estimateRow}>
            <View style={styles.estimateItem}>
              <Ionicons name="speedometer-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.estimateValue}>{estimate.distance_km} km</Text>
              <Text style={styles.estimateLabel}>Distance</Text>
            </View>
            <View style={styles.estimateDivider} />
            <View style={styles.estimateItem}>
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.estimateValue}>{estimate.duration_min} min</Text>
              <Text style={styles.estimateLabel}>Duration</Text>
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
          <View style={styles.searchingPulse}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={styles.searchingTitle}>Finding your driver</Text>
          <Text style={styles.searchingSubtext}>
            Looking for nearby drivers... {searchSeconds}s
          </Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${Math.min((searchSeconds / SEARCH_TIMEOUT) * 100, 100)}%` }]} />
          </View>
          <View style={styles.searchingRoute}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={1}>{pickup?.address || "Pickup"}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={1}>{dropoff?.address || "Destination"}</Text>
            </View>
          </View>
          <Pressable style={[styles.dangerButton, { width: "80%" }]} onPress={handleCancel}>
            <Text style={styles.dangerButtonText}>Cancel Request</Text>
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
        ? "Driver is arriving"
        : "Heading to destination";

    const statusColor =
      rideState === "in_progress" ? colors.success
        : rideState === "arriving" ? colors.warning
        : colors.primary;

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
          {/* Status indicator */}
          <View style={styles.rideStatusRow}>
            <View style={[styles.rideStatusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.rideStatusText}>{statusText}</Text>
          </View>

          {/* Driver card */}
          {driverInfo && (
            <View style={styles.driverCard}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {(driverInfo.driver_name || "D")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{driverInfo.driver_name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <Text style={styles.driverVehicle}>{driverInfo.vehicle_model}</Text>
                  {driverInfo.average_rating && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                      <Ionicons name="star" size={12} color={colors.warning} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>
                        {driverInfo.average_rating}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.plateTag}>
                <Text style={styles.plateText}>{driverInfo.plate_number}</Text>
              </View>
            </View>
          )}

          {/* Ride details */}
          <View style={styles.rideDetailsGrid}>
            {currentRide?.fare ? (
              <View style={styles.rideDetailItem}>
                <Text style={styles.rideDetailLabel}>Fare</Text>
                <Text style={styles.rideDetailValue}>{currentRide.fare} DH</Text>
              </View>
            ) : null}
            {currentRide?.distance ? (
              <View style={styles.rideDetailItem}>
                <Text style={styles.rideDetailLabel}>Distance</Text>
                <Text style={styles.rideDetailValue}>{currentRide.distance} km</Text>
              </View>
            ) : null}
            {currentRide?.duration ? (
              <View style={styles.rideDetailItem}>
                <Text style={styles.rideDetailLabel}>ETA</Text>
                <Text style={styles.rideDetailValue}>{currentRide.duration} min</Text>
              </View>
            ) : null}
          </View>

          {/* Call driver */}
          {driverInfo?.driver_phone && (
            <Pressable style={styles.callDriverBtn} onPress={() => Linking.openURL(`tel:${driverInfo.driver_phone}`)}>
              <Ionicons name="call-outline" size={16} color={colors.success} />
              <Text style={styles.callDriverText}>Call {driverInfo.driver_name?.split(" ")[0] || "Driver"}</Text>
              <Text style={styles.callDriverPhone}>{driverInfo.driver_phone}</Text>
            </Pressable>
          )}

          {/* Route */}
          <View style={styles.routeRow}>
            <View style={styles.routeDots}>
              <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
              <View style={styles.routeLine} />
              <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeAddress} numberOfLines={1}>{pickup?.address || "Pickup"}</Text>
              <Text style={[styles.routeAddress, { marginTop: spacing.md }]} numberOfLines={1}>{dropoff?.address || "Destination"}</Text>
            </View>
          </View>

          {rideState !== "in_progress" && (
            <Pressable style={styles.dangerButton} onPress={confirmCancel}>
              <Text style={styles.dangerButtonText}>Cancel Ride</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── COMPLETED ─────────────────────────────────────────────────────────────
  if (rideState === "completed") {
    async function submitRating() {
      if (selectedRating === 0 || !currentRide) return;
      try {
        await rateRide(currentRide.id, selectedRating);
        setRatingSubmitted(true);
      } catch (err: any) {
        Alert.alert("Rating failed", err.message || "Could not submit rating. Try again.");
      }
    }

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          <Text style={styles.completedTitle}>Ride Complete</Text>
          {currentRide?.fare && (
            <Text style={styles.completedFare}>{currentRide.fare} DH</Text>
          )}
          <Text style={styles.completedRoute}>
            {pickup?.address} {"->"} {dropoff?.address}
          </Text>

          {/* Rating */}
          {!ratingSubmitted ? (
            <View style={styles.ratingSection}>
              <Text style={styles.ratingPrompt}>Rate your driver</Text>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setSelectedRating(star)}>
                    <Ionicons
                      name={star <= selectedRating ? "star" : "star-outline"}
                      size={36}
                      color={star <= selectedRating ? colors.warning : colors.border}
                    />
                  </Pressable>
                ))}
              </View>
              {selectedRating > 0 && (
                <Pressable style={[styles.primaryButton, { width: "80%", marginTop: spacing.md }]} onPress={submitRating}>
                  <Text style={styles.primaryButtonText}>Submit Rating</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Text style={styles.ratingThanks}>Thanks for rating!</Text>
          )}

          <Pressable
            style={[styles.secondaryButton, { marginTop: spacing.lg, width: "80%" }]}
            onPress={() => { setSelectedRating(0); setRatingSubmitted(false); resetRide(); }}
          >
            <Text style={styles.secondaryButtonText}>Done</Text>
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
  mapText: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm },
  mapSubtext: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  whereToText: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.textSecondary },
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
    paddingTop: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  fieldDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,  // 16px prevents iOS Safari zoom
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  fieldCoord: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 16,  // 16px prevents iOS Safari zoom
    color: colors.text,
    backgroundColor: colors.surface,
  },
  currentLocBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  currentLocText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  switchLink: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
    marginTop: spacing.xs,
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
  coordRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
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
  fareHighlight: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  fareHighlightAmount: { fontSize: 32, fontWeight: "800", color: colors.white },
  fareHighlightLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  estimateRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  estimateItem: { alignItems: "center", flex: 1, gap: 4 },
  estimateDivider: { width: 1, backgroundColor: colors.border },
  estimateValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  estimateLabel: { fontSize: 12, color: colors.textMuted },
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
  searchingPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  searchingSubtext: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  searchingRoute: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    width: "80%",
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  progressBarContainer: {
    width: "80%",
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  rideStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rideStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rideStatusText: { fontSize: 16, fontWeight: "700", color: colors.text },
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
  driverVehicle: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
  plateTag: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
  },
  plateText: { fontSize: 12, fontWeight: "700", color: colors.white, letterSpacing: 0.5 },
  rideDetailsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rideDetailItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    alignItems: "center",
  },
  rideDetailLabel: { fontSize: 11, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3 },
  rideDetailValue: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 2 },
  callDriverBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#dcfce7",
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  callDriverText: { fontSize: 14, fontWeight: "600", color: colors.success, flex: 1 },
  callDriverPhone: { fontSize: 13, color: colors.textMuted },
  routeRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  routeDots: {
    alignItems: "center",
    width: 12,
    paddingTop: 3,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  routeAddress: { fontSize: 14, color: colors.textSecondary },
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
  ratingSection: {
    alignItems: "center",
    marginTop: spacing.xl,
    width: "100%",
  },
  ratingPrompt: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  ratingStars: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  ratingThanks: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.success,
    marginTop: spacing.xl,
  },
  savedSection: {
    marginTop: spacing.md,
  },
  savedTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  savedItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  savedIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  savedLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  savedAddress: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 1,
  },
  saveLocationButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveLocationText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textSecondary,
  },
});
