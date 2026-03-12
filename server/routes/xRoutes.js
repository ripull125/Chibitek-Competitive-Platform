import { Router } from 'express';
import { getUserIdByUsername, fetchPostsByUserId, fetchUserMentions, fetchFollowers, fetchFollowing, fetchTweetById, searchRecentTweets } from '../xApi.js';
import { normalizeXPost } from '../utils/normalizeXPost.js';
import { supabase } from '../supabase.js';
import { requireUserId } from './helpers.js';

const router = Router();

router.get("/api/x/fetch/:username", async (req, res) => {
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

router.post('/api/x/search', async (req, res) => {
  try {
    const { options = {}, inputs = {}, limit: rawLimit } = req.body;
    const limit = Math.min(100, Math.max(5, Number(rawLimit) || 10));
    const tasks = [];
    const labels = [];

    const cleanUsername = (u) => String(u || '').trim().replace(/^@/, '');
    const extractTweetId = (urlOrId) => {
      const m = String(urlOrId || '').match(/status\/(\d+)/);
      return m ? m[1] : String(urlOrId || '').trim();
    };

    const profileUsername = cleanUsername(inputs.username);
    const tweetsUsername = cleanUsername(inputs.tweetsUsername || inputs.username);

    if (options.userLookup && profileUsername) {
      labels.push('userLookup');
      tasks.push(getUserIdByUsername(profileUsername));
    }

    if (options.followers && profileUsername) {
      labels.push('followers');
      tasks.push(
        getUserIdByUsername(profileUsername).then(u => fetchFollowers(u.id, limit))
      );
    }

    if (options.following && profileUsername) {
      labels.push('following');
      tasks.push(
        getUserIdByUsername(profileUsername).then(u => fetchFollowing(u.id, limit))
      );
    }

    if (options.userTweets && tweetsUsername) {
      labels.push('userTweets');
      tasks.push(
        getUserIdByUsername(tweetsUsername).then(u => fetchPostsByUserId(u.id, limit))
      );
    }

    if (options.userMentions && tweetsUsername) {
      labels.push('userMentions');
      tasks.push(
        getUserIdByUsername(tweetsUsername).then(u => fetchUserMentions(u.id, limit))
      );
    }

    if (options.tweetLookup && inputs.tweetUrl) {
      labels.push('tweetLookup');
      const tweetId = extractTweetId(inputs.tweetUrl);
      tasks.push(fetchTweetById(tweetId));
    }

    if (options.searchTweets && inputs.searchQuery) {
      labels.push('searchTweets');
      tasks.push(searchRecentTweets(inputs.searchQuery.trim(), limit));
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

router.post("/api/x/fetch-and-save/:username", async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const username = req.params.username;

    const platformUserId = await getUserIdByUsername(username);

    const PLATFORM_X = 1;

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

export default router;
