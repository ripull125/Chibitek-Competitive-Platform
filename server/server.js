import { getUserIdByUsername, fetchPostsByUserId, fetchUserMentions, fetchFollowers, fetchFollowing, fetchTweetById, searchRecentTweets } from "./xApi.js";
import { normalizeXPost } from "./utils/normalizeXPost.js";
import { scrapeCreators } from "./utils/scrapeCreators.js";
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import { supabase } from './supabase.js';
import { categorizeTone } from './tone.js';
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));

const { GITHUB_TOKEN, OPENAI_API_KEY, OPENAI_BASE_URL, CHAT_MODEL, LLM_PROVIDER, CHAT_DEBUG } = process.env;
const githubAiEndpoint = 'https://models.github.ai/inference';
const chatModel = CHAT_MODEL || 'openai/gpt-5-nano';
const provider = String(LLM_PROVIDER || 'auto').toLowerCase();
const usingGithub = provider === 'github' || (provider === 'auto' && !!GITHUB_TOKEN);
const chatApiKey = usingGithub ? GITHUB_TOKEN : OPENAI_API_KEY;
const chatBaseUrl = usingGithub
  ? githubAiEndpoint
  : (OPENAI_BASE_URL || 'https://api.openai.com/v1');
const openai = new OpenAI({ baseURL: chatBaseUrl, apiKey: chatApiKey });

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

