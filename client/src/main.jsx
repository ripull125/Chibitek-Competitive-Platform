// client/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, ScrollArea } from "@mantine/core";
import "@mantine/core/styles.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import DashboardPage from "./pages/DashboardPage.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import KeywordTracking from "./pages/KeywordTracking.jsx";
import CompetitorTracking from "./pages/CompetitorTracking.jsx";
import Reports from "./pages/Reports.jsx";
import Chat from "./pages/Chat.jsx";
import Settings from "./pages/Settings.jsx";
import CompetitorLookup from "./pages/CompetitorLookup.jsx";
import Profile from "./pages/Profile.jsx";
import ConnectedIntegrations from "./pages/ConnectedIntegrations.jsx";

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
    <div className="app-layout">
      {/* Fixed sidebar (does not scroll with page) */}
      <aside className="app-sidebar">
        <NavbarSimple />
      </aside>

      {/* Only this pane scrolls */}
      <main className="app-main">
        <ScrollArea type="auto" scrollbarSize={10} h="100dvh">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/competitor-lookup" element={<CompetitorLookup />} />
            <Route path="/placeholder" element={<Placeholder />} />
            <Route path="/keywords" element={<KeywordTracking />} />
            <Route path="/competitors" element={<CompetitorTracking />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/connected-integrations" element={<ConnectedIntegrations />} />
          </Routes>
        </ScrollArea>
      </main>
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
