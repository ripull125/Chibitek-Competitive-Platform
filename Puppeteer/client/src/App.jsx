import React, { useState, useEffect } from "react";
import { Button, Container, Title, Input, Box, Text } from "@mantine/core";
import DownloadJSON from "../components/DownloadJSON";
import DownloadTXT from "../components/DownloadTXT";
import DownloadCSV from "../components/DownloadCSV";

const App = () => {
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [data, setData] = useState({ heading: "", paragraphs: [], books: [] });

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

      <h3>Books:</h3>
      {!data.books?.length && <p>No books detected.</p>}
      {data.books?.map((book, idx) => (
        <div key={idx} style={{ marginBottom: "12px" }}>
          <strong>{book.title}</strong>
          <div>Price: {book.price || "Unknown"}</div>
          {book.availability && <div>Availability: {book.availability}</div>}
          <div>
            Suggested keywords: {book.keywords?.length ? book.keywords.join(", ") : "Not available"}
          </div>
        </div>
      ))}
    </div>
  );
};

export default App;
