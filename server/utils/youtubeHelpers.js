import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const YT_BASE = 'https://www.googleapis.com/youtube/v3';

export function ytKey() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error('YOUTUBE_API_KEY not configured');
  return k;
}

export async function ytFetch(urlPath, params = {}) {
  const url = new URL(urlPath, YT_BASE);
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

export function extractYouTubeVideoId(input) {
  if (!input) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
  } catch { return null; }
  return null;
}

export async function getTranscriptFromPython(videoId) {
  try {
    const pythonScript = path.join(__dirname, '..', 'get_transcript.py');
    const { stdout, stderr } = await execAsync(`python3 "${pythonScript}" "${videoId}"`, {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (stderr) console.error('Python stderr:', stderr);
    const result = JSON.parse(stdout);
    if (!result.success) console.error('Python transcript extraction failed:', result.error);
    return result;
  } catch (err) {
    console.error('Python transcript extraction error:', err.message);
  }
}

export async function resolveChannelId(input) {
  const trimmed = String(input || '').trim();
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) return trimmed;

  const handleMatch = trimmed.match(/@([\w.-]+)/);
  if (handleMatch) {
    const data = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: handleMatch[0], type: 'channel', maxResults: 1 });
    if (data.items?.[0]?.snippet?.channelId) return data.items[0].snippet.channelId;
    const chData = await ytFetch(`${YT_BASE}/channels`, { part: 'id', forHandle: handleMatch[1] });
    if (chData.items?.[0]?.id) return chData.items[0].id;
    throw new Error(`Could not find channel for ${handleMatch[0]}`);
  }

  try {
    const url = new URL(trimmed);
    const chMatch = url.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (chMatch) return chMatch[1];

    const nameMatch = url.pathname.match(/\/(c|user|@)([\w.-]+)/);
    if (nameMatch) {
      const handle = nameMatch[2];
      const chData = await ytFetch(`${YT_BASE}/channels`, { part: 'id', forHandle: handle });
      if (chData.items?.[0]?.id) return chData.items[0].id;
      const sData = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: handle, type: 'channel', maxResults: 1 });
      if (sData.items?.[0]?.snippet?.channelId) return sData.items[0].snippet.channelId;
      throw new Error(`Could not find channel for ${handle}`);
    }
  } catch (e) {
    if (e.message.includes('Could not find')) throw e;
  }

  const sData = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: trimmed, type: 'channel', maxResults: 1 });
  if (sData.items?.[0]?.snippet?.channelId) return sData.items[0].snippet.channelId;
  throw new Error(`Could not find channel for "${trimmed}"`);
}

export async function fetchChannelDetails(channelId) {
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

export async function fetchChannelVideos(channelId, maxResults = 10) {
  const ch = await fetchChannelDetails(channelId);
  if (!ch.uploadsPlaylistId) return [];

  const data = await ytFetch(`${YT_BASE}/playlistItems`, {
    part: 'snippet,contentDetails',
    playlistId: ch.uploadsPlaylistId,
    maxResults: Math.min(maxResults, 50),
  });
  const videoIds = (data.items || []).map(i => i.contentDetails.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  const vData = await ytFetch(`${YT_BASE}/videos`, {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });
  return (vData.items || []).map(v => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description || "",
    publishedAt: v.snippet.publishedAt,
    channelTitle: v.snippet.channelTitle,
    thumbnails: v.snippet.thumbnails,
    duration: v.contentDetails?.duration,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
  }));
}

export async function fetchVideoDetails(videoId) {
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

export async function searchYouTube(query, maxResults = 10) {
  const data = await ytFetch(`${YT_BASE}/search`, {
    part: 'snippet',
    q: query,
    maxResults: Math.min(maxResults, 50),
    type: 'video',
    order: 'relevance',
  });
  const videoIds = (data.items || []).map(i => i.id?.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  const vData = await ytFetch(`${YT_BASE}/videos`, {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });
  return (vData.items || []).map(v => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description || "",
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
