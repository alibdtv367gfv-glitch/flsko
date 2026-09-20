import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

type UseAuthOptions = {
  autoFetch?: boolean;
};

const AUTH_REFRESH_COOLDOWN_MS = 3000;
let sharedUser: Auth.User | null = null;
let sharedError: Error | null = null;
let lastFetchAt = 0;
let inFlightFetch: Promise<Auth.User | null> | null = null;

function userFromApi(apiUser: Awaited<ReturnType<typeof Api.getMe>>): Auth.User | null {
  if (!apiUser) return null;
  return {
    id: apiUser.id,
    openId: apiUser.openId,
    name: apiUser.name,
    email: apiUser.email,
    loginMethod: apiUser.loginMethod,
    lastSignedIn: new Date(apiUser.lastSignedIn),
    role: apiUser.role,
  };
}

async function fetchUserOnce(force = false): Promise<Auth.User | null> {
  const now = Date.now();
  if (inFlightFetch) return inFlightFetch;
  if (!force && now - lastFetchAt < AUTH_REFRESH_COOLDOWN_MS) return sharedUser;

  lastFetchAt = now;
  inFlightFetch = (async () => {
    try {
      if (Platform.OS === "web") {
        const params = new URLSearchParams(window.location.search);
        const callbackToken = params.get("sessionToken");
        if (callbackToken) {
          // Persist silently; callback owns the single auth notification.
          window.localStorage.setItem("app_session_token", callbackToken);
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }
        const sessionToken = await Auth.getSessionToken();
        if (!sessionToken) {
          sharedUser = null;
          sharedError = null;
          return null;
        }
        const apiUser = await Api.getMe();
        sharedUser = userFromApi(apiUser);
        sharedError = null;
        if (sharedUser) {
          window.localStorage.setItem("manus-runtime-user-info", JSON.stringify(sharedUser));
        } else {
          window.localStorage.removeItem("manus-runtime-user-info");
        }
        return sharedUser;
      }

      const sessionToken = await Auth.getSessionToken();
      if (!sessionToken) {
        sharedUser = null;
        return null;
      }
      sharedUser = await Auth.getUserInfo();
      sharedError = null;
      return sharedUser;
    } catch (err) {
      sharedError = err instanceof Error ? err : new Error("Failed to fetch user");
      sharedUser = null;
      return null;
    } finally {
      inFlightFetch = null;
    }
  })();
  return inFlightFetch;
}

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<Auth.User | null>(sharedUser);
  const [loading, setLoading] = useState(autoFetch && !sharedUser);
  const [error, setError] = useState<Error | null>(sharedError);

  const fetchUser = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const nextUser = await fetchUserOnce(force);
      setUser(nextUser);
      setError(sharedError);
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error("Failed to fetch user");
      setError(nextError);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } catch (err) {
      console.error("[Auth] Logout API call failed:", err);
    } finally {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      sharedUser = null;
      sharedError = null;
      lastFetchAt = 0;
      setUser(null);
      setError(null);
    }
  }, []);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  useEffect(() => {
    if (autoFetch) void fetchUser();
    else setLoading(false);
  }, [autoFetch, fetchUser]);

  useEffect(() => {
    const unsubscribe = Auth.subscribeAuthChanges(() => {
      void fetchUser(true);
    });
    return () => {
      unsubscribe();
    };
  }, [fetchUser]);

  return { user, loading, error, isAuthenticated, refresh: fetchUser, logout };
}
