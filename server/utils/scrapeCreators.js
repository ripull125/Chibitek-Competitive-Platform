// Scrape Creators API helper with key rotation + failover
import fetch from 'node-fetch';

const SCRAPE_CREATORS_BASE = 'https://api.scrapecreators.com';

// Collect all SCRAPE_CREATORS* keys from env (loaded once)
let _cachedKeys = null;
function loadApiKeys() {
  if (_cachedKeys) return _cachedKeys;
  const keys = [];
  for (let i = 0; i <= 50; i++) {
    const key = process.env[`SCRAPE_CREATORS${i}`];
    if (key) keys.push(key);
  }
  if (!keys.length) {
    throw new Error('No SCRAPE_CREATORS API keys found in env');
  }
  _cachedKeys = keys;
  console.log(`[ScrapeCreators] Loaded ${keys.length} API keys`);
  return keys;
}

// Track which keys are temporarily exhausted (402) or invalid (401)
// Map<keyIndex, expiry timestamp>  — keys are excluded until expiry
const _disabledKeys = new Map();

let _keyIndex = 0;

/**
 * Get the next usable key index, skipping disabled ones.
 * Returns { key, index } or throws if all keys are disabled.
 */
function getNextKey() {
  const keys = loadApiKeys();
  const now = Date.now();

  // Clean up expired entries
  for (const [idx, expiry] of _disabledKeys) {
    if (now >= expiry) _disabledKeys.delete(idx);
  }

  // Try up to keys.length times to find a non-disabled key
  for (let tries = 0; tries < keys.length; tries++) {
    const idx = _keyIndex % keys.length;
    _keyIndex++;
    if (!_disabledKeys.has(idx)) {
      return { key: keys[idx], index: idx };
    }
  }

  // All keys disabled — clear the map and return the first anyway
  console.warn('[ScrapeCreators] All keys are disabled, resetting...');
  _disabledKeys.clear();
  const idx = _keyIndex % keys.length;
  _keyIndex++;
  return { key: keys[idx], index: idx };
}

function disableKey(index, durationMs) {
  _disabledKeys.set(index, Date.now() + durationMs);
  console.log(`[ScrapeCreators] Key #${index + 1} disabled for ${Math.round(durationMs / 1000)}s (${_disabledKeys.size} disabled)`);
}

/**
 * Call a Scrape Creators endpoint with automatic key failover.
 *
 * On 401 (invalid key) or 402 (credits exhausted) the failing key is
 * temporarily disabled and the request is retried with the next available key.
 * On 500+ the same key is retried after a backoff.
 * On 404 (not found / private) the error is returned immediately — there's
 * no point retrying with a different key.
 *
 * @param {string} path   - e.g. "/v1/linkedin/profile"
 * @param {Record<string,string>} params - query params e.g. { url: "..." }
 * @param {object} [opts]
 * @param {number} [opts.maxKeyAttempts] - how many different keys to try (default: all)
 * @returns {Promise<object>} parsed JSON body
 */
