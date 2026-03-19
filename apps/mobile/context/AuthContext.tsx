import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { getItem, setItem, deleteItem } from "../utils/storage";
import { API_BASE_URL } from "../constants/api";
import type { User, LoginPayload, RegisterPayload } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const TOKEN_KEY = "auth_token";
const REFRESH_KEY = "refresh_token";
const USER_KEY = "auth_user";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    refreshToken: null,
    isLoading: true,
  });

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const token = await getItem(TOKEN_KEY);
      const refreshToken = await getItem(REFRESH_KEY);
      const userJson = await getItem(USER_KEY);
      if (token && userJson) {
        setState({
          token,
          refreshToken,
          user: JSON.parse(userJson),
          isLoading: false,
        });
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }

  async function login(payload: LoginPayload) {
    const url = `${API_BASE_URL}/auth/login`;
    console.log("Login URL:", url, "Payload:", JSON.stringify(payload));
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("Login response status:", res.status);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.log("Login error body:", JSON.stringify(err));
      throw new Error(err.detail ?? "Login failed");
    }

    const data = await res.json();
    const user: User = {
      id: data.user.id,
      phone: data.user.phone,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      createdAt: new Date().toISOString(),
    };

    await setItem(TOKEN_KEY, data.access_token);
    await setItem(REFRESH_KEY, data.refresh_token);
    await setItem(USER_KEY, JSON.stringify(user));
    setState({ user, token: data.access_token, refreshToken: data.refresh_token, isLoading: false });
  }

  async function register(payload: RegisterPayload) {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? "Registration failed");
    }

    const data = await res.json();
    const user: User = {
      id: data.user.id,
      phone: data.user.phone,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      createdAt: new Date().toISOString(),
    };

    await setItem(TOKEN_KEY, data.access_token);
    await setItem(REFRESH_KEY, data.refresh_token);
    await setItem(USER_KEY, JSON.stringify(user));
    setState({ user, token: data.access_token, refreshToken: data.refresh_token, isLoading: false });
  }

  async function logout() {
    await deleteItem(TOKEN_KEY);
    await deleteItem(REFRESH_KEY);
    await deleteItem(USER_KEY);
    setState({ user: null, token: null, refreshToken: null, isLoading: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
