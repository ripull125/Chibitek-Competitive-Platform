import React, { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  LoadingOverlay,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tabs,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconBrandX,
  IconBrandYoutube,
  IconBrandLinkedin,
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandReddit,
  IconInfoCircle,
  IconSearch,
} from "@tabler/icons-react";
import { convertXInput } from "./DataConverter";
import { apiBase, apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";
import { getConnectedPlatforms } from "../utils/connectedPlatforms";
import { Checkbox, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";

// Extracted helper components
import { LabelWithInfo, SaveAllButton } from "./competitorLookup/SharedCards";
import { LinkedinResults } from "./competitorLookup/LinkedinCards";
import { XResults } from "./competitorLookup/XCards";
import { YoutubeResults, BackendBadge, Copyable } from "./competitorLookup/YoutubeCards";
import { InstagramResults } from "./competitorLookup/InstagramCards";
import { TiktokResults } from "./competitorLookup/TiktokCards";
import { RedditResults } from "./competitorLookup/RedditCards";
import { PostCard } from "./competitorLookup/PostCard";
import { loadLookupCache, saveLookupCache } from "./competitorLookup/competitorLookupUtils";

export default function CompetitorLookup() {
  const [connectedPlatforms, setConnectedPlatforms] = useState(getConnectedPlatforms);
  const { t } = useTranslation();

  const [cached] = useState(loadLookupCache);

  useEffect(() => {
    // Listen for toggle changes from ConnectedIntegrations (or other tabs)
    const handler = () => setConnectedPlatforms(getConnectedPlatforms());
    window.addEventListener("connectedPlatformsChanged", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("connectedPlatformsChanged", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "competitor-lookup" } })
    );
  }, []);

  const [username, setUsername] = useState(cached.username || "");
  const [youtubeUrl, setYoutubeUrl] = useState(cached.youtubeUrl || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(cached.result || null);
  const [convertedData, setConvertedData] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [linkedinOptions, setLinkedinOptions] = useState({
    profile: false,
    company: false,
    post: false,
  });
  const [linkedinInputs, setLinkedinInputs] = useState(
    cached.linkedinInputs || { profile: "", company: "", post: "" }
  );
  const [instagramOptions, setInstagramOptions] = useState({});
  const [instagramInputs, setInstagramInputs] = useState(cached.instagramInputs || {});
  const [tiktokOptions, setTiktokOptions] = useState({});
  const [tiktokInputs, setTiktokInputs] = useState(cached.tiktokInputs || {});
  const [xOptions, setXOptions] = useState({});
  const [xInputs, setXInputs] = useState(cached.xInputs || {});
  const [youtubeOptions, setYoutubeOptions] = useState({});
  const [youtubeInputs, setYoutubeInputs] = useState(cached.youtubeInputs || {});
  const [redditOptions, setRedditOptions] = useState({});
  const [redditInputs, setRedditInputs] = useState(cached.redditInputs || {});
  const [scrapePostCount, setScrapePostCount] = useState(10);
  const [linkedinResult, setLinkedinResult] = useState(cached.linkedinResult || null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState(null);
  const [xResult, setXResult] = useState(cached.xResult || null);
  const [xLoading, setXLoading] = useState(false);
  const [xError, setXError] = useState(null);
  const [youtubeResult, setYoutubeResult] = useState(cached.youtubeResult || null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState(null);
  const [instagramResult, setInstagramResult] = useState(cached.instagramResult || null);
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [instagramError, setInstagramError] = useState(null);
  const [tiktokResult, setTiktokResult] = useState(cached.tiktokResult || null);
  const [tiktokLoading, setTiktokLoading] = useState(false);
  const [tiktokError, setTiktokError] = useState(null);
  const [redditResult, setRedditResult] = useState(cached.redditResult || null);
  const [redditLoading, setRedditLoading] = useState(false);
  const [redditError, setRedditError] = useState(null);
  const [creditsRemaining, setCreditsRemaining] = useState(null);

  // Persist results + inputs to sessionStorage so they survive tab navigation
  useEffect(() => {
    saveLookupCache({
      result, linkedinResult, xResult, youtubeResult,
      instagramResult, tiktokResult, redditResult,
      username, youtubeUrl,
      linkedinInputs, instagramInputs, tiktokInputs,
      xInputs, youtubeInputs, redditInputs,
    });
  }, [
    result, linkedinResult, xResult, youtubeResult,
    instagramResult, tiktokResult, redditResult,
    username, youtubeUrl,
    linkedinInputs, instagramInputs, tiktokInputs,
    xInputs, youtubeInputs, redditInputs,
  ]);

  // Platform name → id mapping from server (e.g. { x: 1, instagram: 3, tiktok: 5, reddit: 10, youtube: 8 })
  const [platformIds, setPlatformIds] = useState({
    x: 1, instagram: 3, tiktok: 5, reddit: 6, youtube: 8, linkedin: 2,
  });

  useEffect(() => {
    fetch(apiUrl("/api/platforms"))
      .then(r => r.json())
      .then(data => { if (data.platforms) setPlatformIds(data.platforms); })
      .catch(() => { }); // fallback to defaults
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const backends = useMemo(() => {
    const bases = new Set();
    if (apiBase) bases.add(apiBase);
    if (import.meta.env.DEV) bases.add('http://localhost:8080');
    return Array.from(bases);
  }, []);

  async function tryFetch(usernameToFetch) {
    const trimmed = String(usernameToFetch || "").trim().replace(/^@/, "");
    if (!trimmed) throw new Error("Please enter a username.");
    const attempts = [];

    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}/api/x/fetch/${encodeURIComponent(trimmed)}`;
      try {
        const resp = await fetch(url, { method: "GET" });
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await resp.text();
          throw new Error(`Expected JSON from ${base}, got: ${text.slice(0, 300)}`);
        }
        const json = await resp.json();
        if (!resp.ok) {
          const msg = json?.error || `Request failed ${resp.status} ${resp.statusText || ""}`.trim();
          throw new Error(msg);
        }
        return { ...json, _usedBackend: base };
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }

    const notFoundAttempt = attempts.find(a => {
      const errorLower = a.error.toLowerCase();
      return (
        a.error.includes("404") ||
        errorLower.includes("not found") ||
        errorLower.includes("user does not exist") ||
        errorLower.includes("no user found")
      );
    });

    if (notFoundAttempt) {
      const err = new Error(
        `Username "@${trimmed}" not found. Please check the spelling and try again.`
      );
      err.type = "not_found";
      throw err;
    }

    const err = new Error(
      `Couldn't connect to the server. Please make sure it's running and try again.`
    );
    err.type = "backend_error";
    err.attempts = attempts;
    throw err;
  }

  async function tryFetchYouTube(youtubeUrlToFetch) {
    const trimmed = String(youtubeUrlToFetch || "").trim();
    if (!trimmed) throw new Error("Please enter a YouTube URL.");

    const attempts = [];

    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}/api/youtube/transcript?video=${encodeURIComponent(trimmed)}`;
      try {
        const resp = await fetch(url, { method: "GET" });
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await resp.text();
          throw new Error(`Expected JSON from ${base}, got: ${text.slice(0, 300)}`);
        }
        const json = await resp.json();
        if (!resp.ok) {
          const msg =
            json?.error ||
            `Request failed ${resp.status} ${resp.statusText || ""}`.trim();
          throw new Error(msg);
        }
        return { ...json, _usedBackend: base };
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }

    const err = new Error(
      `Couldn't connect to the server. Please make sure it's running and try again.`
    );
    err.type = "backend_error";
    err.attempts = attempts;
    throw err;
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError(null);
    setResult(null);
    setYoutubeResult(null);
    setConvertedData(null);
    const u = username.trim();
    if (!u) {
      setError("Please enter a username.");
      return;
    }
    setLoading(true);
    try {
      const data = await tryFetch(u);
      setResult(data);

      // Convert the data using DataConverter
      try {
        const converted = convertXInput(data);
        setConvertedData(converted);
        console.log('Converted data:', converted);

        // Save last 10 posts to localStorage
        const postsToSave = (data.posts || []).slice(0, 10).map((post, index) => {
          const metrics = post.public_metrics || {};
          const engagement =
            (metrics.like_count || 0) +
            (metrics.retweet_count || 0) +
            (metrics.reply_count || 0);
          return {
            id: post.id,
            username: data.username,
            content: post.text,
            engagement: engagement,
            likes: metrics.like_count || 0,
            shares: metrics.retweet_count || 0,
            comments: metrics.reply_count || 0,
            timestamp: post.created_at,
          };
        });

        // Get existing posts from localStorage and prepend new ones
        const storageKey = currentUserId
          ? `recentCompetitorPosts_${currentUserId}`
          : 'recentCompetitorPosts';
        const existingPosts = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const allPosts = [...postsToSave, ...existingPosts];
        // Keep only the last 10 overall
        const recentTen = allPosts.slice(0, 10);
        localStorage.setItem(storageKey, JSON.stringify(recentTen));

      } catch (conversionError) {
        console.error('Error converting data:', conversionError);
        setError(`Data fetched successfully but conversion failed: ${conversionError.message}`);
      }
    } catch (e) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitYouTube(e) {
    e?.preventDefault?.();
    setError(null);
    setResult(null);
    setYoutubeResult(null);
    setConvertedData(null);
    const u = youtubeUrl.trim();
    if (!u) {
      setError("Please enter a YouTube URL.");
      return;
    }
    setLoading(true);
    try {
      const data = await tryFetchYouTube(u);
      setYoutubeResult(data);
    } catch (e) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function tryPostJson(path, body) {
    const attempts = [];
    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}${path}`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await resp.text();
          throw new Error(`Expected JSON from ${base}, got: ${text.slice(0, 300)}`);
        }
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || `Request failed (${resp.status})`);
        return json;
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }
    const err = new Error(
      `Couldn't connect to the server. Please make sure it's running and try again.`
    );
    err.type = "backend_error";
    err.attempts = attempts;
    throw err;
  }

  async function handleLinkedinSubmit() {
    setLinkedinError(null);
    setLinkedinResult(null);

    // Validate that at least one option is selected with input
    const hasInput =
      (linkedinOptions.profile && linkedinInputs.profile?.trim()) ||
      (linkedinOptions.company && linkedinInputs.company?.trim()) ||
      (linkedinOptions.post && linkedinInputs.post?.trim());

    if (!hasInput) {
      setLinkedinError("Please select an option and provide the required input.");
      return;
    }

    setLinkedinLoading(true);
    try {
      const json = await tryPostJson("/api/linkedin/search", {
        options: linkedinOptions,
        inputs: linkedinInputs,
      });
      setLinkedinResult(json);
      // Show errors from individual endpoints if any
      if (json.errors?.length > 0 && !json.results?.profile && !json.results?.company && !json.results?.post) {
        setLinkedinError(`LinkedIn API errors: ${json.errors.map(e => `${e.endpoint}: ${e.error}`).join("; ")}`);
      }
      if (json.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setLinkedinError(e?.message || "Unknown error");
    } finally {
      setLinkedinLoading(false);
    }
  }

  async function handleLinkedinSave(type, data) {
    if (!currentUserId) {
      setLinkedinError("Please sign in to save data.");
      return;
    }
    return tryPostJson("/api/linkedin/save", { type, data, user_id: currentUserId });
  }

  async function handleXSubmit() {
    setXError(null);
    setXResult(null);

    const hasInput =
      ((xOptions.userLookup || xOptions.followers || xOptions.following) && xInputs.username?.trim()) ||
      ((xOptions.userTweets || xOptions.userMentions) && (xInputs.tweetsUsername?.trim() || xInputs.username?.trim())) ||
      (xOptions.tweetLookup && xInputs.tweetUrl?.trim()) ||
      (xOptions.searchTweets && xInputs.searchQuery?.trim());

    if (!hasInput) {
      setXError("Please select an option and provide the required input.");
      return;
    }

    setXLoading(true);
    try {
      const json = await tryPostJson("/api/x/search", {
        options: xOptions,
        inputs: xInputs,
        limit: scrapePostCount,
      });
      setXResult(json);
    } catch (e) {
      setXError(e?.message || "Unknown error");
    } finally {
      setXLoading(false);
    }
  }

  async function handleXSave(type, data) {
    if (!currentUserId) {
      setXError("Please sign in to save data.");
      return;
    }
    // Save posts via the existing /api/posts endpoint
    if (type === "tweet" && data) {
      const metrics = data.public_metrics || {};
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.x,
          platform_user_id: String(data.author_id || data._authorUsername || "unknown"),
          username: data._authorUsername || "",
          platform_post_id: String(data.id || Date.now()),
          content: data.text,
          published_at: data.created_at,
          likes: metrics.like_count ?? 0,
          shares: metrics.retweet_count ?? 0,
          comments: metrics.reply_count ?? 0,
          views: metrics.impression_count ?? 0,
          user_id: currentUserId,
          author_name: data._authorUsername || "",
          author_handle: data._authorUsername || "",
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  async function handleYoutubeSubmit() {
    setYoutubeError(null);
    setYoutubeResult(null);

    const hasInput =
      ((youtubeOptions.channelDetails || youtubeOptions.channelVideos) && youtubeInputs.channelUrl?.trim()) ||
      ((youtubeOptions.videoDetails) && youtubeInputs.videoUrl?.trim()) ||
      (youtubeOptions.search && youtubeInputs.searchQuery?.trim());

    if (!hasInput) {
      setYoutubeError("Please select an option and provide the required input.");
      return;
    }

    setYoutubeLoading(true);
    try {
      const json = await tryPostJson("/api/youtube/search", {
        options: youtubeOptions,
        inputs: youtubeInputs,
        limit: scrapePostCount,
      });
      setYoutubeResult(json);
    } catch (e) {
      setYoutubeError(e?.message || "Unknown error");
    } finally {
      setYoutubeLoading(false);
    }
  }

  async function handleYoutubeSave(type, data) {
    if (!currentUserId) {
      setYoutubeError("Please sign in to save data.");
      return;
    }
    // Save video as a post via /api/posts
    if (type === "video" && data) {
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.youtube,
          platform_user_id: String(data.channelId || data.channelTitle || "unknown"),
          username: data.channelTitle || "",
          platform_post_id: String(data.id || data.videoId || Date.now()),
          content: data.title + (data.description ? "\n\n" + data.description : ""),
          published_at: data.publishedAt,
          likes: data.likes ?? 0,
          shares: 0,
          comments: data.comments ?? 0,
          user_id: currentUserId,
          title: data.title || "",
          description: data.description || "",
          channelTitle: data.channelTitle || "",
          videoId: data.id || data.videoId || "",
          views: data.views ?? 0,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  async function handleInstagramSubmit() {
    setInstagramError(null);
    setInstagramResult(null);

    const hasInput =
      (instagramOptions.profile && instagramInputs.username?.trim()) ||
      (instagramOptions.userPosts && instagramInputs.userPostsUsername?.trim()) ||
      (instagramOptions.singlePost && instagramInputs.postUrl?.trim()) ||
      (instagramOptions.reelsSearch && instagramInputs.reelsSearchTerm?.trim()) ||
      (instagramOptions.userReels && instagramInputs.userReelsUsername?.trim()) ||
      (instagramOptions.highlightDetail && instagramInputs.highlightUrl?.trim());

    if (!hasInput) {
      setInstagramError("Please select an option and provide the required input.");
      return;
    }

    setInstagramLoading(true);
    try {
      const json = await tryPostJson("/api/instagram/search", {
        options: instagramOptions,
        inputs: instagramInputs,
        limit: scrapePostCount,
      });
      setInstagramResult(json);
      if (json.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setInstagramError(e?.message || "Unknown error");
    } finally {
      setInstagramLoading(false);
    }
  }

  async function handleInstagramSave(type, data) {
    if (!currentUserId) {
      setInstagramError("Please sign in to save data.");
      return;
    }
    if (type === "post" && data) {
      const platformUserId = String(
        data.user?.pk || data.user?.id || data.owner?.pk || data.owner?.id ||
        data.user?.username || data.owner?.username || "unknown"
      );
      const platformPostId = String(
        data.pk || data.id || data.media_id || data.code ||
        data.shortcode || data.ig_id || data.fbid || Date.now()
      );
      let publishedAt = null;
      if (data.taken_at) {
        const d = typeof data.taken_at === "number"
          ? new Date(data.taken_at * 1000)
          : new Date(data.taken_at);
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      }
      const ownerUsername = data.user?.username || data.owner?.username || "";
      const ownerFullName = data.user?.full_name || data.owner?.full_name || "";
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.instagram, // Instagram
          platform_user_id: platformUserId,
          username: ownerUsername || ownerFullName || platformUserId,
          platform_post_id: platformPostId,
          content: data.caption?.text || data.caption || "",
          published_at: publishedAt,
          likes: Math.max(0, data.like_count ?? data.likes ?? 0),
          shares: 0,
          comments: Math.max(0, data.comment_count ?? data.comments ?? 0),
          views: Math.max(0, data.play_count ?? data.video_view_count ?? 0),
          user_id: currentUserId,
          author_name: ownerFullName || ownerUsername,
          author_handle: ownerUsername,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  /* ─── TikTok Handler ──────────────────────────────────────────────────── */

  async function handleTiktokSubmit() {
    setTiktokError(null);
    setTiktokResult(null);

    const hasInput =
      ((tiktokOptions.profile || tiktokOptions.following || tiktokOptions.followers) && tiktokInputs.username?.trim()) ||
      (tiktokOptions.profileVideos && tiktokInputs.videosUsername?.trim()) ||
      (tiktokOptions.transcript && tiktokInputs.videoUrl?.trim()) ||
      (tiktokOptions.searchUsers && tiktokInputs.userSearchQuery?.trim()) ||
      (tiktokOptions.searchHashtag && tiktokInputs.hashtag?.trim()) ||
      (tiktokOptions.searchKeyword && tiktokInputs.keyword?.trim());

    if (!hasInput) {
      setTiktokError("Please select an option and provide the required input.");
      return;
    }

    setTiktokLoading(true);
    try {
      const json = await tryPostJson("/api/tiktok/search", {
        options: tiktokOptions,
        inputs: tiktokInputs,
        limit: scrapePostCount,
      });
      setTiktokResult(json);
      if (json.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setTiktokError(e?.message || "Unknown error");
    } finally {
      setTiktokLoading(false);
    }
  }

  async function handleTiktokSave(type, data) {
    if (!currentUserId) {
      setTiktokError("Please sign in to save data.");
      return;
    }
    if (type === "post" && data) {
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.tiktok, // TikTok
          platform_user_id: String(data.author?.id || data.author?.uniqueId || data.author?.uid || "unknown"),
          username: data.author?.uniqueId || data.author?.nickname || data.author?.unique_id || "",
          author_name: data.author?.nickname || data.author?.uniqueId || "",
          author_handle: data.author?.uniqueId || data.author?.unique_id || "",
          platform_post_id: String(data.id || data.aweme_id || data.video?.id || Date.now()),
          content: data.desc || data.title || "",
          published_at: (() => { if (!data.createTime) return null; const d = new Date(typeof data.createTime === 'number' ? data.createTime * 1000 : data.createTime); return isNaN(d.getTime()) ? null : d.toISOString(); })(),
          likes: Math.max(0, data.stats?.diggCount ?? data.statsV2?.diggCount ?? data.statistics?.digg_count ?? data.statistics?.diggCount ?? data.diggCount ?? data.digg_count ?? 0),
          shares: Math.max(0, data.stats?.shareCount ?? data.statsV2?.shareCount ?? data.statistics?.share_count ?? data.statistics?.shareCount ?? data.shareCount ?? data.share_count ?? 0),
          comments: Math.max(0, data.stats?.commentCount ?? data.statsV2?.commentCount ?? data.statistics?.comment_count ?? data.statistics?.commentCount ?? data.commentCount ?? data.comment_count ?? 0),
          views: Math.max(0, data.stats?.playCount ?? data.statsV2?.playCount ?? data.statistics?.play_count ?? data.statistics?.playCount ?? data.playCount ?? data.play_count ?? 0),
          user_id: currentUserId,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  /* ─── Reddit Handler ──────────────────────────────────────────────────── */

  async function handleRedditSubmit() {
    setRedditError(null);
    setRedditResult(null);

    const hasInput =
      ((redditOptions.subredditDetails || redditOptions.subredditPosts) && redditInputs.subreddit?.trim()) ||
      (redditOptions.subredditSearch && redditInputs.subreddit?.trim() && redditInputs.subredditQuery?.trim()) ||
      (redditOptions.postComments && redditInputs.postUrl?.trim()) ||
      (redditOptions.search && redditInputs.searchQuery?.trim()) ||
      (redditOptions.searchAds && redditInputs.adSearchQuery?.trim()) ||
      (redditOptions.getAd && redditInputs.adUrl?.trim());

    if (!hasInput) {
      setRedditError("Please select an option and provide the required input.");
      return;
    }

    setRedditLoading(true);
    try {
      const json = await tryPostJson("/api/reddit/search", {
        options: redditOptions,
        inputs: redditInputs,
        limit: scrapePostCount,
      });
      setRedditResult(json);
      if (json.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setRedditError(e?.message || "Unknown error");
    } finally {
      setRedditLoading(false);
    }
  }

  async function handleRedditSave(type, data) {
    if (!currentUserId) {
      setRedditError("Please sign in to save data.");
      return;
    }
    if (type === "post" && data) {
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.reddit, // Reddit
          platform_user_id: String(data.author || data.author_fullname || "unknown"),
          username: data.author || "",
          platform_post_id: String(data.id || data.name || Date.now()),
          content: data.title || data.selftext || "",
          published_at: (() => { if (!data.created_utc) return null; const d = new Date(typeof data.created_utc === 'number' ? data.created_utc * 1000 : data.created_utc); return isNaN(d.getTime()) ? null : d.toISOString(); })(),
          likes: Math.max(0, data.score ?? data.ups ?? data.upvote_count ?? 0),
          shares: 0,
          comments: Math.max(0, data.num_comments ?? data.comment_count ?? 0),
          user_id: currentUserId,
          author_name: data.author || "",
          author_handle: data.author || "",
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  /* ─── Generic save helper (for profiles, comments, transcripts, users, ads) ─── */

  async function handleGenericSave(platformKey, { platformUserId, username, postId, content, publishedAt, likes, shares, comments, views, authorName, authorHandle }) {
    if (!currentUserId) throw new Error("Please sign in to save data.");
    const pid = platformIds[platformKey];
    if (!pid) throw new Error(`Unknown platform: ${platformKey}`);
    const resp = await fetch(apiUrl("/api/posts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform_id: pid,
        platform_user_id: String(platformUserId || "unknown"),
        username: String(username || platformUserId || "unknown"),
        platform_post_id: String(postId || Date.now()),
        content: String(content || ""),
        published_at: publishedAt || null,
        likes: likes ?? 0,
        shares: shares ?? 0,
        comments: comments ?? 0,
        views: views ?? 0,
        user_id: currentUserId,
        author_name: authorName || username || "",
        author_handle: authorHandle || username || "",
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Save failed: ${resp.status} ${text}`);
    }
    return resp.json();
  }

  // YouTube transcript save (kept for TikTok compatibility)
  function saveYoutubeTranscript(data) {
    return handleGenericSave("youtube", {
      platformUserId: "transcript",
      username: data.videoTitle || "transcript",
      postId: `transcript_${Date.now()}`,
      content: `[Transcript] ${data.videoTitle || ""}\n\n${data.text || ""}`,
      authorName: data.videoTitle || "Transcript",
    });
  }

  // TikTok transcript save
  function saveTiktokTranscript(transcript) {
    const text = typeof transcript === "string" ? transcript : JSON.stringify(transcript, null, 2);
    return handleGenericSave("tiktok", {
      platformUserId: "transcript",
      username: "transcript",
      postId: `transcript_${Date.now()}`,
      content: `[TikTok Transcript]\n\n${text}`,
      authorName: "TikTok Transcript",
    });
  }

  // Reddit comment save
  function saveRedditComment(comment) {
    return handleGenericSave("reddit", {
      platformUserId: comment.author || "deleted",
      username: comment.author || "deleted",
      postId: `comment_${comment.id || Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: comment.body || comment.text || "",
      likes: comment.score ?? 0,
      authorName: comment.author || "deleted",
      authorHandle: comment.author || "deleted",
    });
  }

  // Reddit ad save
  function saveRedditAd(ad) {
    const creative = ad.creative || {};
    const profile = ad.profile_info || {};
    return handleGenericSave("reddit", {
      platformUserId: profile.name || ad.advertiser_id || "ad",
      username: profile.name || "Advertiser",
      postId: `ad_${ad.id || Date.now()}`,
      content: `${creative.title || creative.headline || ""}\n${creative.body || ""}`,
      authorName: profile.name || "Advertiser",
      authorHandle: profile.name || "",
    });
  }

  // LinkedIn sub-item saves (activity posts, company posts, comments, articles)
  function saveLinkedinSubItem(type, item) {
    const { type: liType, data } = { type, data: item };
    return fetch(apiUrl("/api/linkedin/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: liType,
        data,
        user_id: currentUserId,
      }),
    }).then(async r => { if (!r.ok) { const t = await r.text(); throw new Error(t); } return r.json(); });
  }

  const posts = Array.isArray(result?.posts) ? result.posts : [];

  return (
    <Card withBorder radius="lg" shadow="sm" p="lg" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} zIndex={1000} />
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>{t("competitorLookup.title")}</Title>
            <Text size="sm" c="dimmed">
              {t("competitorLookup.subtitle")}
            </Text>
          </div>
          {creditsRemaining != null && (
            <Card withBorder radius="md" p="xs" px="md" shadow="xs" style={{ minWidth: 160, textAlign: "center" }}>
              <Text size="xs" c="dimmed" fw={500}>{t("competitorLookup.creditsRemaining")}</Text>
              <Text fw={700} size="lg" c={creditsRemaining < 10 ? "red" : creditsRemaining < 50 ? "orange" : "teal"}>
                {creditsRemaining.toLocaleString()}
              </Text>
            </Card>
          )}
        </Group>

        {!Object.values(connectedPlatforms).some(Boolean) && (
          <Alert variant="light" color="blue" title={t("competitorLookup.noPlatformsConnected")}>
            {t("competitorLookup.goToConnectedIntegrations")}
          </Alert>
        )}

        {Object.values(connectedPlatforms).some(Boolean) && (
          <Tabs
            defaultValue={Object.keys(connectedPlatforms).find((k) => connectedPlatforms[k]) || "x"}
            keepMounted={false}
          >
            <Tabs.List>
              {connectedPlatforms.x && (
                <Tabs.Tab value="x" leftSection={<IconBrandX size={16} />}>
                  X / Twitter
                </Tabs.Tab>
              )}
              {connectedPlatforms.linkedin && (
                <Tabs.Tab value="linkedin" leftSection={<IconBrandLinkedin size={16} color="#0A66C2" />}>
                  LinkedIn
                </Tabs.Tab>
              )}
              {connectedPlatforms.instagram && (
                <Tabs.Tab value="instagram" leftSection={<IconBrandInstagram size={16} color="#E1306C" />}>
                  Instagram
                </Tabs.Tab>
              )}
              {connectedPlatforms.tiktok && (
                <Tabs.Tab value="tiktok" leftSection={<IconBrandTiktok size={16} />}>
                  TikTok
                </Tabs.Tab>
              )}
              {connectedPlatforms.reddit && (
                <Tabs.Tab value="reddit" leftSection={<IconBrandReddit size={16} color="#FF4500" />}>
                  Reddit
                </Tabs.Tab>
              )}
              {connectedPlatforms.youtube && (
                <Tabs.Tab value="youtube" leftSection={<IconBrandYoutube size={16} color="#FF0000" />}>
                  YouTube
                </Tabs.Tab>
              )}
            </Tabs.List>

            <Card withBorder radius="md" p="sm" mt="md">
              <Group gap="sm" align="flex-end">
                <NumberInput
                  label={t("competitorLookup.scrapePostAmount")}
                  description={t("competitorLookup.scrapePostAmountDesc")}
                  min={5}
                  max={100}
                  step={5}
                  value={scrapePostCount}
                  onChange={(val) => setScrapePostCount(val || 10)}
                  style={{ maxWidth: 200 }}
                />
              </Group>
            </Card>

            {connectedPlatforms.x && (
              <Tabs.Panel value="x" pt="md">
                <Stack gap="lg">

                  <Title order={4}>X / Twitter {t("competitorLookup.lookup")}</Title>

                  <Text size="sm" c="dimmed">
                    {t("competitorLookup.selectDataFetch")}
                  </Text>

                  {/* PROFILE & ACCOUNT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>👤 {t("competitorLookup.profileAccount")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.userLookup")} info={t("competitorLookup.userLookupDesc")} />}
                        checked={xOptions.userLookup || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, userLookup: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.followers")} info={t("competitorLookup.followersDesc")} />}
                        checked={xOptions.followers || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, followers: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.following")} info={t("competitorLookup.followingDesc")} />}
                        checked={xOptions.following || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, following: e.target.checked }))}
                      />

                      {(xOptions.userLookup || xOptions.followers || xOptions.following) && (
                        <TextInput label={t("competitorLookup.username")} placeholder="@jack" value={xInputs.username || ""}
                          onChange={(e) => setXInputs(prev => ({ ...prev, username: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* TWEETS & CONTENT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📝 {t("competitorLookup.tweetsContent")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.userTweets")} info={t("competitorLookup.userTweetsDesc")} />}
                        checked={xOptions.userTweets || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, userTweets: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.userMentions")} info={t("competitorLookup.userMentionsDesc")} />}
                        checked={xOptions.userMentions || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, userMentions: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.tweetLookup")} info={t("competitorLookup.tweetLookupDesc")} />}
                        checked={xOptions.tweetLookup || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, tweetLookup: e.target.checked }))}
                      />

                      {(xOptions.userTweets || xOptions.userMentions) && (
                        <TextInput label={t("competitorLookup.username")} placeholder="@jack" value={xInputs.tweetsUsername || ""}
                          onChange={(e) => setXInputs(prev => ({ ...prev, tweetsUsername: e.target.value }))} />
                      )}

                      {xOptions.tweetLookup && (
                        <TextInput label={t("competitorLookup.tweetUrlId")} placeholder="https://x.com/user/status/123..." value={xInputs.tweetUrl || ""}
                          onChange={(e) => setXInputs(prev => ({ ...prev, tweetUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* SEARCH */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🔍 {t("competitorLookup.search")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.searchTweets")} info={t("competitorLookup.searchTweetsDesc")} />}
                        checked={xOptions.searchTweets || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, searchTweets: e.target.checked }))}
                      />

                      {xOptions.searchTweets && (
                        <TextInput label={t("competitorLookup.searchQuery")} placeholder="from:elonmusk OR #tech" value={xInputs.searchQuery || ""}
                          onChange={(e) => setXInputs(prev => ({ ...prev, searchQuery: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    disabled={!Object.values(xOptions).some(Boolean)}
                    loading={xLoading}
                    onClick={handleXSubmit}
                  >
                    {t("competitorLookup.searchX")}
                  </Button>

                  {xError && (
                    <Alert variant="light" color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>
                      {xError}
                    </Alert>
                  )}

                  {xResult && <XResults data={xResult} onSave={handleXSave} />}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.youtube && (
              <Tabs.Panel value="youtube" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.youtubeLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    {t("competitorLookup.selectDataFetch")}
                  </Text>

                  {/* CHANNEL */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📺 {t("competitorLookup.channel")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.channelDetails")} info={t("competitorLookup.channelDetailsDesc")} />}
                        checked={youtubeOptions.channelDetails || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, channelDetails: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.channelVideos")} info={t("competitorLookup.channelVideosDesc")} />}
                        checked={youtubeOptions.channelVideos || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, channelVideos: e.target.checked }))}
                      />

                      {(youtubeOptions.channelDetails || youtubeOptions.channelVideos) && (
                        <TextInput label={t("competitorLookup.channelUrl")} placeholder="https://youtube.com/@MrBeast or UCX6OQ3..." value={youtubeInputs.channelUrl || ""}
                          onChange={(e) => setYoutubeInputs(prev => ({ ...prev, channelUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* VIDEO & CONTENT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🎬 {t("competitorLookup.videoContent")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.videoDetails")} info={t("competitorLookup.videoDetailsDesc")} />}
                        checked={youtubeOptions.videoDetails || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, videoDetails: e.target.checked }))}
                      />

                      {youtubeOptions.videoDetails && (
                        <TextInput label={t("competitorLookup.videoUrl")} placeholder="https://youtube.com/watch?v=..." value={youtubeInputs.videoUrl || ""}
                          onChange={(e) => setYoutubeInputs(prev => ({ ...prev, videoUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* SEARCH */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🔍 {t("competitorLookup.search")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.search")} info={t("competitorLookup.searchDesc")} />}
                        checked={youtubeOptions.search || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, search: e.target.checked }))}
                      />

                      {youtubeOptions.search && (
                        <TextInput label={t("competitorLookup.searchQuery")} placeholder="react tutorial, #coding" value={youtubeInputs.searchQuery || ""}
                          onChange={(e) => setYoutubeInputs(prev => ({ ...prev, searchQuery: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    disabled={!Object.values(youtubeOptions).some(Boolean)}
                    loading={youtubeLoading}
                    onClick={handleYoutubeSubmit}
                  >
                    {t("competitorLookup.searchYouTube")}
                  </Button>

                  {youtubeError && (
                    <Alert color="red" title={t("competitorLookup.youtubeError")} withCloseButton onClose={() => setYoutubeError(null)}>
                      {youtubeError}
                    </Alert>
                  )}

                  {youtubeResult && (
                    <YoutubeResults data={youtubeResult} onSave={handleYoutubeSave} currentUserId={currentUserId} platformIds={platformIds} />
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.linkedin && (
              <Tabs.Panel value="linkedin" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.linkedinLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
                  </Text>

                  {/* PROFILE & COMPANY */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>👔 {t("competitorLookup.profileCompany")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.personProfile")} info={t("competitorLookup.personProfileDesc")} />}
                        checked={linkedinOptions.profile || false}
                        onChange={(e) => setLinkedinOptions(prev => ({ ...prev, profile: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.companyPage")} info={t("competitorLookup.companyPageDesc")} />}
                        checked={linkedinOptions.company || false}
                        onChange={(e) => setLinkedinOptions(prev => ({ ...prev, company: e.target.checked }))}
                      />

                      {linkedinOptions.profile && (
                        <TextInput label={t("competitorLookup.profileUrlUsername")} placeholder="https://linkedin.com/in/..."
                          value={linkedinInputs.profile}
                          onChange={(e) => setLinkedinInputs(prev => ({ ...prev, profile: e.target.value }))} />
                      )}

                      {linkedinOptions.company && (
                        <TextInput label={t("competitorLookup.companyUrlName")} placeholder="https://linkedin.com/company/..."
                          value={linkedinInputs.company}
                          onChange={(e) => setLinkedinInputs(prev => ({ ...prev, company: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* POSTS */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📝 {t("competitorLookup.postsContent")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.post")} info={t("competitorLookup.postDesc")} />}
                        checked={linkedinOptions.post || false}
                        onChange={(e) => setLinkedinOptions(prev => ({ ...prev, post: e.target.checked }))}
                      />

                      {linkedinOptions.post && (
                        <TextInput label={t("competitorLookup.postUrl")} placeholder="https://linkedin.com/posts/..."
                          value={linkedinInputs.post}
                          onChange={(e) => setLinkedinInputs(prev => ({ ...prev, post: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    disabled={!linkedinOptions.profile && !linkedinOptions.company && !linkedinOptions.post}
                    loading={linkedinLoading}
                    onClick={handleLinkedinSubmit}
                  >
                    {t("competitorLookup.searchLinkedin")}
                  </Button>

                  {linkedinError && (
                    <Alert variant="light" color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>
                      {linkedinError}
                    </Alert>
                  )}

                  {linkedinResult && <LinkedinResults data={linkedinResult} onSave={handleLinkedinSave} />}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.instagram && (
              <Tabs.Panel value="instagram" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.instagramLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
                  </Text>

                  {/* PROFILE SECTION */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>👤 {t("competitorLookup.profileAccount")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.profile")} info={t("competitorLookup.profileDesc")} />}
                        checked={instagramOptions.profile || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, profile: e.target.checked }))}
                      />

                      {instagramOptions.profile && (
                        <TextInput label={t("competitorLookup.username")} placeholder="@username" value={instagramInputs.username || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, username: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* POSTS SECTION */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📝 {t("competitorLookup.postsContent")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.userPosts")} info={t("competitorLookup.userPostsDesc")} />}
                        checked={instagramOptions.userPosts || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, userPosts: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.postReelInfo")} info={t("competitorLookup.postReelInfoDesc")} />}
                        checked={instagramOptions.singlePost || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, singlePost: e.target.checked }))}
                      />

                      {instagramOptions.userPosts && (
                        <TextInput label={t("competitorLookup.username")} placeholder="@username" value={instagramInputs.userPostsUsername || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, userPostsUsername: e.target.value }))} />
                      )}

                      {instagramOptions.singlePost && (
                        <TextInput label={t("competitorLookup.postUrl")} placeholder="https://instagram.com/p/..." value={instagramInputs.postUrl || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, postUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* REELS SECTION */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🎥 {t("competitorLookup.reels")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.searchReels")} info={t("competitorLookup.searchReelsDesc")} />}
                        checked={instagramOptions.reelsSearch || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, reelsSearch: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.userReels")} info={t("competitorLookup.userReelsDesc")} />}
                        checked={instagramOptions.userReels || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, userReels: e.target.checked }))}
                      />

                      {instagramOptions.reelsSearch && (
                        <TextInput label={t("competitorLookup.searchTerm")} placeholder="fitness, #workout" value={instagramInputs.reelsSearchTerm || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, reelsSearchTerm: e.target.value }))} />
                      )}

                      {instagramOptions.userReels && (
                        <TextInput label={t("competitorLookup.username")} placeholder="@username" value={instagramInputs.userReelsUsername || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, userReelsUsername: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* HIGHLIGHTS SECTION */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>⭐ {t("competitorLookup.highlights")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.userHighlights")} info={t("competitorLookup.userHighlightsDesc")} />}
                        checked={instagramOptions.highlightDetail || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, highlightDetail: e.target.checked }))}
                      />

                      {instagramOptions.highlightDetail && (
                        <TextInput label={t("competitorLookup.username")} placeholder="@username" value={instagramInputs.highlightUrl || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, highlightUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    disabled={!Object.values(instagramOptions).some(Boolean)}
                    loading={instagramLoading}
                    onClick={handleInstagramSubmit}
                  >
                    {t("competitorLookup.searchInstagram")}
                  </Button>

                  {instagramError && (
                    <Alert color="red" title={t("competitorLookup.instagramError")} withCloseButton onClose={() => setInstagramError(null)}>
                      {instagramError}
                    </Alert>
                  )}

                  {instagramResult && (
                    <InstagramResults data={instagramResult} onSave={handleInstagramSave} />
                  )}
                </Stack>
              </Tabs.Panel>
            )}


            {connectedPlatforms.tiktok && (
              <Tabs.Panel value="tiktok" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.tiktokLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
                  </Text>

                  {/* PROFILE & ACCOUNT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>👤 {t("competitorLookup.profileAccount")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.profile")} info={t("competitorLookup.tiktokProfileDesc")} />}
                        checked={tiktokOptions.profile || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, profile: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.following")} info={t("competitorLookup.tiktokFollowingDesc")} />}
                        checked={tiktokOptions.following || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, following: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.followers")} info={t("competitorLookup.tiktokFollowersDesc")} />}
                        checked={tiktokOptions.followers || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, followers: e.target.checked }))}
                      />

                      {(tiktokOptions.profile || tiktokOptions.following || tiktokOptions.followers) && (
                        <TextInput label={t("competitorLookup.username")} placeholder="@username" value={tiktokInputs.username || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, username: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* VIDEOS & CONTENT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🎬 {t("competitorLookup.videosContent")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.profileVideos")} info={t("competitorLookup.profileVideosDesc")} />}
                        checked={tiktokOptions.profileVideos || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, profileVideos: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.transcript")} info={t("competitorLookup.tiktokTranscriptDesc")} />}
                        checked={tiktokOptions.transcript || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, transcript: e.target.checked }))}
                      />

                      {tiktokOptions.profileVideos && (
                        <TextInput label={t("competitorLookup.username")} placeholder="@username" value={tiktokInputs.videosUsername || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, videosUsername: e.target.value }))} />
                      )}

                      {tiktokOptions.transcript && (
                        <TextInput label={t("competitorLookup.videoUrl")} placeholder="https://tiktok.com/@user/video/..." value={tiktokInputs.videoUrl || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, videoUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* SEARCH & DISCOVERY */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🔍 {t("competitorLookup.searchDiscovery")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.searchUsers")} info={t("competitorLookup.searchUsersDesc")} />}
                        checked={tiktokOptions.searchUsers || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchUsers: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.searchByHashtag")} info={t("competitorLookup.searchByHashtagDesc")} />}
                        checked={tiktokOptions.searchHashtag || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchHashtag: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.searchByKeyword")} info={t("competitorLookup.searchByKeywordDesc")} />}
                        checked={tiktokOptions.searchKeyword || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchKeyword: e.target.checked }))}
                      />

                      {tiktokOptions.searchUsers && (
                        <TextInput label={t("competitorLookup.userSearchQuery")} placeholder="fitness creator" value={tiktokInputs.userSearchQuery || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, userSearchQuery: e.target.value }))} />
                      )}

                      {tiktokOptions.searchHashtag && (
                        <TextInput label={t("competitorLookup.hashtag")} placeholder="#fitness" value={tiktokInputs.hashtag || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, hashtag: e.target.value }))} />
                      )}

                      {tiktokOptions.searchKeyword && (
                        <TextInput label={t("competitorLookup.keyword")} placeholder="workout routine" value={tiktokInputs.keyword || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, keyword: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    loading={tiktokLoading}
                    disabled={!Object.values(tiktokOptions).some(Boolean)}
                    onClick={handleTiktokSubmit}
                  >
                    {t("competitorLookup.searchTikTok")}
                  </Button>

                  {tiktokError && (
                    <Alert color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>
                      {tiktokError}
                    </Alert>
                  )}

                  {tiktokResult && (
                    <TiktokResults data={tiktokResult} onSave={handleTiktokSave} onSaveTranscript={saveTiktokTranscript} />
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.reddit && (
              <Tabs.Panel value="reddit" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.redditLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
                  </Text>

                  {/* SUBREDDIT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📋 {t("competitorLookup.subreddit")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.subredditDetails")} info={t("competitorLookup.subredditDetailsDesc")} />}
                        checked={redditOptions.subredditDetails || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditDetails: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.subredditPosts")} info={t("competitorLookup.subredditPostsDesc")} />}
                        checked={redditOptions.subredditPosts || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditPosts: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.subredditSearch")} info={t("competitorLookup.subredditSearchDesc")} />}
                        checked={redditOptions.subredditSearch || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditSearch: e.target.checked }))}
                      />

                      {(redditOptions.subredditDetails || redditOptions.subredditPosts || redditOptions.subredditSearch) && (
                        <TextInput label={t("competitorLookup.subreddit")} placeholder="r/reactjs" value={redditInputs.subreddit || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, subreddit: e.target.value }))} />
                      )}

                      {redditOptions.subredditSearch && (
                        <TextInput label={t("competitorLookup.searchQuery")} placeholder="state management" value={redditInputs.subredditQuery || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, subredditQuery: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* POSTS & SEARCH */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>💬 {t("competitorLookup.postsSearch")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.postComments")} info={t("competitorLookup.postCommentsDesc")} />}
                        checked={redditOptions.postComments || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, postComments: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.search")} info={t("competitorLookup.redditSearchDesc")} />}
                        checked={redditOptions.search || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, search: e.target.checked }))}
                      />

                      {redditOptions.postComments && (
                        <TextInput label={t("competitorLookup.postUrl")} placeholder="https://reddit.com/r/reactjs/comments/..." value={redditInputs.postUrl || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, postUrl: e.target.value }))} />
                      )}

                      {redditOptions.search && (
                        <TextInput label={t("competitorLookup.searchQuery")} placeholder="best javascript framework" value={redditInputs.searchQuery || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, searchQuery: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* ADS */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📢 {t("competitorLookup.ads")}</Text>

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.searchAds")} info={t("competitorLookup.searchAdsDesc")} />}
                        checked={redditOptions.searchAds || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, searchAds: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label={t("competitorLookup.getAd")} info={t("competitorLookup.getAdDesc")} />}
                        checked={redditOptions.getAd || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, getAd: e.target.checked }))}
                      />

                      {redditOptions.searchAds && (
                        <TextInput label={t("competitorLookup.adSearchQuery")} placeholder="software, SaaS" value={redditInputs.adSearchQuery || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, adSearchQuery: e.target.value }))} />
                      )}

                      {redditOptions.getAd && (
                        <TextInput label={t("competitorLookup.adUrlId")} placeholder="https://reddit.com/..." value={redditInputs.adUrl || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, adUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    loading={redditLoading}
                    disabled={!Object.values(redditOptions).some(Boolean)}
                    onClick={handleRedditSubmit}
                  >
                    {t("competitorLookup.searchReddit")}
                  </Button>

                  {redditError && (
                    <Alert color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>
                      {redditError}
                    </Alert>
                  )}

                  {redditResult && (
                    <RedditResults data={redditResult} onSave={handleRedditSave} onSaveComment={saveRedditComment} onSaveAd={saveRedditAd} />
                  )}
                </Stack>
              </Tabs.Panel>
            )}
          </Tabs>
        )}

        {error && (
          <Alert
            variant="light"
            color={error.includes("not found") || error.includes("Invalid") ? "yellow" : "orange"}
            title={
              error.includes("not found") ? "Not found" :
                error.includes("Invalid") ? "Invalid input" :
                  "Connection error"
            }
            icon={<IconAlertCircle />}
            styles={{
              label: { fontWeight: 500 },
              message: { fontSize: "14px" }
            }}
          >
            <Text>{error}</Text>
          </Alert>
        )}

        {result && (
          <Stack gap="lg">
            <Card withBorder radius="md">
              <Stack gap="xs">
                <Title order={4}>{t("competitorLookup.summary")}</Title>
                <Group gap="md" wrap="wrap">
                  <Group gap="xs">
                    <Text fw={500}>Username:</Text>
                    <Code>{result.username || "—"}</Code>
                  </Group>
                  <Copyable value={result.userId} label="User ID" />
                  <Group gap="xs">
                    <Text fw={500}>Backend:</Text>
                    <BackendBadge base={result._usedBackend} />
                  </Group>
                  <Group gap="xs">
                    <Text fw={500}>Posts:</Text>
                    <Badge variant="light" radius="sm">
                      {posts.length}
                    </Badge>
                  </Group>
                </Group>
              </Stack>
            </Card>

            {convertedData && convertedData.length > 0 && (
              <>
                <Divider label="Converted Data" />
                <Card withBorder radius="md">
                  <Stack gap="md">
                    <Title order={5}>{t("competitorLookup.universalDataFormat")}</Title>
                    {convertedData.map((item, idx) => (
                      <Card key={idx} withBorder radius="sm" p="sm">
                        <Group gap="md" wrap="wrap">
                          <Group gap="xs">
                            <Text fw={500}>Name/Source:</Text>
                            <Badge variant="light">{item["Name/Source"]}</Badge>
                          </Group>
                          <Group gap="xs">
                            <Text fw={500}>Engagement:</Text>
                            <Badge variant="light" color="green">{item.Engagement}</Badge>
                          </Group>
                        </Group>
                        <Text size="sm" mt="xs" style={{ whiteSpace: "pre-wrap" }}>
                          <Text fw={500} span>Message:</Text> {item.Message.substring(0, 150)}
                          {item.Message.length > 150 ? "..." : ""}
                        </Text>
                      </Card>
                    ))}
                  </Stack>
                </Card>
              </>
            )}

            <Group justify="space-between" align="center">
              <Divider label="Posts" style={{ flex: 1 }} />
              {posts.length > 1 && (
                <SaveAllButton
                  items={posts.filter(p => p?.text)}
                  saveFn={(p) => {
                    const m = p.public_metrics || {};
                    return handleGenericSave("x", {
                      platform_post_id: p.id,
                      username: result.username,
                      platform_user_id: result.userId,
                      content: p.text,
                      published_at: p.created_at,
                      likes: m.like_count ?? 0,
                      shares: m.retweet_count ?? 0,
                      comments: m.reply_count ?? 0,
                    });
                  }}
                  label="Save All Posts"
                />
              )}
            </Group>

            <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />}>
              {t("competitorLookup.metricsMayBeUnavailable", {
                defaultValue: "Some metrics (e.g. views) may appear as 0 because they are private or unavailable from the platform's API.",
              })}
            </Alert>

            {posts.length === 0 ? (
              <Alert variant="light" color="gray" title={t("watchlist.noPostsReturned")}>
                {t("competitorLookup.noDataReturnedInputs")}
              </Alert>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="md">
                {posts.map((p) => (
                  <PostCard key={p?.id ?? Math.random()} post={p} currentUserId={currentUserId} platformIds={platformIds} result={result} />
                ))}
              </SimpleGrid>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}