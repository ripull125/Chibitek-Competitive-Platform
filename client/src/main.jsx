import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "./i18n/i18n";
import AppTourProvider from "./tour/AppTourProvider.jsx";
import { Notifications } from "@mantine/notifications";

import {
  MantineProvider,
  ScrollArea,
  ColorSchemeScript,
  localStorageColorSchemeManager,
} from "@mantine/core";

const colorSchemeManager = localStorageColorSchemeManager({ key: "chibitek-color-scheme" });
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

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
import Watchlist from "./pages/Watchlist.jsx";

import { NavbarSimple } from "../components/NavbarSimple.jsx";
import "./index.css";


const PAGE_TITLE_MAP = [
  { match: (path) => path === "/", key: "appTitle.dashboard" },
  { match: (path) => path.startsWith("/competitor-lookup"), key: "appTitle.competitorLookup" },
  { match: (path) => path.startsWith("/savedPosts"), key: "appTitle.savedPosts" },
  { match: (path) => path.startsWith("/watchlist"), key: "appTitle.watchlist" },
  { match: (path) => path.startsWith("/keywords"), key: "appTitle.keywordTracking" },
  { match: (path) => path.startsWith("/reports"), key: "appTitle.reports" },
  { match: (path) => path.startsWith("/chat"), key: "appTitle.chat" },
  { match: (path) => path.startsWith("/settings"), key: "appTitle.settings" },
  { match: (path) => path.startsWith("/profile"), key: "appTitle.profile" },
  { match: (path) => path.startsWith("/connected-integrations"), key: "appTitle.connectedIntegrations" },
  { match: (path) => path.startsWith("/login"), key: "appTitle.login" },
];

function DocumentTitle() {
  const location = useLocation();
  const { t } = useTranslation();

  React.useEffect(() => {
    const page = PAGE_TITLE_MAP.find((item) => item.match(location.pathname));
    const pageTitle = page ? t(page.key) : t("appTitle.default");
    document.title = pageTitle === t("appTitle.default") ? "Chibitek" : `Chibitek | ${pageTitle}`;
  }, [location.pathname, t]);

  return null;
}


function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <NavbarSimple />
      </aside>

      <main className="app-main">
        <ScrollArea type="auto" scrollbarSize={10} h="100dvh">
          <Routes>
            <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/competitor-lookup" element={<RequireAuth><CompetitorLookup /></RequireAuth>} />
            <Route path="/savedPosts" element={<RequireAuth><SavedPosts /></RequireAuth>} />
            <Route path="/placeholder" element={<RequireAuth><Placeholder /></RequireAuth>} />
            <Route path="/keywords" element={<RequireAuth><KeywordTracking /></RequireAuth>} />
            <Route path="/competitors" element={<RequireAuth><CompetitorTracking /></RequireAuth>} />
            <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/connected-integrations" element={<RequireAuth><ConnectedIntegrations /></RequireAuth>} />
            <Route path="/watchlist" element={<RequireAuth><Watchlist /></RequireAuth>} />
          </Routes>
        </ScrollArea>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="light" />
    <I18nextProvider i18n={i18n}>
      <MantineProvider defaultColorScheme="light" colorSchemeManager={colorSchemeManager}>
        <Notifications position="top-right" zIndex={10000} />
        <BrowserRouter>
          <DocumentTitle />
          {/* IMPORTANT: provider must wrap BOTH login and app */}
          <AppTourProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/*" element={<AppLayout />} />
            </Routes>
          </AppTourProvider>
        </BrowserRouter>
      </MantineProvider>
    </I18nextProvider>
  </React.StrictMode>
);
