import { useRef, useState, useEffect } from "react";
import KeywordTracking from "./KeywordTracking";
import { convertSavedPosts, analyzeUniversalPosts } from "./DataConverter";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button, Checkbox, Container, Title, Paper, LoadingOverlay, Text, Select } from "@mantine/core";
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

export default function Reports() {
  const chartRef = useRef(null);
  const [includeKeywordTracking, setIncludeKeywordTracking] = useState(true);
  const [postLimit, setPostLimit] = useState(10); // number of recent posts to analyze
  const [rawPosts, setRawPosts] = useState([]);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [toneEngagementData, setToneEngagementData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch saved posts once when component mounts. analysis is triggered manually.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("http://localhost:8080/api/posts");
        const data = await r.json();
        setRawPosts(data.posts || []);
      } catch (error) {
        console.error("Error fetching posts:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const generatePDF = async () => {
    if (!includeKeywordTracking) {
      alert("Please enable Keyword Tracking to generate PDF");
      return;
    }

    const input = chartRef.current; 

    if (!input) return;

    // Convert DOM → canvas
    const canvas = await html2canvas(input, {
      scale: 2, // high resolution
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 40; // 20pt margin each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.text("Keyword Tracking Report", 20, 30);
    pdf.addImage(imgData, "PNG", 20, 50, imgWidth, imgHeight);

    pdf.save("keyword-tracking-report.pdf");
  };

  const TONES = [
    'Professional', 'Promotional', 'Informative', 'Persuasive', 'Confident',
    'Approachable', 'Authoritative', 'Inspirational', 'Conversational', 'Assertive',
    'Casual', 'Customer-centric', 'Urgent', 'Optimistic', 'Polished'
  ];

  const PALETTE = [
    '#2f6fdb','#ff7a59','#51cf66','#ffd43b','#845ef7',
    '#20c997','#0ca678','#f783ac','#15aabf','#d9480f',
    '#868e96','#364fc7','#fa5252','#12b886','#495057'
  ];

  const TONE_COLOR = TONES.reduce((acc, t, i) => (acc[t] = PALETTE[i % PALETTE.length], acc), {});

  return (
    <Container size="lg" style={{ padding: "1rem", position: "relative" }}>
      <LoadingOverlay visible={loading} />
      <Title order={1} mb="lg">
        Analysis Reports
      </Title>
      
      <Button onClick={generatePDF} mb="lg">
        Download PDF
      </Button>

      <Checkbox
        label="Include Keyword Tracking"
        checked={includeKeywordTracking}
        onChange={(event) => setIncludeKeywordTracking(event.currentTarget.checked)}
        mb="lg"
      />

      <Button onClick={() => {
          // kick off analysis based on current limit and rawPosts
          setLoading(true);
          setAnalysisStarted(true);
        }} mb="sm">
        {analysisStarted ? 'Re-run Analysis' : 'Start Analysis'}
      </Button>

      <Select
        label="Analyze last"
        data={[
          { value: '5', label: '5 posts' },
          { value: '10', label: '10 posts' },
          { value: '15', label: '15 posts' },
          { value: '20', label: '20 posts' },
          { value: '50', label: '50 posts' },
        ]}
        value={String(postLimit)}
        onChange={(val) => setPostLimit(Number(val) || 0)}
        mb="lg"
        disabled={analysisStarted}
      />

      {includeKeywordTracking && <KeywordTracking ref={chartRef} />}

      {/* perform analysis when requested */}
      {analysisStarted && (
        (() => {
          const doAnalysis = async () => {
            let posts = rawPosts.slice();
            if (postLimit > 0 && posts.length > postLimit) {
              posts = posts.slice(-postLimit);
            }
            const converted = convertSavedPosts(posts);
            let analyzed = [];
            try {
              analyzed = await analyzeUniversalPosts(converted);
            } catch (err) {
              console.error('Tone analysis failed:', err);
            }
            const chartData = (analyzed.length ? analyzed : converted).map((post, index) => ({
              index: index + 1,
              engagement: post.Engagement,
              source: post['Name/Source'],
              message: post.Message,
              tone: post.Tone || null,
            }));
            setToneEngagementData(chartData);
            setLoading(false);
          };
          // immediately invoke
          doAnalysis();
          return null;
        })()
      )}

      {/* Saved Posts Source-Based Engagement Chart */}
      <Paper p="lg" radius="md" style={{ marginTop: "2rem" }} withBorder>
        <Title order={2} size="h3" mb="md">
          Saved Posts - Engagement by Post Index
        </Title>
        {toneEngagementData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="index" name="Post Index" />
              <YAxis dataKey="engagement" name="Engagement" />
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
                  name="Unlabeled"
                  data={toneEngagementData.filter((d) => !d.tone)}
                  dataKey="engagement"
                  fill="#adb5bd"
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <Title order={4} c="dimmed">No saved posts to display</Title>
        )}
      </Paper>

      {/* Source Distribution Pie Chart */}
      <Paper p="lg" radius="md" style={{ marginTop: "2rem" }} withBorder>
        <Title order={2} size="h3" mb="md">
          Post Statistics
        </Title>
        {toneEngagementData.length > 0 ? (
          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <Text><strong>Total Posts:</strong> {toneEngagementData.length}</Text>
              <Text><strong>Average Engagement:</strong> {(toneEngagementData.reduce((sum, p) => sum + p.engagement, 0) / toneEngagementData.length).toFixed(2)}</Text>
              <Text><strong>Total Engagement:</strong> {toneEngagementData.reduce((sum, p) => sum + p.engagement, 0)}</Text>
            </div>
          </div>
        ) : (
          <Title order={4} c="dimmed">No saved posts to display</Title>
        )}
      </Paper>
    </Container>
  );
}