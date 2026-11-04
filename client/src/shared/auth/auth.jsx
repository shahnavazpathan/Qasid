import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "../ui/Toast.jsx";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Google client id is read from the build at runtime; the script tag loads the GIS library.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
// Google's library should be initialised only once per page
let initialized = false;

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const data = await api.get("/api/user/pans");
      // The endpoint returns guest:true with an empty pans list when nobody is signed in
      if (data.guest) { setUser(null); return; }
      // The server returns the persisted profile (name/email/picture) so it survives refreshes
      setUser(data.user || { pans: data.pans || [] });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Draws Google's own button into el. Unlike prompt() (One Tap), it opens Google's sign-in window
  // even for visitors who aren't logged in to Google yet, or who closed One Tap before.
  const renderButton = useCallback(async (el, { dark, compact }) => {
    if (!window.google?.accounts?.id) {
      await loadScript();
    }
    if (!window.google?.accounts?.id) throw new Error("Google sign-in script failed to load.");
    if (!GOOGLE_CLIENT_ID) throw new Error("Google sign-in is not configured for this build.");

    if (!initialized) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (credentialResponse) => {
          try {
            const res = await api.post("/api/auth/google", { idToken: credentialResponse.credential });
            setUser({ id: res.userId, email: res.email, name: res.name, picture: res.picture });
          } catch {
            toast("Sign-in failed. Please try again.", null, "alert");
          }
        },
        auto_select: false
      });
      initialized = true;
    }
    el.replaceChildren();
    window.google.accounts.id.renderButton(el, {
      type: compact ? "icon" : "standard",
      theme: dark ? "filled_black" : "outline",
      size: "large",
      shape: "rectangular",
      text: "signin"
    });
  }, [toast]);

  const signOut = useCallback(async () => {
    setUser(null);
    try { await api.post("/api/auth/logout", {}); } catch {}
    if (window.google?.accounts?.id) {
      try { window.google.accounts.id.disableAutoSelect(); } catch {}
    }
  }, []);

  const value = { user, loading, renderButton, signOut, signedIn: !!user };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}