async function fetchLatestPostsContext(userId) {
  try {
    let query = supabase
      .from('posts')
      .select('platform_id, competitor_id, platform_post_id, url, content, created_at, published_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Failed to load posts for LLM context:', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to load posts for LLM context:', err);
    return [];
  }
}

app.get("/api/x/fetch/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const user = await getUserIdByUsername(username);
    const posts = await fetchPostsByUserId(user.id, 5);

    res.json({ success: true, username: user.username || username, userId: user.id, posts });
  } catch (err) {
    console.error("X fetch error:", err.message);

    if (String(err.message).includes("Rate limit")) {
      return res.status(429).json({ error: err.message });
    }

    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/x/search
 * Body: { options: { userLookup, followers, following, userTweets, userMentions, tweetLookup, searchTweets },
 *         inputs: { username, tweetsUsername, tweetUrl, searchQuery } }
 * Calls the relevant X API v2 endpoints in parallel and returns combined results.
 */
app.post('/api/x/search', async (req, res) => {
  try {
    const { options = {}, inputs = {} } = req.body;
    const tasks = [];
    const labels = [];

    // Resolve user IDs where needed
    const cleanUsername = (u) => String(u || '').trim().replace(/^@/, '');
    const extractTweetId = (urlOrId) => {
      const m = String(urlOrId || '').match(/status\/(\d+)/);
      return m ? m[1] : String(urlOrId || '').trim();
    };

    // Profile-related (need username → user object)
    const profileUsername = cleanUsername(inputs.username);
    const tweetsUsername = cleanUsername(inputs.tweetsUsername || inputs.username);

    // User Lookup
    if (options.userLookup && profileUsername) {
      labels.push('userLookup');
      tasks.push(getUserIdByUsername(profileUsername));
    }

    // Followers
    if (options.followers && profileUsername) {
      labels.push('followers');
      tasks.push(
        getUserIdByUsername(profileUsername).then(u => fetchFollowers(u.id, 20))
      );
    }

    // Following
    if (options.following && profileUsername) {
      labels.push('following');
      tasks.push(
        getUserIdByUsername(profileUsername).then(u => fetchFollowing(u.id, 20))
      );
    }

    // User Tweets
    if (options.userTweets && tweetsUsername) {
      labels.push('userTweets');
      tasks.push(
        getUserIdByUsername(tweetsUsername).then(u => fetchPostsByUserId(u.id, 10))
      );
    }

    // User Mentions
    if (options.userMentions && tweetsUsername) {
      labels.push('userMentions');
      tasks.push(
        getUserIdByUsername(tweetsUsername).then(u => fetchUserMentions(u.id, 10))
      );
    }

    // Single Tweet Lookup
    if (options.tweetLookup && inputs.tweetUrl) {
      labels.push('tweetLookup');
      const tweetId = extractTweetId(inputs.tweetUrl);
      tasks.push(fetchTweetById(tweetId));
    }

    // Search
    if (options.searchTweets && inputs.searchQuery) {
      labels.push('searchTweets');
      tasks.push(searchRecentTweets(inputs.searchQuery.trim(), 10));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No X options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors });
  } catch (err) {
    console.error('X search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

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
  if (!chatApiKey) {
    const missing = usingGithub ? 'GITHUB_TOKEN' : 'OPENAI_API_KEY';
    console.error(`Missing chat API key on server (${missing}).`);
    return res.status(500).json({
      error: `Chat API key is not configured on the server (${missing}).`,
    });
  }

  try {
    const { messages = [], attachments = [] } = req.body || {};
    const userId = getUserIdFromRequest(req);
    const latestPosts = await fetchLatestPostsContext(userId);

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

    const postsContext = latestPosts.length
      ? [
          'Latest posts from Supabase (most recent first):',
          JSON.stringify(
            latestPosts.slice(0, 20).map((post) => ({
              platform_id: post.platform_id,
              competitor_id: post.competitor_id,
              platform_post_id: post.platform_post_id,
              url: post.url,
              content: String(post.content || '').slice(0, 400),
              created_at: post.created_at,
              published_at: post.published_at,
            })),
            null,
            2
          ),
        ].join('\n')
      : null;

    const systemMessages = [
      {
        role: 'system',
        content:
          'You are ChibitekAI, a concise, helpful assistant for competitive intelligence. Use any provided attachment context to strengthen answers.',
      },
    ];
    if (postsContext) {
      systemMessages.push({
        role: 'system',
        content: postsContext,
      });
    }

    const response = await openai.chat.completions.create({
      model: chatModel,
      messages: [...systemMessages, ...userMessages],
    });

    const reply = response.choices?.[0]?.message?.content || 'No response from model.';
    return res.json({ reply });
  } catch (error) {
    const providerLabel = usingGithub ? 'github' : 'openai';
    const details = {
      message: error?.message,
      status: error?.status,
      name: error?.name,
      type: error?.type,
      code: error?.code,
      provider: providerLabel,
      baseUrl: chatBaseUrl,
      model: chatModel,
    };
    console.error('Chat completion error:', details);
    if (CHAT_DEBUG === 'true') {
      return res.status(500).json({
        error: 'Chat request failed.',
        details,
      });
    }
    const message = error?.message || 'Chat request failed.';
    const status = error?.status ? ` status=${error.status}` : '';
    return res.status(500).json({
      error: `${message} (provider=${providerLabel}${status})`,
    });
  }
});

app.get('/api/chat/health', (req, res) => {
  const providerLabel = usingGithub ? 'github' : 'openai';
  const keyPresent = Boolean(chatApiKey);
  res.json({
    ok: true,
    provider: providerLabel,
    baseUrl: chatBaseUrl,
    model: chatModel,
    keyPresent,
  });
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
  } = req.body;

  if (!platform_id || !platform_user_id || !platform_post_id || !user_id) {
    return res.status(400).json({ error: "Missing required fields" });
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
    console.error("Save post failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/posts", async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select(`
  id,
  platform_id,
  content,
  published_at,
  competitors(display_name),
  post_metrics(likes, shares, comments),
  post_details_platform(extra_json)
`)
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

// ─── LinkedIn ────────────────────────────────────────────────────────────────

const PLATFORM_LINKEDIN = 5; // platform id for linkedin (will be upserted)

// Ensure the LinkedIn platform row exists
async function ensureLinkedinPlatform() {
  const { data } = await supabase
    .from('platforms')
    .select('id')
    .eq('name', 'LinkedIn')
    .maybeSingle();
  if (data) return data.id;

  const { data: created, error } = await supabase
    .from('platforms')
    .insert({ name: 'LinkedIn', api_base_url: 'https://api.scrapecreators.com' })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

/**
 * POST /api/linkedin/search
 * Body: { options: { profile, company, post }, inputs: { profile, company, post } }
 * Calls the relevant Scrape Creators endpoints in parallel and returns combined results.
 */
app.post('/api/linkedin/search', async (req, res) => {
  try {
    const { options = {}, inputs = {} } = req.body;

    const tasks = [];
    const labels = [];

    if (options.profile && inputs.profile) {
      labels.push('profile');
      tasks.push(scrapeCreators('/v1/linkedin/profile', { url: inputs.profile }));
    }
    if (options.company && inputs.company) {
      labels.push('company');
      tasks.push(scrapeCreators('/v1/linkedin/company', { url: inputs.company }));
    }
    if (options.post && inputs.post) {
      labels.push('post');
      tasks.push(scrapeCreators('/v1/linkedin/post', { url: inputs.post }));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No LinkedIn options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];
    let credits_remaining = null;

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
        if (s.value?.credits_remaining != null) {
          credits_remaining = s.value.credits_remaining;
        }
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors, credits_remaining });
  } catch (err) {
    console.error('LinkedIn search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/linkedin/save
 * Body: { type: "profile"|"company"|"post", data: <raw api data>, user_id: string }
 * Saves data across competitors, posts, post_metrics, post_details_platform tables.
 */
app.post('/api/linkedin/save', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { type, data } = req.body;
    if (!type || !data) {
      return res.status(400).json({ error: 'Missing type or data.' });
    }

    const platformId = await ensureLinkedinPlatform();

    if (type === 'profile') {
      // Save person profile as a competitor + their recent posts
      const profileUrl = data.linkedInUrl || data.url || '';
      const displayName = data.name || 'Unknown';
      const platformUserId = profileUrl || displayName;

      // Upsert competitor
      let competitor;
      const { data: existing } = await supabase
        .from('competitors')
        .select('*')
        .eq('platform_id', platformId)
        .eq('platform_user_id', platformUserId)
        .maybeSingle();

      if (existing) {
        competitor = existing;
        await supabase.from('competitors').update({
          display_name: displayName,
          profile_url: profileUrl,
        }).eq('id', existing.id);
      } else {
        const { data: created, error } = await supabase
          .from('competitors')
          .insert({
            platform_id: platformId,
            platform_user_id: platformUserId,
            display_name: displayName,
            profile_url: profileUrl,
          })
          .select()
          .single();
        if (error) throw error;
        competitor = created;
      }

      // Save profile details as a "post" (type=profile_snapshot)
      const snapshotId = `profile_${platformUserId}_${Date.now()}`;
      const { data: post, error: postErr } = await supabase
        .from('posts')
        .insert({
          platform_id: platformId,
          competitor_id: competitor.id,
          platform_post_id: snapshotId,
          url: profileUrl,
          content: data.about || '',
          published_at: new Date(),
          user_id: userId,
        })
        .select()
        .single();
      if (postErr) throw postErr;

      await supabase.from('post_metrics').insert({
        post_id: post.id,
        snapshot_at: new Date(),
        likes: data.followers || 0,
        shares: 0,
        comments: 0,
        other_json: { connections: data.connections },
      });

      await supabase.from('post_details_platform').insert({
        post_id: post.id,
        extra_json: {
          type: 'linkedin_profile',
          name: data.name,
          image: data.image,
          location: data.location,
          followers: data.followers,
          connections: data.connections,
          about: data.about,
          experience: data.experience,
          education: data.education,
          articles: data.articles,
        },
      });

      // Also save each recent post from activity if present
      const activityPosts = data.activity || data.recentPosts || [];
      for (const act of activityPosts.slice(0, 10)) {
        const actUrl = act.link || act.url || '';
        const actId = actUrl || `activity_${Date.now()}_${Math.random()}`;

        const { data: existingAct } = await supabase
          .from('posts')
          .select('id')
          .eq('user_id', userId)
          .eq('platform_id', platformId)
          .eq('platform_post_id', actId)
          .maybeSingle();

        if (!existingAct) {
          const { data: actPost, error: actErr } = await supabase
            .from('posts')
            .insert({
              platform_id: platformId,
              competitor_id: competitor.id,
              platform_post_id: actId,
              url: actUrl,
              content: act.title || act.text || '',
              published_at: act.datePublished || new Date(),
              user_id: userId,
            })
            .select()
            .single();

          if (!actErr && actPost) {
            await supabase.from('post_details_platform').insert({
              post_id: actPost.id,
              extra_json: {
                type: 'linkedin_activity',
                activityType: act.activityType,
                image: act.image,
                link: act.link,
              },
            });
          }
        }
      }

      return res.json({ saved: true, competitor_id: competitor.id, post_id: post.id });
    }

    if (type === 'company') {
      const companyUrl = data.linkedInUrl || data.url || '';
      const displayName = data.name || 'Unknown Company';
      const platformUserId = data.id || companyUrl || displayName;

      let competitor;
      const { data: existing } = await supabase
        .from('competitors')
        .select('*')
        .eq('platform_id', platformId)
        .eq('platform_user_id', String(platformUserId))
        .maybeSingle();

      if (existing) {
        competitor = existing;
        await supabase.from('competitors').update({
          display_name: displayName,
          profile_url: companyUrl,
        }).eq('id', existing.id);
      } else {
        const { data: created, error } = await supabase
          .from('competitors')
          .insert({
            platform_id: platformId,
            platform_user_id: String(platformUserId),
            display_name: displayName,
            profile_url: companyUrl,
          })
          .select()
          .single();
        if (error) throw error;
        competitor = created;
      }

      // Save company page as a snapshot post
      const snapshotId = `company_${platformUserId}_${Date.now()}`;
      const { data: post, error: postErr } = await supabase
        .from('posts')
        .insert({
          platform_id: platformId,
          competitor_id: competitor.id,
          platform_post_id: snapshotId,
          url: companyUrl,
          content: data.description || '',
          published_at: new Date(),
          user_id: userId,
        })
        .select()
        .single();
      if (postErr) throw postErr;

      await supabase.from('post_metrics').insert({
        post_id: post.id,
        snapshot_at: new Date(),
        likes: data.employeeCount || 0,
        shares: 0,
        comments: 0,
        other_json: { followers: data.followers },
      });

      await supabase.from('post_details_platform').insert({
        post_id: post.id,
        extra_json: {
          type: 'linkedin_company',
          name: data.name,
          logo: data.logo,
          coverImage: data.coverImage,
          slogan: data.slogan,
          industry: data.industry,
          size: data.size,
          founded: data.founded,
          headquarters: data.headquarters,
          companyType: data.type,
          specialties: data.specialties,
          website: data.website,
          employeeCount: data.employeeCount,
          funding: data.funding,
        },
      });

      // Save company posts
      const compPosts = data.posts || [];
      for (const cp of compPosts.slice(0, 10)) {
        const cpUrl = cp.url || '';
        const cpId = cpUrl || `comppost_${Date.now()}_${Math.random()}`;

        const { data: existingCp } = await supabase
          .from('posts')
          .select('id')
          .eq('user_id', userId)
          .eq('platform_id', platformId)
          .eq('platform_post_id', cpId)
          .maybeSingle();

        if (!existingCp) {
          const { data: cpPost, error: cpErr } = await supabase
            .from('posts')
            .insert({
              platform_id: platformId,
              competitor_id: competitor.id,
              platform_post_id: cpId,
              url: cpUrl,
              content: cp.text || '',
              published_at: cp.datePublished || new Date(),
              user_id: userId,
            })
            .select()
            .single();

          if (!cpErr && cpPost) {
            await supabase.from('post_details_platform').insert({
              post_id: cpPost.id,
              extra_json: {
                type: 'linkedin_company_post',
                image: cp.image,
              },
            });
          }
        }
      }

      return res.json({ saved: true, competitor_id: competitor.id, post_id: post.id });
    }

    if (type === 'post') {
      const authorName = data.author?.name || 'Unknown';
      const authorUrl = data.author?.url || '';
      const platformUserId = authorUrl || authorName;
      const postUrl = data.url || '';

      let competitor;
      const { data: existing } = await supabase
        .from('competitors')
        .select('*')
        .eq('platform_id', platformId)
        .eq('platform_user_id', platformUserId)
        .maybeSingle();

      if (existing) {
        competitor = existing;
      } else {
        const { data: created, error } = await supabase
          .from('competitors')
          .insert({
            platform_id: platformId,
            platform_user_id: platformUserId,
            display_name: authorName,
            profile_url: authorUrl,
          })
          .select()
          .single();
        if (error) throw error;
        competitor = created;
      }

      // Save the post
      const postPlatformId = postUrl || `post_${Date.now()}`;
      const { data: existingPost } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', userId)
        .eq('platform_id', platformId)
        .eq('platform_post_id', postPlatformId)
        .maybeSingle();

      let post;
      if (existingPost) {
        const { data: updated, error: upErr } = await supabase
          .from('posts')
          .update({
            content: data.description || data.headline || '',
            published_at: data.datePublished || new Date(),
          })
          .eq('id', existingPost.id)
          .select()
          .single();
        if (upErr) throw upErr;
        post = updated;
      } else {
        const { data: created, error: crErr } = await supabase
          .from('posts')
          .insert({
            platform_id: platformId,
            competitor_id: competitor.id,
            platform_post_id: postPlatformId,
            url: postUrl,
            content: data.description || data.headline || '',
            published_at: data.datePublished || new Date(),
            user_id: userId,
          })
          .select()
          .single();
        if (crErr) throw crErr;
        post = created;
      }

      await supabase.from('post_metrics').insert({
        post_id: post.id,
        snapshot_at: new Date(),
        likes: data.likeCount || 0,
        shares: 0,
        comments: data.commentCount || 0,
      });

      await supabase.from('post_details_platform').insert({
        post_id: post.id,
        extra_json: {
          type: 'linkedin_post',
          title: data.name,
          headline: data.headline,
          author: data.author,
          commentCount: data.commentCount,
          likeCount: data.likeCount,
          topComments: (data.comments || []).slice(0, 5),
        },
      });

      return res.json({ saved: true, competitor_id: competitor.id, post_id: post.id });
    }

    return res.status(400).json({ error: `Unknown save type: ${type}` });
  } catch (err) {
    console.error('LinkedIn save error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── End LinkedIn ────────────────────────────────────────────────────────────

// ─── Instagram ───────────────────────────────────────────────────────────────

/**
 * Helper – extract an Instagram shortcode from a URL or raw shortcode.
 */
function extractIgShortcode(input) {
  if (!input) return null;
  const trimmed = input.trim();
  // URL like https://www.instagram.com/p/CODE/ or /reel/CODE/
  const m = trimmed.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  // Already a raw shortcode (11-char alphanumeric)
  if (/^[A-Za-z0-9_-]{6,}$/.test(trimmed)) return trimmed;
  return trimmed; // pass through, let API decide
}

function extractIgUsername(input) {
  if (!input) return '';
  let u = input.trim().replace(/^@/, '');
  // URL like instagram.com/username
  const m = u.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (m) u = m[1];
  return u;
}

/**
 * POST /api/instagram/search
 * Body: { options: { profile, userPosts, singlePost, postComments,
 *                     reelsSearch, userReels, highlightDetail },
 *         inputs: { username, userPostsUsername, postUrl, reelsSearchTerm,
 *                   userReelsUsername, highlightUrl } }
 *
 * Scrape Creators param mapping (discovered via testing):
 *   /v1/instagram/profile        → { handle }
 *   /v1/instagram/user/posts     → { handle }
 *   /v1/instagram/post           → { url }   (full IG post URL)
 *   /v1/instagram/post/comments  → { url }   (full IG post URL)
 *   /v1/instagram/reels/search   → { query }
 *   /v1/instagram/user/reels     → { handle }
 *   /v1/instagram/user/highlights→ { handle }
 */
app.post('/api/instagram/search', async (req, res) => {
  try {
    const { options = {}, inputs = {} } = req.body;
    const tasks = [];
    const labels = [];

    // ── Profile & Account ────────────────────────────────────────────────
    const handle = extractIgUsername(inputs.username);

    if (options.profile && handle) {
      labels.push('profile');
      tasks.push(scrapeCreators('/v1/instagram/profile', { handle }));
    }

    // ── Posts & Content ──────────────────────────────────────────────────
    const postsHandle = extractIgUsername(inputs.userPostsUsername);
    if (options.userPosts && postsHandle) {
      labels.push('userPosts');
      tasks.push(scrapeCreators('/v1/instagram/user/posts', { handle: postsHandle }));
    }

    // For single post & comments the API expects the full post URL
    const postUrl = inputs.postUrl?.trim();
    const shortcode = extractIgShortcode(postUrl);
    // Build a canonical URL so the API always receives a full URL
    const canonicalPostUrl = shortcode
      ? (postUrl?.startsWith('http') ? postUrl : `https://www.instagram.com/p/${shortcode}/`)
      : null;

    if (options.singlePost && canonicalPostUrl) {
      labels.push('singlePost');
      tasks.push(scrapeCreators('/v1/instagram/post', { url: canonicalPostUrl }));
    }
    if (options.postComments && canonicalPostUrl) {
      labels.push('postComments');
      tasks.push(scrapeCreators('/v1/instagram/post/comments', { url: canonicalPostUrl }));
    }

    // ── Reels ────────────────────────────────────────────────────────────
    if (options.reelsSearch && inputs.reelsSearchTerm?.trim()) {
      labels.push('reelsSearch');
      tasks.push(scrapeCreators('/v1/instagram/reels/search', { query: inputs.reelsSearchTerm.trim() }));
    }

    const reelsHandle = extractIgUsername(inputs.userReelsUsername);
    if (options.userReels && reelsHandle) {
      labels.push('userReels');
      tasks.push(scrapeCreators('/v1/instagram/user/reels', { handle: reelsHandle }));
    }

    // ── Highlights ───────────────────────────────────────────────────────
    const highlightHandle = extractIgUsername(inputs.highlightUrl);
    if (options.highlightDetail && highlightHandle) {
      labels.push('highlightDetail');
      tasks.push(scrapeCreators('/v1/instagram/user/highlights', { handle: highlightHandle }));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No Instagram options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];
    let credits_remaining = null;

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
        if (s.value?.credits_remaining != null) {
          credits_remaining = s.value.credits_remaining;
        }
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors, credits_remaining });
  } catch (err) {
    console.error('Instagram search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── End Instagram ───────────────────────────────────────────────────────────

// ─── TikTok ──────────────────────────────────────────────────────────────────

/**
 * Extract a clean TikTok username from various input formats:
 *   @username, username, https://tiktok.com/@username, etc.
 */
function extractTkUsername(input) {
  if (!input) return '';
  const trimmed = String(input).trim();
  // URL: https://www.tiktok.com/@username/...
  try {
    const url = new URL(trimmed);
    const m = url.pathname.match(/\/@?([\w.]+)/);
    if (m) return m[1];
  } catch { /* not a URL */ }
  // @username or plain username
  return trimmed.replace(/^@/, '');
}

/**
 * POST /api/tiktok/search
 * Body: { options: { profile, following, followers, profileVideos,
 *                     transcript, comments,
 *                     searchUsers, searchHashtag, searchKeyword },
 *         inputs: { username, videosUsername, videoUrl,
 *                   userSearchQuery, hashtag, keyword } }
 *
 * Scrape Creators param mapping (discovered via testing):
 *   /v1/tiktok/profile          → { handle }
 *   /v1/tiktok/user/following   → { handle }
 *   /v1/tiktok/user/followers   → { handle }
 *   /v1/tiktok/video/transcript → { url }
 *   /v1/tiktok/video/comments   → { url }
 *   /v1/tiktok/search/users     → { query }
 *   /v1/tiktok/search/hashtag   → { hashtag }
 *   /v1/tiktok/search/keyword   → { query }
 */
app.post('/api/tiktok/search', async (req, res) => {
  try {
    const { options = {}, inputs = {} } = req.body;
    const tasks = [];
    const labels = [];

    // ── Profile & Account ──────────────────────────────────────────────
    const handle = extractTkUsername(inputs.username);

    if (options.profile && handle) {
      labels.push('profile');
      tasks.push(scrapeCreators('/v1/tiktok/profile', { handle }));
    }
    if (options.following && handle) {
      labels.push('following');
      tasks.push(scrapeCreators('/v1/tiktok/user/following', { handle }));
    }
    if (options.followers && handle) {
      labels.push('followers');
      tasks.push(scrapeCreators('/v1/tiktok/user/followers', { handle }));
    }

    // ── Videos & Content ───────────────────────────────────────────────
    // Profile videos come from the profile endpoint's itemList
    const videosHandle = extractTkUsername(inputs.videosUsername);
    if (options.profileVideos && videosHandle) {
      labels.push('profileVideos');
      tasks.push(scrapeCreators('/v1/tiktok/profile', { handle: videosHandle }));
    }

    const videoUrl = inputs.videoUrl?.trim();
    if (options.transcript && videoUrl) {
      labels.push('transcript');
      tasks.push(scrapeCreators('/v1/tiktok/video/transcript', { url: videoUrl }));
    }
    if (options.comments && videoUrl) {
      labels.push('comments');
      tasks.push(scrapeCreators('/v1/tiktok/video/comments', { url: videoUrl }));
    }

    // ── Search & Discovery ─────────────────────────────────────────────
    if (options.searchUsers && inputs.userSearchQuery?.trim()) {
      labels.push('searchUsers');
      tasks.push(scrapeCreators('/v1/tiktok/search/users', { query: inputs.userSearchQuery.trim() }));
    }
    if (options.searchHashtag && inputs.hashtag?.trim()) {
      labels.push('searchHashtag');
      const rawTag = inputs.hashtag.trim().replace(/^#/, '');
      tasks.push(scrapeCreators('/v1/tiktok/search/hashtag', { hashtag: rawTag }));
    }
    if (options.searchKeyword && inputs.keyword?.trim()) {
      labels.push('searchKeyword');
      tasks.push(scrapeCreators('/v1/tiktok/search/keyword', { query: inputs.keyword.trim() }));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No TikTok options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];
    let credits_remaining = null;

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
        // Capture latest credits_remaining from any successful response
        if (s.value?.credits_remaining != null) {
          credits_remaining = s.value.credits_remaining;
        }
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors, credits_remaining });
  } catch (err) {
    console.error('TikTok search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── End TikTok ──────────────────────────────────────────────────────────────

// ─── Reddit ──────────────────────────────────────────────────────────────────

/**
 * Normalize subreddit input: strips "r/", leading slashes, or full URLs.
 *   "r/reactjs"  →  "reactjs"
 *   "reactjs"    →  "reactjs"
 *   "https://www.reddit.com/r/reactjs/" → "reactjs"
 */
function extractSubreddit(input) {
  if (!input) return '';
  const trimmed = String(input).trim();
  try {
    const url = new URL(trimmed);
    const m = url.pathname.match(/\/r\/([\w]+)/);
    if (m) return m[1];
  } catch { /* not a URL */ }
  return trimmed.replace(/^\/?r\//, '');
}

/**
 * POST /api/reddit/search
 * Body: { options: { subredditDetails, subredditPosts, subredditSearch,
 *                     postComments, search, searchAds, getAd },
 *         inputs: { subreddit, subredditQuery, postUrl, searchQuery,
 *                   adSearchQuery, adUrl } }
 *
 * Scrape Creators param mapping (discovered via testing):
 *   /v1/reddit/subreddit/details  → { subreddit }
 *   /v1/reddit/subreddit          → { subreddit }          (posts)
 *   /v1/reddit/subreddit/search   → { subreddit, query }
 *   /v1/reddit/post/comments      → { url }
 *   /v1/reddit/search             → { query }
 *   /v1/reddit/ads/search         → { query }
 *   /v1/reddit/ad                 → { id }
 */
app.post('/api/reddit/search', async (req, res) => {
  try {
    const { options = {}, inputs = {} } = req.body;
    const tasks = [];
    const labels = [];

    // ── Subreddit ──────────────────────────────────────────────────────
    const subreddit = extractSubreddit(inputs.subreddit);

    if (options.subredditDetails && subreddit) {
      labels.push('subredditDetails');
      tasks.push(scrapeCreators('/v1/reddit/subreddit/details', { subreddit }));
    }
    if (options.subredditPosts && subreddit) {
      labels.push('subredditPosts');
      tasks.push(scrapeCreators('/v1/reddit/subreddit', { subreddit }));
    }
    if (options.subredditSearch && subreddit && inputs.subredditQuery?.trim()) {
      labels.push('subredditSearch');
      tasks.push(scrapeCreators('/v1/reddit/subreddit/search', { subreddit, query: inputs.subredditQuery.trim() }));
    }

    // ── Posts & Search ─────────────────────────────────────────────────
    if (options.postComments && inputs.postUrl?.trim()) {
      labels.push('postComments');
      tasks.push(scrapeCreators('/v1/reddit/post/comments', { url: inputs.postUrl.trim() }));
    }
    if (options.search && inputs.searchQuery?.trim()) {
      labels.push('search');
      tasks.push(scrapeCreators('/v1/reddit/search', { query: inputs.searchQuery.trim() }));
    }

    // ── Ads ────────────────────────────────────────────────────────────
    if (options.searchAds && inputs.adSearchQuery?.trim()) {
      labels.push('searchAds');
      tasks.push(scrapeCreators('/v1/reddit/ads/search', { query: inputs.adSearchQuery.trim() }));
    }
    if (options.getAd && inputs.adUrl?.trim()) {
      labels.push('getAd');
      // Accept a full ad ID or URL – extract just the ID if possible
      const adId = inputs.adUrl.trim();
      tasks.push(scrapeCreators('/v1/reddit/ad', { id: adId }));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No Reddit options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];
    let credits_remaining = null;

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
        if (s.value?.credits_remaining != null) {
          credits_remaining = s.value.credits_remaining;
        }
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors, credits_remaining });
  } catch (err) {
    console.error('Reddit search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── End Reddit ──────────────────────────────────────────────────────────────

// ─── YouTube Helpers ─────────────────────────────────────────────────────────

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function ytKey() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error('YOUTUBE_API_KEY not configured');
  return k;
}

async function ytFetch(path, params = {}) {
  const url = new URL(path, YT_BASE);
  url.searchParams.set('key', ytKey());
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString());
  const json = await resp.json();
  if (!resp.ok) {
    const msg = json?.error?.message || `YouTube API error ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

// Resolve @handle or channel URL → channelId
async function resolveChannelId(input) {
  const trimmed = String(input || '').trim();

  // Already a channel ID (UC...)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) return trimmed;

  // Handle @username format
  const handleMatch = trimmed.match(/@([\w.-]+)/);
  if (handleMatch) {
    const data = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: handleMatch[0], type: 'channel', maxResults: 1 });
    if (data.items?.[0]?.snippet?.channelId) return data.items[0].snippet.channelId;
    // Try channels endpoint with forHandle
    const chData = await ytFetch(`${YT_BASE}/channels`, { part: 'id', forHandle: handleMatch[1] });
    if (chData.items?.[0]?.id) return chData.items[0].id;
    throw new Error(`Could not find channel for ${handleMatch[0]}`);
  }

  // URL with /channel/UC...
  try {
    const url = new URL(trimmed);
    const chMatch = url.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (chMatch) return chMatch[1];

    // /c/name or /@name
    const nameMatch = url.pathname.match(/\/(c|user|@)([\w.-]+)/);
    if (nameMatch) {
      const handle = nameMatch[2];
      const chData = await ytFetch(`${YT_BASE}/channels`, { part: 'id', forHandle: handle });
      if (chData.items?.[0]?.id) return chData.items[0].id;
      // fallback to search
      const sData = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: handle, type: 'channel', maxResults: 1 });
      if (sData.items?.[0]?.snippet?.channelId) return sData.items[0].snippet.channelId;
      throw new Error(`Could not find channel for ${handle}`);
    }
  } catch (e) {
    if (e.message.includes('Could not find')) throw e;
    // not a URL, try as search term
  }

  // Fallback: search for it
  const sData = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: trimmed, type: 'channel', maxResults: 1 });
  if (sData.items?.[0]?.snippet?.channelId) return sData.items[0].snippet.channelId;
  throw new Error(`Could not find channel for "${trimmed}"`);
}

async function fetchChannelDetails(channelId) {
  const data = await ytFetch(`${YT_BASE}/channels`, {
    part: 'snippet,statistics,brandingSettings,contentDetails',
    id: channelId,
  });
  if (!data.items?.length) throw new Error('Channel not found');
  const ch = data.items[0];
  return {
    id: ch.id,
    title: ch.snippet.title,
    description: ch.snippet.description,
    customUrl: ch.snippet.customUrl,
    publishedAt: ch.snippet.publishedAt,
    thumbnails: ch.snippet.thumbnails,
    country: ch.snippet.country,
    subscribers: Number(ch.statistics.subscriberCount || 0),
    totalViews: Number(ch.statistics.viewCount || 0),
    videoCount: Number(ch.statistics.videoCount || 0),
    uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads,
    bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl || null,
    keywords: ch.brandingSettings?.channel?.keywords || '',
  };
}

async function fetchChannelVideos(channelId, maxResults = 10) {
  // First get channel details to find uploads playlist
  const ch = await fetchChannelDetails(channelId);
  if (!ch.uploadsPlaylistId) return [];

  const data = await ytFetch(`${YT_BASE}/playlistItems`, {
    part: 'snippet,contentDetails',
    playlistId: ch.uploadsPlaylistId,
    maxResults: Math.min(maxResults, 50),
  });
  const videoIds = (data.items || []).map(i => i.contentDetails.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  // Fetch full video details for metrics
  const vData = await ytFetch(`${YT_BASE}/videos`, {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });
  return (vData.items || []).map(v => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description?.slice(0, 300),
    publishedAt: v.snippet.publishedAt,
    channelTitle: v.snippet.channelTitle,
    thumbnails: v.snippet.thumbnails,
    duration: v.contentDetails?.duration,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
  }));
}

async function fetchVideoDetails(videoId) {
  const data = await ytFetch(`${YT_BASE}/videos`, {
    part: 'snippet,statistics,contentDetails,topicDetails',
    id: videoId,
  });
  if (!data.items?.length) throw new Error('Video not found');
  const v = data.items[0];
  return {
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description,
    publishedAt: v.snippet.publishedAt,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    thumbnails: v.snippet.thumbnails,
    tags: v.snippet.tags || [],
    categoryId: v.snippet.categoryId,
    duration: v.contentDetails?.duration,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
    topics: v.topicDetails?.topicCategories || [],
  };
}

async function fetchVideoComments(videoId, maxResults = 20) {
  const data = await ytFetch(`${YT_BASE}/commentThreads`, {
    part: 'snippet,replies',
    videoId: videoId,
    maxResults: Math.min(maxResults, 100),
    order: 'relevance',
    textFormat: 'plainText',
  });
  return (data.items || []).map(item => {
    const top = item.snippet.topLevelComment.snippet;
    const replies = (item.replies?.comments || []).map(r => ({
      author: r.snippet.authorDisplayName,
      authorImage: r.snippet.authorProfileImageUrl,
      text: r.snippet.textDisplay,
      likes: r.snippet.likeCount || 0,
      publishedAt: r.snippet.publishedAt,
    }));
    return {
      author: top.authorDisplayName,
      authorImage: top.authorProfileImageUrl,
      text: top.textDisplay,
      likes: top.likeCount || 0,
      publishedAt: top.publishedAt,
      replyCount: item.snippet.totalReplyCount || 0,
      replies,
    };
  });
}

async function searchYouTube(query, maxResults = 10) {
  const data = await ytFetch(`${YT_BASE}/search`, {
    part: 'snippet',
    q: query,
    maxResults: Math.min(maxResults, 50),
    type: 'video',
    order: 'relevance',
  });
  const videoIds = (data.items || []).map(i => i.id?.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  // Enrich with stats
  const vData = await ytFetch(`${YT_BASE}/videos`, {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });
  return (vData.items || []).map(v => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description?.slice(0, 300),
    publishedAt: v.snippet.publishedAt,
    channelTitle: v.snippet.channelTitle,
    channelId: v.snippet.channelId,
    thumbnails: v.snippet.thumbnails,
    duration: v.contentDetails?.duration,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
  }));
}

/**
 * POST /api/youtube/search
 * Body: { options: { channelDetails, channelVideos, videoDetails, transcript, videoComments, search },
 *         inputs: { channelUrl, videoUrl, searchQuery } }
 */
app.post('/api/youtube/search', async (req, res) => {
  try {
    const { options = {}, inputs = {} } = req.body;
    const tasks = [];
    const labels = [];

    // Channel-related
    if ((options.channelDetails || options.channelVideos) && inputs.channelUrl) {
      const channelIdPromise = resolveChannelId(inputs.channelUrl);

      if (options.channelDetails) {
        labels.push('channelDetails');
        tasks.push(channelIdPromise.then(id => fetchChannelDetails(id)));
      }
      if (options.channelVideos) {
        labels.push('channelVideos');
        tasks.push(channelIdPromise.then(id => fetchChannelVideos(id, 10)));
      }
    }

    // Video-related
    const videoId = inputs.videoUrl ? extractYouTubeVideoId(inputs.videoUrl) : null;

    if (options.videoDetails && videoId) {
      labels.push('videoDetails');
      tasks.push(fetchVideoDetails(videoId));
    }
    if (options.transcript && videoId) {
      labels.push('transcript');
      tasks.push((async () => {
        const pythonResult = await getTranscriptFromPython(videoId);
        if (pythonResult?.success && pythonResult.transcript) {
          return { available: true, language: pythonResult.language || 'en', text: pythonResult.transcript };
        }
        // Fallback: still return video metadata
        const details = await fetchVideoDetails(videoId);
        return { available: false, reason: pythonResult?.error || 'No transcript available', videoTitle: details.title };
      })());
    }
    if (options.videoComments && videoId) {
      labels.push('videoComments');
      tasks.push(fetchVideoComments(videoId, 20));
    }

    // Search
    if (options.search && inputs.searchQuery) {
      labels.push('search');
      tasks.push(searchYouTube(inputs.searchQuery.trim(), 10));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No YouTube options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors });
  } catch (err) {
    console.error('YouTube search error:', err);
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
