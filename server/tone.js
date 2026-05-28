import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { collectCerebrasApiKeys } from './utils/envKeys.js';

dotenv.config();

const CEREBRAS_API_KEYS = collectCerebrasApiKeys();
const CEREBRAS_MODELS = (process.env.TONE_CEREBRAS_MODELS || process.env.CHAT_MODEL_CEREBRAS_FALLBACKS || 'gpt-oss-120b,llama3.1-8b')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MODEL = process.env.TONE_CEREBRAS_MODEL || CEREBRAS_MODELS[0] || 'gpt-oss-120b';

let cerebrasToneKeyIndex = 0;
function nextToneKey() {
  if (!CEREBRAS_API_KEYS.length) return null;
  const index = cerebrasToneKeyIndex % CEREBRAS_API_KEYS.length;
  cerebrasToneKeyIndex++;
  return { apiKey: CEREBRAS_API_KEYS[index], index };
}

const ALLOWED_TONES = [
  'Professional',
  'Promotional',
  'Informative',
  'Persuasive',
  'Confident',
  'Approachable',
  'Authoritative',
  'Inspirational',
  'Conversational',
  'Assertive',
  'Casual',
  'Customer-centric',
  'Urgent',
  'Optimistic',
  'Polished',
];

function normalizeToneLabel(label) {
  if (!label) return null;
  const s = String(label).trim().toLowerCase();
  // Exact match
  for (const allowed of ALLOWED_TONES) {
    if (allowed.toLowerCase() === s) return allowed;
  }
  // Containment match (e.g., "very professional" -> Professional)
  for (const allowed of ALLOWED_TONES) {
    if (s.includes(allowed.toLowerCase())) return allowed;
  }
  // Reverse containment (e.g., "professional tone" -> Professional)
  for (const allowed of ALLOWED_TONES) {
    if (allowed.toLowerCase().includes(s)) return allowed;
  }
  return null;
}

export async function categorizeTone(text, post_id, user_id) {
  if (!CEREBRAS_API_KEYS || CEREBRAS_API_KEYS.length === 0) {
    throw new Error('No Cerebras API keys configured');
  }

  // DEBUG: detect if input text already includes an allowed tone label. This can
  // help trace cases where the client inadvertently resubmits a post that
  // already carried a tone property.
  if (typeof text === 'string' && text) {
    const scan = text.toLowerCase();
    for (const allowed of ALLOWED_TONES) {
      if (scan.includes(allowed.toLowerCase())) {
        console.debug('[tone.js] categorizeTone received text containing', allowed);
        break;
      }
    }
  }

  if (post_id || user_id) {
    console.debug('[tone.js] categorizeTone called for post_id:', post_id, 'user_id:', user_id);
  }

  const systemPrompt = `You are a strict tone classification assistant. Given a piece of text, return ONLY a single JSON object (no surrounding explanation) with keys: \n- "tone": one of ${ALLOWED_TONES.join(', ')} (choose the single best label),\n- "confidence": a number between 0.0 and 1.0,\n- "notes": a short (1-2 sentence) justification.\nRespond with valid JSON only.`;

  const userPrompt = `Classify the tone of the following text and return ONLY the JSON described above. Text:\n\n${String(text).slice(0, 4000)}`;

  let lastError = null;

  // Try all configured models across all keys. This lets old/deprecated model
  // selections fall forward and lets every key participate in the rotation.
  const modelsToTry = Array.from(new Set([MODEL, ...CEREBRAS_MODELS].filter(Boolean)));
  const maxAttempts = Math.max(1, CEREBRAS_API_KEYS.length) * Math.max(1, modelsToTry.length);
  let modelIndex = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const keySlot = nextToneKey();
    if (!keySlot) break;
    const { apiKey, index: keyIndex } = keySlot;
    const model = modelsToTry[modelIndex] || MODEL;

    try {
      const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.0,
          max_tokens: 220,
        }),
      });

      // Check if this is a token/rate limit error
      if (resp.status === 401 || resp.status === 429) {
        const body = await resp.text();
        console.warn(`[tone.js] Key ${keyIndex + 1} failed with ${resp.status}, trying next key...`);
        lastError = new Error(`Cerebras error: ${resp.status} ${body}`);
        continue; // Try next key
      }

      if (resp.status === 404 && modelIndex < modelsToTry.length - 1) {
        const body = await resp.text();
        lastError = new Error(`Cerebras model ${model} failed with 404: ${body}`);
        modelIndex++;
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Cerebras error: ${resp.status} ${body}`);
      }

      // Success! Process and return the response
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Try parsing model output as JSON
      let parsed = null;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        // sometimes model wraps JSON in markdown; try to extract JSON block
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch (e) {
            parsed = null;
          }
        }
      }

      // Normalization
      let normalized = null;
      if (parsed && parsed.tone) {
        const tone = normalizeToneLabel(parsed.tone);
        let confidence = null;
        if (typeof parsed.confidence === 'number') confidence = Math.max(0, Math.min(1, parsed.confidence));
        else if (typeof parsed.confidence === 'string') {
          const n = parseFloat(parsed.confidence);
          if (!Number.isNaN(n)) confidence = Math.max(0, Math.min(1, n));
        }

        normalized = {
          tone: tone,
          confidence: confidence,
          notes: parsed.notes || null,
        };
      }

      return { raw: content, parsed, normalized, allowedTones: ALLOWED_TONES };
    } catch (err) {
      lastError = err;
      // If it's not a 401/429 error, throw immediately instead of trying other keys
      if (!(err.message && (err.message.includes('401') || err.message.includes('429')))) {
        throw err;
      }
      // For 401/429, continue to next key
      if (attempt < maxAttempts - 1) {
        console.warn(`[tone.js] Key ${keyIndex + 1} failed, trying next key...`);
      }
    }
  }

  // All keys exhausted
  throw lastError || new Error('All Cerebras API keys failed');
}
