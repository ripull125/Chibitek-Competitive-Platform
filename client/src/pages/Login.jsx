import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button, Card, Title, Text } from "@mantine/core";

export default function Login() {
	const navigate = useNavigate();
	const [error, setError] = useState("");

	// If the user is already logged in via Supabase, redirect to dashboard
	useEffect(() => {
		const checkSession = async () => {
			const { data } = await supabase.auth.getSession();
			if (data?.session) navigate("/", { replace: true });
		};
		checkSession();
	}, [navigate]);

	const handleGoogleLogin = async () => {
		setError("");
		try {
			const { error } = await supabase.auth.signInWithOAuth({
				provider: "google",
				options: {
					redirectTo: window.location.origin,
				},
			});
			if (error) setError(error.message);
		} catch (e) {
			setError(e.message || "Failed to start Google login");
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

