import { useRef } from "react";
import KeywordTracking from "./KeywordTracking";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button } from "@mantine/core";

export default function Reports() {
  const chartRef = useRef(null);

  const generatePDF = async () => {
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
      <Button onClick={generatePDF} mb="lg">
        Download PDF
      </Button>

      <KeywordTracking ref={chartRef} />
    </div>
  );
}
