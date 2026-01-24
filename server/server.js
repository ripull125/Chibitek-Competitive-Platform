import { getUserIdByUsername, fetchPostsByUserId } from "./xApi.js";
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase.js';
import { suggestKeywordsForBooks } from './keywords.js';

dotenv.config();

const app = express();
app.use(cors({
  origin: 'http://localhost:5173',
  /* credentials: true, */
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' }));

const { OPENAI_API_KEY } = process.env;
const chatGptModel = 'gpt-4o-mini';

app.get("/api/x/fetch/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const userId = await getUserIdByUsername(username);
    const posts = await fetchPostsByUserId(userId, 5);

    res.json({ success: true, username, userId, posts });
  } catch (err) {
    console.error("X fetch error:", err.message);

    if (String(err.message).includes("Rate limit")) {
      return res.status(429).json({ error: err.message });
    }

    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 8080;

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

app.post("/api/delete", async (req, res) => {
  const providedAuth = req.get("x-scraper-auth") || req.headers["x-scraper-auth"];
  if (process.env.SCRAPER_AUTH && providedAuth !== process.env.SCRAPER_AUTH) {
    console.warn(`Unauthorized delete attempt from ${req.ip}`);
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "Missing id in body" });
  try {
    const { error } = await supabase.from("hello_world").delete().eq("id", id);
    if (error) {
      console.error("Delete error:", error);
      return res.status(500).json({ error: error.message });
    }
    console.log(`Deleted hello_world id=${id}`);
    res.json({ status: "deleted", id });
  } catch (err) {
    console.error("Delete failed:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

app.post('/api/chat', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY on server');
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  try {
    const { messages = [], attachments = [] } = req.body || {};

    const sanitizedMessages = Array.isArray(messages) ? messages.slice(-20) : [];

    const attachmentContext = (attachments || [])
      .filter((file) => file && file.name && file.content)
      .map((file) => {
        const preview = String(file.content).slice(0, 6000);
        return `Attachment: ${file.name} (${file.type || 'unknown type'})\n${preview}`;
      })
      .join('\n\n');

    const userMessages = attachmentContext
      ? [...sanitizedMessages, { role: 'user', content: `Attachment context:\n${attachmentContext}` }]
      : sanitizedMessages;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: chatGptModel, // 'gpt-4o-mini'
        messages: [
          {
            role: 'system',
            content:
              'You are ChibitekAI, a concise, helpful assistant for competitive intelligence. Use any provided attachment context to strengthen answers.',
          },
          ...userMessages,
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error('OpenAI API error:', openaiResponse.status, openaiResponse.statusText, errorBody);
      return res.status(500).json({
        error: `OpenAI API error: ${openaiResponse.status} ${openaiResponse.statusText}`,
      });
    }

    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content || 'No response from model.';
    return res.json({ reply });
  } catch (error) {
    console.error('Chat completion error:', error);
    return res.status(500).json({ error: 'Chat request failed.' });
  }
});

app.post('/api/chat/conversations', async (req, res) => {
  const { title, conversation } = req.body || {};
  if (!Array.isArray(conversation) || !conversation.length) {
    return res.status(400).json({ error: 'conversation must be a non-empty array' });
  }

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        title: title || 'New chat',
        conversation,
      })
      .select()
      .single();

    if (error) {
      console.error('Save conversation error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversation: data });
  } catch (err) {
    console.error('Save conversation failed:', err);
    return res.status(500).json({ error: 'Failed to save conversation.' });
  }
});

app.get('/api/chat/conversations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('List conversations error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversations: data || [] });
  } catch (err) {
    console.error('List conversations failed:', err);
    return res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

app.get('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Fetch conversation error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversation: data });
  } catch (err) {
    console.error('Fetch conversation failed:', err);
    return res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

// Delete a saved conversation by id
app.delete('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;

  // Optional: protect deletes with the same header you already use elsewhere
  // If you DON'T want protection, delete this whole block.
  const providedAuth = req.get('x-scraper-auth') || req.headers['x-scraper-auth'];
  if (process.env.SCRAPER_AUTH && providedAuth !== process.env.SCRAPER_AUTH) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  try {
    const { error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ status: 'deleted', id });
  } catch (err) {
    console.error('Delete conversation failed:', err);
    return res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
app.post("/api/x/fetch-and-save/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const userId = await getUserIdByUsername(username);

    const PLATFORM_X = 1;

    const { data: competitor } = await supabase
      .from("competitors")
      .upsert(
        {
          platform_id: PLATFORM_X,
          platform_user_id: userId,
          display_name: username,
          profile_url: `https://x.com/${username}`,
        },
        { onConflict: "platform_id,platform_user_id" }
      )
      .select()
      .single();

    const [tweet] = await fetchPostsByUserId(userId);

    if (!tweet) {
      return res.json({ saved: false, reason: "No tweet found" });
    }

    const normalized = normalizeXPost(tweet, {
      platformId: PLATFORM_X,
      competitorId: competitor.id,
    });

    const { data: post } = await supabase
      .from("posts")
      .upsert(normalized.post, {
        onConflict: "platform_id,platform_post_id",
      })
      .select()
      .single();

    await supabase.from("post_metrics").insert({
      post_id: post.id,
      snapshot_at: new Date(),
      ...normalized.metrics,
    });

    res.json({ saved: true, post_id: post.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/posts", async (req, res) => {
  const {
    platform_id,
    platform_user_id,
    username,
    platform_post_id,
    content,
    published_at,
    likes,
    shares,
    comments,
  } = req.body;

  if (!platform_id || !platform_user_id || !platform_post_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { data: competitor, error: competitorError } = await supabase
      .from("competitors")
      .upsert(
        {
          platform_id,
          platform_user_id,
          display_name: username,
          profile_url: `https://x.com/${username}`,
        },
        { onConflict: "platform_id,platform_user_id" }
      )
      .select()
      .single();

    if (competitorError) throw competitorError;

    const { data: post, error: postError } = await supabase
      .from("posts")
      .upsert(
        {
          platform_id,
          competitor_id: competitor.id,
          platform_post_id,
          content,
          published_at,
        },
        { onConflict: "platform_id,platform_post_id" }
      )
      .select()
      .single();

    if (postError) throw postError;

    await supabase.from("post_metrics").insert({
      post_id: post.id,
      snapshot_at: new Date(),
      likes,
      shares,
      comments,
    });

    res.json({ saved: true, post_id: post.id });
  } catch (err) {
    console.error("Save post failed:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/posts", async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select(`
        id,
        content,
        published_at,
        post_metrics(likes, shares, comments)
      `)
      .order("published_at", { ascending: false });

    if (error) throw error;

    const formattedPosts = posts.map((post) => ({
      id: post.id,
      content: post.content,
      published_at: post.published_at,
      likes: post.post_metrics?.[0]?.likes || 0,
      shares: post.post_metrics?.[0]?.shares || 0,
      comments: post.post_metrics?.[0]?.comments || 0,
    }));

    res.json({ posts: formattedPosts });
  } catch (err) {
    console.error("Fetch posts failed:", err);
    res.status(500).json({ error: err.message });
  }
});