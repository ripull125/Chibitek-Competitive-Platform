import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Center, Loader } from "@mantine/core";
import {
  getStoredSession,
  getSupabaseSession,
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
      setChecking(false);

      // Still subscribe so we keep storage in sync (logout, expiry, etc.)
      const sub = onAuthStateChange((_event, session) => {
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
