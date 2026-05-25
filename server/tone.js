import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { collectCerebrasApiKeys } from './utils/envKeys.js';

dotenv.config();

const CEREBRAS_API_KEYS = collectCerebrasApiKeys();
const CEREBRAS_MODELS = (process.env.TONE_CEREBRAS_MODELS || process.env.CHAT_MODEL_CEREBRAS_FALLBACKS || 'gpt-oss-120b,zai-glm-4.7')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MODEL = normalizeCerebrasModel(process.env.TONE_CEREBRAS_MODEL || CEREBRAS_MODELS[0] || 'gpt-oss-120b');

function normalizeCerebrasModel(model) {
  const raw = String(model || '').trim();
  if (!raw) return raw;
  const aliases = {
    'llama3.1-8b': 'gpt-oss-120b',
    'llama3.1-70b': 'gpt-oss-120b',
    'llama-3.1-70b': 'gpt-oss-120b',
    'llama-3.3-70b': 'gpt-oss-120b',
    'qwen-3-235b-a22b-instruct-2507': 'gpt-oss-120b',
    'qwen-3-32b': 'gpt-oss-120b',
    'qwen-3-14b': 'gpt-oss-120b',
    'deepseek-r1-distill-llama-70b': 'gpt-oss-120b',
  };
  return aliases[raw.toLowerCase()] || raw;
}

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


function inferToneLocally(text) {
  const value = String(text || '').toLowerCase();
  const rules = [
    { tone: 'Urgent', words: ['urgent', 'limited time', 'act now', 'last chance', 'deadline', 'immediately'] },
    { tone: 'Promotional', words: ['sale', 'discount', 'offer', 'launch', 'deal', 'promo', 'sign up', 'try now'] },
    { tone: 'Inspirational', words: ['inspire', 'achieve', 'journey', 'dream', 'proud', 'celebrate', 'together'] },
    { tone: 'Customer-centric', words: ['customers', 'clients', 'support', 'service', 'experience', 'feedback'] },
    { tone: 'Authoritative', words: ['research', 'report', 'study', 'according to', 'analysis', 'data shows'] },
    { tone: 'Confident', words: ['leading', 'best', 'proven', 'reliable', 'trusted', 'powerful'] },
    { tone: 'Conversational', words: ['we’re', "we're", 'you’ll', "you'll", 'let’s', "let's", 'check out'] },
  ];
  for (const rule of rules) {
    if (rule.words.some((word) => value.includes(word))) return rule.tone;
  }
  return 'Informative';
}

function buildLocalToneResult(text, reason = 'Cerebras rate limit reached; used local fallback tone classifier.') {
  const tone = inferToneLocally(text);
  const parsed = {
    tone,
    confidence: 0.45,
    notes: reason,
    fallback: true,
  };
  return {
    raw: JSON.stringify(parsed),
    parsed,
    normalized: { tone, confidence: parsed.confidence, notes: parsed.notes },
    allowedTones: ALLOWED_TONES,
    fallback: true,
  };
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
  let sawRateLimit = false;

  // Try valid models, but do not hammer every key twice when the issue is RPM.
  // A 404 moves to the next model; 401/429 moves to the next key once.
  const modelsToTry = Array.from(new Set([MODEL, ...CEREBRAS_MODELS.map(normalizeCerebrasModel), 'gpt-oss-120b', 'zai-glm-4.7'].filter(Boolean)));

  for (const model of modelsToTry) {
    let modelWasMissing = false;

    for (let attempt = 0; attempt < Math.max(1, CEREBRAS_API_KEYS.length); attempt++) {
      const keySlot = nextToneKey();
      if (!keySlot) break;
      const { apiKey, index: keyIndex } = keySlot;

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

        if (resp.status === 404) {
          const body = await resp.text();
          lastError = new Error(`Cerebras model ${model} failed with 404: ${body}`);
          modelWasMissing = true;
          break;
        }

        if (resp.status === 401 || resp.status === 429) {
          const body = await resp.text();
          sawRateLimit = sawRateLimit || resp.status === 429;
          console.warn(`[tone.js] Key ${keyIndex + 1} failed with ${resp.status}, trying next key...`);
          lastError = new Error(`Cerebras error: ${resp.status} ${body}`);
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
            tone,
            confidence,
            notes: parsed.notes || null,
          };
        }

        return { raw: content, parsed, normalized, allowedTones: ALLOWED_TONES };
      } catch (err) {
        lastError = err;
        if (!(err.message && (err.message.includes('401') || err.message.includes('429')))) {
          throw err;
        }
      }
    }

    if (!modelWasMissing && sawRateLimit) break;
  }

  if (sawRateLimit) {
    console.warn('[tone.js] Cerebras RPM exhausted for tone analysis; using local fallback tone classifier.');
    return buildLocalToneResult(text);
  }

  // All keys exhausted
  throw lastError || new Error('All Cerebras API keys failed');
}
