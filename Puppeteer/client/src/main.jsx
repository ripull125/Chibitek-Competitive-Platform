import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App.jsx";
import KeywordTracking from "./pages/KeywordTracking.jsx";
import CompetitorTracking from "./pages/CompetitorTracking.jsx";
import Reports from "./pages/Reports.jsx";
import Chat from "./pages/Chat.jsx";
import Settings from "./pages/Settings.jsx";

import { NavbarSimple } from "../components/NavbarSimple.jsx";
import "./index.css";

function AppLayout() {
  return (
    <div className="app-layout">
      {/* Left sidebar */}
      <NavbarSimple />

      {/* Right content area */}
      <div className="app-main">
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/keywords" element={<KeywordTracking />} />
          <Route path="/competitors" element={<CompetitorTracking />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/settings" element={<Settings />} />
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
