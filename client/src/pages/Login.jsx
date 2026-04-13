import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Center, Paper, Stack, Text, Title } from "@mantine/core";
import { supabase } from "../supabaseClient";
import {
  getStoredSession,
  getSupabaseSession,
  isSessionValid,
  onAuthStateChange,
  resolveSessionAccess,
  storeSession,
} from "../auth/session";
import { useTranslation } from "react-i18next";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const { t } = useTranslation();

  const unauthorizedMessage = t("login.unauthorizedMessage");

  const nextPath = useMemo(() => {
    return searchParams.get("next") || location.state?.from || "/";
  }, [location.state?.from, searchParams]);

  useEffect(() => {
    let mounted = true;

    // Quick path: if we already have a valid stored session, allow entry.
    const stored = getStoredSession();
    if (isSessionValid(stored)) {
      (async () => {
        const access = await resolveSessionAccess(stored);
        if (!mounted) return;
        if (!access.authorized) {
          storeSession(null);
          if (supabase?.auth?.signOut) supabase.auth.signOut();
          setErrorMsg(unauthorizedMessage);
          return;
        }
        storeSession({ ...stored, access });
        navigate(nextPath, { replace: true });
      })();
    }

    // Confirm with Supabase (source of truth).
    (async () => {
      const sess = await getSupabaseSession();
      if (!mounted) return;
      if (sess) {
        const access = await resolveSessionAccess(sess);
        if (!access.authorized) {
          storeSession(null);
          if (supabase?.auth?.signOut) supabase.auth.signOut();
          setErrorMsg(unauthorizedMessage);
          return;
        }
        storeSession({ ...sess, access });
        navigate(nextPath, { replace: true });
      }
    })();

    const sub = onAuthStateChange((_event, session) => {
      if (!session) {
        storeSession(null);
        return;
      }
      (async () => {
        const access = await resolveSessionAccess(session);
        if (!access.authorized) {
          storeSession(null);
          if (supabase?.auth?.signOut) supabase.auth.signOut();
          setErrorMsg(unauthorizedMessage);
          return;
        }
        storeSession({ ...session, access });
        navigate(nextPath, { replace: true });
      })();
    });

    return () => {
      mounted = false;
      sub?.unsubscribe?.();
    };
  }, [navigate, nextPath, searchParams]);

  useEffect(() => {
    if (searchParams.get("unauthorized")) {
      setErrorMsg(unauthorizedMessage);
    }
  }, [searchParams]);

  const signInWithGoogle = async () => {
    setErrorMsg("");
    if (!supabase) {
      setErrorMsg(
        t("login.supabaseNotConfigured")
      );
      return;
    }

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/login`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // helps ensure refresh tokens when enabled in the Supabase project
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
      // Browser will redirect away to Google.
    } catch (e) {
      setErrorMsg(e?.message || t("login.failedStartGoogleOauth"));
      setLoading(false);
    }
  };

  return (
    <Center h="100dvh" style={{ background: "var(--mantine-color-gray-0)" }}>
      <Paper radius="md" p="xl" withBorder style={{ width: 420, maxWidth: "92vw" }}>
        <Stack gap="md">
          <Title order={2}>{t("login.signInTitle")}</Title>
          <Text c="dimmed">
            {t("login.signInDescription")}
          </Text>

          {errorMsg ? <Text c="red">{errorMsg}</Text> : null}

          <Button loading={loading} onClick={signInWithGoogle} size="md">
            {t("login.continueWithGoogle")}
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
