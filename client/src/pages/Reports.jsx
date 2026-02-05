import { useEffect, useRef, useState } from "react";
import KeywordTracking from "./KeywordTracking";
import { convertSavedPosts } from "./DataConverter";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
  Switch,
} from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import "../utils/ui.css";

export default function Reports() {
  const chartRef = useRef(null);
  const [includeKeywordTracking, setIncludeKeywordTracking] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toneEngagementData, setToneEngagementData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch and process saved posts
  useEffect(() => {
    fetch("http://localhost:8080/api/posts")
      .then((r) => r.json())
      .then((data) => {
        const posts = data.posts || [];
        const converted = convertSavedPosts(posts);

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

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "reports" } })
    );
  }, []);

  const generatePDF = async () => {
    if (!includeKeywordTracking) return;

    const input = chartRef.current;
    if (!input) return;

    setGenerating(true);
    try {
      const canvas = await html2canvas(input, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 48;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.setFontSize(14);
      pdf.text("Keyword Tracking Report", 24, 28);
      pdf.addImage(imgData, "PNG", 24, 44, imgWidth, imgHeight);

      pdf.save("keyword-tracking-report.pdf");
    } finally {
      setGenerating(false);
    }
  };

  const COLORS = {
    positive: "#51cf66",
    negative: "#ff6b6b",
    neutral: "#868e96",
  };

  return (
    <Container size="lg" py="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={4}>
            <Title order={2}>Analysis Reports</Title>
            <Text c="dimmed">
              Export a PDF snapshot for sharing, archiving, or quick weekly check ins.
            </Text>
          </Stack>
          <Badge variant="light" radius="sm">
            PDF Export
          </Badge>
        </Group>

        <Card withBorder radius="lg" p="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Group gap="md" align="center">
              <Switch
                checked={includeKeywordTracking}
                onChange={(e) => setIncludeKeywordTracking(e.currentTarget.checked)}
                label="Include Keyword Tracking"
              />
            </Group>

            <Button
              leftSection={<IconDownload size={16} />}
              onClick={generatePDF}
              loading={generating}
              disabled={!includeKeywordTracking}
              variant="light"
              radius="md"
            >
              Download PDF
            </Button>
          </Group>

          {!includeKeywordTracking ? (
            <Text c="dimmed" mt="sm">
              Turn on Keyword Tracking to enable the PDF export.
            </Text>
          ) : null}
        </Card>

        <div data-tour="reports-root">
          {includeKeywordTracking ? (
            <KeywordTracking ref={chartRef} />
          ) : (
            <Card withBorder radius="lg" p="xl">
              <Stack gap={6} align="center">
                <Title order={4}>Keyword Tracking hidden</Title>
                <Text c="dimmed" ta="center">
                  Enable Keyword Tracking above to view the report content.
                </Text>
              </Stack>
            </Card>
          )}
        </div>
      </Stack>
    </Container>
  );
}
