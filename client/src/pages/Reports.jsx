import { useEffect, useRef, useState } from "react";
import KeywordTracking from "./KeywordTracking";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button, Checkbox, Container, Title, Paper } from "@mantine/core";
import "../utils/ui.css";

export default function Reports() {
  const chartRef = useRef(null);
  const [includeKeywordTracking, setIncludeKeywordTracking] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Page ready event for tour system
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

  return (
    <Container size="lg" style={{ padding: "1rem", position: "relative" }}>
      <Title order={1} mb="lg">
        Keyword Tracking Reports
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

      {includeKeywordTracking && <KeywordTracking ref={chartRef} />}
    </Container>
  );
}
