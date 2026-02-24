import { getUserByUsername, getUserIdByUsername, fetchPostsByUserId } from "./xApi.js";
import { normalizeXPost } from "./utils/normalizeXPost.js";
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase.js';
import { suggestKeywordsForBooks } from './keywords.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractYouTubeVideoId(input) {
  if (!input) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    if (url.hostname.includes("youtube.com")) {
      return url.searchParams.get("v");
    }
    if (url.hostname === "youtu.be") {
      return url.pathname.slice(1);
    }
  } catch {
    return null;
  }

  return null;
}

// Helper function to get transcript using Python library (youtube-transcript-api)
async function getTranscriptFromPython(videoId) {
  try {
    const pythonScript = path.join(__dirname, 'get_transcript.py');
    const { stdout, stderr } = await execAsync(`python3 "${pythonScript}" "${videoId}"`, {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (stderr) console.error('Python stderr:', stderr);
    const result = JSON.parse(stdout);
    if (!result.success) console.error('Python transcript extraction failed:', result.error);
    return result;
  } catch (err) {
    console.error('Python transcript extraction error:', err.message);
    // Always return a valid object so callers can safely check .success
    return { success: false, transcript: "", error: err.message };
  }
}

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

const getUserIdFromRequest = (req) =>
  req.body?.user_id || req.query?.user_id || req.get('x-user-id') || null;

const requireUserId = (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: 'Missing user id.' });
    return null;
  }
  return String(userId);
};

// Health check - confirms this is the right server version
app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: "chibitek-v3", timestamp: new Date().toISOString() });
});

app.get("/api/x/fetch/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const requestedCount = Math.min(100, Math.max(5, parseInt(req.query.count) || 10)); // X API minimum is 5
    const user = await getUserByUsername(username);
    const posts = await fetchPostsByUserId(user.id, requestedCount);
    res.json({
      success: true,
      username: user.username,
      name: user.name,
      userId: user.id,
      followerCount: user.followerCount,
      posts,
    });
  } catch (err) {
    console.error("X fetch error:", err.message);
    if (String(err.message).includes("Rate limit")) return res.status(429).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Routes defined below. Server starts after all routes are registered.

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

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        title: title || 'New chat',
        conversation,
        user_id: userId,
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
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at')
      .eq('user_id', userId)
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

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
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

app.delete('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.length) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('Delete conversation failed:', err);
    return res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

const deleteConversationById = async (id, req, res) => {
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.length) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('Delete conversation failed:', err);
    return res.status(500).json({ error: 'Failed to delete conversation.' });
  }
};

app.post('/api/chat/conversations/:id/delete', async (req, res) => {
  const { id } = req.params;
  return deleteConversationById(id, req, res);
});

app.post('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  const methodOverride = req.get('x-http-method-override') || req.query?._method;
  if (String(methodOverride || '').toUpperCase() !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  return deleteConversationById(id, req, res);
});

