import { memo, useEffect, useRef, useState } from "react";
import { ActionIcon, Box, Group, Text, Tooltip } from "@mantine/core";
import { IconExternalLink, IconPlayerPlay } from "@tabler/icons-react";

/* ─────────────────────────────────────────────────────────────────────────
   URL helpers – reconstruct a post URL from platform data
   ───────────────────────────────────────────────────────────────────────── */

/** Extract a YouTube videoId from a URL or bare ID */
function extractYouTubeId(urlOrId) {
    if (!urlOrId) return null;
    // already a bare id (11 chars, no slashes)
    if (/^[\w-]{11}$/.test(urlOrId)) return urlOrId;
    try {
        const u = new URL(urlOrId);
        if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
        return u.searchParams.get("v") || u.pathname.split("/").pop();
    } catch { return urlOrId; }
}

/** Extract X/Twitter tweet ID from a URL or bare ID */
function extractTweetId(urlOrId) {
    if (!urlOrId) return null;
    const m = String(urlOrId).match(/status\/(\d+)/);
    if (m) return m[1];
    if (/^\d+$/.test(urlOrId)) return urlOrId;
    return null;
}

/** Extract Instagram shortcode from a URL or bare code */
function extractInstagramCode(urlOrCode) {
    if (!urlOrCode) return null;
    const m = String(urlOrCode).match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{6,}$/.test(urlOrCode)) return urlOrCode;
    return null;
}

/** Extract Reddit post ID from a URL or bare ID */
function extractRedditPostId(urlOrId) {
    if (!urlOrId) return null;
    const m = String(urlOrId).match(/comments\/([a-z0-9]+)/i);
    if (m) return m[1];
    if (/^[a-z0-9]+$/i.test(urlOrId) && urlOrId.length < 20) return urlOrId;
    return null;
}

/**
 * Build a canonical post URL from whatever data we have.
 * @param {"x"|"youtube"|"instagram"|"reddit"} platform
 * @param {{ url, platformPostId, username, videoId, subreddit, shortcode }} meta
 */
export function buildPostUrl(platform, meta = {}) {
    // If we already have a full URL, use it
    if (meta.url && /^https?:\/\//.test(meta.url)) return meta.url;

    switch (platform) {
        case "x": {
            const tweetId = meta.platformPostId || extractTweetId(meta.url);
            if (!tweetId) return null;
            const user = meta.username || "i";
            return `https://x.com/${user}/status/${tweetId}`;
        }
        case "youtube": {
            const vid = meta.videoId || extractYouTubeId(meta.url || meta.platformPostId);
            if (!vid) return null;
            return `https://www.youtube.com/watch?v=${vid}`;
        }
        case "instagram": {
            const code = meta.shortcode || extractInstagramCode(meta.url || meta.platformPostId);
            if (!code) return null;
            return `https://www.instagram.com/p/${code}/`;
        }
        case "reddit": {
            const id = extractRedditPostId(meta.url || meta.platformPostId);
            if (!id) return null;
            if (meta.subreddit) return `https://www.reddit.com/r/${meta.subreddit}/comments/${id}/`;
            return `https://www.reddit.com/comments/${id}/`;
        }
        default:
            return meta.url || null;
    }
}

/* ─────────────────────────────────────────────────────────────────────────
   YouTube embed – an <iframe> with thumbnail overlay
   ───────────────────────────────────────────────────────────────────────── */

function YouTubeEmbedInner({ videoId }) {
    const [playing, setPlaying] = useState(false);
    if (!videoId) return null;

    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    if (!playing) {
        return (
            <Box
                onClick={() => setPlaying(true)}
                style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: 400,
                    paddingBottom: "min(56.25%, 225px)",
                    borderRadius: 8,
                    overflow: "hidden",
                    cursor: "pointer",
                    background: "#000",
                }}
            >
                <img
                    src={thumbUrl}
                    alt="Video thumbnail"
                    style={{
                        position: "absolute",
                        top: 0, left: 0, width: "100%", height: "100%",
                        objectFit: "cover",
                    }}
                />
                <div style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.25)",
                }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: "rgba(255,0,0,0.9)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <IconPlayerPlay size={22} color="#fff" style={{ marginLeft: 2 }} />
                    </div>
                </div>
            </Box>
        );
    }

    return (
        <Box style={{
            position: "relative", width: "100%", maxWidth: 400,
            paddingBottom: "min(56.25%, 225px)",
            borderRadius: 8, overflow: "hidden",
        }}>
            <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                title="YouTube video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{
                    position: "absolute", top: 0, left: 0,
                    width: "100%", height: "100%", border: "none",
                }}
            />
        </Box>
    );
}

