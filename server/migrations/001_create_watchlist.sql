-- Watchlist: items a user wants automatically scraped on a schedule
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS watchlist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,              -- references auth.users(id)
  platform    TEXT NOT NULL CHECK (platform IN ('x','youtube','reddit','linkedin','instagram','tiktok')),
  scrape_type TEXT NOT NULL,              -- e.g. 'user_posts', 'channel_videos', 'subreddit_posts', 'search', etc.
  target      TEXT NOT NULL,              -- username, channel URL, subreddit name, search query, etc.
  label       TEXT,                       -- optional user-friendly display name
  config      JSONB DEFAULT '{}'::jsonb,  -- extra params (max results, filters, etc.)
  enabled     BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items (user_id);

-- Row Level Security (optional — enable if you use RLS)
-- ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can manage own watchlist" ON watchlist_items
--   USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
