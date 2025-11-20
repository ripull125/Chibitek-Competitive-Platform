// React can't directly work with puppeteer so it has to go through a
// server that calls another file with puppeteer

import express from 'express';
import cors from 'cors';
import { Scraping } from './scraper.js';

const app = express();
app.use(cors());

app.get('/scrape', async (req, res) => {
  try {
    const data = await Scraping();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scraping failed' });
  }
});

app.listen(4000, () => {
  console.log('Server running at http://localhost:5000');
});
