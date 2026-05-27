import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconArrowRight, IconX, IconChevronRight, IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const TourContext = React.createContext(null);

export function useAppTour() {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error("useAppTour must be used within AppTourProvider");
  return ctx;
}

const target = (...items) => items.filter(Boolean);

// Keep the tour focused on the main workflow. Each target list is ordered from
// most-specific to safest fallback, so empty dashboards/chats still look clean.
const getTourFlow = (t) => [
  {
    key: "dashboard",
    path: "/",
    tips: [
      {
        title: t("tutorial.dashboard.title", { defaultValue: "Dashboard" }),
        body: t("tutorial.dashboard.body", { defaultValue: "Start here for the main performance snapshot across saved posts." }),
        target: target("dashboard-kpis", "dashboard-empty", "dashboard-root"),
      },
      {
        title: t("tutorial.dashboardSections.title", { defaultValue: "Performance sections" }),
        body: t("tutorial.dashboardSections.body", { defaultValue: "Once posts are saved, this area shows platform performance, top posts, keywords, and tone." }),
        target: target("dashboard-platforms", "dashboard-top-posts", "dashboard-empty", "dashboard-root"),
      },
    ],
  },
  {
    key: "competitor-lookup",
    path: "/competitor-lookup",
    tips: [
      {
        title: t("tutorial.competitorLookup.title", { defaultValue: "Competitor Lookup" }),
        body: t("tutorial.competitorLookup.body", { defaultValue: "Choose a platform, then search by username, URL, hashtag, or keyword." }),
        target: target("competitor-lookup-search"),
      },
      {
        title: t("tutorial.results.title", { defaultValue: "Results" }),
        body: t("tutorial.results.body", { defaultValue: "Review the results, open originals, and save useful examples for analysis." }),
        target: target("competitor-results", "competitor-lookup-search"),
      },
    ],
  },
  {
    key: "saved-posts",
    path: "/savedPosts",
    tips: [
      {
        title: t("tutorial.savedPosts.title", { defaultValue: "Saved Posts" }),
        body: t("tutorial.savedPosts.body", { defaultValue: "Saved posts are the evidence library for reports, keywords, dashboard charts, and chat answers." }),
        target: target("saved-posts-header", "saved-posts-empty", "saved-posts-list"),
      },
      {
        title: t("tutorial.savedPostsActions.title", { defaultValue: "Platform controls" }),
        body: t("tutorial.savedPostsActions.body", { defaultValue: "When posts exist, each platform section has its own sort, delete, and review controls." }),
        target: target("saved-posts-platforms", "saved-posts-empty", "saved-posts-header"),
      },
    ],
  },
  {
    key: "keyword-tracking",
    path: "/keywords",
    tips: [
      {
        title: t("tutorial.keywordTracking.title", { defaultValue: "Keyword Tracking" }),
        body: t("tutorial.keywordTracking.body", { defaultValue: "Repeated topics are ranked by engagement, consistency, trend, and platform coverage." }),
        target: target("keyword-tracking-root"),
      },
    ],
  },
  {
    key: "autoscraper",
    path: "/watchlist",
    tips: [
      {
        title: t("tutorial.autoscraper.title", { defaultValue: "Auto Scraper" }),
        body: t("tutorial.autoscraper.body", { defaultValue: "Create searches that can pull fresh posts from each social platform." }),
        target: target("autoscraper-root"),
      },
    ],
  },
  {
    key: "reports",
    path: "/reports",
    tips: [
      {
        title: t("tutorial.reports.title", { defaultValue: "Reports" }),
        body: t("tutorial.reports.body", { defaultValue: "Build a PDF from saved posts, keywords, tone, and platform performance." }),
        target: target("reports-layout", "reports-ai", "reports-preview"),
      },
      {
        title: t("tutorial.reportPreview.title", { defaultValue: "Report preview" }),
        body: t("tutorial.reportPreview.body", { defaultValue: "Check the layout here before downloading the final report." }),
        target: target("reports-preview", "reports-layout"),
      },
    ],
  },
  {
    key: "chat",
    path: "/chat",
    tips: [
      {
        title: t("tutorial.chat.title", { defaultValue: "Chat" }),
        body: t("tutorial.chat.body", { defaultValue: "Ask questions about saved posts, reports, or uploaded files." }),
        target: target("chat-composer", "chat-quick-actions", "chat-root"),
      },
      {
        title: t("tutorial.chatHistory.title", { defaultValue: "Chat history" }),
        body: t("tutorial.chatHistory.body", { defaultValue: "Saved chats appear here. If the account is new, start a fresh chat from the composer." }),
        target: target("chat-history", "chat-root"),
      },
    ],
  },
  {
    key: "settings",
    path: "/settings",
    tips: [
      {
        title: t("tutorial.appearance.title", { defaultValue: "Appearance" }),
        body: t("tutorial.appearance.body", { defaultValue: "Switch light or dark mode and choose the app color theme." }),
        target: target("settings-appearance"),
      },
      {
        title: t("tutorial.aiModel.title", { defaultValue: "Chat model" }),
        body: t("tutorial.aiModel.body", { defaultValue: "Choose the AI model shared by the Chat page." }),
        target: target("settings-ai", "settings-appearance"),
      },
    ],
  },
];

