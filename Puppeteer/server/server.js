// React can't directly work with puppeteer so it has to go through a
// server that calls another file with puppeteer

import express from 'express';
import cors from 'cors';
import { Scraping } from './scraper.js';
import { supabase } from './supabase.js';

const app = express();
app.use(cors());

app.get('/scrape', async (req, res) => {
  try {
    const data = await Scraping();
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
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scraping failed' });
  }
});

app.listen(4000, () => {
  console.log('Server running at http://localhost:4000');
});
