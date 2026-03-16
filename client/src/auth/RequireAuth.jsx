import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Center, Loader } from "@mantine/core";
import { supabase } from "../supabaseClient";
import {
  getStoredSession,
  getSupabaseSession,
  isSessionValid,
  onAuthStateChange,
  resolveSessionAccess,
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
      const storedAccess = stored?.access;
      if (storedAccess?.authorized) {
        setChecking(false);
      }

      (async () => {
        const access = await resolveSessionAccess(stored);
        if (!mounted) return;

        if (!access.authorized) {
          storeSession(null);
          if (supabase?.auth?.signOut) supabase.auth.signOut();
          setChecking(false);
          navigate(`/login?unauthorized=1`, { replace: true });
          return;
        }

        storeSession({ ...stored, access });
        setChecking(false);
      })();

      const sub = onAuthStateChange((_event, session) => {
        if (!session) {
          storeSession(null);
          navigate(`/login?next=${encodeURIComponent(location.pathname)}`, {
            replace: true,
          });
          return;
        }

        (async () => {
          const access = await resolveSessionAccess(session);
          if (!access.authorized) {
            storeSession(null);
            if (supabase?.auth?.signOut) supabase.auth.signOut();
            navigate(`/login?unauthorized=1`, { replace: true });
            return;
          }
          storeSession({ ...session, access });
        })();
      });

      return () => {
        mounted = false;
        sub?.unsubscribe?.();
      };
    }

    (async () => {
      const sess = await getSupabaseSession();
      if (!mounted) return;

      if (sess) {
        const access = await resolveSessionAccess(sess);
        if (!access.authorized) {
          storeSession(null);
          if (supabase?.auth?.signOut) supabase.auth.signOut();
          setChecking(false);
          navigate(`/login?unauthorized=1`, { replace: true });
          return;
        }
        storeSession({ ...sess, access });
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
      if (!session) {
        storeSession(null);
        if (mounted) {
          navigate(`/login?next=${encodeURIComponent(location.pathname)}`, {
            replace: true,
            state: { from: location.pathname },
          });
        }
        return;
      }

      (async () => {
        const access = await resolveSessionAccess(session);
        if (!access.authorized) {
          storeSession(null);
          if (supabase?.auth?.signOut) supabase.auth.signOut();
          navigate(`/login?unauthorized=1`, { replace: true });
          return;
        }
        storeSession({ ...session, access });
      })();
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
