import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../constants/api";

const TOKEN_KEY = "auth_token";

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
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
