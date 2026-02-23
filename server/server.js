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
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large transcripts
    });

    if (stderr) {
      console.error('Python stderr:', stderr);
    }

    const result = JSON.parse(stdout);
    if (!result.success) {
      console.error('Python transcript extraction failed:', result.error);
    }
    return result;
  } catch (err) {
    console.error('Python transcript extraction error:', err.message);
  };
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
// GET /api/keywords
// Lift-score based keyword analysis. No external dependencies.
// Ranks keywords by how overrepresented they are in high-performing posts.
// ---------------------------------------------------------------------------

// Extract keywords from post text: hashtags + meaningful single words only
function extractKeywords(text) {
  if (!text) return [];
  const keywords = new Set();

  // 1. Hashtags (strip # prefix so they compare with regular words)
  const hashtags = text.match(/#([a-zA-Z][a-zA-Z0-9_]*)/g) || [];
  hashtags.forEach(tag => keywords.add(tag.slice(1).toLowerCase()));

  // 2. Clean text - single meaningful words only
  const cleaned = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#\w+/g, '')
    .replace(/@\w+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(w => w.length > 3 && !KW_STOPWORDS.has(w));
  words.forEach(w => keywords.add(w));

  return Array.from(keywords).slice(0, 25);
}

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

app.get("/api/keywords", async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  console.log(`[keywords] request for user ${userId}`);

  try {
    // 1. Fetch posts ordered by published_at so we can detect trends
    let posts, postsError;
    ({ data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, content, published_at, post_metrics(likes, shares, comments, snapshot_at)")
      .eq("user_id", userId)
      .order("published_at", { ascending: true })
      .limit(500));

    if (postsError) {
      console.error("[keywords] supabase error:", postsError);
      throw postsError;
    }

    if (!posts || posts.length === 0) {
      return res.json({ keywords: [], trendingKeywords: [], totalPosts: 0, debug: "no posts found" });
    }

    // 2. Score each post by engagement (follower-normalized when available)
    const scoredPosts = posts.map((p, idx) => {
      const snapshots = Array.isArray(p.post_metrics) ? p.post_metrics : [];
      const m = snapshots.sort(
        (a, b) => new Date(b.snapshot_at || 0) - new Date(a.snapshot_at || 0)
      )[0] || {};

      const likes    = Number(m.likes    || 0);
      const shares   = Number(m.shares   || 0);
      const comments = Number(m.comments || 0);
      const rawEngagement = likes + 2 * comments + 2 * shares;
      const score = Math.log(1 + rawEngagement);

      return {
        id: p.id,
        score,
        rawEngagement,
        keywords: extractKeywords(p.content || ""),
        chronoIndex: idx, // 0 = oldest, higher = newer
      };
    });

    const totalPosts = scoredPosts.length;

    // 3. Identify top performers — strict threshold so only genuinely best posts define keywords
    // <10 posts: top 1; 10-29 posts: top 20%; 30+ posts: top 15%
    const sorted = [...scoredPosts].sort((a, b) => b.score - a.score);
    const topN = totalPosts < 10
      ? 1
      : totalPosts < 30
        ? Math.max(1, Math.ceil(totalPosts * 0.20))
        : Math.max(2, Math.ceil(totalPosts * 0.15));
    const topPostIds = new Set(sorted.slice(0, topN).map(p => p.id));

    // 4. Split posts into recent (newest 33%) vs older (older 67%) for trend detection
    const recentCutoff = Math.floor(totalPosts * 0.67);
    const recentPosts  = scoredPosts.filter(p => p.chronoIndex >= recentCutoff);
    const olderPosts   = scoredPosts.filter(p => p.chronoIndex < recentCutoff);
    const totalRecent  = Math.max(recentPosts.length, 1);
    const totalOlder   = Math.max(olderPosts.length, 1);

    // 5. Count keyword appearances across all three views
    const kwData = {};
    scoredPosts.forEach(post => {
      const isTop    = topPostIds.has(post.id);
      const isRecent = post.chronoIndex >= recentCutoff;
      post.keywords.forEach(kw => {
        if (!kwData[kw]) kwData[kw] = { inTop: 0, inAll: 0, inRecent: 0, inOlder: 0 };
        kwData[kw].inAll++;
        if (isTop)    kwData[kw].inTop++;
        if (isRecent) kwData[kw].inRecent++;
        else          kwData[kw].inOlder++;
      });
    });

    // 6. Score each keyword
    const results = [];
    Object.entries(kwData).forEach(([kw, counts]) => {
      if (counts.inAll < 1) return;

      const topFreq     = counts.inTop / topN;
      const overallFreq = counts.inAll / totalPosts;
      // Raw lift
      const lift = overallFreq > 0 ? topFreq / overallFreq : 0;
      // Power score: lift weighted by log(count) so rare flukes don't rank above consistent words
      const power = lift * Math.log(1 + counts.inAll);

      // Trend: how much more common is this word in recent posts vs older posts?
      const recentFreq = counts.inRecent / totalRecent;
      const olderFreq  = counts.inOlder  / totalOlder;
      const trend = olderFreq > 0
        ? recentFreq / olderFreq    // >1 = rising, <1 = falling
        : recentFreq > 0 ? 2 : 1;  // only in recent = strongly rising

      results.push({
        term:        kw,
        lift:        Math.round(lift  * 100) / 100,
        power:       Math.round(power * 100) / 100,
        topFreq:     Math.round(topFreq     * 1000) / 10,
        overallFreq: Math.round(overallFreq * 1000) / 10,
        sampleSize:  counts.inAll,
        topCount:    counts.inTop,
        trend:       Math.round(trend * 100) / 100,
        trendDir:    trend >= 1.4 ? "rising" : trend <= 0.7 ? "falling" : "stable",
      });
    });

    // 7. Top keywords: sort by power score (lift × consistency)
    const keywords = results
      .filter(r => r.lift > 0)
      .sort((a, b) => b.power - a.power || b.sampleSize - a.sampleSize)
      .slice(0, 30);

    // 8. Trending keywords: recently rising words that also have some engagement signal
    const trendingKeywords = results
      .filter(r => r.trendDir === "rising" && r.sampleSize >= 2)
      .sort((a, b) => b.trend - a.trend || b.power - a.power)
      .slice(0, 10);

    console.log(`[keywords] ${totalPosts} posts -> ${keywords.length} keywords, ${trendingKeywords.length} trending`);

    return res.json({
      keywords,
      trendingKeywords,
      totalPosts,
      totalTopPosts: topN,
      debug: `Analysed ${totalPosts} posts · ${topN} top posts · ${keywords.length} keywords`,
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