// client/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/i18n";

import { MantineProvider, ScrollArea, ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { theme } from "./theme";
import { applyColorScheme, getStoredColorScheme, useAppColorScheme } from "./useAppColorScheme";

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
import SavedPosts from "./pages/SavedPosts.jsx";

import { NavbarSimple } from "../components/NavbarSimple.jsx";
import "./index.css";
import "./App.css";

const initialColorScheme = getStoredColorScheme();
applyColorScheme(initialColorScheme);



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
              path="/savedPosts"
              element={
                <RequireAuth>
                  <SavedPosts />
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

function AppRoot() {
  const { colorScheme } = useAppColorScheme();

  return (
    <I18nextProvider i18n={i18n}>
      <MantineProvider
        theme={theme}
        defaultColorScheme={colorScheme}
        colorScheme={colorScheme}
      >
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </BrowserRouter>
      </MantineProvider>
    </I18nextProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme={initialColorScheme} />
    <AppRoot />
  </React.StrictMode>
);
