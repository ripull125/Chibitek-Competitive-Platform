// Scrape Creators API helper with round-robin key rotation
import fetch from 'node-fetch';

const SCRAPE_CREATORS_BASE = 'https://api.scrapecreators.com';

// Collect all SCRAPE_CREATORS* keys from env
function loadApiKeys() {
  const keys = [];
  for (let i = 1; i <= 30; i++) {
    const key = process.env[`SCRAPE_CREATORS${i}`];
    if (key) keys.push(key);
  }
  if (!keys.length) {
    throw new Error('No SCRAPE_CREATORS API keys found in env');
  }
  return keys;
}

let keyIndex = 0;

function getNextKey() {
  const keys = loadApiKeys();
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}

/**
 * Call a Scrape Creators endpoint.
 * @param {string} path  - e.g. "/v1/linkedin/profile"
 * @param {Record<string,string>} params - query params e.g. { url: "..." }
 * @returns {Promise<object>} parsed JSON body
 */
export async function scrapeCreators(path, params = {}) {
  const url = new URL(path, SCRAPE_CREATORS_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }

  const apiKey = getNextKey();

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });

  // Scrape Creators sometimes returns JSON with a non-JSON content-type,
  // so always try to parse the body as JSON first.
  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Scrape Creators returned non-JSON (${resp.status}): ${text.slice(0, 500)}`);
  }

  if (!resp.ok) {
    const msg = json?.error || json?.message || `API error ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }

  return json;
}
