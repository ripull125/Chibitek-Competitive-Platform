import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import App from "./App.jsx";
import KeywordTracking from "./pages/KeywordTracking.jsx";
import CompetitorTracking from "./pages/CompetitorTracking.jsx";
import Reports from "./pages/Reports.jsx";
import Chat from "./pages/Chat.jsx";
import Settings from "./pages/Settings.jsx";
import Login from "./pages/Login.jsx";
import { supabase } from "./supabaseClient.js";

import { NavbarSimple } from "../components/NavbarSimple.jsx";
import "./index.css";

function AuthGate({ children }) {
  const [loaded, setLoaded] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);

  React.useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setAuthed(Boolean(data?.session));
      supabase.auth.onAuthStateChange((_event, session) => {
        setAuthed(Boolean(session));
      });
      setLoaded(true);
    };
    init();
  }, []);

  if (!loaded) return null; // avoid flicker
  return authed ? children : <Navigate to="/login" replace />;
}

function AppLayout() {
  const location = useLocation();
  const [authed, setAuthed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setAuthed(Boolean(data?.session));
      supabase.auth.onAuthStateChange((_event, session) => {
        setAuthed(Boolean(session));
      });
      setLoaded(true);
    };
    init();
  }, []);

  // Avoid flicker while checking auth
  if (!loaded) return null;

  const isLoginRoute = location.pathname === "/login";

  return (
    <div className={isLoginRoute ? "login-layout" : "app-layout"}>
      {/* Show sidebar only when not on login route and user is authenticated */}
      {!isLoginRoute && authed && <NavbarSimple />}

      {/* Right content area */}
      <div className="app-main" style={isLoginRoute ? { width: "100%" } : undefined}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <AuthGate>
                <App />
              </AuthGate>
            }
          />
          <Route
            path="/keywords"
            element={
              <AuthGate>
                <KeywordTracking />
              </AuthGate>
            }
          />
          <Route
            path="/competitors"
            element={
              <AuthGate>
                <CompetitorTracking />
              </AuthGate>
            }
          />
          <Route
            path="/reports"
            element={
              <AuthGate>
                <Reports />
              </AuthGate>
            }
          />
          <Route
            path="/chat"
            element={
              <AuthGate>
                <Chat />
              </AuthGate>
            }
          />
          <Route
            path="/settings"
            element={
              <AuthGate>
                <Settings />
              </AuthGate>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="light">
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>
);
