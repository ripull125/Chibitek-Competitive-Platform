import { Button } from "@mantine/core";
import { downloadFile } from "./downloadFile";

const DownloadCSV = ({ data }) => {
  const handleDownload = () => {
    const escapeCsv = (value) => {
      if (value == null) return "";
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = [];
    rows.push("type,text,details");
    rows.push(`heading,${escapeCsv(data.heading)},`);
    data.paragraphs.forEach((p, index) => {
      rows.push(`paragraph,${escapeCsv(p)},Paragraph ${index + 1}`);
    });

    (data.books || []).forEach((book, index) => {
      rows.push(
        `book,${escapeCsv(book.title)},${escapeCsv(
          `price: ${book.price || "Unknown"}; availability: ${book.availability || "Unknown"}; keywords: ${
            book.keywords?.length ? book.keywords.join(' | ') : 'Not available'
          }`
        )}`
      );
    });

    const csvContent = rows.join("\n");
    downloadFile(csvContent, "scraped-data.csv", "text/csv");
  };

  return <Button color="teal" onClick={handleDownload}>Download CSV</Button>;
};

export default DownloadCSV;
