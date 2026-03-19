import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type PropsWithChildren,
} from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { WS_BASE_URL } from "../constants/api";
import { useAuth } from "./AuthContext";

interface WSMessage {
  type: string;
  data: any;
}

interface WSContextValue {
  lastMessage: WSMessage | null;
  isConnected: boolean;
  sendMessage: (msg: object) => void;
}

const WebSocketContext = createContext<WSContextValue>({
  lastMessage: null,
  isConnected: false,
  sendMessage: () => {},
});

export function WebSocketProvider({ children }: PropsWithChildren) {
  const { user, token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  // Toast notification state
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  function showToast(title: string, body: string) {
    setToast({ title, body });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  const connect = useCallback(() => {
    if (!user || !token) return;

    const role = user.role;
    const endpoint =
      role === "rider"
        ? `${WS_BASE_URL}/ws/rider/${user.id}?token=${token}`
        : `${WS_BASE_URL}/ws/driver/${user.id}?token=${token}`;

    const ws = new WebSocket(endpoint);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        // Non-blocking toast for ride requests (driver on any tab)
        if (msg.type === "ride_request" && user?.role === "driver") {
          showToast(
            "New Ride Request",
            `${msg.data.pickup_address || "Pickup"} → ${msg.data.dropoff_address || "Dropoff"}${msg.data.fare ? ` (${msg.data.fare} DH)` : ""}`
          );
        }
        // Non-blocking toast for cancellations
        if (msg.type === "ride_status" && msg.data.status === "cancelled") {
          showToast("Ride Cancelled", user?.role === "driver" ? "The rider cancelled the ride." : "Your ride was cancelled.");
        }
        // Always set last message so screens can react
        setLastMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [user, token]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ lastMessage, isConnected, sendMessage }}>
      {children}
      {/* Toast overlay */}
      {toast && (
        <Pressable style={styles.toastOverlay} onPress={() => setToast(null)}>
          <View style={styles.toast}>
            <Text style={styles.toastTitle}>{toast.title}</Text>
            <Text style={styles.toastBody}>{toast.body}</Text>
            <Text style={styles.toastDismiss}>Tap to dismiss</Text>
          </View>
        </Pressable>
      )}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

const styles = StyleSheet.create({
  toastOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    justifyContent: "flex-start",
    paddingTop: 60,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  toast: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  toastTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  toastBody: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 18,
  },
  toastDismiss: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 8,
  },
});