function getTargetElement(targets) {
  const list = Array.isArray(targets) ? targets : [targets].filter(Boolean);
  for (const item of list) {
    if (!item) continue;
    const selector = String(item).startsWith("[") || String(item).startsWith(".") || String(item).startsWith("#")
      ? String(item)
      : `[data-tour="${item}"]`;
    const el = document.querySelector(selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isVisible = rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden";
      if (isVisible) return el;
    }
  }
  return null;
}

function getStableRect(el) {
  const raw = el.getBoundingClientRect();
  const pad = 10;
  const top = Math.max(12, Math.round(raw.top - pad));
  const left = Math.max(12, Math.round(raw.left - pad));
  const right = Math.min(window.innerWidth - 12, Math.round(raw.right + pad));
  const bottom = Math.min(window.innerHeight - 12, Math.round(raw.bottom + pad));
  return {
    top,
    left,
    width: Math.max(44, right - left),
    height: Math.max(44, bottom - top),
  };
}

function rectChanged(a, b) {
  if (!a || !b) return true;
  return (
    Math.abs(a.top - b.top) > 3 ||
    Math.abs(a.left - b.left) > 3 ||
    Math.abs(a.width - b.width) > 3 ||
    Math.abs(a.height - b.height) > 3
  );
}

function TourSpotlight({ targets, fadeState }) {
  const [rect, setRect] = React.useState(null);
  const lastRectRef = React.useRef(null);
  const rafRef = React.useRef(null);

  React.useEffect(() => {
    if (!targets || typeof document === "undefined") {
      setRect(null);
      return undefined;
    }

    let disposed = false;
    let retryTimer = null;
    let measureTimer = null;

    const measure = () => {
      if (disposed) return;
      const el = getTargetElement(targets);
      if (!el) {
        setRect(null);
        retryTimer = window.setTimeout(measure, 160);
        return;
      }

      const raw = el.getBoundingClientRect();
      const mostlyVisible = raw.top >= 90 && raw.bottom <= window.innerHeight - 100;
      if (!mostlyVisible) {
        el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      }

      const next = getStableRect(el);
      if (rectChanged(lastRectRef.current, next)) {
        lastRectRef.current = next;
        setRect(next);
      }
    };

    const scheduleMeasure = () => {
      if (disposed) return;
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(measure);
    };

    measureTimer = window.setTimeout(scheduleMeasure, 120);
    const secondPass = window.setTimeout(scheduleMeasure, 360);

    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    window.addEventListener("chibitek:pageReady", scheduleMeasure);

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (measureTimer) window.clearTimeout(measureTimer);
      window.clearTimeout(secondPass);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("chibitek:pageReady", scheduleMeasure);
    };
  }, [JSON.stringify(targets)]);

  if (!rect) return null;

  const isOut = fadeState === "out";
  return (
    <div aria-hidden="true" style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius: 18,
          zIndex: 11990,
          opacity: isOut ? 0 : 1,
          transition: "opacity 160ms ease",
          boxShadow:
            "0 0 0 9999px rgba(15, 23, 42, 0.54), 0 0 0 4px rgba(28, 126, 214, 0.98), 0 0 0 9px rgba(255, 255, 255, 0.88), 0 18px 60px rgba(28, 126, 214, 0.42)",
          outline: "2px solid rgba(255,255,255,0.95)",
          background: "rgba(28, 126, 214, 0.08)",
        }}
      />
    </div>
  );
}

