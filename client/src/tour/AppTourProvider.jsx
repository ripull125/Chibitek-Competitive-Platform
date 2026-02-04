// client/src/tour/AppTourProvider.jsx
import React from "react";
import Joyride from "react-joyride";
import { useNavigate } from "react-router-dom";

const TourContext = React.createContext(null);

export function useAppTour() {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error("useAppTour must be used within AppTourProvider");
  return ctx;
}

/*
  Joyride runs for:
  1) Dashboard highlights (3 steps)
  2) Keyword Tracking highlights (2 steps)

  Bubble overlay runs for:
  1) Competitor Lookup intro (full screen)
  2) Saved Posts intro (full screen)
*/

const DASHBOARD_STEPS = [
  {
    target: '[data-tour="dashboard-kpis"]',
    title: "Engagement snapshot",
    content: "A quick overview of how your brand is performing right now.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: '[data-tour="dashboard-alerts"]',
    title: "Opportunity alerts",
    content: "Fast movers and watchouts that are worth acting on early.",
    placement: "right",
    disableBeacon: true,
  },
  {
    target: '[data-tour="dashboard-chart"]',
    title: "What works now",
    content: "Topics generating the strongest engagement right now.",
    placement: "left",
    disableBeacon: true,
  },
];

const KEYWORD_STEPS = [
  {
    target: '[data-tour="keywords-trending"]',
    title: "Trending Keywords",
    content: "This table shows what’s trending right now, with volume and rank movement.",
    placement: "right",
    disableBeacon: true,
  },
  {
    target: '[data-tour="keywords-categories-chart"]',
    title: "Keyword Categories Over Time",
    content: "This chart shows category momentum over time so you can spot what’s rising and cooling off.",
    placement: "top",
    disableBeacon: true,
  },
];

function Bubble({ title, body, onNext, onExit, nextLabel = "Next" }) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9000,
          background: "rgba(80, 80, 80, 0.55)",
          opacity: 1,
          transition: "opacity 260ms ease",
        }}
      />
      <div
        style={{
          position: "fixed",
          left: 20,
          bottom: 86,
          zIndex: 9100,
          width: 360,
          maxWidth: "calc(100vw - 40px)",
          background: "rgba(255,255,255,0.96)",
          borderRadius: 18,
          padding: "16px 16px 14px",
          boxShadow: "0 12px 34px rgba(0,0,0,0.16), 0 3px 12px rgba(0,0,0,0.10)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.04em",
            color: "#6b7280",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            fontWeight: 650,
            color: "#111827",
            lineHeight: 1.35,
            textAlign: "center",
          }}
        >
          {body}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={onExit}
            style={{
              appearance: "none",
              border: "1px solid rgba(17,24,39,0.10)",
              background: "rgba(255,255,255,0.9)",
              borderRadius: 12,
              padding: "8px 12px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              color: "#374151",
            }}
          >
            Exit
          </button>
          <button
            onClick={onNext}
            style={{
              appearance: "none",
              border: "1px solid rgba(37,99,235,0.18)",
              background: "rgba(37,99,235,0.12)",
              borderRadius: 12,
              padding: "8px 14px",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              color: "#1d4ed8",
            }}
          >
            {nextLabel}
          </button>
        </div>
      </div>

      <div
        onClick={onExit}
        style={{
          position: "fixed",
          bottom: 26,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9200,
          background: "rgba(255,255,255,0.92)",
          borderRadius: 999,
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 700,
          color: "#374151",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          userSelect: "none",
        }}
      >
        Exit tutorial
      </div>
    </>
  );
}

