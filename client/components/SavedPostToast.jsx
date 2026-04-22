import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const TOAST_DURATION = 5000; // ms
const STORAGE_KEY = "chibitek-pending-chat-post";

/**
 * SavedPostToast
 *
 * Listens for a global "chibitek:postSaved" CustomEvent.
 * When fired, shows a popup for TOAST_DURATION ms with:
 *   - A message asking whether to send the post to chat
 *   - "Send to Chat" / "Dismiss" buttons
 *   - A shrinking blue progress bar showing remaining time
 *   - A fade-out + slide-down in the last ~400 ms
 *
 * Clicking "Send to Chat" saves the post as a text attachment in
 * sessionStorage and navigates to /chat, where Chat.jsx picks it up.
 *
 * Event detail shape: { content?: string, platform?: string, postId?: string }
 */
export default function SavedPostToast() {
  const [toast, setToast] = useState(null);
  const [progress, setProgress] = useState(100);
  const [fading, setFading] = useState(false);
  const timerRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const navigate = useNavigate();

  /* ── dismiss ─────────────────────────────────────────────────────── */
  const dismiss = () => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    setFading(true);
    setTimeout(() => {
      setToast(null);
      setFading(false);
      setProgress(100);
    }, 380);
  };

  /* ── listen for save events ──────────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
      setFading(false);
      setProgress(100);
      setToast(e.detail || {});
      startRef.current = performance.now();

      const tick = (now) => {
        const elapsed = now - startRef.current;
        const pct = Math.max(0, 1 - elapsed / TOAST_DURATION);
        setProgress(pct * 100);
        if (elapsed < TOAST_DURATION - 400) {
          rafRef.current = requestAnimationFrame(tick);
        } else if (elapsed < TOAST_DURATION) {
          setFading(true);
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);

      timerRef.current = setTimeout(() => {
        setToast(null);
        setFading(false);
        setProgress(100);
      }, TOAST_DURATION + 20);
    };

    window.addEventListener("chibitek:postSaved", handler);
    return () => {
      window.removeEventListener("chibitek:postSaved", handler);
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ── send to chat ────────────────────────────────────────────────── */
  const handleSendToChat = () => {
    const { content = "", platform = "" } = toast || {};

    // Build a text attachment the chat page can load directly
    const label = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Saved";
    const attachment = {
      name: `${label.toLowerCase().replace(/\s+/g, "-")}-post.txt`,
      type: "text/plain",
      size: content.length,
      content: content.slice(0, 12000),
    };

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ attachment, platform })
    );

    dismiss();
    navigate("/chat");
  };

  if (!toast) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        zIndex: 9999,
        width: 320,
        borderRadius: 12,
        background: "#ffffff",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
        overflow: "hidden",
        opacity: fading ? 0 : 1,
        transform: fading ? "translateY(10px) scale(0.97)" : "translateY(0) scale(1)",
        transition: "opacity 0.38s ease, transform 0.38s ease",
        fontFamily: "system-ui, Avenir, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Progress bar */}
      <div style={{ height: 3, background: "#e9ecef" }}>
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, #339af0, #228be6)",
            transition: "width 0.08s linear",
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 22, height: 22, borderRadius: "50%", background: "#d3f9d8", flexShrink: 0,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6.5L4.5 9L10 3" stroke="#2f9e44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1c2526", letterSpacing: "-0.01em" }}>
              Post saved!
            </span>
          </div>
          <button
            onClick={dismiss}
            style={{
              background: "none", border: "none", padding: "2px 4px",
              cursor: "pointer", color: "#868e96", lineHeight: 1,
              borderRadius: 4, display: "flex", alignItems: "center",
            }}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#495057", lineHeight: 1.45 }}>
          Send this post to the AI chat for analysis?
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleSendToChat}
            style={{
              flex: 1, padding: "7px 0", fontSize: 13, fontWeight: 600,
              background: "#228be6", color: "#fff", border: "none",
              borderRadius: 7, cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.target.style.background = "#1971c2")}
            onMouseLeave={(e) => (e.target.style.background = "#228be6")}
          >
            Send to Chat
          </button>
          <button
            onClick={dismiss}
            style={{
              flex: 1, padding: "7px 0", fontSize: 13, fontWeight: 600,
              background: "#f1f3f5", color: "#495057", border: "none",
              borderRadius: 7, cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.target.style.background = "#e9ecef")}
            onMouseLeave={(e) => (e.target.style.background = "#f1f3f5")}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}