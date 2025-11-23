// React can't directly work with puppeteer so it has to go through a
// server that calls another file with puppeteer

import express from 'express';
import cors from 'cors';
import { Scraping } from './scraper.js';
import { supabase } from './supabase.js';
import { suggestKeywordsForBooks } from './keywords.js';

const app = express();
app.use(cors());

app.get('/scrape', async (req, res) => {
  try {
    const data = await Scraping();
    const booksWithKeywords = await suggestKeywordsForBooks(data.books || []);
    const payload = { ...data, books: booksWithKeywords };
    const { data: inserted, error } = await supabase
      .from('posts')
      .insert({
        platform_id: 1,
        competitor_id: 1,
        platform_post_id: data.url,
        url: data.url,
        content: data.heading + ' ' + (data.paragraphs || []).join(' ')
      });
    if (error) {
      console.error('Insert error:', error);
    }
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scraping failed' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

app.use(express.json()); 

app.post("/write", async (req, res) => {
  const { message } = req.body;
  const { data, error } = await supabase
    .from("hello_world") 
    .insert({ message })
    .select()
    .single();

  if (error) {
    console.error("Insert error:", error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ inserted: data });
});

app.get("/read", async (req, res) => {
  const { data, error } = await supabase
    .from("hello_world")
    .select("*");
  if (error) {
    console.error("Select error:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ records: data });
});
