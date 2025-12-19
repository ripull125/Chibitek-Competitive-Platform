// client/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, ScrollArea, ColorSchemeScript } from "@mantine/core";
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

// Keep <html> synced with OS theme
import ThemeManager from "./utils/ThemeManager.js";
new ThemeManager();

function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <NavbarSimple />
      </aside>
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
    {/* Ensures correct scheme before first paint */}
    <ColorSchemeScript defaultColorScheme="auto" />
    <MantineProvider defaultColorScheme="auto">
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>
);
