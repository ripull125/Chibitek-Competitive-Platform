import { Router } from 'express';
import OpenAI from 'openai';
import { supabase } from '../supabase.js';
import { getUserIdFromRequest, requireUserId } from './helpers.js';

const router = Router();

const { GITHUB_TOKEN, OPENAI_API_KEY, OPENAI_BASE_URL, CHAT_MODEL, LLM_PROVIDER, CHAT_DEBUG } = process.env;
const githubAiEndpoint = 'https://models.github.ai/inference';
const chatModel = CHAT_MODEL || 'openai/gpt-5-nano';
const provider = String(LLM_PROVIDER || 'auto').toLowerCase();
const usingGithub = provider === 'github' || (provider === 'auto' && !!GITHUB_TOKEN);
const chatApiKey = usingGithub ? GITHUB_TOKEN : OPENAI_API_KEY;
const chatBaseUrl = usingGithub
  ? githubAiEndpoint
  : (OPENAI_BASE_URL || 'https://api.openai.com/v1');
const openai = new OpenAI({ baseURL: chatBaseUrl, apiKey: chatApiKey });

async function fetchLatestPostsContext(userId) {
  try {
    let query = supabase
      .from('posts')
      .select('platform_id, competitor_id, platform_post_id, url, content, created_at, published_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Failed to load posts for LLM context:', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to load posts for LLM context:', err);
    return [];
  }
}

router.post('/api/chat', async (req, res) => {
  if (!chatApiKey) {
    const missing = usingGithub ? 'GITHUB_TOKEN' : 'OPENAI_API_KEY';
    console.error(`Missing chat API key on server (${missing}).`);
    return res.status(500).json({
      error: `Chat API key is not configured on the server (${missing}).`,
    });
  }

  try {
    const { messages = [], attachments = [] } = req.body || {};
    const userId = getUserIdFromRequest(req);
    const latestPosts = await fetchLatestPostsContext(userId);

    const sanitizedMessages = Array.isArray(messages) ? messages.slice(-20) : [];

    const attachmentContext = (attachments || [])
      .filter((file) => file && file.name && file.content)
      .map((file) => {
        const preview = String(file.content).slice(0, 6000);
        return `Attachment: ${file.name} (${file.type || 'unknown type'})\n${preview}`;
      })
      .join('\n\n');

    const userMessages = attachmentContext
      ? [...sanitizedMessages, { role: 'user', content: `Attachment context:\n${attachmentContext}` }]
      : sanitizedMessages;

    const postsContext = latestPosts.length
      ? [
        'Latest posts from Supabase (most recent first):',
        JSON.stringify(
          latestPosts.slice(0, 20).map((post) => ({
            platform_id: post.platform_id,
            competitor_id: post.competitor_id,
            platform_post_id: post.platform_post_id,
            url: post.url,
            content: String(post.content || '').slice(0, 400),
            created_at: post.created_at,
            published_at: post.published_at,
          })),
          null,
          2
        ),
      ].join('\n')
      : null;

    const systemMessages = [
      {
        role: 'system',
        content:
          'You are ChibitekAI, a concise, helpful assistant for competitive intelligence. Use any provided attachment context to strengthen answers.',
      },
    ];
    if (postsContext) {
      systemMessages.push({
        role: 'system',
        content: postsContext,
      });
    }

    const response = await openai.chat.completions.create({
      model: chatModel,
      messages: [...systemMessages, ...userMessages],
    });

    const reply = response.choices?.[0]?.message?.content || 'No response from model.';
    return res.json({ reply });
  } catch (error) {
    const providerLabel = usingGithub ? 'github' : 'openai';
    const details = {
      message: error?.message,
      status: error?.status,
      name: error?.name,
      type: error?.type,
      code: error?.code,
      provider: providerLabel,
      baseUrl: chatBaseUrl,
      model: chatModel,
    };
    console.error('Chat completion error:', details);
    if (CHAT_DEBUG === 'true') {
      return res.status(500).json({
        error: 'Chat request failed.',
        details,
      });
    }
    const message = error?.message || 'Chat request failed.';
    const status = error?.status ? ` status=${error.status}` : '';
    return res.status(500).json({
      error: `${message} (provider=${providerLabel}${status})`,
    });
  }
});

router.get('/api/chat/health', (req, res) => {
  const providerLabel = usingGithub ? 'github' : 'openai';
  const keyPresent = Boolean(chatApiKey);
  res.json({
    ok: true,
    provider: providerLabel,
    baseUrl: chatBaseUrl,
    model: chatModel,
    keyPresent,
  });
});

router.post('/api/chat/conversations', async (req, res) => {
  const { title, conversation } = req.body || {};
  if (!Array.isArray(conversation) || !conversation.length) {
    return res.status(400).json({ error: 'conversation must be a non-empty array' });
  }

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        title: title || 'New chat',
        conversation,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Save conversation error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversation: data });
  } catch (err) {
    console.error('Save conversation failed:', err);
    return res.status(500).json({ error: 'Failed to save conversation.' });
  }
});

router.get('/api/chat/conversations', async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('List conversations error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversations: data || [] });
  } catch (err) {
    console.error('List conversations failed:', err);
    return res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

router.get('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Fetch conversation error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversation: data });
  } catch (err) {
    console.error('Fetch conversation failed:', err);
    return res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

router.delete('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.length) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('Delete conversation failed:', err);
    return res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

const deleteConversationById = async (id, req, res) => {
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.length) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('Delete conversation failed:', err);
    return res.status(500).json({ error: 'Failed to delete conversation.' });
  }
};

router.post('/api/chat/conversations/:id/delete', async (req, res) => {
  const { id } = req.params;
  return deleteConversationById(id, req, res);
});

router.post('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  const methodOverride = req.get('x-http-method-override') || req.query?._method;
  if (String(methodOverride || '').toUpperCase() !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  return deleteConversationById(id, req, res);
});

export default router;