function TourBox({
  title,
  body,
  tipIndex,
  tipCount,
  hasMoreTips,
  onNextTip,
  isLastScreen,
  onNextScreen,
  onExit,
  fadeState,
  targets,
}) {
  const { t } = useTranslation();
  const isOut = fadeState === "out";
  const fadeStyle = {
    opacity: isOut ? 0 : 1,
    transform: isOut ? "translateY(8px) scale(0.985)" : "translateY(0) scale(1)",
    transition: "opacity 180ms ease, transform 180ms ease",
    willChange: "opacity, transform",
    pointerEvents: isOut ? "none" : "auto",
  };

  return (
    <>
      <TourSpotlight targets={targets} fadeState={fadeState} />
      <div
        style={{
          position: "fixed",
          right: 22,
          bottom: 22,
          zIndex: 12000,
          width: 380,
          maxWidth: "calc(100vw - 44px)",
          ...fadeStyle,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
          <div
            style={{
              background: "var(--surface-1, #ffffff)",
              borderRadius: 16,
              padding: "16px 16px 18px",
              boxShadow: "0 18px 52px rgba(0,0,0,0.22), 0 4px 14px rgba(0,0,0,0.14)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid var(--border-color, rgba(15,23,42,0.12))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.05em",
                  color: "var(--text-secondary, #64748b)",
                  textTransform: "uppercase",
                }}
              >
                {t("tutorial.label", { defaultValue: "Tutorial" })}
              </div>

              <button
                onClick={onExit}
                type="button"
                aria-label={t("tutorial.exit", { defaultValue: "Exit tutorial" })}
                style={{
                  appearance: "none",
                  border: "1px solid var(--border-color, rgba(15,23,42,0.12))",
                  background: "var(--surface-2, #f8fafc)",
                  borderRadius: 999,
                  width: 34,
                  height: 34,
                  padding: 0,
                  lineHeight: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--text-secondary, #64748b)",
                  boxShadow: "0 8px 18px rgba(0,0,0,0.16)",
                }}
              >
                <IconX size={16} style={{ display: "block" }} />
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 900, color: "var(--text-primary, #111827)" }}>{title}</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 14,
                fontWeight: 650,
                color: "var(--text-secondary, #64748b)",
                lineHeight: 1.4,
              }}
            >
              {body}
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 850, color: "var(--text-secondary, #64748b)" }}>
                {t("tutorial.tipOf", { current: Math.min(tipIndex + 1, tipCount), total: tipCount, defaultValue: "Tip {{current}} of {{total}}" })}
              </div>

              <button
                onClick={onNextScreen}
                type="button"
                aria-label={isLastScreen
                  ? t("tutorial.finish", { defaultValue: "Finish tutorial" })
                  : t("tutorial.nextScreen", { defaultValue: "Next screen" })}
                style={{
                  appearance: "none",
                  border: "1px solid rgba(28, 126, 214, 0.35)",
                  background: "var(--accent-color, #1c7ed6)",
                  borderRadius: 999,
                  width: 44,
                  height: 44,
                  padding: 0,
                  lineHeight: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#ffffff",
                  boxShadow: "0 12px 28px rgba(28, 126, 214, 0.25)",
                  userSelect: "none",
                }}
              >
                {isLastScreen ? (
                  <IconCheck size={20} style={{ display: "block" }} />
                ) : (
                  <IconArrowRight size={20} style={{ display: "block" }} />
                )}
              </button>

              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                {hasMoreTips ? (
                  <button
                    onClick={onNextTip}
                    type="button"
                    style={{
                      appearance: "none",
                      border: "1px solid rgba(28, 126, 214, 0.35)",
                      background: "var(--accent-soft, #e7f5ff)",
                      borderRadius: 12,
                      padding: "0 14px",
                      height: 36,
                      fontWeight: 950,
                      fontSize: 13,
                      cursor: "pointer",
                      color: "var(--accent-color, #1c7ed6)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 10px 26px rgba(0,0,0,0.16)",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t("tutorial.next", { defaultValue: "Next" })}
                    <IconChevronRight size={16} />
                  </button>
                ) : (
                  <div style={{ height: 36 }} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onExit}
        type="button"
        style={{
          position: "fixed",
          left: 22,
          bottom: 22,
          zIndex: 12000,
          appearance: "none",
          border: "1px solid rgba(255,255,255,0.24)",
          background: "rgba(37,99,235,0.96)",
          borderRadius: 999,
          padding: "0 14px",
          height: 38,
          fontSize: 12,
          fontWeight: 900,
          cursor: "pointer",
          color: "rgba(255,255,255,0.96)",
          boxShadow: "0 16px 44px rgba(0,0,0,0.20)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          userSelect: "none",
          whiteSpace: "nowrap",
          ...fadeStyle,
        }}
      >
        {t("tutorial.exit", { defaultValue: "Exit tutorial" })}
      </button>
    </>
  );
}

