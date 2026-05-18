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

// Tutorial flow is deliberately screen based.
// Each screen can contain multiple "tips". The Next button advances tips.
// The arrow button advances to the next screen.
const getTourFlow = (t) => [
  {
    key: "dashboard",
    path: "/",
    tips: [
      {
        title: t("tutorial.dashboard.title", { defaultValue: "Dashboard" }),
        body: t("tutorial.dashboard.body", { defaultValue: "This page shows the main performance summary." }),
        target: "dashboard-kpis",
      },
      {
        title: t("tutorial.kpis.title", { defaultValue: "KPI cards" }),
        body: t("tutorial.kpis.body", { defaultValue: "Use these cards to quickly check posts, engagement, likes, comments, and shares." }),
        target: "dashboard-kpis",
      },
      {
        title: t("tutorial.topPosts.title", { defaultValue: "Top posts" }),
        body: t("tutorial.topPosts.body", { defaultValue: "This section ranks the posts with the strongest engagement." }),
        target: "dashboard-top-posts",
      },
      {
        title: t("tutorial.platformCharts.title", { defaultValue: "Charts" }),
        body: t("tutorial.platformCharts.body", { defaultValue: "These charts compare engagement over time and by platform." }),
        target: "dashboard-platforms",
      },
    ],
  },
  {
    key: "competitor-lookup",
    path: "/competitor-lookup",
    tips: [
      {
        title: t("tutorial.competitorLookup.title", { defaultValue: "Competitor Lookup" }),
        body: t("tutorial.competitorLookup.body", { defaultValue: "Search a platform, username, URL, or keyword to pull competitor content." }),
        target: "competitor-lookup-search",
      },
      {
        title: t("tutorial.results.title", { defaultValue: "Results" }),
        body: t("tutorial.results.body", { defaultValue: "Review the results, open the original post, or save useful posts for later." }),
        target: "competitor-results",
      },
    ],
  },
  {
    key: "saved-posts",
    path: "/savedPosts",
    tips: [
      {
        title: t("tutorial.savedPosts.title", { defaultValue: "Saved Posts" }),
        body: t("tutorial.savedPosts.body", { defaultValue: "Saved posts are stored here so they can be reused in reports, keywords, and analysis." }),
        target: "saved-posts-list",
      },
    ],
  },
  {
    key: "keyword-tracking",
    path: "/keywords",
    tips: [
      {
        title: t("tutorial.keywordTracking.title", { defaultValue: "Keyword Tracking" }),
        body: t("tutorial.keywordTracking.body", { defaultValue: "This page finds repeated words and topics from saved posts." }),
        target: "keyword-tracking-root",
      },
      {
        title: t("tutorial.keywordRankings.title", { defaultValue: "Keyword rankings" }),
        body: t("tutorial.keywordRankings.body", { defaultValue: "Use the rankings to see which topics appear most often and perform best." }),
        target: "keyword-tracking-root",
      },
    ],
  },
  {
    key: "autoscraper",
    path: "/watchlist",
    tips: [
      {
        title: t("tutorial.autoscraper.title", { defaultValue: "Auto Scraper" }),
        body: t("tutorial.autoscraper.body", { defaultValue: "Add searches here to pull new posts without manually searching every time." }),
        target: "autoscraper-root",
      },
    ],
  },
  {
    key: "reports",
    path: "/reports",
    tips: [
      {
        title: t("tutorial.reports.title", { defaultValue: "Reports" }),
        body: t("tutorial.reports.body", { defaultValue: "Describe the report you want, then let AI build the preview." }),
        target: "reports-ai",
      },
      {
        title: t("tutorial.reportPreview.title", { defaultValue: "Report preview" }),
        body: t("tutorial.reportPreview.body", { defaultValue: "Check the PDF layout before downloading it." }),
        target: "reports-preview",
      },
    ],
  },
  {
    key: "chat",
    path: "/chat",
    tips: [
      {
        title: t("tutorial.chat.title", { defaultValue: "Chat" }),
        body: t("tutorial.chat.body", { defaultValue: "Ask questions about your posts, reports, or uploaded files." }),
        target: "chat-composer",
      },
      {
        title: t("tutorial.chatActions.title", { defaultValue: "Chat actions" }),
        body: t("tutorial.chatActions.body", { defaultValue: "Use these buttons to start common tasks faster." }),
        target: "chat-quick-actions",
      },
    ],
  },
  {
    key: "settings",
    path: "/settings",
    tips: [
      {
        title: t("tutorial.settings.title", { defaultValue: "Settings" }),
        body: t("tutorial.settings.body", { defaultValue: "Change language, theme, model, and account settings here." }),
        target: "settings-tutorial-card",
      },
      {
        title: t("tutorial.restartTutorial.title", { defaultValue: "Restart tutorial" }),
        body: t("tutorial.restartTutorial.body", { defaultValue: "Press Start to run this walkthrough again." }),
        target: "settings-tutorial-card",
      },
    ],
  },
];


function TourSpotlight({ target, fadeState }) {
  const [rect, setRect] = React.useState(null);

  React.useEffect(() => {
    if (!target || typeof document === "undefined") {
      setRect(null);
      return undefined;
    }

    let disposed = false;
    let retryTimer = null;

    const findTarget = () => document.querySelector(`[data-tour="${target}"]`);

    const update = () => {
      if (disposed) return;
      const el = findTarget();
      if (!el) {
        setRect(null);
        return;
      }
      const next = el.getBoundingClientRect();
      setRect({
        top: Math.max(10, next.top - 10),
        left: Math.max(10, next.left - 10),
        width: Math.min(window.innerWidth - 20, next.width + 20),
        height: Math.min(window.innerHeight - 20, next.height + 20),
      });
    };

    const reveal = () => {
      const el = findTarget();
      if (!el) {
        retryTimer = window.setTimeout(reveal, 180);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      window.setTimeout(update, 220);
    };

    reveal();
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [target]);

  if (!rect) return null;

  const isOut = fadeState === "out";
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: 18,
        pointerEvents: "none",
        zIndex: 11990,
        opacity: isOut ? 0 : 1,
        transition: "opacity 180ms ease, top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease",
        boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.58), 0 0 0 5px rgba(28, 126, 214, 0.98), 0 0 0 10px rgba(255, 255, 255, 0.85), 0 18px 60px rgba(28, 126, 214, 0.45)",
        outline: "2px solid rgba(255,255,255,0.95)",
        background: "rgba(28, 126, 214, 0.08)",
      }}
    />
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
  target,
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
      <TourSpotlight target={target} fadeState={fadeState} />
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

            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, color: "var(--text-primary, #111827)" }}>{title}</div>
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
                  background: "#1c7ed6",
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
                      background: "#e7f5ff",
                      borderRadius: 12,
                      padding: "0 14px",
                      height: 36,
                      fontWeight: 950,
                      fontSize: 13,
                      cursor: "pointer",
                      color: "#1c7ed6",
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

  React.useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const screen = TOUR_FLOW[screenIndex];
  const tips = screen?.tips ?? [];
  const tip = tips[Math.min(tipIndex, Math.max(0, tips.length - 1))] ?? null;

  // Keep tutorial aligned to manual navigation.
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
    [clearTimers, schedule]
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
    [clearTimers, schedule]
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

        // Let it mount at opacity 0, then fade in.
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
          target={tip.target}
        />
      ) : null}
    </TourContext.Provider>
  );
}
