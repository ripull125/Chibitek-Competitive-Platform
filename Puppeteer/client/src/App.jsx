import React, { useEffect, useState } from "react";
import { Button, Container, Title } from '@mantine/core';
import DownloadJSON from "../components/DownloadJSON";
import DownloadTXT from "../components/DownloadTXT";
import DownloadCSV from "../components/DownloadCSV";

const App = () => {
  const [data, setData] = useState(null);

  const handleDownload = () => {
    if (!data) return;

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "scraped-data.json";
    link.click();

    URL.revokeObjectURL(url);
  };


  useEffect(() => {
    fetch("http://localhost:4000/scrape")
      .then(res => res.json())
      .then(json => setData(json))
      .catch(err => console.error(err));
  }, []);

  if (!data) return <div>Loading scrape...</div>;

  return (
    <div style={{ padding: 20 }}>
      <Container p="md">
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <DownloadJSON data={data} />
          <DownloadTXT data={data} />
          <DownloadCSV data={data} />
        </div>

      </Container>
      <h1>Scraped Heading:</h1>
      <h2>{data.heading}</h2>
      <h3>Paragraphs:</h3>
      {data.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
};

export default App;
