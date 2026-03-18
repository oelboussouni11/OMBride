// Shared types and constants for OMBdrive

export type UserRole = 'rider' | 'driver' | 'admin';
export type DriverStatus = 'pending' | 'verified' | 'rejected';
export type RideStatus = 'requested' | 'matched' | 'arriving' | 'in_progress' | 'completed' | 'cancelled';
export type DocType = 'license' | 'id_card' | 'insurance' | 'vehicle_registration';
export type DocStatus = 'pending' | 'approved' | 'rejected';
export type CreditTransactionType = 'topup' | 'ride_fee';
export type PaymentMethod = 'cashplus' | 'wafacash' | 'wire';

export interface Location {
  lat: number;
  lng: number;
}

export interface SavedLocation extends Location {
  name: string;
}

export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Driver {
  id: string;
  user_id: string;
  vehicle_model: string;
  plate_number: string;
  status: DriverStatus;
  is_available: boolean;
  credit_balance: number;
  current_location?: Location;
  created_at: string;
}

export interface Ride {
  id: string;
  rider_id: string;
  driver_id?: string;
  pickup_location: Location;
  dropoff_location: Location;
  pickup_address: string;
  dropoff_address: string;
  distance_km?: number;
  duration_min?: number;
  fare?: number;
  status: RideStatus;
  created_at: string;
  completed_at?: string;
}

export interface FareConfig {
  id: string;
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  booking_fee: number;
  minimum_fare: number;
  commission_per_ride: number;
  is_active: boolean;
}

// WebSocket message types
export type WSMessageType =
  | 'location_update'
  | 'ride_request'
  | 'ride_accepted'
  | 'driver_location'
  | 'ride_status';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  data: T;
}
