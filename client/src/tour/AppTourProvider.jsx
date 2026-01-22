import { createContext, useContext, useMemo, useState } from "react";
import Joyride from "react-joyride";
import { useNavigate } from "react-router-dom";

const TourContext = createContext(null);

export function useAppTour() {
  return useContext(TourContext);
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
    content: "Fast-moving trends and risks worth acting on early.",
    placement: "right",
    disableBeacon: true,
  },
  {
    target: '[data-tour="dashboard-chart"]',
    title: "What works now",
    content: "Topics that generate the strongest engagement.",
    placement: "left",
    disableBeacon: true,
  },
  {
    target: '[data-tour="competitor-lookup-input"]',
    title: "Competitor lookup",
    content: "Search competitors by username to analyze their activity.",
    route: "/competitor-lookup",
    placement: "bottom",
    disableBeacon: true,
  },
];

export default function AppTourProvider({ children }) {
  const navigate = useNavigate();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const api = useMemo(
    () => ({
      start() {
        setStepIndex(0);
        setRun(true);
        navigate("/");
      },
      stop() {
        setRun(false);
        setStepIndex(0);
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
          if (data.action === "next") {
            const next = stepIndex + 1;
            const step = STEPS[next];
            if (step?.route) navigate(step.route);
            setStepIndex(next);
          }

          if (data.status === "finished" || data.status === "skipped") {
            setRun(false);
            setStepIndex(0);
          }
        }}
        styles={{
          options: {
            zIndex: 8000,
            width: 360,
            backgroundColor: "#ffffff",
            textColor: "#1f2937",
            primaryColor: "#2563eb",
            borderRadius: 14,
          },
          overlay: {
            backgroundColor: "rgba(90, 90, 90, 0.55)",
            transition: "opacity 320ms ease",
          },
          spotlight: {
            borderRadius: 18,
            boxShadow: "0 0 0 9999px rgba(90,90,90,0.55)",
          },
          tooltipContainer: {
            textAlign: "center",
          },
          tooltipTitle: {
            textAlign: "center",
            fontWeight: 700,
            fontSize: "13px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#6b7280",
            marginBottom: 8,
          },
          tooltip: {
            padding: "20px 22px",
            fontSize: "14px",
            lineHeight: 1.6,
            textAlign: "center",
            boxShadow:
              "0 10px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
          },
          buttonNext: {
            backgroundColor: "#2563eb",
            borderRadius: 10,
            padding: "8px 18px",
            fontWeight: 600,
            margin: "0 auto",
          },
        }}
      />

      {/* 🔹 EXIT TUTORIAL BUBBLE 🔹 */}
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
            boxShadow:
              "0 4px 14px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
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
