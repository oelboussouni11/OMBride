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
      // Fallback: default to Rabat, Morocco if location fails (HTTP doesn't support geolocation)
      setLocationGranted(true);
      setPickup({
        latitude: 33.9716,
        longitude: -6.8498,
        address: "Rabat (default)",
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
            <Text style={styles.whereToIcon}>→</Text>
            <Text style={styles.whereToText}>Where to?</Text>
          </Pressable>

          {savedLocations.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedTitle}>Saved Places</Text>
              {savedLocations.map((loc) => (
                <Pressable
                  key={loc.label}
                  style={styles.savedItem}
                  onPress={() => selectSavedLocation(loc)}
                  onLongPress={() => handleDeleteSavedLocation(loc.label)}
                >
                  <View style={styles.savedIcon}>
                    <Text style={styles.savedIconText}>
                      {loc.label.toLowerCase() === "home" ? "H" :
                       loc.label.toLowerCase() === "work" ? "W" :
                       loc.label[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savedLabel}>{loc.label}</Text>
                    <Text style={styles.savedAddress} numberOfLines={1}>{loc.address}</Text>
                  </View>
                </Pressable>
              ))}
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
          {/* Pickup */}
          <Text style={styles.sectionLabel}>PICKUP</Text>
          <Pressable
            style={[styles.toggleRow, useCurrentLocation && styles.toggleRowActive]}
            onPress={() => setUseCurrentLocation(true)}
          >
            <Ionicons name={useCurrentLocation ? "radio-button-on" : "radio-button-off"} size={20} color={useCurrentLocation ? colors.primary : colors.textMuted} />
            <Text style={[styles.toggleText, useCurrentLocation && styles.toggleTextActive]}>
              Use Current Location {pickup ? `(${pickup.latitude.toFixed(4)}, ${pickup.longitude.toFixed(4)})` : ""}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleRow, !useCurrentLocation && styles.toggleRowActive]}
            onPress={() => setUseCurrentLocation(false)}
          >
            <Ionicons name={!useCurrentLocation ? "radio-button-on" : "radio-button-off"} size={20} color={!useCurrentLocation ? colors.primary : colors.textMuted} />
            <Text style={[styles.toggleText, !useCurrentLocation && styles.toggleTextActive]}>Enter Manually</Text>
          </Pressable>
          {!useCurrentLocation && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Pickup address"
                placeholderTextColor={colors.textMuted}
                value={pickupAddress}
                onChangeText={setPickupAddress}
              />
              <View style={styles.coordRow}>
                <TextInput style={[styles.input, styles.coordInput]} placeholder="Lat" placeholderTextColor={colors.textMuted} value={pickupLat} onChangeText={setPickupLat} keyboardType="decimal-pad" />
                <TextInput style={[styles.input, styles.coordInput]} placeholder="Lng" placeholderTextColor={colors.textMuted} value={pickupLng} onChangeText={setPickupLng} keyboardType="decimal-pad" />
              </View>
            </>
          )}

          {/* Destination */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>DESTINATION</Text>
          <TextInput
            style={styles.input}
            placeholder="Destination address"
            placeholderTextColor={colors.textMuted}
            value={destAddress}
            onChangeText={setDestAddress}
          />
          <View style={styles.coordRow}>
            <TextInput style={[styles.input, styles.coordInput]} placeholder="Lat" placeholderTextColor={colors.textMuted} value={destLat} onChangeText={setDestLat} keyboardType="decimal-pad" />
            <TextInput style={[styles.input, styles.coordInput]} placeholder="Lng" placeholderTextColor={colors.textMuted} value={destLng} onChangeText={setDestLng} keyboardType="decimal-pad" />
          </View>

          <Pressable style={styles.primaryButton} onPress={handleEstimate} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Get Estimate</Text>
            )}
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
          <Text style={styles.searchingSubtext}>
            Searching... {searchSeconds}s
          </Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${Math.min((searchSeconds / SEARCH_TIMEOUT) * 100, 100)}%` }]} />
          </View>
          <Pressable style={[styles.dangerButton, { marginTop: 32, width: "80%" }]} onPress={handleCancel}>
            <Text style={styles.dangerButtonText}>Cancel</Text>
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
    paddingTop: spacing.lg,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  toggleRowActive: {
    backgroundColor: colors.surface,
  },
  toggleText: {
    fontSize: 14,
    color: colors.textMuted,
    flex: 1,
  },
  toggleTextActive: {
    color: colors.text,
    fontWeight: "600",
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
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  savedIconText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
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
