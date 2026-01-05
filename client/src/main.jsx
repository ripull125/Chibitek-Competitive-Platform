// client/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, ScrollArea, ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import RequireAuth from "./auth/RequireAuth.jsx";
import Login from "./pages/Login.jsx";

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
            <Route
              path="/"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/competitor-lookup"
              element={
                <RequireAuth>
                  <CompetitorLookup />
                </RequireAuth>
              }
            />
            <Route
              path="/placeholder"
              element={
                <RequireAuth>
                  <Placeholder />
                </RequireAuth>
              }
            />
            <Route
              path="/keywords"
              element={
                <RequireAuth>
                  <KeywordTracking />
                </RequireAuth>
              }
            />
            <Route
              path="/competitors"
              element={
                <RequireAuth>
                  <CompetitorTracking />
                </RequireAuth>
              }
            />
            <Route
              path="/reports"
              element={
                <RequireAuth>
                  <Reports />
                </RequireAuth>
              }
            />
            <Route
              path="/chat"
              element={
                <RequireAuth>
                  <Chat />
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <Settings />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="/connected-integrations"
              element={
                <RequireAuth>
                  <ConnectedIntegrations />
                </RequireAuth>
              }
            />
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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>
);
