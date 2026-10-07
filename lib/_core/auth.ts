import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
  role?: "user" | "admin";
};

const authListeners = new Set<() => void>();
export function subscribeAuthChanges(listener: () => void) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}
export function notifyAuthChanges() { authListeners.forEach((listener) => listener()); }

export async function getSessionToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return window.localStorage.getItem(SESSION_TOKEN_KEY);
    }

    // Use SecureStore for native
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    return token;
  } catch (error) {
    return null;
  }
}

export async function setSessionToken(token: string, options: { notify?: boolean } = {}): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
      if (options.notify !== false) notifyAuthChanges();
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  } catch (error) {
    throw error;
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch (error) {
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {

    let info: string | null = null;
    if (Platform.OS === "web") {
      // Use localStorage for web
      info = window.localStorage.getItem(USER_INFO_KEY);
    } else {
      // Use SecureStore for native
      info = await SecureStore.getItemAsync(USER_INFO_KEY);
    }

    if (!info) {
      return null;
    }
    const user = JSON.parse(info);
    return user;
  } catch (error) {
    return null;
  }
}

export async function setUserInfo(user: User, options: { notify?: boolean } = {}): Promise<void> {
  try {

    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      if (options.notify !== false) notifyAuthChanges();
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
    if (options.notify !== false) notifyAuthChanges();
  } catch (error) {
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.removeItem(USER_INFO_KEY);
      notifyAuthChanges();
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
    notifyAuthChanges();
  } catch (error) {
  }
}