const YouTubeEmbed = memo(YouTubeEmbedInner);

/* ─────────────────────────────────────────────────────────────────────────
   X / Twitter embed – uses Twitter widget.js
   ─────────────────────────────────────────────────────────────────────── */

function loadTwitterScript() {
    if (window.twttr) return Promise.resolve(window.twttr);
    if (document.getElementById("twitter-wjs")) {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (window.twttr?.widgets) { clearInterval(check); resolve(window.twttr); }
            }, 100);
            setTimeout(() => clearInterval(check), 8000);
        });
    }
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.id = "twitter-wjs";
        script.src = "https://platform.twitter.com/widgets.js";
        script.async = true;
        script.onload = () => {
            const check = setInterval(() => {
                if (window.twttr?.widgets) { clearInterval(check); resolve(window.twttr); }
            }, 100);
            setTimeout(() => clearInterval(check), 8000);
        };
        document.head.appendChild(script);
    });
}

function XTweetEmbedInner({ tweetId }) {
    const containerRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!tweetId || !containerRef.current) return;
        let cancelled = false;

        loadTwitterScript().then((twttr) => {
            if (cancelled || !containerRef.current) return;
            // Clear previous
            containerRef.current.innerHTML = "";
            twttr.widgets
                .createTweet(String(tweetId), containerRef.current, {
                    theme: "light",
                    align: "center",
                    conversation: "none",
                    dnt: true,
                    width: 400,
                })
                .then((el) => {
                    if (!cancelled) { setLoaded(true); if (!el) setError(true); }
                })
                .catch(() => { if (!cancelled) setError(true); });
        });

        return () => { cancelled = true; };
    }, [tweetId]);

    if (!tweetId) return null;

    return (
        <Box style={{ minHeight: error ? 0 : 200 }}>
            <div ref={containerRef} />
            {error && (
                <Text size="xs" c="dimmed" ta="center" mt="xs">
                    Could not load tweet embed.{" "}
                    <Text component="a" href={`https://x.com/i/web/status/${tweetId}`} target="_blank" size="xs" c="blue">
                        View on X →
                    </Text>
                </Text>
            )}
        </Box>
    );
}

const XTweetEmbed = memo(XTweetEmbedInner);

/* ─────────────────────────────────────────────────────────────────────────
   Instagram embed – uses Instagram embed.js (oEmbed blockquote)
   ─────────────────────────────────────────────────────────────────────── */

function loadInstagramScript() {
    if (window.instgrm) return Promise.resolve(window.instgrm);
    if (document.getElementById("instagram-embed-js")) {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (window.instgrm?.Embeds) { clearInterval(check); resolve(window.instgrm); }
            }, 100);
            setTimeout(() => clearInterval(check), 8000);
        });
    }
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.id = "instagram-embed-js";
        script.src = "https://www.instagram.com/embed.js";
        script.async = true;
        script.onload = () => {
            const check = setInterval(() => {
                if (window.instgrm?.Embeds) { clearInterval(check); resolve(window.instgrm); }
            }, 100);
            setTimeout(() => clearInterval(check), 8000);
        };
        document.head.appendChild(script);
    });
}

