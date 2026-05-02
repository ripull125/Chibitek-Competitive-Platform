import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import KeywordTracking from "./KeywordTracking";
import { convertSavedPosts, analyzeUniversalPosts } from "./DataConverter";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  Button, Checkbox, Chip, Container, Group, Title, Paper,
  LoadingOverlay, RangeSlider, SegmentedControl, Stack, Text, Select, Modal,
} from "@mantine/core";
import {
  IconDownload, IconSparkles, IconRefresh, IconChartDots, IconChartBar,
  IconLayoutList, IconLayoutColumns, IconLayoutDashboard, IconAlertTriangle,
} from "@tabler/icons-react";
import {
  ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import "../utils/ui.css";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";

// ── Layout manager ────────────────────────────────────────────────────────────
import {
  createLayout,
  loadLayout,
  saveLayout,
  resetLayout,
  PAGE,
} from "./pdfLayoutManager";

const KW_SUMMARY_KEY = "chibitek-keyword-summary";

// ── PDF Template UI definitions ───────────────────────────────────────────────
const PDF_TEMPLATES = [
  {
    id: "executive",
    label: "Executive Summary",
    icon: IconLayoutList,
    description: "Text-first layout. Summary leads, then keyword chart, tone chart, and stats. Ideal for stakeholder read-outs.",
    accent: "#2f6fdb",
    badge: "Recommended",
  },
  {
    id: "visual",
    label: "Visual Report",
    icon: IconLayoutDashboard,
    description: "Chart-heavy layout. Full-width graphs dominate with summary and stats below. Great for presentations.",
    accent: "#845ef7",
    badge: "Most Popular",
  },
  {
    id: "compact",
    label: "Compact Data",
    icon: IconLayoutColumns,
    description: "Two-column layout — keyword and tone charts sit side-by-side. Perfect for internal data reviews.",
    accent: "#20c997",
    badge: "Space-efficient",
  },
];

// ── Preview scale: PDF pt → modal px ─────────────────────────────────────────
const PREVIEW_SCALE = 0.72;
const PREVIEW_W = Math.round(PAGE.WIDTH_PT  * PREVIEW_SCALE); // ≈ 441 px
const PREVIEW_H = Math.round(PAGE.HEIGHT_PT * PREVIEW_SCALE); // ≈ 570 px

// ── TemplatePicker ────────────────────────────────────────────────────────────
function TemplatePicker({ onSelect, onCancel }) {
  const [hovered, setHovered]   = useState(null);
  const [selected, setSelected] = useState(null);

  return (
    <div style={{ padding: "8px 0" }}>
      <Text size="sm" c="dimmed" mb="lg">
        Choose a layout for your PDF report. Chart positions are driven by the saved layout JSON and can be repositioned in the preview step.
      </Text>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {PDF_TEMPLATES.map((tpl) => {
          const Icon       = tpl.icon;
          const isSelected = selected === tpl.id;
          const isHovered  = hovered  === tpl.id;
          return (
            <div
              key={tpl.id}
              onClick={() => setSelected(tpl.id)}
              onMouseEnter={() => setHovered(tpl.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: "1 1 180px", minWidth: 180, maxWidth: 240,
                border: `2px solid ${isSelected ? tpl.accent : isHovered ? tpl.accent + "80" : "#e9ecef"}`,
                borderRadius: 12, padding: 20, cursor: "pointer",
                background: isSelected ? tpl.accent + "0f" : isHovered ? tpl.accent + "06" : "#fff",
                transition: "all 0.18s ease", position: "relative",
                boxShadow: isSelected
                  ? `0 0 0 3px ${tpl.accent}30`
                  : isHovered ? "0 4px 16px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <div style={{
                position: "absolute", top: -10, right: 12,
                background: tpl.accent, color: "#fff",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                padding: "2px 8px", borderRadius: 20,
              }}>
                {tpl.badge}
              </div>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: tpl.accent + "18",
                display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
              }}>
                <Icon size={22} color={tpl.accent} />
              </div>
              <Text fw={700} size="sm" mb={6} style={{ color: isSelected ? tpl.accent : "#1a1a2e" }}>
                {tpl.label}
              </Text>
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                {tpl.description}
              </Text>
              {isSelected && (
                <div style={{
                  position: "absolute", bottom: 12, right: 12,
                  width: 20, height: 20, borderRadius: "50%",
                  background: tpl.accent, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4.5L4 7.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Group justify="flex-end" mt="xl" gap="sm">
        <Button variant="subtle" color="gray" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          style={{ background: selected ? PDF_TEMPLATES.find((t) => t.id === selected)?.accent : undefined }}
        >
          Continue with {selected ? PDF_TEMPLATES.find((t) => t.id === selected)?.label : "…"}
        </Button>
      </Group>
    </div>
  );
}

// ── PDFPreviewCanvas ──────────────────────────────────────────────────────────
// Shows a scaled-down 8.5×11 page with draggable chart thumbnails.
// Drag positions are written back into the PDFLayout instance (and persisted
// to localStorage via saveLayout) when the user releases the mouse.
function PDFPreviewCanvas({ layout, images, onLayoutChange }) {
  const canvasRef = useRef(null);
  const [dragging, setDragging] = useState(null); // { name, offsetX, offsetY }

  // Local px rects derived from layout pt coords
  const [rects, setRects] = useState(() => ptRectsToPixels(layout, images));

  function ptRectsToPixels(l, imgs) {
    const out = {};
    for (const name of Object.keys(imgs)) {
      const el = l.getElement(name);
      if (el) {
        out[name] = {
          x:      Math.round(el.x      * PREVIEW_SCALE),
          y:      Math.round(el.y      * PREVIEW_SCALE),
          width:  Math.round(el.width  * PREVIEW_SCALE),
          height: Math.round(el.height * PREVIEW_SCALE),
        };
      }
    }
    return out;
  }

  // Re-sync when layout reference changes (e.g. after reset)
  useEffect(() => {
    setRects(ptRectsToPixels(layout, images));
  }, [layout, images]);

  const handleMouseDown = (name, e) => {
    e.preventDefault();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const r = rects[name];
    setDragging({
      name,
      offsetX: e.clientX - canvasRect.left - r.x,
      offsetY: e.clientY - canvasRect.top  - r.y,
    });
  };

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;
      const { name, offsetX, offsetY } = dragging;
      const { width: w, height: h } = rects[name];
      const x = Math.max(0, Math.min(e.clientX - canvasRect.left - offsetX, PREVIEW_W - w));
      const y = Math.max(0, Math.min(e.clientY - canvasRect.top  - offsetY, PREVIEW_H - h));
      setRects((prev) => ({ ...prev, [name]: { ...prev[name], x, y } }));
    };

    const onUp = () => {
      // Convert px → pt and persist into layout JSON
      for (const [name, r] of Object.entries(rects)) {
        layout.setElement(name, {
          x:      Math.round(r.x      / PREVIEW_SCALE),
          y:      Math.round(r.y      / PREVIEW_SCALE),
          width:  Math.round(r.width  / PREVIEW_SCALE),
          height: Math.round(r.height / PREVIEW_SCALE),
        });
      }
      saveLayout(layout);
      onLayoutChange(layout);
      setDragging(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [dragging, rects, layout, onLayoutChange]);

  const tpl = PDF_TEMPLATES.find((t) => t.id === layout.id);

  return (
    <div
      ref={canvasRef}
      style={{
        position: "relative",
        width:  PREVIEW_W,
        height: PREVIEW_H,
        background: "#fff",
        border: "1px solid #dee2e6",
        borderRadius: 4,
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Template colour border */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", border: `2px solid ${tpl?.accent ?? "#ccc"}22` }} />

      {/* Margin guides */}
      <div style={{
        position: "absolute",
        top:    PAGE.MARGIN_PT * PREVIEW_SCALE,
        left:   PAGE.MARGIN_PT * PREVIEW_SCALE,
        right:  PAGE.MARGIN_PT * PREVIEW_SCALE,
        bottom: PAGE.MARGIN_PT * PREVIEW_SCALE,
        border: "1px dashed #e0e0e0",
        pointerEvents: "none",
      }} />

      {/* Chart images */}
      {Object.entries(images).map(([name, src]) => {
        if (!src || !rects[name]) return null;
        const r = rects[name];
        const isDragging = dragging?.name === name;
        const label = name === "keywordChart" ? "Keyword Chart" : "Tone Chart";
        return (
          <div
            key={name}
            onMouseDown={(e) => handleMouseDown(name, e)}
            style={{
              position: "absolute",
              left: r.x, top: r.y,
              width: r.width, height: r.height,
              cursor: isDragging ? "grabbing" : "grab",
              zIndex: isDragging ? 10 : 1,
              userSelect: "none",
              outline: isDragging
                ? `2px solid ${tpl?.accent ?? "#2f6fdb"}`
                : `1px solid ${tpl?.accent ?? "#2f6fdb"}44`,
              borderRadius: 2,
            }}
          >
            <img
              src={src} alt={label}
              style={{ width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", display: "block" }}
            />
            <div style={{
              position: "absolute", top: 2, left: 4,
              background: tpl?.accent ?? "#2f6fdb", color: "#fff",
              fontSize: 9, fontWeight: 700,
              padding: "1px 5px", borderRadius: 3, pointerEvents: "none",
            }}>
              {label}
            </div>
          </div>
        );
      })}

      {Object.values(images).every((v) => !v) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Text size="sm" c="dimmed">No charts available.</Text>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: 9, color: "#aaa", pointerEvents: "none" }}>
        8.5 × 11 in
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Reports() {
  const chartRef     = useRef(null);
  const toneChartRef = useRef(null);

  // Modal state
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [previewOpen,        setPreviewOpen]        = useState(false);

  // Active layout (PDFLayout instance from pdfLayoutManager)
  const [activeLayout,   setActiveLayout]   = useState(null);
  const [previewImages,  setPreviewImages]  = useState({});     // { keywordChart, toneChart }
  const [layoutWarnings, setLayoutWarnings] = useState([]);

  const [generating, setGenerating] = useState(false);

  // Report content
  const [includeKeywordTracking, setIncludeKeywordTracking] = useState(true);
  const [includeTone,            setIncludeTone]            = useState(true);
  const [includeSummary,         setIncludeSummary]         = useState(true);
  const [postLimit,              setPostLimit]              = useState(10);
  const [convertedData,          setConvertedData]          = useState([]);
  const [analysisStarted,        setAnalysisStarted]        = useState(false);
  const [toneEngagementData,     setToneEngagementData]     = useState([]);
  const [loading,                setLoading]                = useState(true);
  const [currentUserId,          setCurrentUserId]          = useState(null);
  const [topKeywords,            setTopKeywords]            = useState([]);
  const [keywordSummary,         setKeywordSummary]         = useState("");
  const [summaryLoading,         setSummaryLoading]         = useState(false);
  const [toneFilter,             setToneFilter]             = useState([]);
  const [engRange,               setEngRange]               = useState([0, 100]);
  const [chartView,              setChartView]              = useState("scatter");
  const [showUnlabeled,          setShowUnlabeled]          = useState(true);
  const [competitorFilter,       setCompetitorFilter]       = useState(null);

  const { t } = useTranslation();

  // ── localStorage helpers ──────────────────────────────────────────────────
  const loadSavedSummary = (uid) => {
    try {
      const raw = localStorage.getItem(KW_SUMMARY_KEY);
      if (!raw) return "";
      const obj = JSON.parse(raw);
      return obj?.userId === uid ? obj.summary || "" : "";
    } catch { return ""; }
  };
  const saveSummary = (uid, summary) => {
    try { localStorage.setItem(KW_SUMMARY_KEY, JSON.stringify({ userId: uid, summary })); } catch { }
  };

  const handleKeywordsLoaded = useCallback((kws) => { setTopKeywords(kws || []); }, []);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (error || !mounted) return;
      setCurrentUserId(data?.user?.id || null);
      if (data?.user?.id) setKeywordSummary(loadSavedSummary(data.user.id));
    })();
    return () => { mounted = false; };
  }, []);

  // ── Fetch posts ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) { setToneEngagementData([]); setLoading(false); setConvertedData([]); return; }
    fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`))
      .then((r) => r.json())
      .then((data) => {
        const converted = convertSavedPosts(data.posts || []);
        setConvertedData(converted);
        setToneEngagementData(converted.map((p, i) => ({
          index: i + 1, engagement: p.Engagement,
          source: p["Name/Source"], message: p.Message, tone: p.tone,
        })));
      })
      .catch((err) => console.error("Error fetching posts:", err))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "reports" } }));
  }, []);

  // ── Keyword summary ───────────────────────────────────────────────────────
  const generateKeywordSummary = async () => {
    if (!topKeywords.length || summaryLoading) return;
    setSummaryLoading(true);
    try {
      const kwList = topKeywords.slice(0, 5).map((kw) => kw.term).join(", ");
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `My top keywords are: ${kwList}. In 2-3 sentences, summarize what these keywords say about the content that performs best and any common theme. Be concise.` }],
          user_id: currentUserId || undefined,
        }),
      });
      if (!response.ok) throw new Error("Chat request failed");
      const data    = await response.json();
      const summary = data.reply || "No response.";
      setKeywordSummary(summary);
      if (currentUserId) saveSummary(currentUserId, summary);
    } catch (err) {
      console.error("Keyword summary error:", err);
      setKeywordSummary("Failed to generate summary. Please try again.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // ── Template selected → load layout + capture charts → open preview ───────
  const handleTemplateSelected = async (templateId) => {
    setTemplatePickerOpen(false);

    // 1. Load saved layout JSON or fall back to defaults
    const layout = loadLayout(templateId) ?? createLayout(templateId);

    // 2. Screenshot the two chart DOM nodes
    const imgs = {};
    if (includeKeywordTracking && chartRef.current) {
      try { imgs.keywordChart = (await html2canvas(chartRef.current, { scale: 2 })).toDataURL("image/png"); } catch { }
    }
    if (includeTone && toneChartRef.current) {
      try { imgs.toneChart = (await html2canvas(toneChartRef.current, { scale: 2 })).toDataURL("image/png"); } catch { }
    }

    setLayoutWarnings(layout.validate());
    setActiveLayout(layout);
    setPreviewImages(imgs);
    setPreviewOpen(true);
  };

  // Callback from PDFPreviewCanvas after a drag-drop saves new positions
  const handleLayoutChange = useCallback((updatedLayout) => {
    setActiveLayout(updatedLayout);
    setLayoutWarnings(updatedLayout.validate());
  }, []);

  // Reset layout element positions to built-in defaults
  const handleResetLayout = () => {
    if (!activeLayout) return;
    const fresh = resetLayout(activeLayout.id);
    setActiveLayout(fresh);
    setLayoutWarnings(fresh.validate());
  };

  // ── Generate & download PDF using layout JSON positions ───────────────────
  const generatePDF = async () => {
    if (!activeLayout) return;
    setGenerating(true);
    try {
      // jsPDF "letter" format = 612 × 792 pt — matches PAGE constants exactly
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const { WIDTH_PT: W, HEIGHT_PT: H, MARGIN_PT: M } = PAGE;
      let cursorY = M;

      const checkPage = (needed = 40) => {
        if (cursorY + needed > H - M) { pdf.addPage(); cursorY = M; }
      };

      // ── Title ──
      pdf.setFontSize(16); pdf.setFont(undefined, "bold");
      pdf.text(t("reports.pdfTitle", { defaultValue: "Analytics Report" }), M, cursorY);
      cursorY += 28;

      // ── Template label ──
      const tplMeta = PDF_TEMPLATES.find((t) => t.id === activeLayout.id);
      if (tplMeta) {
        pdf.setFontSize(9); pdf.setFont(undefined, "normal"); pdf.setTextColor(120, 120, 120);
        pdf.text(`Template: ${tplMeta.label}`, M, cursorY);
        pdf.setTextColor(0, 0, 0);
        cursorY += 18;
      }

      // ── Section order differs per template ──
      // executive / compact → summary first, then charts
      // visual              → charts first, then summary
      const order = activeLayout.id === "visual"
        ? ["keywordChart", "toneChart", "summary", "stats"]
        : ["summary", "keywordChart", "toneChart", "stats"];

      for (const section of order) {

        // ── Keyword summary text ──
        if (section === "summary" && includeSummary && keywordSummary) {
          checkPage(60);
          pdf.setFontSize(11); pdf.setFont(undefined, "bold");
          pdf.text(t("reports.keywordSummaryTitle", { defaultValue: "Keyword Summary" }), M, cursorY);
          cursorY += 14;
          pdf.setFontSize(9); pdf.setFont(undefined, "normal");
          pdf.splitTextToSize(keywordSummary, W - M * 2).forEach((line) => {
            checkPage(12); pdf.text(line, M, cursorY); cursorY += 12;
          });
          cursorY += 10;
        }

        // ── Keyword chart image — read x/y/w/h from layout JSON ──
        if (section === "keywordChart" && includeKeywordTracking && previewImages.keywordChart) {
          const el = activeLayout.getElement("keywordChart");
          if (el) {
            if (activeLayout.id === "compact") {
              // Compact: place both charts side-by-side using their layout coords
              const elTone = activeLayout.getElement("toneChart");
              checkPage(Math.max(el.height, elTone?.height ?? 0) + 16);
              pdf.addImage(previewImages.keywordChart, "PNG", el.x, cursorY, el.width, el.height);
              if (elTone && previewImages.toneChart) {
                pdf.addImage(previewImages.toneChart, "PNG", elTone.x, cursorY, elTone.width, elTone.height);
              }
              cursorY += Math.max(el.height, elTone?.height ?? 0) + 16;
            } else {
              checkPage(el.height + 10);
              pdf.addImage(previewImages.keywordChart, "PNG", el.x, cursorY, el.width, el.height);
              cursorY += el.height + 16;
            }
          }
        }

        // ── Tone chart (skipped for compact — already placed above) ──
        if (section === "toneChart" && activeLayout.id !== "compact" && includeTone && previewImages.toneChart) {
          const el = activeLayout.getElement("toneChart");
          if (el) {
            checkPage(el.height + 10);
            pdf.addImage(previewImages.toneChart, "PNG", el.x, cursorY, el.width, el.height);
            cursorY += el.height + 16;
          }
        }

        // ── Stats text ──
        if (section === "stats" && includeTone && toneEngagementData.length > 0) {
          checkPage(60);
          pdf.setFontSize(11); pdf.setFont(undefined, "bold");
          pdf.text(t("reports.statisticsTitle", { defaultValue: "Statistics" }), M, cursorY); cursorY += 14;
          pdf.setFontSize(9); pdf.setFont(undefined, "normal");

          const totalEng = toneEngagementData.reduce((s, p) => s + p.engagement, 0);
          pdf.text(`${t("reports.totalPosts",        { defaultValue: "Total Posts"       })}: ${toneEngagementData.length}`, M, cursorY); cursorY += 12;
          pdf.text(`${t("reports.averageEngagement", { defaultValue: "Avg Engagement"    })}: ${(totalEng / toneEngagementData.length).toFixed(2)}`, M, cursorY); cursorY += 12;
          pdf.text(`${t("reports.totalEngagement",   { defaultValue: "Total Engagement"  })}: ${totalEng}`, M, cursorY); cursorY += 16;

          // Tone breakdown
          const toneCounts = {};
          toneEngagementData.forEach((d) => { if (d.tone) toneCounts[d.tone] = (toneCounts[d.tone] || 0) + 1; });
          const toneEntries = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]);
          if (toneEntries.length) {
            pdf.setFont(undefined, "bold"); pdf.text("Tone Distribution:", M, cursorY); cursorY += 12;
            pdf.setFont(undefined, "normal");
            toneEntries.forEach(([tone, count]) => {
              checkPage(11); pdf.text(`  ${tone}: ${count} post${count !== 1 ? "s" : ""}`, M, cursorY); cursorY += 11;
            });
          }
        }
      }

      // ── Footer: layout JSON fingerprint ──
      pdf.setPage(pdf.internal.getNumberOfPages());
      pdf.setFontSize(7); pdf.setTextColor(180, 180, 180);
      pdf.text(
        `Layout: ${activeLayout.id} | Updated: ${activeLayout.updatedAt ?? "default"} | Generated: ${new Date().toLocaleString()}`,
        M, H - 12,
      );

      // Persist final positions (includes any drag edits)
      saveLayout(activeLayout);

      pdf.save(`report-${activeLayout.id}-${Date.now()}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  // ── Recharts data ─────────────────────────────────────────────────────────
  const TONES = [
    "Professional","Promotional","Informative","Persuasive","Confident",
    "Approachable","Authoritative","Inspirational","Conversational","Assertive",
    "Casual","Customer-centric","Urgent","Optimistic","Polished",
  ];
  const PALETTE = [
    "#2f6fdb","#ff7a59","#51cf66","#ffd43b","#845ef7",
    "#20c997","#0ca678","#f783ac","#15aabf","#d9480f",
    "#868e96","#364fc7","#fa5252","#12b886","#495057",
  ];
  const TONE_COLOR = TONES.reduce((acc, t, i) => (acc[t] = PALETTE[i % PALETTE.length], acc), {});

  const activeTones = useMemo(() => {
    const set = new Set();
    toneEngagementData.forEach((d) => { if (d.tone) set.add(d.tone); });
    return TONES.filter((t) => set.has(t));
  }, [toneEngagementData]);

  const competitors = useMemo(() => {
    const set = new Set();
    toneEngagementData.forEach((d) => { if (d.source) set.add(d.source); });
    return Array.from(set).sort();
  }, [toneEngagementData]);

  const engMinMax = useMemo(() => {
    if (!toneEngagementData.length) return [0, 1];
    const vals = toneEngagementData.map((d) => d.engagement);
    return [Math.min(...vals), Math.max(...vals)];
  }, [toneEngagementData]);

  const filteredToneData = useMemo(() => {
    const [lo, hi] = engMinMax;
    const range    = hi - lo || 1;
    return toneEngagementData.filter((d) => {
      if (competitorFilter && d.source !== competitorFilter) return false;
      if (toneFilter.length > 0) {
        if (d.tone  && !toneFilter.includes(d.tone)) return false;
        if (!d.tone && !showUnlabeled) return false;
      }
      if (!d.tone && !showUnlabeled) return false;
      const pct = ((d.engagement - lo) / range) * 100;
      return pct >= engRange[0] && pct <= engRange[1];
    });
  }, [toneEngagementData, toneFilter, engRange, engMinMax, showUnlabeled, competitorFilter]);

  const barData = useMemo(() => {
    const map = {};
    filteredToneData.forEach((d) => {
      const key = d.tone || "Unlabeled";
      if (!map[key]) map[key] = { tone: key, totalEngagement: 0, count: 0 };
      map[key].totalEngagement += d.engagement;
      map[key].count += 1;
    });
    return Object.values(map)
      .map((d) => ({ ...d, avgEngagement: Math.round(d.totalEngagement / d.count) }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  }, [filteredToneData]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Container size="lg" style={{ padding: "1rem", position: "relative" }}>

      {/* ── 1. Template Picker Modal ───────────────────────────────────────── */}
      <Modal
        opened={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        title={<Group gap="xs"><IconDownload size={18} /><Text fw={700}>Choose a PDF Template</Text></Group>}
        centered size="xl"
      >
        <TemplatePicker
          onCancel={() => setTemplatePickerOpen(false)}
          onSelect={handleTemplateSelected}
        />
      </Modal>

      {/* ── 2. Preview + Download Modal ────────────────────────────────────── */}
      <Modal
        opened={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={
          activeLayout && (() => {
            const tpl = PDF_TEMPLATES.find((t) => t.id === activeLayout.id);
            return (
              <Group gap="xs">
                {tpl && <div style={{ width: 10, height: 10, borderRadius: "50%", background: tpl.accent }} />}
                <Text fw={700}>Preview — {tpl?.label ?? activeLayout.id}</Text>
              </Group>
            );
          })()
        }
        centered
        size="auto"
        styles={{ content: { padding: 24, overflow: "auto" } }}
      >
        {activeLayout && (
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

            {/* Left: scaled page canvas */}
            <div>
              <PDFPreviewCanvas
                layout={activeLayout}
                images={previewImages}
                onLayoutChange={handleLayoutChange}
              />
              <Text size="xs" c="dimmed" mt={6} style={{ textAlign: "center" }}>
                Drag charts to reposition • positions auto-save
              </Text>
            </div>

            {/* Right: controls + JSON viewer */}
            <div style={{ minWidth: 240 }}>
              <Text fw={700} size="sm" mb={6}>Layout JSON</Text>
              <pre style={{
                fontSize: 10, background: "#f8f9fa", border: "1px solid #e9ecef",
                borderRadius: 6, padding: 10, maxHeight: 280, overflow: "auto",
                lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {activeLayout.toString()}
              </pre>

              {/* Validation warnings */}
              {layoutWarnings.length > 0 && (
                <div style={{
                  marginTop: 10, background: "#fff9db", border: "1px solid #ffd43b",
                  borderRadius: 6, padding: "8px 10px",
                }}>
                  <Group gap={4} mb={4}>
                    <IconAlertTriangle size={14} color="#f59f00" />
                    <Text size="xs" fw={700} c="#f59f00">Layout warnings</Text>
                  </Group>
                  {layoutWarnings.map((w, i) => (
                    <Text key={i} size="xs" style={{ marginLeft: 4 }}>{w}</Text>
                  ))}
                </div>
              )}

              <Stack gap="xs" mt="md">
                <Button size="sm" variant="outline" color="gray" onClick={handleResetLayout}>
                  Reset to defaults
                </Button>
                <Button
                  size="sm"
                  leftSection={<IconDownload size={14} />}
                  loading={generating}
                  onClick={generatePDF}
                  style={{ background: PDF_TEMPLATES.find((t) => t.id === activeLayout?.id)?.accent }}
                >
                  Download PDF
                </Button>
              </Stack>

              <Text size="xs" c="dimmed" mt="md">
                Positions are stored in <code>localStorage</code> per template and persist across sessions.
              </Text>
            </div>
          </div>
        )}
      </Modal>

      <LoadingOverlay visible={loading} />

      <Title order={1} mb="lg">{t("reports.title")}</Title>

      <Button mb="lg" leftSection={<IconDownload size={16} />} onClick={() => setTemplatePickerOpen(true)}>
        Create PDF
      </Button>

      <Group gap="lg" mb="lg">
        <Checkbox
          label={t("reports.includeKeywordTracking")}
          checked={includeKeywordTracking}
          onChange={(e) => setIncludeKeywordTracking(e.currentTarget.checked)}
        />
        <Checkbox
          label={t("reports.includeTone")}
          checked={includeTone}
          onChange={(e) => setIncludeTone(e.currentTarget.checked)}
        />
        <Checkbox
          label={t("reports.includeSummary")}
          checked={includeSummary}
          onChange={(e) => setIncludeSummary(e.currentTarget.checked)}
        />
      </Group>

      {/* ── Run analysis ──────────────────────────────────────────────────── */}
      <Button
        onClick={async () => {
          setLoading(true);
          setAnalysisStarted(true);
          try {
            let displayPosts = convertedData.slice();
            if (postLimit > 0 && displayPosts.length > postLimit) displayPosts = displayPosts.slice(-postLimit);

            const missing = displayPosts.filter((p) => !p.tone);
            let analyzed  = [];
            if (missing.length) {
              try { analyzed = await analyzeUniversalPosts(missing, currentUserId); }
              catch (err) { console.error("Tone analysis failed:", err); }
            }

            let aiIndex  = 0;
            const merged = displayPosts.map((post) => {
              if (post.tone) return post;
              return { ...post, tone: (analyzed[aiIndex++] || {}).tone || null };
            });

            if (analyzed.length) {
              const updateMap = new Map();
              merged.forEach((p) => { if (p.tone) updateMap.set(`${p.Message}###${p.Engagement}`, p.tone); });
              setConvertedData(convertedData.map((p) => {
                const key = `${p.Message}###${p.Engagement}`;
                return (!p.tone && updateMap.has(key)) ? { ...p, tone: updateMap.get(key) } : p;
              }));
            }

            setToneEngagementData(merged.map((p, i) => ({
              index: i + 1, engagement: p.Engagement,
              source: p["Name/Source"], message: p.Message, tone: p.tone || null,
            })));
          } finally {
            setLoading(false);
          }
        }}
        mb="sm"
        disabled={loading}
      >
        {analysisStarted ? t("reports.rerunAnalysis") : t("reports.startAnalysis")}
      </Button>

      <Select
        label={t("reports.analyzeLast")}
        data={[5, 10, 15, 20, 50].map((n) => ({ value: String(n), label: t("reports.postsCount", { count: n }) }))}
        value={String(postLimit)}
        onChange={(val) => setPostLimit(Number(val) || 0)}
        mb="lg"
        disabled={analysisStarted}
      />

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {includeKeywordTracking && (
        <KeywordTracking
          ref={chartRef}
          onKeywordsLoaded={handleKeywordsLoaded}
          maxEntries={10}
        />
      )}

      {includeKeywordTracking && includeSummary && (
        <Paper p="lg" radius="md" style={{ marginTop: "1rem" }} withBorder>
          <Group justify="space-between" mb="sm">
            <Title order={2} size="h3">{t("reports.keywordSummaryTitle")}</Title>
            <Group gap="xs">
              {keywordSummary
                ? <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={generateKeywordSummary} loading={summaryLoading} disabled={!topKeywords.length}>{t("reports.regenerateSummary")}</Button>
                : <Button leftSection={<IconSparkles size={16} />} onClick={generateKeywordSummary} loading={summaryLoading} disabled={!topKeywords.length}>{t("reports.generateKeywordSummary")}</Button>
              }
            </Group>
          </Group>
          {keywordSummary
            ? <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{keywordSummary}</Text>
            : <Text size="sm" c="dimmed">{topKeywords.length ? t("reports.keywordSummaryHint") : t("reports.noKeywordsYet")}</Text>
          }
        </Paper>
      )}

      {includeTone && (
        <Paper ref={toneChartRef} p="lg" radius="md" style={{ marginTop: "2rem" }} withBorder>
          <Group justify="space-between" mb="sm" align="flex-start">
            <Title order={2} size="h3">{t("reports.engagementChartTitle")}</Title>
            <SegmentedControl
              size="xs" value={chartView} onChange={setChartView}
              data={[
                { label: <Group gap={4}><IconChartDots size={14} /> Scatter</Group>, value: "scatter" },
                { label: <Group gap={4}><IconChartBar  size={14} /> Bar</Group>,     value: "bar"     },
              ]}
            />
          </Group>

          {toneEngagementData.length > 0 && (
            <Stack gap="xs" mb="md">
              {competitors.length > 0 && (
                <Group gap="sm" align="center">
                  <Text size="xs" fw={600} c="dimmed" style={{ minWidth: 90 }}>Competitor:</Text>
                  <Select
                    data={competitors.map((c) => ({ value: c, label: c }))}
                    value={competitorFilter} onChange={setCompetitorFilter}
                    clearable placeholder="All competitors" searchable style={{ minWidth: 200 }}
                  />
                </Group>
              )}
              <Group gap={6} wrap="wrap">
                <Text size="xs" fw={600} c="dimmed" style={{ minWidth: 50 }}>Tones:</Text>
                {activeTones.map((tone) => (
                  <Chip key={tone} size="xs" variant="light" color={TONE_COLOR[tone]}
                    checked={toneFilter.length === 0 || toneFilter.includes(tone)}
                    onChange={(checked) => {
                      setToneFilter((prev) => {
                        if (prev.length === 0) return [tone];
                        if (checked) { const next = [...prev, tone]; return next.length >= activeTones.length ? [] : next; }
                        return prev.filter((t) => t !== tone);
                      });
                    }}
                  >{tone}</Chip>
                ))}
                <Chip size="xs" variant="light" color="gray" checked={showUnlabeled} onChange={setShowUnlabeled}>Unlabeled</Chip>
                {toneFilter.length > 0 && <Button size="compact-xs" variant="subtle" onClick={() => setToneFilter([])}>Reset</Button>}
              </Group>
              <Group gap="sm" align="center">
                <Text size="xs" fw={600} c="dimmed" style={{ minWidth: 50 }}>Range:</Text>
                <div style={{ flex: 1, maxWidth: 300 }}>
                  <RangeSlider
                    size="xs" min={0} max={100} value={engRange} onChange={setEngRange}
                    label={(v) => `${v}%`}
                    marks={[{ value: 0, label: "Low" }, { value: 50, label: "Mid" }, { value: 100, label: "High" }]}
                  />
                </div>
                <Text size="xs" c="dimmed">{filteredToneData.length} / {toneEngagementData.length} posts</Text>
              </Group>
            </Stack>
          )}

          {filteredToneData.length > 0 ? (
            chartView === "scatter" ? (
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" name={t("reports.postIndex")} />
                  <YAxis dataKey="engagement" name={t("reports.engagement")} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Legend />
                  {TONES.map((tone) => {
                    const pts = filteredToneData.filter((d) => d.tone === tone);
                    if (!pts.length) return null;
                    return <Scatter key={tone} name={tone} data={pts} dataKey="engagement" fill={TONE_COLOR[tone]} />;
                  })}
                  {showUnlabeled && filteredToneData.some((d) => !d.tone) && (
                    <Scatter name={t("reports.unlabeled")} data={filteredToneData.filter((d) => !d.tone)} dataKey="engagement" fill="#adb5bd" />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tone" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis /><Tooltip /><Legend />
                  <Bar dataKey="avgEngagement" name="Avg Engagement" radius={[4, 4, 0, 0]}>
                    {barData.map((entry) => <Cell key={entry.tone} fill={TONE_COLOR[entry.tone] || "#adb5bd"} />)}
                  </Bar>
                  <Bar dataKey="count" name="Post Count" radius={[4, 4, 0, 0]} fill="#868e96" opacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            )
          ) : (
            <Title order={4} c="dimmed">{t("reports.noPostsToDisplay")}</Title>
          )}
        </Paper>
      )}

      {includeTone && (
        <Paper p="lg" radius="md" style={{ marginTop: "2rem" }} withBorder>
          <Title order={2} size="h3" mb="md">{t("reports.statisticsTitle")}</Title>
          {toneEngagementData.length > 0 ? (
            <div style={{ flex: 1 }}>
              <Text><strong>{t("reports.totalPosts")}:</strong> {toneEngagementData.length}</Text>
              <Text><strong>{t("reports.averageEngagement")}:</strong> {(toneEngagementData.reduce((s, p) => s + p.engagement, 0) / toneEngagementData.length).toFixed(2)}</Text>
              <Text><strong>{t("reports.totalEngagement")}:</strong> {toneEngagementData.reduce((s, p) => s + p.engagement, 0)}</Text>
            </div>
          ) : (
            <Title order={4} c="dimmed">{t("reports.noPostsToDisplay")}</Title>
          )}
        </Paper>
      )}
    </Container>
  );
}