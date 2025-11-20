import React, { useEffect, useState } from "react";
import { Button, Container, Title } from '@mantine/core';

const App = () => {
  const [data, setData] = useState(null);

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
      <Title order={2} mb="md">Mantine is working</Title>
      <Button color="blue">Test Button</Button>
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
