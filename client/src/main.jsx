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

import { NavbarSimple } from "../components/NavbarSimple.jsx";
import "./index.css";

function AppLayout() {
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
