/**
 * @typedef {Object} UniversalDataPoint
 * @property {string} Name/Source - The username or source of the data
 * @property {number} Engagement - Total engagement count (likes + retweets + replies + quotes + bookmarks)
 * @property {string} Message - The post text content
 */

// Client-side sentiment removed.  labels will be provided by the server LLM via `/api/assign-strategy`.

/**
 * Converts X/Twitter API response data into a universal data format
 * @param {Object} input - The X API response object
 * @returns {UniversalDataPoint[]} Array of universal data points with Name/Source, Engagement, and Message
 */
function convertXInput(input) {
  // Validate input
  if (!input || !input.success || !input.posts || !Array.isArray(input.posts)) {
    throw new Error('Invalid input format');
  }

  const source = input.username || 'Unknown';
  
  // Convert each post to universal format
  return input.posts.map(post => {
    const metrics = post.public_metrics || {};
    
    // Calculate total engagement
    const engagement = 
      (metrics.retweet_count || 0) +
      (metrics.reply_count || 0) +
      (metrics.like_count || 0) +
      (metrics.quote_count || 0) +
      (metrics.bookmark_count || 0);
    
    const messageText = post.text || '';
    
    return {
      'Name/Source': source,
      'Engagement': engagement,
      'Message': messageText
    };
  });
}

// Export for use in other modules (ES6)
export { convertXInput, convertSavedPosts };

/**
 * Send universal-format posts to the server for LLM-based tone analysis.
 * Calls /api/tone for each post individually using Cerebras.
 * @param {Array<Object>} universalPosts - array of objects with keys 'Name/Source', 'Engagement', 'Message'
 * @returns {Promise<Array<Object>>} - resolved array of posts augmented with `Tone`
 */
async function analyzeUniversalPosts(universalPosts) {
  if (!Array.isArray(universalPosts)) throw new Error('universalPosts must be an array');

  const analyzed = [];
  
  for (const post of universalPosts) {
    try {
      const resp = await fetch('http://localhost:8080/api/tone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: post.Message || '' }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.error(`Tone API error for message:`, resp.status, body);
        analyzed.push({ ...post, Tone: null, _toneError: `${resp.status}: ${body}` });
        continue;
      }

      const data = await resp.json();
      const toneLabel = data.result?.normalized?.tone || data.result?.parsed?.tone || null;

      analyzed.push({
        ...post,
        Tone: toneLabel,
        _toneRaw: data.result?.raw,
        _toneParsed: data.result?.parsed,
      });
    } catch (err) {
      console.error('Tone call failed:', err);
      analyzed.push({ ...post, Tone: null, _toneError: String(err.message) });
    }
  }

  return analyzed;
}

export { analyzeUniversalPosts };

/**
 * Converts SavedPosts API response data into a universal data format
 * @param {Object[]} posts - Array of saved posts from the API
 * @returns {UniversalDataPoint[]} Array of universal data points
 */
function convertSavedPosts(posts) {
  if (!Array.isArray(posts)) {
    throw new Error('Posts must be an array');
  }

  return posts.map(post => {
    // Calculate total engagement from likes, shares, and comments
    const engagement = (post.likes || 0) + (post.shares || 0) + (post.comments || 0);
    const messageText = post.content || '';
    
    return {
      'Name/Source': 'Saved Posts',
      'Engagement': engagement,
      'Message': messageText
    };
  });
}

// Example usage and debug
const exampleInput = {
  "success": true,
  "username": "Microsoft",
  "userId": "74286565",
  "posts": [
    {
      "public_metrics": {
        "retweet_count": 60,
        "reply_count": 139,
        "like_count": 255,
        "quote_count": 8,
        "bookmark_count": 22,
        "impression_count": 65137
      },
      "text": "Farmers in the Maipo River basin are saving 74 million cubic feet of water using Kilimo's data-driven irrigation insights powered by Azure. \n\nLearn how Chilean farmers are using data and real time monitoring to power sustainability in these ecosystems: https://t.co/xsLoXhd1UL https://t.co/g0yIDXahpN",
      "created_at": "2025-12-09T23:35:19.000Z",
      "edit_history_tweet_ids": [
        "1998535633254387729",
        "1998536971346690088"
      ],
      "lang": "en",
      "id": "1998536971346690088"
    }
  ],
  "_usedBackend": "http://localhost:8080"
};

console.log('=== Testing convertXInput ===');
console.log('Input:', JSON.stringify(exampleInput, null, 2));
console.log('\n--- Output ---');
const result = convertXInput(exampleInput);
console.log(JSON.stringify(result, null, 2));
console.log('\n--- Summary ---');
console.log(`Source: ${result[0]['Name/Source']}`);
console.log(`Total Engagement: ${result[0]['Engagement']}`);
console.log(`Message Preview: ${result[0]['Message'].substring(0, 50)}...`);