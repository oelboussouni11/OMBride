import { Slot } from "expo-router";
import { AuthProvider } from "../context/AuthContext";
import { RideProvider } from "../context/RideContext";
import { WebSocketProvider } from "../context/WebSocketContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <RideProvider>
        <WebSocketProvider>
          <Slot />
        </WebSocketProvider>
      </RideProvider>
    </AuthProvider>
  );
}
