import { Router } from 'express';
import { supabase } from '../supabase.js';
import { ensurePlatform, requireUserId, getRedditPlatformId } from './helpers.js';

const router = Router();

router.post("/api/posts", async (req, res) => {
  const {
    platform_id: rawPlatformId,
    platform_name,
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

  if ((!rawPlatformId && !platform_name) || !platform_user_id || !platform_post_id || !user_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const PLATFORM_NAME_MAP = { x: 'X', youtube: 'YouTube', reddit: 'Reddit', linkedin: 'LinkedIn', instagram: 'Instagram', tiktok: 'TikTok' };
  let platform_id = rawPlatformId;
  if (platform_name) {
    const resolvedName = PLATFORM_NAME_MAP[platform_name.toLowerCase()] || platform_name;
    platform_id = await ensurePlatform(resolvedName);
  }

  const REDDIT_PLATFORM_ID = getRedditPlatformId();

  try {
    const profileUrlMap = {
      1: `https://x.com/${username}`,
      3: `https://www.instagram.com/${username}`,
      5: `https://www.tiktok.com/@${username}`,
      8: `https://www.youtube.com/channel/${platform_user_id}`,
    };
    profileUrlMap[REDDIT_PLATFORM_ID] = `https://www.reddit.com/user/${username}`;
    const profileUrl = profileUrlMap[platform_id] || `https://unknown/${username}`;

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
          display_name: username || platform_user_id,
          profile_url: profileUrl,
        })
        .select()
        .single();
      if (compErr) throw compErr;
      competitor = newComp;
    }

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

    console.log('[POST /api/posts] Saving metrics – likes:', likes, 'shares:', shares, 'comments:', comments, 'views:', views);
    await supabase.from("post_metrics").insert({
      post_id: post.id,
      snapshot_at: new Date(),
      likes,
      shares,
      comments,
      other_json: { views: views ?? 0 },
    });

    if (platform_id === 8) {
      const { error: detailsError } = await supabase.from("post_details_platform").insert({
        post_id: post.id,
        extra_json: { title, description, channelTitle, videoId, views },
      });
      if (detailsError) console.error('Error saving post details:', detailsError);
    }

    if (platform_id === 1) {
      const { error: detailsError } = await supabase.from("post_details_platform").insert({
        post_id: post.id,
        extra_json: {
          author_name: author_name || username,
          author_handle: author_handle || username,
          username,
          views: views ?? 0,
        },
      });
      if (detailsError) console.error('Error saving X post details:', detailsError);
    }

    if ([3, 5, REDDIT_PLATFORM_ID].includes(platform_id)) {
      const { error: detailsError } = await supabase.from("post_details_platform").insert({
        post_id: post.id,
        extra_json: {
          author_name: author_name || username,
          author_handle: author_handle || username,
          username,
          views: views ?? 0,
        },
      });
      if (detailsError) console.error('Error saving post details:', detailsError);
    }

    res.json({ saved: true, post_id: post.id });
  } catch (err) {
    console.error("Save post failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/posts", async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select(`
  id,
  platform_id,
  platform_post_id,
  url,
  content,
  published_at,
  tone,
  competitors(display_name),
  post_metrics(likes, shares, comments, other_json),
  post_details_platform(extra_json)
`)
      .eq("user_id", userId)
      .order("published_at", { ascending: false });

    if (error) throw error;

    const formattedPosts = posts.map((post) => {
      const extra = post.post_details_platform?.[0]?.extra_json || {};
      const competitorName = post.competitors?.display_name
        ?? post.competitors?.[0]?.display_name
        ?? undefined;

      const authorName = extra.author_name || extra.name || competitorName || extra.author?.name;
      const authorHandle = extra.author_handle || extra.username || competitorName;

      return {
        id: post.id,
        platform_id: post.platform_id || 0,
        platform_post_id: post.platform_post_id || null,
        url: post.url || null,
        content: post.content,
        published_at: post.published_at,
        tone: post.tone || null,
        likes: post.post_metrics?.[0]?.likes || 0,
        shares: post.post_metrics?.[0]?.shares || 0,
        comments: post.post_metrics?.[0]?.comments || 0,
        views: post.post_metrics?.[0]?.other_json?.views || extra.views || 0,
        username: authorHandle || undefined,
        extra: {
          ...extra,
          author_name: authorName || undefined,
          author_handle: authorHandle || undefined,
          username: authorHandle || undefined,
          title: extra.title,
          description: extra.description,
          channelTitle: extra.channelTitle,
          videoId: extra.videoId,
          views: post.post_metrics?.[0]?.other_json?.views || extra.views || 0,
        },
      };
    });

    res.json({ posts: formattedPosts });
  } catch (err) {
    console.error("Fetch posts failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/posts", async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .eq("user_id", userId);
    if (deleteError) throw deleteError;
    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete all posts failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/posts/:id", async (req, res) => {
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

// GET /api/posts/saved-ids — return platform_post_ids the user already saved
router.get('/api/posts/saved-ids', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { data, error } = await supabase
      .from('posts')
      .select('platform_post_id')
      .eq('user_id', userId);

    if (error) throw error;
    const ids = (data || []).map((r) => r.platform_post_id);
    return res.json({ ids });
  } catch (err) {
    console.error('saved-ids error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