export default function AppTourProvider({ children }) {
  const navigate = useNavigate();

  const [joyrideRun, setJoyrideRun] = React.useState(false);
  const [joyrideStep, setJoyrideStep] = React.useState(0);
  const [joyrideSteps, setJoyrideSteps] = React.useState(DASHBOARD_STEPS);

  const [pageIntro, setPageIntro] = React.useState(null);

  const waitingDashboardStartRef = React.useRef(false);
  const waitingKeywordStartRef = React.useRef(false);

  React.useEffect(() => {
    const onPageReady = (e) => {
      const page = e?.detail?.page;

      // start dashboard joyride when dashboard signals ready
      if (waitingDashboardStartRef.current && page === "dashboard") {
        waitingDashboardStartRef.current = false;
        setJoyrideSteps(DASHBOARD_STEPS);
        setJoyrideStep(0);
        setJoyrideRun(true);
        return;
      }

      // start keyword joyride when keyword tracking signals ready
      if (waitingKeywordStartRef.current && page === "keyword-tracking") {
        waitingKeywordStartRef.current = false;
        setJoyrideSteps(KEYWORD_STEPS);
        setJoyrideStep(0);
        setJoyrideRun(true);
        return;
      }

      // bubble readiness for competitor / saved posts
      if (pageIntro?.awaitPage && page === pageIntro.awaitPage) {
        setPageIntro((prev) => (prev ? { ...prev, ready: true } : prev));
      }
    };

    window.addEventListener("chibitek:pageReady", onPageReady);
    return () => window.removeEventListener("chibitek:pageReady", onPageReady);
  }, [pageIntro]);

  const api = React.useMemo(
    () => ({
      start() {
        setPageIntro(null);
        setJoyrideRun(false);
        setJoyrideStep(0);

        waitingKeywordStartRef.current = false;
        waitingDashboardStartRef.current = true;

        navigate("/");
      },
      stop() {
        waitingDashboardStartRef.current = false;
        waitingKeywordStartRef.current = false;

        setJoyrideRun(false);
        setJoyrideStep(0);
        setPageIntro(null);
      },
    }),
    [navigate]
  );

  const beginCompetitorIntro = React.useCallback(() => {
    setJoyrideRun(false);
    setJoyrideStep(0);

    setPageIntro({
      awaitPage: "competitor-lookup",
      ready: false,
      title: "Competitor Lookup",
      body: "Search any competitor and pull their latest posts so you can compare positioning and performance.",
      next: () => {
        setPageIntro({
          awaitPage: "saved-posts",
          ready: false,
          title: "Saved Posts",
          body: "Everything you saved for later lives here so you can reference, tag, and reuse the best examples.",
          next: () => {
            // NOW: go to keyword tracking and run Joyride there (two cutouts)
            setPageIntro(null);
            setJoyrideRun(false);
            setJoyrideStep(0);

            waitingKeywordStartRef.current = true;
            navigate("/keywords");
          },
        });

        navigate("/savedPosts");
      },
    });

    navigate("/competitor-lookup");
  }, [navigate]);

  return (
    <TourContext.Provider value={api}>
      <Joyride
        steps={joyrideSteps}
        run={joyrideRun}
        stepIndex={joyrideStep}
        continuous
        scrollToFirstStep
        disableOverlayClose
        spotlightClicks={false}
        spotlightPadding={8}
        showSkipButton={false}
        hideCloseButton
        locale={{
          back: "Back",
          close: "Next",
          last: "Next",
          next: "Next",
          skip: "Skip",
        }}
        callback={(data) => {
          if (!joyrideRun) return;

          const isAfter = data.type === "step:after";
          if (!isAfter) return;

          if (data.action === "next") {
            const next = joyrideStep + 1;

            // finished current joyride sequence
            if (next >= joyrideSteps.length) {
              // If we just finished dashboard, go to competitor bubble flow
              if (joyrideSteps === DASHBOARD_STEPS) {
                beginCompetitorIntro();
                return;
              }

              // If we just finished keyword tracking, end tutorial
              api.stop();
              return;
            }

            setJoyrideStep(next);
            return;
          }

          if (data.action === "prev") {
            setJoyrideStep((s) => Math.max(0, s - 1));
          }

          if (data.status === "finished" || data.status === "skipped") {
            api.stop();
          }
        }}
        styles={{
          options: {
            zIndex: 8000,
            width: 360,
            backgroundColor: "#ffffff",
            textColor: "#111827",
            primaryColor: "#2563eb",
            borderRadius: 16,
          },
          overlay: {
            backgroundColor: "rgba(80, 80, 80, 0.55)",
            transition: "opacity 320ms ease",
          },
          spotlight: {
            borderRadius: 18,
            boxShadow: "0 0 0 9999px rgba(80, 80, 80, 0.55)",
            transition: "all 260ms ease",
          },
          tooltip: {
            padding: "18px 20px",
            textAlign: "center",
            borderRadius: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.14), 0 2px 10px rgba(0,0,0,0.08)",
          },
          tooltipContainer: { textAlign: "center" },
          tooltipTitle: {
            textAlign: "center",
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#6b7280",
            marginBottom: 8,
          },
          buttonNext: {
            borderRadius: 12,
            padding: "8px 18px",
            fontWeight: 800,
            margin: "0 auto",
          },
          buttonBack: { borderRadius: 12 },
        }}
      />

      {pageIntro && pageIntro.ready && (
        <Bubble
          title={pageIntro.title}
          body={pageIntro.body}
          onExit={api.stop}
          onNext={pageIntro.next}
          nextLabel="Next"
        />
      )}

      {children}
    </TourContext.Provider>
  );
}
