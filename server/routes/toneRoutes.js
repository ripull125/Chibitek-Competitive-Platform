import { Router } from 'express';
import { supabase } from '../supabase.js';
import { categorizeTone } from '../tone.js';

const router = Router();

async function updatePostTone(post_id, user_id, tone) {
  if (!post_id || !user_id || !tone) {
    return { success: false, error: 'Missing post_id, user_id, or tone' };
  }

  try {
    const { error: updateErr } = await supabase
      .from('posts')
      .update({ tone })
      .eq('id', post_id)
      .eq('user_id', user_id);

    if (updateErr) {
      console.error('[updatePostTone] Failed to update tone in database:', updateErr);
      return { success: false, error: updateErr.message };
    }

    console.log('[updatePostTone] Tone updated in database for post', post_id, ':', tone);
    return { success: true };
  } catch (err) {
    console.error('[updatePostTone] Exception:', err);
    return { success: false, error: err.message };
  }
}

router.post('/api/tone', async (req, res) => {
  try {
    const { message, post_id, user_id } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Missing message field' });
    }

    console.log(post_id + " " + user_id);

    const result = await categorizeTone(message, post_id, user_id);

    if (post_id && user_id && result.normalized?.tone) {
      const updateResult = await updatePostTone(post_id, user_id, result.normalized.tone);
      console.warn('starting update');
      if (!updateResult.success) {
        console.warn('[/api/tone] Tone analysis succeeded but database update failed:', updateResult.error);
      } else {
        console.warn('[/api/tone] Tone analysis succeeded and database update succeeded:');
      }
    }

    return res.json({ success: true, result });
  } catch (err) {
    console.error('Tone API error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
