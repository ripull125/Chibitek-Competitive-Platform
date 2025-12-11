import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button, Card, Title, Text } from "@mantine/core";

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  // If the user already has a session, redirect to dashboard
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        console.error("Error getting session", error);
        return;
      }

      if (data?.session) {
        navigate("/", { replace: true });
      }
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setError("");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Supabase will handle Google -> Supabase callback,
          // then redirect back to your app at this URL.
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        console.error("Error starting Google login", error);
        setError(error.message);
      }
    } catch (e) {
      console.error("Unexpected error during Google login", e);
      setError(
        e && typeof e === "object" && "message" in e ? e.message : "Failed to start Google login"
      );
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--mantine-color-gray-0)",
      }}
    >
      <Card shadow="sm" padding="xl" radius="md" withBorder style={{ maxWidth: 380, width: "90%" }}>
        <Title order={3} mb="md" style={{ textAlign: "center" }}>
          Chibitek Competitive Platform
        </Title>
        <Text c="dimmed" mb="lg" style={{ textAlign: "center" }}>
          Sign in to continue to your dashboard
        </Text>
        <Button fullWidth color="blue" onClick={handleGoogleLogin}>
          Continue with Google
        </Button>
        {error && (
          <Text c="red" mt="md" style={{ textAlign: "center" }}>
            {error}
          </Text>
        )}
      </Card>
    </div>
  );
}
