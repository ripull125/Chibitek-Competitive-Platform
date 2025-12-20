import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Center, Paper, Stack, Text, Title } from "@mantine/core";
import { supabase } from "../supabaseClient";
import {
  getStoredSession,
  getSupabaseSession,
  isSessionValid,
  onAuthStateChange,
  storeSession,
} from "../auth/session";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const nextPath = useMemo(() => {
    return searchParams.get("next") || location.state?.from || "/";
  }, [location.state?.from, searchParams]);

  useEffect(() => {
    // Quick path: if we already have a valid stored session, allow entry.
    const stored = getStoredSession();
    if (isSessionValid(stored)) {
      navigate(nextPath, { replace: true });
      return;
    }

    // Confirm with Supabase (source of truth).
    let mounted = true;
    (async () => {
      const sess = await getSupabaseSession();
      if (!mounted) return;
      if (sess) {
        storeSession(sess);
        navigate(nextPath, { replace: true });
      }
    })();

    const sub = onAuthStateChange((_event, session) => {
      storeSession(session);
      if (session) navigate(nextPath, { replace: true });
    });

    return () => {
      mounted = false;
      sub?.unsubscribe?.();
    };
  }, [navigate, nextPath]);

  const signInWithGoogle = async () => {
    setErrorMsg("");
    if (!supabase) {
      setErrorMsg(
        "Supabase client isn't configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env."
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
      setErrorMsg(e?.message || "Failed to start Google OAuth");
      setLoading(false);
    }
  };

  return (
    <Center h="100dvh" style={{ background: "var(--mantine-color-gray-0)" }}>
      <Paper radius="md" p="xl" withBorder style={{ width: 420, maxWidth: "92vw" }}>
        <Stack gap="md">
          <Title order={2}>Sign in</Title>
          <Text c="dimmed">
            Use Google to sign in. You’ll be redirected back here automatically.
          </Text>

          {errorMsg ? <Text c="red">{errorMsg}</Text> : null}

          <Button loading={loading} onClick={signInWithGoogle} size="md">
            Continue with Google
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
