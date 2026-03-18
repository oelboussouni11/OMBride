import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type PropsWithChildren,
} from "react";
import { WS_BASE_URL } from "../constants/api";
import { useAuth } from "./AuthContext";

interface WSMessage {
  type: string;
  data: any;
}

interface WSContextValue {
  lastMessage: WSMessage | null;
  isConnected: boolean;
}

const WebSocketContext = createContext<WSContextValue>({
  lastMessage: null,
  isConnected: false,
});

export function WebSocketProvider({ children }: PropsWithChildren) {
  const { user, token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!user || !token) return;

    const role = user.role;
    const endpoint =
      role === "rider"
        ? `${WS_BASE_URL}/ws/rider/${user.id}?token=${token}`
        : `${WS_BASE_URL}/ws/driver/${user.id}?token=${token}`;

    const ws = new WebSocket(endpoint);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        setLastMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect after 3 seconds
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [user, token]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ lastMessage, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
