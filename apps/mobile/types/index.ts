export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  role: "rider" | "driver";
  avatar?: string;
  createdAt: string;
}

export interface Driver extends User {
  role: "driver";
  licenseNumber?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  rating: number;
  isOnline: boolean;
  documentsVerified: boolean;
}

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface Ride {
  id: string;
  riderId: string;
  driverId?: string;
  pickup: Location;
  dropoff: Location;
  status:
    | "requested"
    | "accepted"
    | "arriving"
    | "in_progress"
    | "completed"
    | "cancelled";
  fare?: number;
  distance?: number;
  duration?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface RegisterPayload {
  phone: string;
  name: string;
  password: string;
  role: "rider" | "driver";
}
