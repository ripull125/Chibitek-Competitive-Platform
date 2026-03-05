import React, { useState, useEffect } from "react";
import { Button, Container, Title, Input, Box, Text } from "@mantine/core";
import { supabase } from "../supabaseClient";
import DownloadJSON from "../../components/DownloadJSON";
import DownloadTXT from "../../components/DownloadTXT";
import DownloadCSV from "../../components/DownloadCSV";
import { apiUrl } from "../utils/api";
import { useTranslation } from "react-i18next";

// Import the RechartsTest chart
// import RechartsTest from "../../../recharts/src/RechartsTest.jsx";

const Placeholder = () => {
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [data, setData] = useState({ heading: "", paragraphs: [], books: [] });
  const { t } = useTranslation();

  

  const fetchRecords = async () => {
    try {
      const res = await fetch(apiUrl("/read"));
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
      await fetch(apiUrl("/write"), {
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

  const saveKeywords = async (book) => {
    const keywords = (book.keywords || []).join(", ");
    const price = book.price || "Unknown";
    const message = `${book.title} - ${keywords} - Price: ${price}`;

    try {
      const res = await fetch(apiUrl("/write"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const json = await res.json();
      if (!res.ok) {
        console.error("Save keywords failed:", json);
        alert(t("placeholder.failedSaveKeywords"));
        return;
      }

      await fetchRecords();
    } catch (err) {
      console.error("Save keywords error:", err);
      alert(t("placeholder.failedSaveKeywords"));
    }
  };

  const deleteMessage = async (id) => {
    const ok = window.confirm(t("placeholder.deleteConfirm"));
    if (!ok) return;

    try {
      const res = await fetch(apiUrl("/api/delete"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SCRAPER-AUTH": import.meta.env.VITE_SCRAPER_AUTH || ""
        },
        body: JSON.stringify({ id })
      });
      const json = await res.json();
      if (!res.ok) {
        console.error("Delete error:", json);
        alert(t("placeholder.failedDeleteWithReason") + (json.error || res.statusText));
        return;
      }
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
      alert(t("placeholder.failedDelete"));
    }
  };

  useEffect(() => {
    fetchRecords();

    fetch(apiUrl(`/scrape?ts=${Date.now()}`), { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        setData(json);
      })
      .catch((err) => console.error(err));
  }, []);

  return (
    <Container p="md">
      <Box style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <Button color="blue">{t("placeholder.testButton")}</Button>

        <DownloadJSON
          data={records.map((r) => {
            let price = null;
            let title = r.message;
            let keywords = "";

            const priceMatch = r.message.match(
              /Price:\s*[£$]?\s*([0-9,]+(?:\.[0-9]+)?)/
            );
            if (priceMatch) {
              price = Number(priceMatch[1].replace(/,/g, ""));
            }

            const split = r.message.split(" - ");
            if (split.length >= 2) {
              title = split[0];
              keywords = split[1];
            }

            return {
              id: r.id,
              title,
              keywords,
              price
            };
          })}
        />

        <DownloadTXT data={records} />
        <DownloadCSV data={records} />
      </Box>

      <Title order={2} mb="md">
        {t("placeholder.writeReadTitle")}
      </Title>

      <Box mb="lg">
        <Input
          placeholder={t("placeholder.enterMessage")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          mb="sm"
        />
        <Button onClick={submitMessage} color="teal" mb="md">
          {t("placeholder.submitMessage")}
        </Button>

        <Title order={3} mb="sm">
          {t("placeholder.savedData")}
        </Title>

        {records.map((r) => (
          <Box
            key={r.id}
            mb="xs"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Text>{r.message}</Text>
            <Button color="red" size="xs" onClick={() => deleteMessage(r.id)}>
              {t("placeholder.delete")}
            </Button>
          </Box>
        ))}
      </Box>

      <Title order={3} mb="sm">
        {t("placeholder.scrapedContent")}
      </Title>
      <Text fontSize="lg" mb="sm">
        {t("placeholder.heading")}: {data.heading}
      </Text>

      <Box mb="lg">
        <Title order={4}>{t("placeholder.paragraphs")}</Title>
        {data.paragraphs?.length ? (
          data.paragraphs.map((p, i) => (
            <Text key={i} mb="xs">
              {p}
            </Text>
          ))
        ) : (
          <Text mb="xs">{t("placeholder.noParagraphs")}</Text>
        )}
      </Box>

      <Box mb="lg">
        <Title order={4} mb="sm">
          {t("placeholder.books")}
        </Title>

        {!data.books?.length && <Text>{t("placeholder.noBooks")}</Text>}

        {data.books?.map((book, idx) => (
          <Box key={idx} mb="sm" style={{ border: "1px solid #eee", padding: 8 }}>
            <Text weight={700}>{book.title}</Text>
            <Text>{t("placeholder.price")}: {book.price || t("placeholder.unknown")}</Text>
            {book.availability && <Text>{t("placeholder.availability")}: {book.availability}</Text>}

            <Box
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 6
              }}
            >
              <Text style={{ marginBottom: 0 }}>
                {t("placeholder.suggestedKeywords")}: {" "}
                {book.keywords?.length
                  ? book.keywords.join(", ")
                  : t("placeholder.notAvailable")}
              </Text>
              <Button size="xs" onClick={() => saveKeywords(book)}>
                {t("placeholder.save")}
              </Button>
            </Box>
          </Box>
        ))}
      </Box>
    </Container>
  );
};

export default Placeholder;
