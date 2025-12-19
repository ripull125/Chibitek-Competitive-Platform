import { useRef, useState } from "react";
import KeywordTracking from "./KeywordTracking";
import CompetitorTracking from "./CompetitorTracking";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button, Title, Stack } from "@mantine/core";

export default function Reports() {
  const reportRef = useRef(null);

  const [selected, setSelected] = useState({
    keyword: {
      enabled: true,
      datasets: { 0: true, 1: true },
    },
    competitor: {
      enabled: true,
      datasets: { 0: true, 1: true },
    },
  });

  const togglePage = (page) => {
    setSelected((prev) => ({
      ...prev,
      [page]: {
        ...prev[page],
        enabled: !prev[page].enabled,
      },
    }));
  };

  const toggleDataset = (page, index) => {
    setSelected((prev) => ({
      ...prev,
      [page]: {
        ...prev[page],
        datasets: {
          ...prev[page].datasets,
          [index]: !prev[page].datasets[index],
        },
      },
    }));
  };

  const generatePDF = async () => {
    const input = reportRef.current;
    if (!input) return;

    const canvas = await html2canvas(input, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 40;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.text("Analytics Report", 20, 30);
    pdf.addImage(imgData, "PNG", 20, 50, imgWidth, imgHeight);
    pdf.save("analytics-report.pdf");
  };

  return (
    <div style={{ padding: "1rem" }}>
      <Title order={1} mb="lg">
        Analytics Report
      </Title>

      <Stack spacing="md" mb="lg" align="flex-start">
        <Title order={4}>Select graphs to include</Title>

        {/* KEYWORD TRACKING BLOCK */}
        <div style={{ width: "100%" }}>
          <label style={{ display: "block", fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={selected.keyword.enabled}
              onChange={() => togglePage("keyword")}
            />{" "}
            Keyword Tracking
          </label>

          {selected.keyword.enabled && (
            <div style={{ paddingLeft: "1.5rem", marginTop: "0.25rem" }}>
              {[0, 1].map((i) => (
                <label
                  key={i}
                  style={{ display: "block", marginTop: "0.25rem" }}
                >
                  <input
                    type="checkbox"
                    checked={selected.keyword.datasets[i]}
                    onChange={() => toggleDataset("keyword", i)}
                  />{" "}
                  Sample Data #{i + 1}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* COMPETITOR TRACKING BLOCK */}
        <div style={{ width: "100%" }}>
          <label style={{ display: "block", fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={selected.competitor.enabled}
              onChange={() => togglePage("competitor")}
            />{" "}
            Competitor Tracking
          </label>

          {selected.competitor.enabled && (
            <div style={{ paddingLeft: "1.5rem", marginTop: "0.25rem" }}>
              {[0, 1].map((i) => (
                <label
                  key={i}
                  style={{ display: "block", marginTop: "0.25rem" }}
                >
                  <input
                    type="checkbox"
                    checked={selected.competitor.datasets[i]}
                    onChange={() => toggleDataset("competitor", i)}
                  />{" "}
                  Sample Data #{i + 1}
                </label>
              ))}
            </div>
          )}
        </div>

        <Button onClick={generatePDF}>Download PDF</Button>
      </Stack>

      {/* PRINTABLE AREA */}
      <div ref={reportRef}>
        {selected.keyword.enabled && (
          <KeywordTracking selectedDatasets={selected.keyword.datasets} />
        )}

        {selected.competitor.enabled && (
          <CompetitorTracking selectedDatasets={selected.competitor.datasets} />
        )}
      </div>
    </div>
  );
}
