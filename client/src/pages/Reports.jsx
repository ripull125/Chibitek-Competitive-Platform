import { useEffect, useRef, useState, useCallback } from "react";
import KeywordTracking from "./KeywordTracking";
import { convertSavedPosts, analyzeUniversalPosts } from "./DataConverter";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Alert, Badge, Button, Card, Checkbox, Container, Group, Title, Paper, LoadingOverlay, Stack, Text, Select, Switch } from "@mantine/core";
import { IconDownload, IconSparkles, IconRefresh } from "@tabler/icons-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import "../utils/ui.css";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";

const KW_SUMMARY_KEY = "chibitek-keyword-summary";

// holds posts already converted to universal format
// previous version used a global var; switched to component state instead

export default function Reports() {
  const chartRef = useRef(null);
  const [includeKeywordTracking, setIncludeKeywordTracking] = useState(true);
  const [includeTone, setIncludeTone] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [postLimit, setPostLimit] = useState(10); // number of recent posts to analyze
  const [convertedData, setConvertedData] = useState([]);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toneEngagementData, setToneEngagementData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [topKeywords, setTopKeywords] = useState([]);
  const [keywordSummary, setKeywordSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const { t } = useTranslation();

  // Persist & restore keyword summary from localStorage
  const loadSavedSummary = (uid) => {
    try {
      const raw = localStorage.getItem(KW_SUMMARY_KEY);
      if (!raw) return "";
      const obj = JSON.parse(raw);
      return obj?.userId === uid ? (obj.summary || "") : "";
    } catch { return ""; }
  };
  const saveSummary = (uid, summary) => {
    try { localStorage.setItem(KW_SUMMARY_KEY, JSON.stringify({ userId: uid, summary })); } catch { }
  };

  const handleKeywordsLoaded = useCallback((kws) => { setTopKeywords(kws || []); }, []);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
      if (mounted && data?.user?.id) setKeywordSummary(loadSavedSummary(data.user.id));
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch saved posts once when component mounts. analysis is triggered manually.
  useEffect(() => {
    if (!currentUserId) {
      setToneEngagementData([]);
      setLoading(false);
      setConvertedData([]);
      return;
    }

    fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`))
      .then((r) => r.json())
      .then((data) => {
        const posts = data.posts || [];
        const converted = convertSavedPosts(posts);

        setConvertedData(converted);

        // Create chart data with index for each post
        const chartData = converted.map((post, index) => ({
          index: index + 1,
          engagement: post.Engagement,
          source: post['Name/Source'],
          message: post.Message,
          tone: post.tone,
        }));

        setToneEngagementData(chartData);
      })
      .catch((error) => console.error("Error fetching posts:", error))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "reports" } })
    );
  }, []);

  const generateKeywordSummary = async () => {
    if (!topKeywords.length || summaryLoading) return;
    setSummaryLoading(true);
    try {
      const kwList = topKeywords.slice(0, 5).map(kw => kw.term).join(", ");

      const prompt = `My top keywords are: ${kwList}. In 2-3 sentences, summarize what these keywords say about the content that performs best and any common theme. Be concise.`;

      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          user_id: currentUserId || undefined,
        }),
      });

      if (!response.ok) throw new Error("Chat request failed");
      const data = await response.json();
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

  const generatePDF = async () => {
    const input = chartRef.current;

    setGenerating(true);
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const contentWidth = pageWidth - margin * 2;
      let cursorY = 28;

      // Helper: add a new page if we're running out of room
      const checkPage = (needed = 40) => {
        if (cursorY + needed > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }
      };

      // ── Title
      pdf.setFontSize(16);
      pdf.setFont(undefined, "bold");
      pdf.text(t("reports.pdfTitle"), margin, cursorY);
      cursorY += 24;

      // ── Keyword Tracking screenshot
      if (includeKeywordTracking && input) {
        const canvas = await html2canvas(input, { scale: 2 });
        const imgData = canvas.toDataURL("image/png");
        const imgWidth = contentWidth;
        let imgHeight = (canvas.height * imgWidth) / canvas.width;
        // Cap image to remaining space on current page so it doesn't overflow
        const maxImgH = pageHeight - cursorY - margin - 10;
        if (imgHeight > maxImgH) {
          const scale = maxImgH / imgHeight;
          imgHeight = maxImgH;
          const scaledW = imgWidth * scale;
          const xOffset = margin + (contentWidth - scaledW) / 2;
          pdf.addImage(imgData, "PNG", xOffset, cursorY, scaledW, imgHeight);
        } else {
          pdf.addImage(imgData, "PNG", margin, cursorY, imgWidth, imgHeight);
        }
        cursorY += imgHeight + 16;
      }

      // ── Keyword Summary
      if (includeSummary && keywordSummary) {
        checkPage(60);
        pdf.setFontSize(13);
        pdf.setFont(undefined, "bold");
        pdf.text(t("reports.keywordSummaryTitle"), margin, cursorY);
        cursorY += 16;
        pdf.setFontSize(10);
        pdf.setFont(undefined, "normal");
        const summaryLines = pdf.splitTextToSize(keywordSummary, contentWidth);
        summaryLines.forEach((line) => {
          checkPage(14);
          pdf.text(line, margin, cursorY);
          cursorY += 13;
        });
        cursorY += 10;
      }

      // ── Tone Analysis
      if (includeTone && toneEngagementData.length > 0) {
        checkPage(60);
        pdf.setFontSize(13);
        pdf.setFont(undefined, "bold");
        pdf.text(t("reports.engagementChartTitle"), margin, cursorY);
        cursorY += 16;
        pdf.setFontSize(10);
        pdf.setFont(undefined, "normal");

        // Stats
        const totalEng = toneEngagementData.reduce((s, p) => s + p.engagement, 0);
        const avgEng = (totalEng / toneEngagementData.length).toFixed(2);
        pdf.text(`${t("reports.totalPosts")}: ${toneEngagementData.length}`, margin, cursorY);
        cursorY += 13;
        pdf.text(`${t("reports.averageEngagement")}: ${avgEng}`, margin, cursorY);
        cursorY += 13;
        pdf.text(`${t("reports.totalEngagement")}: ${totalEng}`, margin, cursorY);
        cursorY += 16;

        // Tone breakdown
        const toneCounts = {};
        toneEngagementData.forEach((d) => { if (d.tone) toneCounts[d.tone] = (toneCounts[d.tone] || 0) + 1; });
        const toneEntries = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]);
        if (toneEntries.length > 0) {
          checkPage(20);
          pdf.setFont(undefined, "bold");
          pdf.text("Tone Distribution:", margin, cursorY);
          cursorY += 14;
          pdf.setFont(undefined, "normal");
          toneEntries.forEach(([tone, count]) => {
            checkPage(14);
            pdf.text(`  ${tone}: ${count} post${count !== 1 ? "s" : ""}`, margin, cursorY);
            cursorY += 13;
          });
          cursorY += 10;
        }
      }

      pdf.save("keyword-tracking-report.pdf");
    } finally {
      setGenerating(false);
    }
  };

  const TONES = [
    'Professional', 'Promotional', 'Informative', 'Persuasive', 'Confident',
    'Approachable', 'Authoritative', 'Inspirational', 'Conversational', 'Assertive',
    'Casual', 'Customer-centric', 'Urgent', 'Optimistic', 'Polished'
  ];

  const PALETTE = [
    '#2f6fdb', '#ff7a59', '#51cf66', '#ffd43b', '#845ef7',
    '#20c997', '#0ca678', '#f783ac', '#15aabf', '#d9480f',
    '#868e96', '#364fc7', '#fa5252', '#12b886', '#495057'
  ];

  const TONE_COLOR = TONES.reduce((acc, t, i) => (acc[t] = PALETTE[i % PALETTE.length], acc), {});

  return (
    <Container size="lg" style={{ padding: "1rem", position: "relative" }}>
      <LoadingOverlay visible={loading} />
      <Title order={1} mb="lg">
        {t("reports.title")}
      </Title>

      <Button onClick={generatePDF} mb="lg">
        {t("reports.downloadPdf")}
      </Button>

      <Group gap="lg" mb="lg">
        <Checkbox
          label={t("reports.includeKeywordTracking")}
          checked={includeKeywordTracking}
          onChange={(event) => setIncludeKeywordTracking(event.currentTarget.checked)}
        />
        <Checkbox
          label={t("reports.includeTone")}
          checked={includeTone}
          onChange={(event) => setIncludeTone(event.currentTarget.checked)}
        />
        <Checkbox
          label={t("reports.includeSummary")}
          checked={includeSummary}
          onChange={(event) => setIncludeSummary(event.currentTarget.checked)}
        />
      </Group>

      <Button
        onClick={async () => {
          // perform analysis once per click
          setLoading(true);
          setAnalysisStarted(true);
          try {
            // slice according to limit for display purposes
            let displayPosts = convertedData.slice();
            if (postLimit > 0 && displayPosts.length > postLimit) {
              displayPosts = displayPosts.slice(-postLimit);
            }

            // only send items without a tone for analysis
            const missing = displayPosts.filter((p) => !p.tone);
            let analyzed = [];
            if (missing.length) {
              try {
                analyzed = await analyzeUniversalPosts(missing, currentUserId);
              } catch (err) {
                console.error('Tone analysis failed:', err);
              }
            }

            // merge results back into displayPosts, keeping existing tones
            let aiIndex = 0;
            const merged = displayPosts.map((post) => {
              if (post.tone) return post;
              const result = analyzed[aiIndex++] || {};
              return { ...post, tone: result.tone || null };
            });

            // update convertedData cache with any new tone values
            if (analyzed.length) {
              const updateMap = new Map();
              merged.forEach((p) => {
                if (p.tone) {
                  updateMap.set(`${p.Message}###${p.Engagement}`, p.tone);
                }
              });
              const updatedAll = convertedData.map((p) => {
                const key = `${p.Message}###${p.Engagement}`;
                if (!p.tone && updateMap.has(key)) {
                  return { ...p, tone: updateMap.get(key) };
                }
                return p;
              });
              setConvertedData(updatedAll);
            }

            const chartData = merged.map((post, index) => ({
              index: index + 1,
              engagement: post.Engagement,
              source: post['Name/Source'],
              message: post.Message,
              tone: post.tone || null,
            }));
            setToneEngagementData(chartData);
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
        data={[
          { value: '5', label: t("reports.postsCount", { count: 5 }) },
          { value: '10', label: t("reports.postsCount", { count: 10 }) },
          { value: '15', label: t("reports.postsCount", { count: 15 }) },
          { value: '20', label: t("reports.postsCount", { count: 20 }) },
          { value: '50', label: t("reports.postsCount", { count: 50 }) },
        ]}
        value={String(postLimit)}
        onChange={(val) => setPostLimit(Number(val) || 0)}
        mb="lg"
        disabled={analysisStarted}
      />

      {includeKeywordTracking && <KeywordTracking ref={chartRef} onKeywordsLoaded={handleKeywordsLoaded} />}

      {/* ── Keyword Summary ── */}
      {includeKeywordTracking && includeSummary && (
        <Paper p="lg" radius="md" style={{ marginTop: "1rem" }} withBorder>
          <Group justify="space-between" mb="sm">
            <Title order={2} size="h3">{t("reports.keywordSummaryTitle")}</Title>
            <Group gap="xs">
              {keywordSummary && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconRefresh size={14} />}
                  onClick={generateKeywordSummary}
                  loading={summaryLoading}
                  disabled={!topKeywords.length}
                >
                  {t("reports.regenerateSummary")}
                </Button>
              )}
              {!keywordSummary && (
                <Button
                  leftSection={<IconSparkles size={16} />}
                  onClick={generateKeywordSummary}
                  loading={summaryLoading}
                  disabled={!topKeywords.length}
                >
                  {t("reports.generateKeywordSummary")}
                </Button>
              )}
            </Group>
          </Group>
          {keywordSummary ? (
            <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {keywordSummary}
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              {topKeywords.length
                ? t("reports.keywordSummaryHint")
                : t("reports.noKeywordsYet")}
            </Text>
          )}
        </Paper>
      )}

      {/* Saved Posts Source-Based Engagement Chart */}
      {includeTone && <Paper p="lg" radius="md" style={{ marginTop: "2rem" }} withBorder>
        <Title order={2} size="h3" mb="md">
          {t("reports.engagementChartTitle")}
        </Title>
        {toneEngagementData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="index" name={t("reports.postIndex")} />
              <YAxis dataKey="engagement" name={t("reports.engagement")} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              {TONES.map((tone) => {
                const pts = toneEngagementData.filter((d) => d.tone === tone);
                if (!pts || !pts.length) return null;
                return (
                  <Scatter
                    key={tone}
                    name={tone}
                    data={pts}
                    dataKey="engagement"
                    fill={TONE_COLOR[tone]}
                  />
                );
              })}
              {/* Fallback for unlabelled posts */}
              {toneEngagementData.some((d) => !d.tone) && (
                <Scatter
                  name={t("reports.unlabeled")}
                  data={toneEngagementData.filter((d) => !d.tone)}
                  dataKey="engagement"
                  fill="#adb5bd"
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <Title order={4} c="dimmed">{t("reports.noPostsToDisplay")}</Title>
        )}
      </Paper>}

      {/* Source Distribution Pie Chart */}
      {includeTone && <Paper p="lg" radius="md" style={{ marginTop: "2rem" }} withBorder>
        <Title order={2} size="h3" mb="md">
          {t("reports.statisticsTitle")}
        </Title>
        {toneEngagementData.length > 0 ? (
          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <Text><strong>{t("reports.totalPosts")}:</strong> {toneEngagementData.length}</Text>
              <Text><strong>{t("reports.averageEngagement")}:</strong> {(toneEngagementData.reduce((sum, p) => sum + p.engagement, 0) / toneEngagementData.length).toFixed(2)}</Text>
              <Text><strong>{t("reports.totalEngagement")}:</strong> {toneEngagementData.reduce((sum, p) => sum + p.engagement, 0)}</Text>
            </div>
          </div>
        ) : (
          <Title order={4} c="dimmed">{t("reports.noPostsToDisplay")}</Title>
        )}
      </Paper>}
    </Container>
  );
}
