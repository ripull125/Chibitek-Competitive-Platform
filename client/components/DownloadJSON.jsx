import { Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { downloadFile } from "./downloadFile";

const DownloadJSON = ({ data }) => {
  const { t } = useTranslation();
  const handleDownload = () => {
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, "scraped-data.json", "application/json");
  };

  return <Button color="green" onClick={handleDownload}>{t("common.downloadJson")}</Button>;
};

export default DownloadJSON;
