import { supabase } from '../supabase.js';

export const getUserIdFromRequest = (req) =>
  req.body?.user_id || req.query?.user_id || req.get('x-user-id') || null;

export const requireUserId = (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: 'Missing user id.' });
    return null;
  }
  return String(userId);
};

export async function ensurePlatform(name) {
  const { data } = await supabase
    .from('platforms')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (data) return data.id;

  const { data: created, error } = await supabase
    .from('platforms')
    .insert({ name })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

let REDDIT_PLATFORM_ID = 6;

export function getRedditPlatformId() {
  return REDDIT_PLATFORM_ID;
}

export async function ensureRedditPlatform() {
  const { data } = await supabase
    .from('platforms')
    .select('id')
    .ilike('name', 'reddit')
    .maybeSingle();
  if (data) { REDDIT_PLATFORM_ID = data.id; return data.id; }

  const { data: created, error } = await supabase
    .from('platforms')
    .insert({ name: 'Reddit' })
    .select('id')
    .single();
  if (error) throw error;
  REDDIT_PLATFORM_ID = created.id;
  return created.id;
}