app.post("/api/x/fetch-and-save/:username", async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const username = req.params.username;

    const platformUserId = await getUserIdByUsername(username);

    const PLATFORM_X = 1;

    // Find or create competitor
    let competitor;
    const { data: existingComp } = await supabase
      .from("competitors")
      .select("*")
      .eq("platform_id", PLATFORM_X)
      .eq("platform_user_id", platformUserId)
      .maybeSingle();

    if (existingComp) {
      competitor = existingComp;
    } else {
      const { data: newComp, error: compErr } = await supabase
        .from("competitors")
        .insert({
          platform_id: PLATFORM_X,
          platform_user_id: platformUserId,
          display_name: username,
          profile_url: `https://x.com/${username}`,
        })
        .select()
        .single();
      if (compErr) throw compErr;
      competitor = newComp;
    }

    const [tweet] = await fetchPostsByUserId(platformUserId);

    if (!tweet) {
      return res.json({ saved: false, reason: "No tweet found" });
    }

    const normalized = normalizeXPost(tweet, {
      platformId: PLATFORM_X,
      competitorId: competitor.id,
    });

    // Find or create post
    let post;
    const { data: existingPost } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", userId)
      .eq("platform_id", PLATFORM_X)
      .eq("platform_post_id", normalized.post.platform_post_id)
      .maybeSingle();

    if (existingPost) {
      const { data: updated, error: updateErr } = await supabase
        .from("posts")
        .update({ content: normalized.post.content, published_at: normalized.post.published_at })
        .eq("id", existingPost.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      post = updated;
    } else {
      const { data: newPost, error: insertErr } = await supabase
        .from("posts")
        .insert({
          ...normalized.post,
          user_id: userId,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;
      post = newPost;
    }

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
  // Log raw body for debugging save failures
  const body = req.body || {};
  console.log("[POST /api/posts] body keys:", Object.keys(body), "user_id:", body.user_id, "platform_id:", body.platform_id);

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
    user_id,
    title,
    description,
    channelTitle,
    videoId,
    views,
    author_name,
    author_handle,
  } = body;

  if (!platform_id || !platform_user_id || !platform_post_id || !user_id) {
    console.log("[POST /api/posts] missing fields: platform_id=", platform_id, "platform_user_id=", platform_user_id, "platform_post_id=", platform_post_id, "user_id=", user_id);
    return res.status(400).json({ error: "Missing required fields", detail: { platform_id: !!platform_id, platform_user_id: !!platform_user_id, platform_post_id: !!platform_post_id, user_id: !!user_id } });
  }

  try {
    // Find or create competitor
    const profileUrl = platform_id === 1
      ? `https://x.com/${username}`
      : platform_id === 8
        ? `https://www.youtube.com/channel/${platform_user_id}`
        : null;

    let competitor;
    const { data: existingComp, error: competitorError } = await supabase
      .from("competitors")
      .select("*")
      .eq("platform_id", platform_id)
      .eq("platform_user_id", platform_user_id)
      .maybeSingle();

    if (competitorError) throw competitorError;

    if (existingComp) {
      competitor = existingComp;
    } else {
      const { data: newComp, error: compErr } = await supabase
        .from("competitors")
        .insert({
          platform_id,
          platform_user_id,
          display_name: username,
          profile_url: profileUrl || `https://x.com/${username}`,
        })
        .select()
        .single();
      if (compErr) throw compErr;
      competitor = newComp;
    }

    // Find or create post
    let post;
    const { data: existingPost } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", user_id)
      .eq("platform_id", platform_id)
      .eq("platform_post_id", platform_post_id)
      .maybeSingle();

    if (existingPost) {
      const { data: updated, error: updateErr } = await supabase
        .from("posts")
        .update({ content, published_at })
        .eq("id", existingPost.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      post = updated;
    } else {
      const { data: newPost, error: insertErr } = await supabase
        .from("posts")
        .insert({
          platform_id,
          competitor_id: competitor.id,
          platform_post_id,
          content,
          published_at,
          user_id,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;
      post = newPost;
    }

    await supabase.from("post_metrics").insert({
      post_id: post.id,
      snapshot_at: new Date(),
      likes,
      shares,
      comments,
    });

    // For YouTube, save additional details
    if (platform_id === 8) {
      const { error: detailsError } = await supabase.from("post_details_platform").insert({
        post_id: post.id,
        extra_json: {
          title,
          description,
          channelTitle,
          videoId,
          views,
        },
      });
      if (detailsError) {
        console.error('Error saving post details:', detailsError);
      }
    }

    // For X (Twitter), save additional details
    if (platform_id === 1) {
      const { error: detailsError } = await supabase.from("post_details_platform").insert({
        post_id: post.id,
        extra_json: {
          author_name: author_name || username,
          author_handle: author_handle || username,
          username,
        },
      });
      if (detailsError) {
        console.error('Error saving X post details:', detailsError);
      }
    }

    res.json({ saved: true, post_id: post.id });
  } catch (err) {
    console.error("[POST /api/posts] Save post failed:", JSON.stringify({ message: err.message, code: err.code, details: err.details, hint: err.hint }));
    res.status(500).json({ error: err.message, detail: err.details || err.hint || null });
  }
});

app.get("/api/posts", async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select(`id, platform_id, content, published_at, competitors(display_name), post_metrics(likes, shares, comments), post_details_platform(extra_json)`)
      .eq("user_id", userId)
      .order("published_at", { ascending: false });
    if (error) throw error;

    const formattedPosts = posts.map((post) => {
      const extra = post.post_details_platform?.[0]?.extra_json || {};
      const competitorName = post.competitors?.[0]?.display_name;

      return {
        id: post.id,
        platform_id: post.platform_id || 0,
        content: post.content,
        published_at: post.published_at,
        likes: post.post_metrics?.[0]?.likes || 0,
        shares: post.post_metrics?.[0]?.shares || 0,
        comments: post.post_metrics?.[0]?.comments || 0,
        extra: {
          ...extra,
          // Fallback to competitor name for X posts if author_name not set
          author_name: extra.author_name || (post.platform_id === 1 ? competitorName : undefined),
          username: extra.username || competitorName,
          title: extra.title,
          description: extra.description,
          channelTitle: extra.channelTitle,
          videoId: extra.videoId,
          views: extra.views,
        },
      };
    });

    res.json({ posts: formattedPosts });
  } catch (err) {
    console.error("Fetch posts failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/posts/:id", async (req, res) => {
  const postId = req.params.id;

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    if (postError) throw postError;
    if (!post) return res.status(404).json({ error: "Post not found." });

    await supabase.from("post_metrics").delete().eq("post_id", postId);
    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("user_id", userId);

    if (deleteError) throw deleteError;

    res.json({ deleted: true, post_id: postId });
  } catch (err) {
    console.error("Delete post failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Keyword extraction — single meaningful words only
// ---------------------------------------------------------------------------
const KW_STOPWORDS = new Set([
  "this","that","with","have","from","they","been","were","said","each","which",
  "their","there","will","would","could","should","about","after","before","when",
  "what","your","just","more","also","into","over","then","than","some","such",
  "like","very","most","only","make","take","come","know","think","even","well",
  "much","here","through","while","these","those","being","having","doing","going",
  "want","need","good","great","time","year","back","down","many","long","look",
  "people","way","day","how","our","use","now","may","new","you","all","can",
  "get","got","its","let","him","her","his","she","they","was","are","has","had",
  "does","did","the","and","for","not","but","with","you","this","from","they",
]);

function extractKeywords(text, extraText) {
  // extraText = optional bonus content (e.g. YouTube title) to extract from too
  const combined = [text || "", extraText || ""].join(" ");
  if (!combined.trim()) return [];
  const keywords = new Set();
  const hashtags = combined.match(/#([a-zA-Z][a-zA-Z0-9_]*)/g) || [];
  hashtags.forEach(tag => keywords.add(tag.slice(1).toLowerCase()));
  const cleaned = combined
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#\w+/g, "")
    .replace(/@\w+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  cleaned.split(" ").filter(w => w.length > 3 && !KW_STOPWORDS.has(w)).forEach(w => keywords.add(w));
  // Higher cap for long content (YouTube transcripts)
  const cap = combined.length > 500 ? 80 : 30;
  return Array.from(keywords).slice(0, cap);
}

// ---------------------------------------------------------------------------
// GET /api/keywords  — Bayesian Keyword Performance Index
//
// Scoring formula:
//   weightedEngagement = shares*5 + comments*3 + likes*1
//   globalMean         = mean weighted engagement across all posts
//   k                  = 5  (Bayesian confidence constant)
//   bayesianAvg        = (n * kwAvg + k * globalMean) / (n + k)
//   consistency        = 1 / (1 + min(stdDev/kwAvg, 1.0))
//   trendBoost         = min(sqrt(recentAvg / olderAvg), 1.5)  — only upward
//   rawScore           = bayesianAvg * consistency * trendBoost
//   kpi                = rawScore normalised to 0–100 index
// ---------------------------------------------------------------------------
app.get("/api/keywords", async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  console.log(`[keywords] request for user ${userId}`);

  try {
    // 1. Fetch all posts with metrics, oldest first for trend detection
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, content, published_at, platform_id, competitor_id, post_metrics(likes, shares, comments, snapshot_at), post_details_platform(extra_json)")
      .eq("user_id", userId)
      .order("published_at", { ascending: true })
      .limit(500);

    if (postsError) throw postsError;
    if (!posts?.length) {
      return res.json({ keywords: [], totalPosts: 0, debug: "no posts found" });
    }

    // 2. Compute weighted engagement score for every post
    const scoredPosts = posts.map((p, idx) => {
      const snapshots = Array.isArray(p.post_metrics) ? p.post_metrics : [];
      const m = snapshots.sort(
        (a, b) => new Date(b.snapshot_at || 0) - new Date(a.snapshot_at || 0)
      )[0] || {};
      const likes    = Number(m.likes    || 0);
      const shares   = Number(m.shares   || 0);
      const comments = Number(m.comments || 0);
      const weightedScore = shares * 5 + comments * 3 + likes * 1;
      // For YouTube, extract keywords from title too (most signal-dense text)
      const youtubeTitle = p.platform_id === 8
        ? (p.post_details_platform?.[0]?.extra_json?.title || "")
        : "";
      return { id: p.id, weightedScore, likes, shares, comments, platform_id: p.platform_id, competitor_id: p.competitor_id, keywords: extractKeywords(p.content || "", youtubeTitle), chronoIdx: idx };
    });

    const totalPosts = scoredPosts.length;

    // 3. Per-account normalization — prevents one high-engagement account from flooding rankings
    // Each post score becomes: post_score / that_account's_mean_score
    // This measures relative outperformance within each account
    // A post 2x above Obama's mean beats a post 1.1x above MrBeast's mean,
    // even though MrBeast's absolute numbers are much higher
    const accountScores = {};
    scoredPosts.forEach(p => {
      if (!accountScores[p.competitor_id]) accountScores[p.competitor_id] = [];
      accountScores[p.competitor_id].push(p.weightedScore);
    });
    const accountMeans = {};
    Object.entries(accountScores).forEach(([id, scores]) => {
      accountMeans[id] = scores.reduce((s, v) => s + v, 0) / scores.length;
    });
    // Apply normalization — floor at 0.01 to avoid division issues on zero-engagement posts
    scoredPosts.forEach(p => {
      const mean = accountMeans[p.competitor_id] || 1;
      p.normalizedScore = mean > 0 ? p.weightedScore / mean : 1.0;
    });

    // In normalized space the global mean is always ~1.0 by definition
    const K = 10; // Bayesian confidence constant

    // 4. Trend split: newest 33% = recent, older 67% = baseline
    const recentCutoff = Math.floor(totalPosts * 0.67);

    // 5. Aggregate per-keyword stats using normalized scores
    const kwData = {};
    scoredPosts.forEach(post => {
      const isRecent = post.chronoIdx >= recentCutoff;
      post.keywords.forEach(kw => {
        if (!kwData[kw]) kwData[kw] = {
          scores: [], recentScores: [], olderScores: [],
          rawScores: [], // keep raw for display purposes
          totalLikes: 0, totalShares: 0, totalComments: 0,
        };
        kwData[kw].scores.push(post.normalizedScore);
        kwData[kw].rawScores.push(post.weightedScore);
        kwData[kw].totalLikes    += post.likes;
        kwData[kw].totalShares   += post.shares;
        kwData[kw].totalComments += post.comments;
        if (isRecent) kwData[kw].recentScores.push(post.normalizedScore);
        else          kwData[kw].olderScores.push(post.normalizedScore);
      });
    });

    // 6. Score every keyword with the Bayesian KPI formula (in normalized space)
    const globalMean = 1.0; // always 1.0 after per-account normalization
    const results = [];
    Object.entries(kwData).forEach(([kw, d]) => {
      const n   = d.scores.length;
      const avg = d.scores.reduce((s, v) => s + v, 0) / n;
      const rawAvg = d.rawScores.reduce((s, v) => s + v, 0) / n;

      // Bayesian shrinkage toward 1.0 (the normalized global mean)
      const bayesianAvg = (n * avg + K * globalMean) / (n + K);

      // Consistency: penalise high variance
      const variance = d.scores.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / n;
      const stdDev   = Math.sqrt(variance);
      const cv       = avg > 0 ? stdDev / avg : 0;
      const consistency = 1 / (1 + Math.min(cv, 1.0));

      // Trend boost: only upward, capped at 1.5×
      const recentAvg = d.recentScores.length
        ? d.recentScores.reduce((s, v) => s + v, 0) / d.recentScores.length
        : avg;
      const olderAvg  = d.olderScores.length
        ? d.olderScores.reduce((s, v) => s + v, 0) / d.olderScores.length
        : avg;
      const trendRatio = olderAvg > 0 ? recentAvg / olderAvg : 1;
      const trendBoost = trendRatio > 1 ? Math.min(Math.sqrt(trendRatio), 1.5) : 1.0;
      const trendDir   = trendRatio >= 1.4 ? "rising" : trendRatio <= 0.7 ? "falling" : "stable";

      const rawScore = bayesianAvg * consistency * trendBoost;

      results.push({
        term:          kw,
        rawScore,
        kpi:           0,
        avgEngagement: Math.round(rawAvg),      // raw for display
        normalizedAvg: Math.round(avg * 100) / 100,
        bayesianAvg:   Math.round(bayesianAvg * 100) / 100,
        sampleSize:    n,
        consistency:   Math.round(consistency * 100),
        trend:         Math.round(trendRatio * 100) / 100,
        trendDir,
        totalLikes:    d.totalLikes,
        totalShares:   d.totalShares,
        totalComments: d.totalComments,
      });
    });

    // 7. Normalise rawScore → KPI index 0–100
    const sortedResults = results.sort((a, b) => b.rawScore - a.rawScore);
    const maxRaw = sortedResults[0]?.rawScore || 1;
    sortedResults.forEach(r => {
      r.kpi = Math.round((r.rawScore / maxRaw) * 100);
      delete r.rawScore; // don't expose internal value
    });

    // Filter keywords with only 1 post when we have enough data to be meaningful
    // With 10+ posts, single-occurrence words are noise, not signal
    const minPosts = totalPosts >= 10 ? 2 : 1;
    const keywords = sortedResults.filter(r => r.sampleSize >= minPosts).slice(0, 50);

    const xPosts = scoredPosts.filter(p => p.platform_id === 1).length;
    const ytPosts = scoredPosts.filter(p => p.platform_id === 8).length;
    console.log(`[keywords] ${totalPosts} posts (X:${xPosts} YT:${ytPosts}) → ${keywords.length} keywords`);

    return res.json({
      keywords,
      totalPosts,
      globalMean: Math.round(globalMean),
      debug: `${totalPosts} posts (X: ${xPosts}, YouTube: ${ytPosts}) · ${keywords.length} keywords · global avg ${Math.round(globalMean).toLocaleString()}`,
    });

  } catch (err) {
    console.error("[keywords] failed:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/youtube/transcript", async (req, res) => {
  try {
    const { video } = req.query;
    const videoId = extractYouTubeVideoId(video);

    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL or video ID" });
    }

    if (!process.env.YOUTUBE_API_KEY) {
      return res.status(500).json({ error: "YOUTUBE_API_KEY not configured" });
    }

    // Fetch video metadata using official YouTube API
    const videoMetaRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
    );
    const videoMetaData = await videoMetaRes.json();

    if (!videoMetaData.items?.length) {
      return res.status(404).json({ error: "Video not found" });
    }

    const videoItem = videoMetaData.items[0];

    const videoInfo = {
      title: videoItem.snippet.title,
      description: videoItem.snippet.description,
      publishedAt: videoItem.snippet.publishedAt,
      channelId: videoItem.snippet.channelId,
      channelTitle: videoItem.snippet.channelTitle,
      stats: {
        views: Number(videoItem.statistics.viewCount || 0),
        likes: Number(videoItem.statistics.likeCount || 0),
        comments: Number(videoItem.statistics.commentCount || 0),
      },
    };

    // Extract transcript using Python library
    const pythonResult = await getTranscriptFromPython(videoId);

    if (pythonResult.success && pythonResult.transcript) {
      return res.json({
        videoId,
        video: videoInfo,
        transcriptAvailable: true,
        language: pythonResult.language || "en",
        source: "youtube-transcript-api",
        transcript: pythonResult.transcript,
      });
    }

    // Failed to get transcript
    return res.json({
      videoId,
      video: videoInfo,
      transcriptAvailable: false,
      transcript: "",
      reason: pythonResult.error || "No transcript available",
    });
  } catch (err) {
    console.error("YouTube transcript error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`\n✅ Chibitek server v3 running on port ${port}`);
  console.log(`   Health check: http://localhost:${port}/api/health\n`);
});