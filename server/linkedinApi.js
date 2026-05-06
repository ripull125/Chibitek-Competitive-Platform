import { scrapeCreators } from "./utils/scrapeCreators.js";

const LINKEDIN_HOST_RE = /(^|\.)linkedin\.com$/i;
const DEFAULT_LIMIT = 10;

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function normalizeLinkedinUrl(raw, type = "profile") {
  if (!raw) return raw;
  let value = String(raw).trim();

  if (/^https?:\/\//i.test(value)) return value;

  value = value.replace(/^@/, "").replace(/^\/+/, "").replace(/^(www\.)?linkedin\.com\/?/i, "");

  if (type === "company") {
    const slug = value.replace(/^company\//i, "").replace(/\/+$/, "");
    return `https://www.linkedin.com/company/${slug}`;
  }

  if (type === "post") {
    if (/^(posts|pulse|feed)\//i.test(value)) return `https://www.linkedin.com/${value}`;
    return `https://www.linkedin.com/posts/${value}`;
  }

  const slug = value.replace(/^in\//i, "").replace(/\/+$/, "");
  return `https://www.linkedin.com/in/${slug}`;
}

export function parseLinkedInInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { type: "empty", raw };

  const at = raw.match(/^@([A-Za-z0-9._-]{2,100})$/);
  if (at) {
    return {
      type: "profile",
      raw,
      handle: at[1],
      url: normalizeLinkedinUrl(at[1], "profile"),
      source: "handle",
    };
  }

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (LINKEDIN_HOST_RE.test(host)) {
      const path = url.pathname.toLowerCase();
      if (/\/(posts|pulse)\//i.test(path) || /\/feed\/update\//i.test(path)) {
        return { type: "post", raw, url: url.toString() };
      }
      if (/\/company\//i.test(path)) {
        return { type: "company", raw, url: url.toString() };
      }
      if (/\/in\//i.test(path) || /^\/[A-Za-z0-9._-]+\/?$/i.test(url.pathname)) {
        return { type: "profile", raw, url: url.toString() };
      }
    }
  } catch {
    // Not a URL; treat as keyword below.
  }

  return { type: "keyword", raw, query: raw };
}

function getCredits(...responses) {
  for (const resp of responses) {
    if (resp?.credits_remaining != null) return resp.credits_remaining;
  }
  return null;
}

function dateMs(value) {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

function postIdFromUrl(url) {
  const text = String(url || "");
  const activity = text.match(/activity[-:](\d{8,})/i);
  if (activity) return activity[1];
  const numeric = text.match(/(\d{8,})/);
  if (numeric) return numeric[1];
  return text || String(Date.now());
}

function sortPostsNewestFirst(posts = []) {
  return [...posts].sort((a, b) => dateMs(b.datePublished || b.published_at || b.created_at) - dateMs(a.datePublished || a.published_at || a.created_at));
}

function dedupePosts(posts = []) {
  const seen = new Set();
  const out = [];
  for (const post of posts) {
    if (!post) continue;
    const key = String(post.url || post.link || post.id || postIdFromUrl(post.url || post.link || "")).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(post);
  }
  return out;
}

function normalizeImage(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return normalizeImage(value[0]);
  return value.url || value.src || value.image || null;
}

function normalizeLinkedInPost(raw = {}, fallbackAuthor = {}) {
  const post = raw?.data || raw?.post || raw;
  const author = post.author || fallbackAuthor || {};
  const url = post.url || post.link || post.linkedinUrl || post.shareUrl || "";
  const title = post.name || post.title || post.headline || "";
  const text = post.description || post.text || post.body || post.content || title || "";
  const image = normalizeImage(post.image || post.thumbnailUrl || post.thumbnail || post.images);
  const id = String(post.id || post.urn || post.activityId || postIdFromUrl(url));

  return {
    ...post,
    id,
    url,
    link: url,
    name: post.name || title,
    title: post.title || title,
    headline: post.headline || title,
    description: text,
    text,
    datePublished: post.datePublished || post.publishedAt || post.created_at || post.date || null,
    likeCount: post.likeCount ?? post.reactionCount ?? post.numLikes ?? post.likes ?? 0,
    shareCount: post.shareCount ?? post.numShares ?? post.reposts ?? 0,
    commentCount: post.commentCount ?? post.numComments ?? post.commentsCount ?? post.comments?.length ?? 0,
    image,
    thumbnailUrl: post.thumbnailUrl || image || null,
    author: {
      ...author,
      name: author?.name || post.authorName || fallbackAuthor?.name || "LinkedIn",
      url: author?.url || post.authorUrl || fallbackAuthor?.url || "",
      followers: author?.followers ?? fallbackAuthor?.followers ?? null,
      image: author?.image || author?.profileImage || fallbackAuthor?.image || null,
    },
  };
}

function normalizeProfile(resp, url = null) {
  const profile = resp?.data || resp?.profile || resp;
  return {
    ...profile,
    url: profile.url || profile.linkedInUrl || profile.linkedinUrl || url,
    linkedInUrl: profile.linkedInUrl || profile.linkedinUrl || profile.url || url,
    image: profile.image || profile.profileImage || profile.picture || null,
    name: profile.name || profile.fullName || "LinkedIn profile",
    followers: profile.followers ?? profile.followerCount ?? null,
    recentPosts: Array.isArray(profile.recentPosts) ? profile.recentPosts : [],
    activity: Array.isArray(profile.activity) ? profile.activity : [],
  };
}

function normalizeCompany(resp, url = null) {
  const company = resp?.data || resp?.company || resp;
  return {
    ...company,
    url: company.url || company.linkedInUrl || company.linkedinUrl || url,
    linkedInUrl: company.linkedInUrl || company.linkedinUrl || company.url || url,
    logo: company.logo || company.image || company.profileImage || null,
    name: company.name || "LinkedIn company",
    posts: Array.isArray(company.posts) ? company.posts : [],
  };
}

function recentGoogleDate(daysBack = 90) {
  const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function linkedInPostUrlFromHit(hit) {
  const url = String(hit?.url || hit?.link || "").trim();
  if (!url || !/linkedin\.com\//i.test(url)) return null;
  if (/linkedin\.com\/(posts|pulse)\//i.test(url) || /linkedin\.com\/feed\/update\//i.test(url)) return url;
  return null;
}

export async function scrapeLinkedInProfile(url) {
  const normalizedUrl = normalizeLinkedinUrl(url, "profile");
  const resp = await scrapeCreators("/v1/linkedin/profile", { url: normalizedUrl });
  return {
    profile: normalizeProfile(resp, normalizedUrl),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

export async function scrapeLinkedInCompany(url) {
  const normalizedUrl = normalizeLinkedinUrl(url, "company");
  const resp = await scrapeCreators("/v1/linkedin/company", { url: normalizedUrl });
  return {
    company: normalizeCompany(resp, normalizedUrl),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

export async function scrapeLinkedInCompanyPosts(url, limit = DEFAULT_LIMIT, page = 1) {
  const normalizedUrl = normalizeLinkedinUrl(url, "company");
  const resp = await scrapeCreators("/v1/linkedin/company/posts", {
    url: normalizedUrl,
    page,
  });
  const posts = dedupePosts((resp?.posts || resp?.data?.posts || []).map((p) => normalizeLinkedInPost(p, { name: resp?.name || "LinkedIn company", url: normalizedUrl })));
  return {
    posts: sortPostsNewestFirst(posts).slice(0, clampInt(limit, 1, 25, DEFAULT_LIMIT)),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

export async function scrapeLinkedInPost(url, fallbackAuthor = {}) {
  const normalizedUrl = normalizeLinkedinUrl(url, "post");
  const resp = await scrapeCreators("/v1/linkedin/post", { url: normalizedUrl });
  return {
    post: normalizeLinkedInPost(resp, fallbackAuthor),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function hydratePostList(rawPosts = [], limit = DEFAULT_LIMIT, fallbackAuthor = {}) {
  const target = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const out = [];
  const credits = [];

  for (const raw of dedupePosts(rawPosts).slice(0, target)) {
    const url = raw.url || raw.link;
    if (!url) {
      out.push(normalizeLinkedInPost(raw, fallbackAuthor));
      continue;
    }

    try {
      const detailed = await scrapeLinkedInPost(url, fallbackAuthor);
      if (detailed?.post) out.push(detailed.post);
      if (detailed?.credits_remaining != null) credits.push(detailed.credits_remaining);
    } catch (err) {
      console.warn("[LinkedIn] Post hydrate failed; using lightweight post:", {
        url,
        message: err?.message,
        status: err?.response?.status,
      });
      out.push(normalizeLinkedInPost(raw, fallbackAuthor));
    }
  }

  return {
    posts: sortPostsNewestFirst(dedupePosts(out)).slice(0, target),
    credits_remaining: credits.length ? credits[credits.length - 1] : null,
  };
}

export async function searchLinkedInKeywordPosts(query, limit = DEFAULT_LIMIT) {
  const target = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const since = recentGoogleDate(90);
  const searches = [
    `${query} after:${since} site:linkedin.com/posts`,
    `${query} after:${since} site:linkedin.com/feed/update`,
    `${query} after:${since} site:linkedin.com/pulse`,
  ];

  const urls = [];
  let credits_remaining = null;

  for (const search of searches) {
    const resp = await scrapeCreators("/v1/google/search", { query: search });
    if (resp?.credits_remaining != null) credits_remaining = resp.credits_remaining;
    const hits = resp?.results || resp?.data || [];
    for (const hit of hits) {
      const url = linkedInPostUrlFromHit(hit);
      if (url && !urls.includes(url)) urls.push(url);
      if (urls.length >= target * 2) break;
    }
    if (urls.length >= target * 2) break;
  }

  const hydrated = await hydratePostList(urls.map((url) => ({ url })), target);

  return {
    posts: hydrated.posts,
    credits_remaining: hydrated.credits_remaining ?? credits_remaining,
    source: "google_to_linkedin_post",
  };
}

export async function lookupLinkedInInput(input, maxResults = DEFAULT_LIMIT) {
  const parsed = parseLinkedInInput(input);
  const limit = clampInt(maxResults, 1, 25, DEFAULT_LIMIT);

  if (parsed.type === "empty") {
    throw new Error("Please enter a LinkedIn @handle, profile/company/post URL, or keyword search.");
  }

  if (parsed.type === "profile") {
    const profileResult = await scrapeLinkedInProfile(parsed.url);
    const profile = profileResult.profile;
    const lightweightPosts = [...(profile.activity || []), ...(profile.recentPosts || [])];
    const hydrated = await hydratePostList(lightweightPosts, limit, {
      name: profile.name,
      url: profile.linkedInUrl || profile.url,
      followers: profile.followers,
      image: profile.image,
    });

    return {
      success: true,
      platform: "linkedin",
      mode: "account",
      input: parsed,
      results: {
        profile: { ...profile, recentPosts: [], activity: [] },
        profilePosts: hydrated.posts,
      },
      errors: [],
      credits_remaining: hydrated.credits_remaining ?? profileResult.credits_remaining ?? null,
    };
  }

  if (parsed.type === "company") {
    const companyResult = await scrapeLinkedInCompany(parsed.url);
    const company = companyResult.company;
    let companyPosts = [];
    let postsCredits = null;
    try {
      const companyPostsResult = await scrapeLinkedInCompanyPosts(parsed.url, limit, 1);
      const hydrated = await hydratePostList(companyPostsResult.posts, limit, {
        name: company.name,
        url: company.linkedInUrl || company.url,
        image: company.logo,
      });
      companyPosts = hydrated.posts;
      postsCredits = hydrated.credits_remaining ?? companyPostsResult.credits_remaining;
    } catch (err) {
      console.warn("[LinkedIn] Company posts lookup failed:", err?.message || err);
      companyPosts = company.posts || [];
    }

    return {
      success: true,
      platform: "linkedin",
      mode: "company",
      input: parsed,
      results: {
        company: { ...company, posts: [] },
        companyPosts,
      },
      errors: [],
      credits_remaining: postsCredits ?? companyResult.credits_remaining ?? null,
    };
  }

  if (parsed.type === "post") {
    const result = await scrapeLinkedInPost(parsed.url);
    return {
      success: true,
      platform: "linkedin",
      mode: "post",
      input: parsed,
      results: {
        post: result.post,
      },
      errors: [],
      credits_remaining: result.credits_remaining ?? null,
    };
  }

  const searchResult = await searchLinkedInKeywordPosts(parsed.query, limit);
  return {
    success: true,
    platform: "linkedin",
    mode: "keyword",
    input: parsed,
    results: {
      searchPosts: searchResult.posts,
    },
    errors: [],
    credits_remaining: searchResult.credits_remaining ?? null,
  };
}

export async function legacyLinkedInSearch(options = {}, inputs = {}, limit = DEFAULT_LIMIT) {
  const results = {};
  const errors = [];
  let credits_remaining = null;

  const assignCredits = (value) => {
    if (value?.credits_remaining != null) credits_remaining = value.credits_remaining;
  };

  if (options.profile && inputs.profile) {
    try {
      const profileResult = await scrapeLinkedInProfile(inputs.profile);
      results.profile = profileResult.profile;
      assignCredits(profileResult);
    } catch (err) {
      errors.push({ endpoint: "profile", error: err?.message || String(err) });
    }
  }

  if (options.company && inputs.company) {
    try {
      const companyResult = await scrapeLinkedInCompany(inputs.company);
      results.company = companyResult.company;
      assignCredits(companyResult);
    } catch (err) {
      errors.push({ endpoint: "company", error: err?.message || String(err) });
    }
  }

  if (options.post && inputs.post) {
    try {
      const postResult = await scrapeLinkedInPost(inputs.post);
      results.post = postResult.post;
      assignCredits(postResult);
    } catch (err) {
      errors.push({ endpoint: "post", error: err?.message || String(err) });
    }
  }

  if (inputs.keyword) {
    try {
      const search = await searchLinkedInKeywordPosts(inputs.keyword, limit);
      results.searchPosts = search.posts;
      assignCredits(search);
    } catch (err) {
      errors.push({ endpoint: "keyword", error: err?.message || String(err) });
    }
  }

  if (!Object.keys(results).length && errors.length) {
    const err = new Error(errors.map((e) => `${e.endpoint}: ${e.error}`).join("; "));
    err.errors = errors;
    throw err;
  }

  return { success: true, platform: "linkedin", results, errors, credits_remaining };
}
