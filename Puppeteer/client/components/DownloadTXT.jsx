import { Button } from "@mantine/core";
import { downloadFile } from "./downloadFile";

const DownloadTXT = ({ data }) => {
  const handleDownload = () => {
    if (!data) return;

    const txtLines = [
      `Heading: ${data.heading}`,
      "",
      "Paragraphs:",
      ...(data.paragraphs || []),
    ];

    const content = txtLines.join("\n");
    downloadFile(content, "scraped-data.txt", "text/plain");
  };

  return (
    <Button color="grape" onClick={handleDownload}>
      Download TXT
    </Button>
  );
};

export default DownloadTXT;
