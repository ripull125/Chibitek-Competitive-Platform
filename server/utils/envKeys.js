function cleanEnvValue(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function pushEnvValue(values, seen, value, { split = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return;

  const parts = split ? raw.split(/[;,\n]/) : [raw];
  for (const part of parts) {
    const cleaned = cleanEnvValue(part);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    values.push(cleaned);
  }
}

function sortedEnvNames() {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return Object.keys(process.env).sort((a, b) => collator.compare(a, b));
}

export function collectEnvValues({ singleNames = [], csvNames = [], matchName } = {}) {
  const values = [];
  const seen = new Set();

  for (const name of singleNames) {
    pushEnvValue(values, seen, process.env[name]);
  }

  for (const name of csvNames) {
    pushEnvValue(values, seen, process.env[name], { split: true });
  }

  if (typeof matchName === 'function') {
    for (const name of sortedEnvNames()) {
      if (!matchName(name)) continue;
      const shouldSplit = /(?:^|_)(?:KEYS|TOKENS)(?:_|$)/i.test(name);
      pushEnvValue(values, seen, process.env[name], { split: shouldSplit });
    }
  }

  return values;
}

export function collectCerebrasApiKeys() {
  return collectEnvValues({
    singleNames: ['CEREBRAS_API_KEY', 'CEREBRAS_KEY', 'CEREBRAS_TOKEN'],
    csvNames: ['CEREBRAS_API_KEYS', 'CEREBRAS_KEYS', 'CEREBRAS_TOKENS'],
    matchName: (name) =>
      /^CEREBRAS(?:_API)?(?:_KEY|_TOKEN)\d+$/i.test(name) ||
      /^CEREBRAS_(?:API_)?(?:KEY|TOKEN)_?\d+$/i.test(name),
  });
}

export function collectScrapeCreatorsApiKeys() {
  return collectEnvValues({
    singleNames: [
      'SCRAPE_CREATORS',
      'SCRAPE_CREATORS_API_KEY',
      'SCRAPE_CREATORS_KEY',
      'SCRAPE_CREATORS_TOKEN',
      'SCRAPECREATORS_API_KEY',
      'SCRAPECREATORS_KEY',
      'SCRAPECREATORS_TOKEN',
    ],
    csvNames: [
      'SCRAPE_CREATORS_API_KEYS',
      'SCRAPE_CREATORS_KEYS',
      'SCRAPE_CREATORS_TOKENS',
      'SCRAPECREATORS_API_KEYS',
      'SCRAPECREATORS_KEYS',
      'SCRAPECREATORS_TOKENS',
    ],
    matchName: (name) =>
      /^SCRAPE_CREATORS\d+$/i.test(name) ||
      /^SCRAPECREATORS\d+$/i.test(name) ||
      /^SCRAPE_CREATORS(?:_API)?(?:_KEY|_TOKEN)\d+$/i.test(name) ||
      /^SCRAPECREATORS(?:_API)?(?:_KEY|_TOKEN)\d+$/i.test(name) ||
      /^SCRAPE_CREATORS_(?:API_)?(?:KEY|TOKEN)_?\d+$/i.test(name) ||
      /^SCRAPECREATORS_(?:API_)?(?:KEY|TOKEN)_?\d+$/i.test(name),
  });
}
