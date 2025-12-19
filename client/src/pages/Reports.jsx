import { useRef, useState } from "react";
import KeywordTracking from "./KeywordTracking";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button, Checkbox } from "@mantine/core";
import "../utils/ui.css";

export default function Reports() {
  const chartRef = useRef(null);
  const [includeKeywordTracking, setIncludeKeywordTracking] = useState(true);

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

  return (
    <div style={{ padding: "1rem" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>Analysis Reports</h1>
      
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
    </div>
  );
}