export async function scrapeCreators(path, params = {}, { maxKeyAttempts } = {}) {
  const keys = loadApiKeys();
  const maxAttempts = maxKeyAttempts ?? keys.length;

  // Local test-mode mock: if the only key is the placeholder 'dummy' or
  // SCRAPE_CREATORS_MOCK=1 is set, return canned responses so local testing
  // can proceed without contacting the external API.
  const isMock = (keys.length === 1 && keys[0] === 'dummy') || process.env.SCRAPE_CREATORS_MOCK === '1';
  if (isMock) {
    // Minimal fake responses tailored to the most-common paths used by tests.
    if (path.startsWith('/v1/tiktok/profile')) {
      const handle = params.handle || 'demo';
      const videos = Array.from({ length: 12 }).map((_, i) => ({
        aweme_id: `1000${i}`,
        desc: `Demo video ${i} by ${handle}`,
        author: { uniqueId: handle, nickname: handle },
        url: `https://www.tiktok.com/@${handle}/video/1000${i}`,
      }));
      return { uniqueId: handle, nickname: handle, itemList: videos };
    }
    if (path === '/v1/tiktok/search/keyword' || path === '/v1/tiktok/search/hashtag') {
      const q = params.query || params.hashtag || 'demo';
      const hits = Array.from({ length: 12 }).map((_, i) => ({ data: { aweme_id: `2000${i}`, desc: `${q} result ${i}`, author: { uniqueId: q } } }));
      return { search_item_list: hits, cursor: null };
    }
    if (path === '/v1/reddit/subreddit/details') {
      // Return subreddit metadata including rules expected by the frontend
      return {
        display_name: params.subreddit || 'demo',
        description: `Demo subreddit for ${params.subreddit || 'demo'}`,
        subscribers: 12345,
        weekly_active_users: 678,
        weekly_contributions: 12,
        submit_text: 'Demo submit text',
        advertiser_category: 'Technology',
        rules: [
          { short_name: 'No Spam', description: 'No spammy posts' },
          { short_name: 'Be Respectful', description: 'Be kind to others' },
        ],
      };
    }
    if (path.startsWith('/v1/reddit/subreddit')) {
      const posts = Array.from({ length: 12 }).map((_, i) => ({ id: `t3_demo${i}`, title: `Demo post ${i}`, selftext: `Demo content ${i}`, permalink: `/r/demo/comments/t3_demo${i}` }));
      return { posts };
    }
    if (path === '/v1/reddit/search') {
      const posts = Array.from({ length: 8 }).map((_, i) => ({ id: `s_demo${i}`, title: `Search post ${i}`, selftext: `Search content ${i}`, permalink: `/r/search/comments/s_demo${i}` }));
      return { posts };
    }
    if (path.startsWith('/v1/linkedin/profile')) {
      return { url: params.url || 'https://linkedin.com/in/demo', name: 'Demo Person', headline: 'Demo Headline', activity: Array.from({ length: 10 }).map((_, i) => ({ id: `lnk_post_${i}`, text: `Demo activity ${i}`, url: `https://linkedin.com/posts/demo_${i}` })) };
    }
    if (path.startsWith('/v1/google/search')) {
      return { results: [{ url: `https://twitter.com/${params.query?.split(' ')[0] || 'demo'}` }] };
    }
  }

  const url = new URL(path, SCRAPE_CREATORS_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }

  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { key: apiKey, index: keyIdx } = getNextKey();

    try {
      // Abort after 35 seconds; some endpoints are slow but still valid.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35_000);

      let resp;
      try {
        resp = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'x-api-key': apiKey },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Scrape Creators sometimes returns JSON with a non-JSON content-type,
      // so always try to parse the body as JSON first.
      const text = await resp.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Scrape Creators returned non-JSON (${resp.status}): ${text.slice(0, 500)}`);
      }

      if (resp.ok) {
        return json;
      }

      const msg = json?.error || json?.message || `API error ${resp.status}`;
      lastError = new Error(`External API error (${resp.status}): ${msg}`);
      lastError.status = resp.status;

      // ── Decide what to do based on status code ─────────────────────

      if (resp.status === 401) {
        // Invalid / revoked key → disable for 1 hour, try next key
        disableKey(keyIdx, 60 * 60 * 1000);
        continue;
      }

      if (resp.status === 402) {
        // Credits exhausted → disable for 30 min, try next key
        disableKey(keyIdx, 30 * 60 * 1000);
        continue;
      }

      if (resp.status === 429) {
        // Rate limited → disable for 60s, try next key
        disableKey(keyIdx, 60 * 1000);
        continue;
      }

      if (resp.status >= 500) {
        // Server error → wait briefly, then try next key
        await new Promise(r => setTimeout(r, (attempt + 1) * 500));
        continue;
      }

      // 400, 404, etc. → don't retry, the request itself is wrong or the
      // resource doesn't exist.  Throw immediately.
      throw lastError;

    } catch (err) {
      // If the error was thrown by us (from the block above) just re-throw
      if (err === lastError) throw err;

      // Timeout (AbortError) can be transient; retry with backoff.
      if (err.name === 'AbortError') {
        lastError = new Error(`Request timed out after 35s: ${path}`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 750));
        continue;
      }

      // Network / fetch error → try next key
      lastError = err;
      await new Promise(r => setTimeout(r, (attempt + 1) * 500));
      continue;
    }
  }

  throw lastError || new Error('All Scrape Creators API keys exhausted');
}

/* ──────────────────────────────────────────────────────────────────────────
 *  scrapeCreatorsPaginated
 *
 *  ScrapeCreators endpoints do NOT accept a `limit` parameter — they
 *  return a fixed page of results (~10-12) and expose a pagination cursor.
 *  This helper fetches successive pages until `limit` items are collected.
 *
 *  ⚠ Each page costs 1 credit.
 * ────────────────────────────────────────────────────────────────────── */

const PAGINATION_CONFIG = {
  // Instagram
  '/v2/instagram/user/posts': {
    resultsKey: 'items',
    cursorParam: 'next_max_id',
    getCursor: (resp) => resp.next_max_id,
    hasMore: (resp) => resp.more_available === true,
  },
  '/v2/instagram/reels/search': {
    resultsKey: 'reels',
    cursorParam: 'page',
    // page is a simple counter: 1, 2, 3 …
    getCursor: (_resp, prevCursor) => (Number(prevCursor) || 1) + 1,
    hasMore: (resp) => Array.isArray(resp.reels) && resp.reels.length > 0,
  },
  '/v1/instagram/user/reels': {
    resultsKey: 'items',
    cursorParam: 'max_id',
    getCursor: (resp) => resp.paging_info?.max_id,
    hasMore: (resp) => resp.paging_info?.more_available === true,
  },

  // TikTok
  '/v1/tiktok/search/keyword': {
    resultsKey: 'search_item_list',
    cursorParam: 'cursor',
    getCursor: (resp) => resp.cursor,
    hasMore: (resp) =>
      resp.cursor != null &&
      Array.isArray(resp.search_item_list) &&
      resp.search_item_list.length > 0,
  },
  '/v1/tiktok/search/hashtag': {
    resultsKey: 'challenge_aweme_list',
    cursorParam: 'cursor',
    getCursor: (resp) => resp.cursor,
    hasMore: (resp) =>
      resp.cursor != null &&
      Array.isArray(resp.challenge_aweme_list) &&
      resp.challenge_aweme_list.length > 0,
  },

  // Reddit
  '/v1/reddit/subreddit': {
    resultsKey: 'posts',
    cursorParam: 'after',
    getCursor: (resp) => resp.after,
    hasMore: (resp) => !!resp.after,
  },
  '/v1/reddit/subreddit/search': {
    resultsKey: 'posts',
    cursorParam: 'after',
    getCursor: (resp) => resp.after,
    hasMore: (resp) => !!resp.after,
  },
  '/v1/reddit/search': {
    resultsKey: 'posts',
    cursorParam: 'after',
    getCursor: (resp) => resp.after,
    hasMore: (resp) => !!resp.after,
  },
};

/**
 * Fetch up to `limit` results by auto-paginating a ScrapeCreators endpoint.
 *
 * @param {string} path   – endpoint path (e.g. "/v2/instagram/reels/search")
 * @param {Record<string,any>} params – query params **without** limit
 * @param {number} [limit=10] – desired result count
 * @returns {Promise<object>} – the response object with combined results
 */
export async function scrapeCreatorsPaginated(path, params = {}, limit = 10) {
  const config = PAGINATION_CONFIG[path];

  // If no pagination config or limit small enough for 1 page → single call
  if (!config) return scrapeCreators(path, params);

  const maxPages = Math.min(Math.ceil(limit / 8), 10); // cap at 10 pages
  let allResults = [];
  let lastResp = null;
  let cursorValue = null;

  for (let page = 0; page < maxPages; page++) {
    const pageParams =
      page === 0
        ? { ...params }
        : { ...params, [config.cursorParam]: cursorValue };

    const resp = await scrapeCreators(path, pageParams);
    lastResp = resp;

    const items = resp[config.resultsKey];
    if (!Array.isArray(items) || items.length === 0) break;

    allResults.push(...items);

    if (allResults.length >= limit) break;
    if (!config.hasMore(resp)) break;

    const nextCursor = config.getCursor(resp, cursorValue);
    if (nextCursor == null) break;

    cursorValue = nextCursor;
  }

  // Trim to the requested limit
  allResults = allResults.slice(0, limit);

  const pagesUsed = lastResp ? Math.min(maxPages, Math.ceil(allResults.length / 8) || 1) : 0;
  console.log(
    `[ScrapeCreators] Paginated ${path}: ${allResults.length}/${limit} items in ≤${pagesUsed} page(s)`
  );

  // Return the last response shape but with the combined results array
  return lastResp
    ? { ...lastResp, [config.resultsKey]: allResults }
    : {};
}
