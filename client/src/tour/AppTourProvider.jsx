import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconArrowRight, IconX, IconChevronRight, IconCheck } from "@tabler/icons-react";

const TourContext = React.createContext(null);

export function useAppTour() {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error("useAppTour must be used within AppTourProvider");
  return ctx;
}

// Tutorial flow is deliberately screen based.
// Each screen can contain multiple "tips". The Next button advances tips.
// The arrow button advances to the next screen.
const TOUR_FLOW = [
  {
    key: "dashboard",
    path: "/",
    tips: [
      {
        title: "Dashboard",
        body: "Your high level snapshot. Scan performance, spot changes, then decide where to dig deeper.",
      },
      {
        title: "Engagement snapshot",
        body: "Top tiles summarize what is happening right now so you can orient yourself in seconds.",
      },
      {
        title: "Opportunity alerts",
        body: "Watchouts and fast movers that are worth acting on early.",
      },
      {
        title: "What works now",
        body: "Charts and tables highlight the topics driving the strongest engagement at the moment.",
      },
    ],
  },
  {
    key: "competitor-lookup",
    path: "/competitor-lookup",
    tips: [
      {
        title: "Competitor Lookup",
        body: "Search any competitor and pull recent posts so you can compare positioning and momentum.",
      },
      {
        title: "Search and filters",
        body: "Use the search bar and filters to narrow results by platform, time window, or topic.",
      },
      {
        title: "Post feed",
        body: "Open items for detail, then save the best examples for later.",
      },
    ],
  },
  {
    key: "saved-posts",
    path: "/savedPosts",
    tips: [
      {
        title: "Saved Posts",
        body: "Everything you saved lives here so you can reference it later and build your evidence library.",
      },
      {
        title: "Tagging and notes",
        body: "Add tags or quick notes so you can find examples by theme, competitor, or campaign style.",
      },
      {
        title: "Export",
        body: "Download your saved set when you need to share findings or move work into a deck.",
      },
    ],
  },
  {
    key: "keyword-tracking",
    path: "/keywords",
    tips: [
      {
        title: "Keyword Tracking",
        body: "Track what topics are rising and cooling off, then connect them to performance.",
      },
      {
        title: "Trending keywords",
        body: "This table shows what is trending right now, including volume and rank movement.",
      },
      {
        title: "Category momentum",
        body: "Charts show category movement over time so you can spot shifts early.",
      },
    ],
  },
  {
    key: "reports",
    path: "/reports",
    tips: [
      {
        title: "Reports",
        body: "Generate shareable summaries so your insights can travel beyond the dashboard.",
      },
      {
        title: "Build and download",
        body: "Create a report, review it quickly, then download for distribution or archiving.",
      },
    ],
  },
  {
    key: "chat",
    path: "/chat",
    tips: [
      {
        title: "ChibitekAI Chat",
        body: "Ask questions, attach files, and save conversations so research stays organized.",
      },
      {
        title: "Save your work",
        body: "Keep threads you want to reuse, and return to them when you build reports or briefs.",
      },
    ],
  },
  {
    key: "settings",
    path: "/settings",
    tips: [
      {
        title: "Settings",
        body: "Manage your account preferences and integrations. You can restart this tutorial any time.",
      },
      {
        title: "Language",
        body: "Switch the app language here. Changes apply instantly across the interface.",
      },
      {
        title: "Integrations",
        body: "Connect data sources so Chibitek can pull competitive content and updates automatically.",
      },
      {
        title: "Tutorial",
        body: "Press Start whenever you want a quick refresher of the key screens.",
      },
    ],
  },
];

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
}) {
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
              background:
                "linear-gradient(135deg, rgba(29,78,216,0.98) 0%, rgba(37,99,235,0.98) 55%, rgba(59,130,246,0.98) 100%)",
              borderRadius: 20,
              padding: "16px 16px 18px",
              boxShadow: "0 18px 52px rgba(0,0,0,0.22), 0 4px 14px rgba(0,0,0,0.14)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.05em",
                  color: "rgba(255,255,255,0.92)",
                  textTransform: "uppercase",
                }}
              >
                Tutorial
              </div>

              <button
                onClick={onExit}
                type="button"
                aria-label="Exit tutorial"
                style={{
                  appearance: "none",
                  border: "1px solid rgba(255,255,255,0.28)",
                  background: "rgba(255,255,255,0.16)",
                  borderRadius: 999,
                  width: 34,
                  height: 34,
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.96)",
                  boxShadow: "0 8px 18px rgba(0,0,0,0.16)",
                }}
              >
                <IconX size={16} />
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, color: "#ffffff" }}>{title}</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 14,
                fontWeight: 650,
                color: "rgba(255,255,255,0.92)",
                lineHeight: 1.35,
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
              <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(255,255,255,0.86)" }}>
                Tip {Math.min(tipIndex + 1, tipCount)} of {tipCount}
              </div>

              <button
                onClick={onNextScreen}
                type="button"
                aria-label={isLastScreen ? "Finish tutorial" : "Next screen"}
                style={{
                  appearance: "none",
                  border: "1px solid rgba(255,255,255,0.50)",
                  background: "rgba(255,255,255,0.92)",
                  borderRadius: 999,
                  width: 44,
                  height: 44,
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  color: "#1d4ed8",
                  boxShadow: "0 18px 44px rgba(0,0,0,0.22)",
                  userSelect: "none",
                }}
              >
                {isLastScreen ? <IconCheck size={20} /> : <IconArrowRight size={20} />}
              </button>

              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                {hasMoreTips ? (
                  <button
                    onClick={onNextTip}
                    type="button"
                    style={{
                      appearance: "none",
                      border: "1px solid rgba(255,255,255,0.45)",
                      background: "rgba(255,255,255,0.92)",
                      borderRadius: 12,
                      padding: "0 14px",
                      height: 36,
                      fontWeight: 950,
                      fontSize: 13,
                      cursor: "pointer",
                      color: "#1d4ed8",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 10px 26px rgba(0,0,0,0.16)",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Next
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
        Exit tutorial
      </button>
    </>
  );
}

export default function AppTourProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

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
  }, [isRunning, location.pathname, screenIndex]);

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
    [ANIM_MS, clearTimers, fadeOutThen, isRunning, navigate, schedule]
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
  }, [fadeOutThen, fadeSwap, navigate, screenIndex]);

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
        />
      ) : null}
    </TourContext.Provider>
  );
}
