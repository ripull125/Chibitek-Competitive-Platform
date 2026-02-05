import { useRef, useState, useEffect } from "react";
import KeywordTracking from "./KeywordTracking";
import { convertSavedPosts } from "./DataConverter";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button, Checkbox, Container, Title, Paper, LoadingOverlay, Text } from "@mantine/core";
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
  const [toneEngagementData, setToneEngagementData] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch and process saved posts
  useEffect(() => {
    fetch("http://localhost:8080/api/posts")
      .then((r) => r.json())
      .then((data) => {
        const posts = data.posts || [];
        const converted = convertSavedPosts(posts);

        setSavedPosts(converted);

        // Create chart data with index for each post
        const chartData = converted.map((post, index) => ({
          index: index + 1,
          engagement: post.Engagement,
          source: post['Name/Source'],
          message: post.Message,
          tone: post.Tone,
        }));

        setToneEngagementData(chartData);
      })
      .catch((error) => console.error("Error fetching posts:", error))
      .finally(() => setLoading(false));
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

  const COLORS = {
    positive: "#51cf66",
    negative: "#ff6b6b",
    neutral: "#868e96",
  };

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

      {includeKeywordTracking && (
        <KeywordTracking ref={chartRef} posts={savedPosts} /> )} 

      {/* Saved Posts Source-Based Engagement Chart */}
      <Paper p="lg" radius="md" style={{ marginTop: "2rem" }} withBorder>
        <Title order={2} size="h3" mb="md">
          Saved Posts - Engagement by Post Index
        </Title>
        {toneEngagementData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart data={toneEngagementData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="index" name="Post Index" />
              <YAxis dataKey="engagement" name="Engagement" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              <Scatter name="Engagement" dataKey="engagement" fill="#8884d8" />
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