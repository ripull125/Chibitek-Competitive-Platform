// server
// navigate to Puppeteer/server
// node server.js
// client
// navigate to Puppeteer/client
// npm run dev
import dotenv from 'dotenv';

dotenv.config();

const { OPENAI_API_KEY } = process.env;
const chatGptModel = 'gpt-4o-mini';
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
  if (!OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set; skipping keyword suggestions.');
    return books.map((book) => ({ ...book, keywords: [] }));
  }

  const userPayload = books.map((book, index) => ({
    index,
    title: book.title,
    price: book.price,
    availability: book.availability,
  }));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: chatGptModel,
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
    }),
  });

  if (!response.ok) {
    console.error('Keyword suggestion request failed:', response.status, response.statusText);
    return books.map((book) => ({ ...book, keywords: [] }));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return parseKeywordsResponse(content, books);
}