function InstagramEmbedInner({ shortcode }) {
    const containerRef = useRef(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!shortcode || !containerRef.current) return;
        let cancelled = false;

        const url = `https://www.instagram.com/p/${shortcode}/`;
        containerRef.current.innerHTML = `
      <blockquote class="instagram-media"
        data-instgrm-captioned data-instgrm-permalink="${url}"
        style="max-width:360px; width:100%; margin:0 auto;">
      </blockquote>`;

        loadInstagramScript().then((instgrm) => {
            if (cancelled) return;
            try { instgrm.Embeds.process(containerRef.current); }
            catch { if (!cancelled) setError(true); }
        }).catch(() => { if (!cancelled) setError(true); });

        return () => { cancelled = true; };
    }, [shortcode]);

    if (!shortcode) return null;

    return (
        <Box>
            <div ref={containerRef} />
            {error && (
                <Text size="xs" c="dimmed" ta="center" mt="xs">
                    Could not load Instagram embed.{" "}
                    <Text component="a" href={`https://www.instagram.com/p/${shortcode}/`} target="_blank" size="xs" c="blue">
                        View on Instagram →
                    </Text>
                </Text>
            )}
        </Box>
    );
}

const InstagramEmbed = memo(InstagramEmbedInner);

/* ─────────────────────────────────────────────────────────────────────────
   Reddit embed – iframe approach
   ─────────────────────────────────────────────────────────────────────── */

function RedditEmbedInner({ postUrl }) {
    const [error, setError] = useState(false);
    if (!postUrl) return null;

    // Build the reddit embed URL
    // Reddit supports oEmbed — append ?embed=true&ref_source=embed&ref=share
    const cleanUrl = postUrl.replace(/\/$/, "");
    const embedSrc = `https://embed.reddit.com${new URL(cleanUrl).pathname}?embed=true&theme=light&showTitle=true&showMedia=true`;

    if (error) {
        return (
            <Text size="xs" c="dimmed" ta="center" mt="xs">
                Could not load Reddit embed.{" "}
                <Text component="a" href={postUrl} target="_blank" size="xs" c="blue">
                    View on Reddit →
                </Text>
            </Text>
        );
    }

    return (
        <Box style={{ borderRadius: 8, overflow: "hidden", width: "100%", maxWidth: 400 }}>
            <iframe
                src={embedSrc}
                sandbox="allow-scripts allow-same-origin allow-popups"
                style={{
                    width: "100%", minHeight: 240, maxHeight: 360, border: "none",
                    borderRadius: 8,
                }}
                title="Reddit post"
                onError={() => setError(true)}
            />
        </Box>
    );
}

const RedditEmbed = memo(RedditEmbedInner);

/* ─────────────────────────────────────────────────────────────────────────
   Main EmbedPost component — picks the right embed based on platform
   ─────────────────────────────────────────────────────────────────────── */

/**
 * Renders an embedded social media post.
 *
 * @param {"x"|"youtube"|"instagram"|"reddit"} platform
 * @param {{
 *   url?: string,
 *   platformPostId?: string,
 *   username?: string,
 *   videoId?: string,
 *   subreddit?: string,
 *   shortcode?: string,
 * }} meta – any available metadata for constructing the embed
 */
export default function EmbedPost({ platform, meta = {} }) {
    const url = buildPostUrl(platform, meta);

    switch (platform) {
        case "youtube": {
            const videoId = meta.videoId || extractYouTubeId(meta.url || meta.platformPostId);
            if (!videoId) return null;
            return (
                <Box mb="xs">
                    <YouTubeEmbed videoId={videoId} />
                    {url && (
                        <Group justify="flex-end" mt={4}>
                            <Tooltip label="Open on YouTube">
                                <Text component="a" href={url} target="_blank" size="xs" c="dimmed" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <IconExternalLink size={12} /> YouTube
                                </Text>
                            </Tooltip>
                        </Group>
                    )}
                </Box>
            );
        }

        case "x": {
            const tweetId = meta.platformPostId || extractTweetId(meta.url);
            if (!tweetId) return null;
            return (
                <Box mb="xs">
                    <XTweetEmbed tweetId={tweetId} />
                </Box>
            );
        }

        case "instagram": {
            const code = meta.shortcode || extractInstagramCode(meta.url || meta.platformPostId);
            if (!code) return null;
            return (
                <Box mb="xs">
                    <InstagramEmbed shortcode={code} />
                </Box>
            );
        }

        case "reddit": {
            const postUrl = buildPostUrl("reddit", meta);
            if (!postUrl) return null;
            return (
                <Box mb="xs">
                    <RedditEmbed postUrl={postUrl} />
                </Box>
            );
        }

        default:
            return null;
    }
}