export default function AppTourProvider({ children }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const TOUR_FLOW = React.useMemo(
    () => getTourFlow(t),
    [i18n.resolvedLanguage, i18n.language, t]
  );

  const ANIM_MS = 180;

  const [isRunning, setIsRunning] = React.useState(false);
  const [screenIndex, setScreenIndex] = React.useState(0);
  const [tipIndex, setTipIndex] = React.useState(0);
  const [fadeState, setFadeState] = React.useState("out");

  const timersRef = React.useRef([]);
  const transitioningRef = React.useRef(false);

  const schedule = React.useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const clearTimers = React.useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  const screen = TOUR_FLOW[screenIndex];
  const tips = screen?.tips ?? [];
  const tip = tips[Math.min(tipIndex, Math.max(0, tips.length - 1))] ?? null;

  React.useEffect(() => {
    if (!isRunning) return;
    const idx = TOUR_FLOW.findIndex((s) => s.path === location.pathname);
    if (idx === -1) return;
    if (idx !== screenIndex) {
      setScreenIndex(idx);
      setTipIndex(0);
    }
  }, [isRunning, location.pathname, screenIndex, TOUR_FLOW]);

  const fadeOutThen = React.useCallback(
    (fn) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      clearTimers();
      setFadeState("out");

      schedule(() => {
        fn?.();
        transitioningRef.current = false;
      }, ANIM_MS);
    },
    [ANIM_MS, clearTimers, schedule]
  );

  const fadeSwap = React.useCallback(
    (fn) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      clearTimers();
      setFadeState("out");

      schedule(() => {
        fn?.();
        setFadeState("in");

        schedule(() => {
          transitioningRef.current = false;
        }, ANIM_MS);
      }, ANIM_MS);
    },
    [ANIM_MS, clearTimers, schedule]
  );

  const api = React.useMemo(
    () => ({
      start() {
        if (transitioningRef.current) return;
        transitioningRef.current = true;
        clearTimers();

        setFadeState("out");
        setIsRunning(true);
        setScreenIndex(0);
        setTipIndex(0);
        navigate(TOUR_FLOW[0].path);

        schedule(() => {
          setFadeState("in");
          schedule(() => {
            transitioningRef.current = false;
          }, ANIM_MS);
        }, 30);
      },
      stop() {
        fadeOutThen(() => {
          setIsRunning(false);
          setTipIndex(0);
        });
      },
      isRunning() {
        return isRunning;
      },
    }),
    [ANIM_MS, clearTimers, fadeOutThen, isRunning, navigate, schedule, TOUR_FLOW]
  );

  const onNextTip = React.useCallback(() => {
    const count = tips.length;
    if (count <= 1) return;

    fadeSwap(() => {
      setTipIndex((i) => Math.min(i + 1, count - 1));
    });
  }, [fadeSwap, tips.length]);

  const onNextScreen = React.useCallback(() => {
    const next = screenIndex + 1;

    if (next >= TOUR_FLOW.length) {
      fadeOutThen(() => {
        setIsRunning(false);
        setTipIndex(0);
      });
      return;
    }

    fadeSwap(() => {
      setScreenIndex(next);
      setTipIndex(0);
      navigate(TOUR_FLOW[next].path);
    });
  }, [fadeOutThen, fadeSwap, navigate, screenIndex, TOUR_FLOW]);

  const hasMoreTips = tips.length > 1 && tipIndex < tips.length - 1;
  const isLastScreen = screenIndex >= TOUR_FLOW.length - 1;

  return (
    <TourContext.Provider value={api}>
      {children}

      {isRunning && tip ? (
        <TourBox
          title={tip.title}
          body={tip.body}
          tipIndex={tipIndex}
          tipCount={tips.length}
          hasMoreTips={hasMoreTips}
          onNextTip={onNextTip}
          isLastScreen={isLastScreen}
          onNextScreen={onNextScreen}
          onExit={api.stop}
          fadeState={fadeState}
          targets={tip.target}
        />
      ) : null}
    </TourContext.Provider>
  );
}
