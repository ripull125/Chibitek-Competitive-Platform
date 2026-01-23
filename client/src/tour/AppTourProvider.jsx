import React from "react";
import Joyride from "react-joyride";
import { useNavigate } from "react-router-dom";

const TourContext = React.createContext(null);

export function useAppTour() {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error("useAppTour must be used within AppTourProvider");
  return ctx;
}

const STEPS = [
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
  {
    target: '[data-tour="dashboard-slide-2"]',
    title: "Competitor moves",
    content: "High engagement posts by competitors so you can learn what’s working.",
    placement: "top",
    disableBeacon: true,
  },
];

export default function AppTourProvider({ children }) {
  const navigate = useNavigate();

  const [run, setRun] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);

  const pendingRef = React.useRef(null);
  const waitingStartRef = React.useRef(false);

  React.useEffect(() => {
    const onPageReady = (e) => {
      if (e?.detail?.page !== "dashboard") return;
      if (!waitingStartRef.current) return;

      waitingStartRef.current = false;
      setStepIndex(0);
      setRun(true);
    };

    const onDashboard = (e) => {
      const desired = pendingRef.current;
      if (!desired) return;

      if (e?.detail?.page === desired.awaitPage) {
        pendingRef.current = null;
        setStepIndex(desired.nextStep);
      }
    };

    window.addEventListener("chibitek:pageReady", onPageReady);
    window.addEventListener("chibitek:dashboard", onDashboard);

    return () => {
      window.removeEventListener("chibitek:pageReady", onPageReady);
      window.removeEventListener("chibitek:dashboard", onDashboard);
    };
  }, []);

  const api = React.useMemo(
    () => ({
      start() {
        setRun(false);
        setStepIndex(0);

        waitingStartRef.current = true;

        navigate("/");
        window.dispatchEvent(
          new CustomEvent("chibitek:tour", {
            detail: { type: "setDashboardSlide", page: 0 },
          })
        );
      },
      stop() {
        pendingRef.current = null;
        waitingStartRef.current = false;

        setRun(false);
        setStepIndex(0);

        window.dispatchEvent(
          new CustomEvent("chibitek:tour", {
            detail: { type: "setDashboardSlide", page: 0 },
          })
        );
      },
    }),
    [navigate]
  );

  return (
    <TourContext.Provider value={api}>
      <Joyride
        steps={STEPS}
        run={run}
        stepIndex={stepIndex}
        continuous
        scrollToFirstStep
        disableOverlayClose
        spotlightClicks={false}
        showSkipButton={false}
        hideCloseButton
        callback={(data) => {
          if (!run) return;

          const isAfter = data.type === "step:after";
          if (!isAfter) return;

          if (data.action === "next") {
            if (stepIndex === 2) {
              pendingRef.current = { awaitPage: 1, nextStep: 3 };

              window.dispatchEvent(
                new CustomEvent("chibitek:tour", {
                  detail: { type: "setDashboardSlide", page: 1 },
                })
              );
              return;
            }

            setStepIndex((s) => Math.min(s + 1, STEPS.length - 1));
          }

          if (data.action === "prev") {
            if (stepIndex === 3) {
              pendingRef.current = { awaitPage: 0, nextStep: 2 };

              window.dispatchEvent(
                new CustomEvent("chibitek:tour", {
                  detail: { type: "setDashboardSlide", page: 0 },
                })
              );
              return;
            }

            setStepIndex((s) => Math.max(s - 1, 0));
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
          },
          tooltip: {
            padding: "18px 20px",
            textAlign: "center",
            borderRadius: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.14), 0 2px 10px rgba(0,0,0,0.08)",
          },
          tooltipContainer: {
            textAlign: "center",
          },
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
            fontWeight: 700,
            margin: "0 auto",
          },
          buttonBack: {
            borderRadius: 12,
          },
        }}
      />

      {run && (
        <div
          onClick={api.stop}
          style={{
            position: "fixed",
            bottom: 26,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9000,
            background: "rgba(255,255,255,0.92)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
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
      )}

      {children}
    </TourContext.Provider>
  );
}
