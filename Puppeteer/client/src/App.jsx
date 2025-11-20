import React, { useEffect, useState } from "react";
import { Button, Container, Title } from "@mantine/core";
import DownloadJSON from "../components/DownloadJSON";
import DownloadTXT from "../components/DownloadTXT";
import DownloadCSV from "../components/DownloadCSV";

// every time the page renders, it uploads the files into supabase
// set cloud scheduler to only push to supabase when necessary

const App = () => {
  const [data, setData] = useState({ heading: "", paragraphs: [] });

  useEffect(() => {
    fetch(`http://localhost:4000/scrape?ts=${Date.now()}`, { cache: "no-store" })
      .then(res => res.json())
      .then(json => setData(json))
      .catch(err => console.error(err));
  }, []);

  if (!data) return <div>Loading scrape…</div>;

  return (
    <div style={{ padding: 20 }}>
      <Container p="md">
        <Title order={2} mb="md">Mantine is working</Title>
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <Button color="blue">Test Button</Button>
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
