import React, { useState, useEffect } from "react";
import { Button, Container, Title, Input, Box, Text } from "@mantine/core";
import DownloadJSON from "../components/DownloadJSON";
import DownloadTXT from "../components/DownloadTXT";
import DownloadCSV from "../components/DownloadCSV";

const App = () => {
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [data, setData] = useState({ heading: "", paragraphs: [] });

  const backendUrl = "http://localhost:8080";

  const fetchRecords = async () => {
    try {
      const res = await fetch(`${backendUrl}/read`);
      const json = await res.json();
      if (json.records) {
        setRecords(json.records);
      }
    } catch (err) {
      console.error("Error fetching records:", err);
    }
  };

  const submitMessage = async () => {
    if (!message) return;
    try {
      await fetch(`${backendUrl}/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      setMessage("");
      await fetchRecords();
    } catch (err) {
      console.error("Error writing message:", err);
    }
  };

  useEffect(() => {
    fetchRecords();

    fetch(`${backendUrl}/scrape?ts=${Date.now()}`, { cache: "no-store" })
      .then(res => res.json())
      .then(json => {
        setData(json);
      })
      .catch(err => console.error(err));
  }, []);

  return (
    <Container p="md">
      <Box style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <DownloadJSON data={data} />
        <DownloadTXT data={data} />
        <DownloadCSV data={data} />
      </Box>
      <Title order={2} mb="md">Write & Read to Database</Title>

      <Box mb="lg">
        <Input
          placeholder="Enter your message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          mb="sm"
        />
        <Button onClick={submitMessage} color="teal" mb="md">Submit Message</Button>

        <Title order={3} mb="sm">Previous Messages:</Title>
        {records.map(r => (
          <Text key={r.id} mb="xs">{r.message}</Text>
        ))}
      </Box>

      <Title order={3} mb="sm">Scraped Content:</Title>
      <Text fontSize="lg" mb="sm">Heading: {data.heading}</Text>

      <Box mb="lg">
        <Title order={4}>Paragraphs:</Title>
        {data.paragraphs && data.paragraphs.map((p, i) => (
          <Text key={i} mb="xs">{p}</Text>
        ))}
      </Box>
    </Container>
  );
};

export default App;
