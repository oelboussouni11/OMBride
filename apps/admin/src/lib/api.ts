const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/admin_token=([^;]+)/);
  return match ? match[1] : null;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function login(phone: string, password: string) {
  const data = await apiFetch<{
    access_token: string;
    refresh_token: string;
    user: { role: string };
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
  // Store token in cookie
  document.cookie = `admin_token=${data.access_token}; path=/; max-age=${60 * 30}`;
  return data;
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardStats {
  rides_today: number;
  rides_week: number;
  rides_month: number;
  revenue_total: number;
  active_drivers: number;
  pending_verifications: number;
}

export interface RecentRide {
  id: string;
  rider_name: string;
  driver_name: string | null;
  pickup_address: string;
  dropoff_address: string;
  fare: number | null;
  status: string;
  created_at: string;
}

export interface DashboardData {
  stats: DashboardStats;
  recent_rides: RecentRide[];
}

export const fetchDashboard = () => apiFetch<DashboardData>("/admin/dashboard");

// ── Drivers ─────────────────────────────────────────────────────────────────

export interface DriverListItem {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  vehicle_model: string;
  plate_number: string;
  status: string;
  credit_balance: number;
  is_available: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  doc_type: string;
  file_url: string;
  status: string;
  uploaded_at: string;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  payment_method: string | null;
  reference_code: string | null;
  created_at: string;
}

export interface DriverRide {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  fare: number | null;
  status: string;
  created_at: string;
}

export interface DriverDetail {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string | null;
  vehicle_model: string;
  plate_number: string;
  status: string;
  credit_balance: number;
  is_available: boolean;
  created_at: string;
  documents: Document[];
  credit_transactions: CreditTransaction[];
  rides: DriverRide[];
}

export const fetchDrivers = (status?: string, search?: string) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  const qs = params.toString();
  return apiFetch<DriverListItem[]>(`/drivers/${qs ? `?${qs}` : ""}`);
};

export const fetchDriver = (id: string) =>
  apiFetch<DriverDetail>(`/drivers/${id}`);

export const verifyDriver = (id: string, status: string, note?: string) =>
  apiFetch<DriverListItem>(`/drivers/${id}/verify`, {
    method: "PUT",
    body: JSON.stringify({ status, note: note || "" }),
  });

export const topupDriver = (
  id: string,
  amount: number,
  payment_method: string,
  reference_code: string
) =>
  apiFetch<CreditTransaction>(`/drivers/${id}/credit`, {
    method: "POST",
    body: JSON.stringify({ amount, payment_method, reference_code }),
  });

// ── Riders ──────────────────────────────────────────────────────────────────

export interface RiderListItem {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  total_rides: number;
  created_at: string;
}

export const fetchRiders = () => apiFetch<RiderListItem[]>("/riders/");

// ── Rides ───────────────────────────────────────────────────────────────────

export interface RideListItem {
  id: string;
  rider_name: string;
  driver_name: string | null;
  pickup_address: string;
  dropoff_address: string;
  fare: number | null;
  status: string;
  created_at: string;
}

export const fetchRides = (status?: string) =>
  apiFetch<RideListItem[]>(`/admin/rides${status ? `?status=${status}` : ""}`);

// ── Fare Config ─────────────────────────────────────────────────────────────

export interface FareConfig {
  id: string;
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  booking_fee: number;
  minimum_fare: number;
  commission_per_ride: number;
  commission_type: string;
  weight_rating: number;
  weight_distance: number;
  is_active: boolean;
  updated_at: string;
}

export const fetchFareConfig = () =>
  apiFetch<FareConfig>("/admin/fare-config");

export const updateFareConfig = (data: {
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  booking_fee: number;
  minimum_fare: number;
  commission_per_ride: number;
  commission_type: string;
  weight_rating: number;
  weight_distance: number;
}) =>
  apiFetch<FareConfig>("/admin/fare-config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
