import { Button } from "@mantine/core";
import { downloadFile } from "./downloadFile";

const DownloadCSV = ({ data }) => {
  const handleDownload = () => {
    if (!data) return;

    const escapeCsv = (value) => {
      if (value == null) return "";
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = [];
    rows.push("type,text");
    rows.push(`heading,${escapeCsv(data.heading)}`);

    (data.paragraphs || []).forEach((p) => {
      rows.push(`paragraph,${escapeCsv(p)}`);
    });

    const csvContent = rows.join("\n");
    downloadFile(csvContent, "scraped-data.csv", "text/csv");
  };

  return (
    <Button color="teal" onClick={handleDownload}>
      Download CSV
    </Button>
  );
};

export default DownloadCSV;
