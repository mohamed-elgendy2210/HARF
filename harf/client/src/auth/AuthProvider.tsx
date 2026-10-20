import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ApiRequestError,
  authApi,
  type SafeUser,
} from "../api/client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthContextValue {
  status: AuthStatus;
  user: SafeUser | null;
  retrySessionCheck: () => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<SafeUser>;
  register: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SafeUser | null>(null);

  const retrySessionCheck = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await authApi.me();
      setUser(response.user);
      setStatus("authenticated");
    } catch (error) {
      setUser(null);
      setStatus(
        error instanceof ApiRequestError && error.status === 401
          ? "unauthenticated"
          : "error",
      );
    }
  }, []);

  useEffect(() => {
    void retrySessionCheck();
  }, [retrySessionCheck]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      await authApi.login(input);
      const response = await authApi.me();
      setUser(response.user);
      setStatus("authenticated");
      return response.user;
    },
    [],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      await authApi.register(input);
    },
    [],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ status, user, retrySessionCheck, login, register, logout }),
    [status, user, retrySessionCheck, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
