import { getItem } from "../utils/storage";
import { API_BASE_URL } from "../constants/api";

const TOKEN_KEY = "auth_token";

async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Rides ───────────────────────────────────────────────────────────────────

export interface EstimateResponse {
  distance_km: number;
  duration_min: number;
  estimated_fare: number;
}

export interface RideResponse {
  id: string;
  rider_id: string;
  driver_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number | null;
  duration_min: number | null;
  fare: number | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export function estimateRide(
  pickup_lat: number,
  pickup_lng: number,
  dropoff_lat: number,
  dropoff_lng: number
) {
  return apiFetch<EstimateResponse>("/rides/estimate", {
    method: "POST",
    body: JSON.stringify({ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng }),
  });
}

export function requestRide(data: {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  pickup_address: string;
  dropoff_address: string;
}) {
  return apiFetch<RideResponse>("/rides/request", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface ActiveRideResponse {
  ride: {
    id: string;
    rider_id: string;
    driver_id: string | null;
    pickup_address: string;
    dropoff_address: string;
    distance_km: number | null;
    duration_min: number | null;
    fare: number | null;
    status: string;
    created_at: string;
  } | null;
  driver_info?: {
    driver_name: string;
    driver_phone: string;
    vehicle_model: string;
    plate_number: string;
    average_rating: number;
  };
}

export function fetchActiveRide() {
  return apiFetch<ActiveRideResponse>("/rides/active");
}

export function fetchRideHistory() {
  return apiFetch<RideResponse[]>("/rides/history");
}

export function cancelRide(rideId: string) {
  return apiFetch<RideResponse>(`/rides/${rideId}/cancel`, { method: "POST" });
}

// ── Driver ──────────────────────────────────────────────────────────────────

export function acceptRide(rideId: string) {
  return apiFetch<RideResponse>(`/rides/${rideId}/accept`, { method: "POST" });
}

export function arrivingRide(rideId: string) {
  return apiFetch<RideResponse>(`/rides/${rideId}/arriving`, { method: "POST" });
}

export function startRide(rideId: string) {
  return apiFetch<RideResponse>(`/rides/${rideId}/start`, { method: "POST" });
}

export function completeRide(rideId: string) {
  return apiFetch<RideResponse>(`/rides/${rideId}/complete`, { method: "POST" });
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  payment_method: string | null;
  reference_code: string | null;
  created_at: string;
}

export function fetchCredits() {
  return apiFetch<CreditTransaction[]>("/credits/");
}

export function requestTopup(data: { amount: number; payment_method: string; reference_code: string }) {
  return apiFetch<CreditTransaction>("/credits/topup", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Saved Locations ────────────────────────────────────────────────────────

export interface SavedLocation {
  label: string;
  latitude: number;
  longitude: number;
  address: string;
}

export function getSavedLocations() {
  return apiFetch<SavedLocation[]>("/riders/saved-locations");
}

export function addSavedLocation(data: SavedLocation) {
  return apiFetch<SavedLocation[]>("/riders/saved-locations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteSavedLocation(label: string) {
  return apiFetch<SavedLocation[]>(`/riders/saved-locations/${encodeURIComponent(label)}`, {
    method: "DELETE",
  });
}

// ── Rating ─────────────────────────────────────────────────────────────────

export function rateRide(rideId: string, rating: number) {
  return apiFetch<{ status: string; rating: number }>(`/rides/${rideId}/rate`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
}

// ── Stats ──────────────────────────────────────────────────────────────────

export interface UserStats {
  rider?: {
    completed_rides: number;
    cancelled_rides: number;
    average_rating: number;
    score: number;
  };
  driver?: {
    completed_rides: number;
    cancelled_rides: number;
    average_rating: number;
    score: number;
  };
}

export function fetchStats() {
  return apiFetch<UserStats>("/auth/me/stats");
}

// ── Driver ─────────────────────────────────────────────────────────────────

export function requestReverification() {
  return apiFetch<{ status: string; message: string }>("/drivers/request-reverification", {
    method: "POST",
  });
}

export interface VerificationData {
  full_name: string;
  phone: string;
  licence_number: string;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_color: string;
  vehicle_year: number;
  plate_number: string;
  selfie: string;
  licence_front: string;
  licence_back: string;
  car_photo: string;
  carte_grise: string;
}

export function submitVerification(data: VerificationData) {
  return apiFetch<{ status: string; message: string }>("/drivers/submit-verification", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Account ────────────────────────────────────────────────────────────────

export function deleteAccount() {
  return apiFetch<{ message: string }>("/auth/me", { method: "DELETE" });
}

// ── User ───────────────────────────────────────────────────────────────────

export function fetchMe() {
  return apiFetch<{
    id: string;
    phone: string;
    name: string;
    email: string | null;
    role: string;
    is_active: boolean;
    driver: {
      driver_id: string;
      vehicle_model: string;
      plate_number: string;
      status: string;
      credit_balance: number;
    } | null;
  }>("/auth/me");
}
