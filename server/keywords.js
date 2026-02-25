// server
// navigate to server
// node server.js
// client
// navigate to client
// npm run dev
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const { GITHUB_TOKEN, OPENAI_API_KEY, OPENAI_BASE_URL, CHAT_MODEL, LLM_PROVIDER } = process.env;
const githubAiEndpoint = 'https://models.github.ai/inference';
const chatModel = CHAT_MODEL || 'openai/gpt-5-nano';
const provider = String(LLM_PROVIDER || 'auto').toLowerCase();
const usingGithub = provider === 'github' || (provider === 'auto' && !!GITHUB_TOKEN);
const chatApiKey = usingGithub ? GITHUB_TOKEN : OPENAI_API_KEY;
const chatBaseUrl = usingGithub
  ? githubAiEndpoint
  : (OPENAI_BASE_URL || 'https://api.openai.com/v1');
const openai = new OpenAI({ baseURL: chatBaseUrl, apiKey: chatApiKey });
const systemPrompt =
  'You generate 3-5 concise search keywords for each book. Return only JSON in the shape {"books": [{"keywords": ["keyword1", ...]}]} matching the input order. Keep keywords simple.';

const parseKeywordsResponse = (content, books) => {
  try {
    const parsed = JSON.parse(content || '{}');
    if (Array.isArray(parsed.books)) {
      return books.map((book, idx) => {
        const keywords = Array.isArray(parsed.books[idx]?.keywords)
          ? parsed.books[idx].keywords.filter(Boolean).map(String)
          : [];
        return { ...book, keywords };
      });
    }
  } catch (error) {
    console.error('Failed to parse keyword suggestions:', error);
  }
  return books.map((book) => ({ ...book, keywords: [] }));
};

export async function suggestKeywordsForBooks(books = []) {
  if (!Array.isArray(books) || books.length === 0) return [];
  if (!chatApiKey) {
    console.warn('Chat API key not set; skipping keyword suggestions.');
    return books.map((book) => ({ ...book, keywords: [] }));
  }

  const userPayload = books.map((book, index) => ({
    index,
    title: book.title,
    price: book.price,
    availability: book.availability,
  }));

  const response = await openai.chat.completions.create({
    model: chatModel,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `Books to tag: ${JSON.stringify(userPayload)}`,
      },
    ],
  });

  console.log("Query Complete")

  const content = response.choices?.[0]?.message?.content;
  return parseKeywordsResponse(content, books);
}
