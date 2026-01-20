export function normalizeXPost(tweet, { platformId, competitorId }) {
  if (!tweet) return null;

  return {
    post: {
      platform_id: platformId,
      competitor_id: competitorId,
      platform_post_id: tweet.id,
      url: `https://x.com/i/web/status/${tweet.id}`,
      content: tweet.text,
      published_at: tweet.created_at ?? null,
    },
    metrics: {
      likes: tweet.public_metrics?.like_count ?? 0,
      shares: tweet.public_metrics?.retweet_count ?? 0,
      comments: tweet.public_metrics?.reply_count ?? 0,
      other_json: {
        quotes: tweet.public_metrics?.quote_count ?? 0,
      },
    },
  };
}
