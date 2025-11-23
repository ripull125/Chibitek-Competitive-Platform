import { Button } from "@mantine/core";
import { downloadFile } from "./downloadFile";

const DownloadTXT = ({ data }) => {
  const handleDownload = () => {
    const txtLines = [
      `Heading: ${data.heading}`,
      "",
      "Paragraphs:",
      ...data.paragraphs,
      "",
      "Books:",
      ...((data.books || []).map((book, index) => [
        `${index + 1}. ${book.title}`,
        `   Price: ${book.price || "Unknown"}`,
        book.availability ? `   Availability: ${book.availability}` : null,
        `   Keywords: ${book.keywords?.length ? book.keywords.join(", ") : "Not available"}`
      ]).flat().filter(Boolean))
    ];
    const content = txtLines.join("\n");
    downloadFile(content, "scraped-data.txt", "text/plain");
  };

  return <Button color="grape" onClick={handleDownload}>Download TXT</Button>;
};

export default DownloadTXT;
