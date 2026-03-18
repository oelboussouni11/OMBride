import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import * as SecureStore from "expo-secure-store";
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
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
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
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
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

    await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
    await SecureStore.setItemAsync(REFRESH_KEY, data.refresh_token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
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

    await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
    await SecureStore.setItemAsync(REFRESH_KEY, data.refresh_token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    setState({ user, token: data.access_token, refreshToken: data.refresh_token, isLoading: false });
  }

  async function logout() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
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
