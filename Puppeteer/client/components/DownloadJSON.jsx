import { Button } from "@mantine/core";
import { downloadFile } from "./downloadFile";

const DownloadJSON = ({ data }) => {
  const handleDownload = () => {
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, "scraped-data.json", "application/json");
  };

  return <Button color="green" onClick={handleDownload}>Download JSON</Button>;
};

export default DownloadJSON;
