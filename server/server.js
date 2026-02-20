import { getUserIdByUsername, fetchPostsByUserId, fetchUserMentions, fetchFollowers, fetchFollowing, fetchTweetById, searchRecentTweets } from "./xApi.js";
import { normalizeXPost } from "./utils/normalizeXPost.js";
import { scrapeCreators } from "./utils/scrapeCreators.js";
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

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors });
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
