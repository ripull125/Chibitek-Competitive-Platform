import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Center, Loader } from "@mantine/core";
import { supabase } from "../supabaseClient";
import {
  getStoredSession,
  getSupabaseSession,
  isAuthorizedEmail,
  isSessionAuthorized,
  isSessionValid,
  onAuthStateChange,
  storeSession,
} from "./session";

export default function RequireAuth({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const stored = getStoredSession();
    if (isSessionValid(stored)) {
      if (!isAuthorizedEmail(stored?.user?.email)) {
        storeSession(null);
        if (supabase?.auth?.signOut) supabase.auth.signOut();
        setChecking(false);
        navigate(`/login?unauthorized=1`, { replace: true });
        return;
      }
      setChecking(false);

      // Still subscribe so we keep storage in sync (logout, expiry, etc.)
      const sub = onAuthStateChange((_event, session) => {
        if (session && !isSessionAuthorized(session)) {
          storeSession(null);
          if (supabase?.auth?.signOut) supabase.auth.signOut();
          navigate(`/login?unauthorized=1`, { replace: true });
          return;
        }
        storeSession(session);
        if (!session) {
          navigate(`/login?next=${encodeURIComponent(location.pathname)}`, {
            replace: true,
          });
        }
      });

      return () => sub?.unsubscribe?.();
    }

    (async () => {
      const sess = await getSupabaseSession();
      if (!mounted) return;

      if (sess) {
        if (!isSessionAuthorized(sess)) {
          storeSession(null);
          if (supabase?.auth?.signOut) supabase.auth.signOut();
          setChecking(false);
          navigate(`/login?unauthorized=1`, { replace: true });
          return;
        }
        storeSession(sess);
        setChecking(false);
      } else {
        setChecking(false);
        navigate(`/login?next=${encodeURIComponent(location.pathname)}`, {
          replace: true,
          state: { from: location.pathname },
        });
      }
    })();

    const sub = onAuthStateChange((_event, session) => {
      if (session && !isSessionAuthorized(session)) {
        storeSession(null);
        if (supabase?.auth?.signOut) supabase.auth.signOut();
        navigate(`/login?unauthorized=1`, { replace: true });
        return;
      }
      storeSession(session);
      if (!session && mounted) {
        navigate(`/login?next=${encodeURIComponent(location.pathname)}`, {
          replace: true,
          state: { from: location.pathname },
        });
      }
    });

    return () => {
      mounted = false;
      sub?.unsubscribe?.();
    };
  }, [location.pathname, navigate]);

  if (checking) {
    return (
      <Center h="100dvh">
        <Loader />
      </Center>
    );
  }

  return children;
}
