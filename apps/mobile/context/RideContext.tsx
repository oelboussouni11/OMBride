import React, {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import type { Ride, Location } from "../types";

interface RideContextValue {
  currentRide: Ride | null;
  pickup: Location | null;
  dropoff: Location | null;
  setPickup: (location: Location | null) => void;
  setDropoff: (location: Location | null) => void;
  setCurrentRide: (ride: Ride | null) => void;
}

const RideContext = createContext<RideContextValue | null>(null);

export function RideProvider({ children }: PropsWithChildren) {
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);
  const [pickup, setPickup] = useState<Location | null>(null);
  const [dropoff, setDropoff] = useState<Location | null>(null);

  return (
    <RideContext.Provider
      value={{ currentRide, pickup, dropoff, setPickup, setDropoff, setCurrentRide }}
    >
      {children}
    </RideContext.Provider>
  );
}

export function useRide() {
  const ctx = useContext(RideContext);
  if (!ctx) {
    throw new Error("useRide must be used within a RideProvider");
  }
  return ctx;
}
