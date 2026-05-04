import express from "express";
import {
  fetchFollowers,
  fetchFollowing,
  fetchPostsByUserId,
  fetchTweetById,
  fetchUserMentions,
  getUserIdByUsername,
  lookupXInput,
  searchRecentTweets,
} from "../xApi.js";

const router = express.Router();

function cleanUsername(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function extractTweetId(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/status\/(\d+)/i);
  return match ? match[1] : raw;
}

function normalizeLimit(value, fallback = 10) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(10, Math.trunc(n)));
}

function errorStatus(err) {
  if (err?.status === 429 || /rate limit/i.test(err?.message || "")) return 429;
  if (err?.status === 404 || /not found|no .* found/i.test(err?.message || "")) return 404;
  if (err?.status === 401 || err?.status === 403) return err.status;
  if (/required|valid|please enter/i.test(err?.message || "")) return 400;
  return 500;
}

function sendError(res, err, label = "X lookup failed") {
  const status = errorStatus(err);
  const payload = {
    success: false,
    error: err?.message || label,
  };
  if (process.env.NODE_ENV !== "production") {
    if (err?.body) payload.body = err.body;
    if (err?.attempts) payload.attempts = err.attempts;
  }
  return res.status(status).json(payload);
}

router.get("/health", (_req, res) => {
  res.json({ success: true, route: "x", ok: true });
});

// Backward-compatible endpoint used by the older username-only lookup.
router.get("/fetch/:username", async (req, res) => {
  try {
    const username = cleanUsername(req.params.username);
    const limit = normalizeLimit(req.query.limit, 10);
    const result = await lookupXInput(`@${username}`, limit);
    const user = result.results.userLookup;
    const posts = result.results.userTweets || [];

    return res.json({
      success: true,
      username: user?.username || username,
      name: user?.name || username,
      userId: user?.id || username,
      user,
      posts,
      results: result.results,
      credits_remaining: result.credits_remaining,
    });
  } catch (err) {
    console.error("[X /fetch]", err);
    return sendError(res, err, "X account lookup failed");
  }
});

// New single-bar endpoint. Body can be either:
// { q: "@openai", limit: 10 }
// { query: "AI agents", limit: 10 }
// { inputs: { q: "https://x.com/user/status/123" }, limit: 10 }
router.post("/search", async (req, res) => {
  try {
    const { options = {}, inputs = {}, limit: rawLimit } = req.body || {};
    const limit = normalizeLimit(rawLimit, 10);
    const q = req.body?.q ?? req.body?.query ?? inputs.q;
    const paginationToken = req.body?.pagination_token ?? req.body?.next_token ?? inputs.pagination_token ?? null;

    // Preferred: one-bar behavior.
    const noOptionsSelected = !options || Object.keys(options).length === 0 || Object.values(options).every((v) => !v);
    if (q && noOptionsSelected) {
      const result = await lookupXInput(q, limit, { paginationToken });
      return res.json(result);
    }

    // Backward-compatible advanced-option behavior for the current UI.
    const tasks = [];
    const labels = [];
    const results = {};
    const errors = [];
    let credits_remaining = null;

    const profileUsername = cleanUsername(inputs.username);
    const tweetsUsername = cleanUsername(inputs.tweetsUsername || inputs.username);

    if (options.userLookup && profileUsername) {
      labels.push("userLookup");
      tasks.push(getUserIdByUsername(profileUsername));
    }

    if (options.followers && profileUsername) {
      labels.push("followers");
      tasks.push(getUserIdByUsername(profileUsername).then((u) => fetchFollowers(u.id, limit)));
    }

    if (options.following && profileUsername) {
      labels.push("following");
      tasks.push(getUserIdByUsername(profileUsername).then((u) => fetchFollowing(u.id, limit)));
    }

    if (options.userTweets && tweetsUsername) {
      labels.push("userTweets");
      tasks.push(getUserIdByUsername(tweetsUsername).then((u) => fetchPostsByUserId(u.id, limit, u.username)));
    }

    if (options.userMentions && tweetsUsername) {
      labels.push("userMentions");
      tasks.push(getUserIdByUsername(tweetsUsername).then((u) => fetchUserMentions(u.id, limit)));
    }

    if (options.tweetLookup && inputs.tweetUrl) {
      labels.push("tweetLookup");
      tasks.push(fetchTweetById(extractTweetId(inputs.tweetUrl)));
    }

    if (options.searchTweets && inputs.searchQuery) {
      labels.push("searchTweets");
      tasks.push(searchRecentTweets(inputs.searchQuery, limit, paginationToken));
    }

    if (!tasks.length && q) {
      const result = await lookupXInput(q, limit, { paginationToken });
      return res.json(result);
    }

    if (!tasks.length) {
      return res.status(400).json({ success: false, error: "No X search input provided." });
    }

    const settled = await Promise.allSettled(tasks);
    settled.forEach((settledResult, i) => {
      const label = labels[i];
      if (settledResult.status === "fulfilled") {
        const value = settledResult.value;
        if (label === "userTweets" && value && Array.isArray(value.tweets)) {
          results.userTweets = value.tweets;
          if (value.credits_remaining != null) credits_remaining = value.credits_remaining;
          return;
        }
        results[label] = value;
        if (value?.credits_remaining != null) credits_remaining = value.credits_remaining;
      } else {
        errors.push({ endpoint: label, error: settledResult.reason?.message || String(settledResult.reason) });
      }
    });

    return res.json({ success: true, platform: "x", results, errors, credits_remaining });
  } catch (err) {
    console.error("[X /search]", err);
    return sendError(res, err, "X search failed");
  }
});

// Optional alias for the big competitor lookup bar if you want it to call X first.
router.post("/lookup", async (req, res) => {
  try {
    const q = req.body?.q ?? req.body?.query ?? req.body?.inputs?.q;
    const limit = normalizeLimit(req.body?.limit, 10);
    const paginationToken = req.body?.pagination_token ?? req.body?.next_token ?? null;
    const result = await lookupXInput(q, limit, { paginationToken });
    return res.json(result);
  } catch (err) {
    console.error("[X /lookup]", err);
    return sendError(res, err, "X lookup failed");
  }
});

export default router;
