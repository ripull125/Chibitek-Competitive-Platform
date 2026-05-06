function getFullTweetText(tweet = {}) {
  return (
    tweet.note_tweet?.text ||
    tweet.note_tweet?.note_tweet_results?.result?.text ||
    tweet.note_tweet_results?.result?.text ||
    tweet.legacy?.note_tweet?.note_tweet_results?.result?.text ||
    tweet.full_text ||
    tweet.legacy?.full_text ||
    tweet.text ||
    ""
  );
}

export function normalizeXPost(tweet, { platformId, competitorId }) {
  if (!tweet) return null;

  const author = tweet.author || {};
  const handle = author.username || tweet._authorUsername || "";
  const url = tweet.url || (tweet.id
    ? handle
      ? `https://x.com/${handle}/status/${tweet.id}`
      : `https://x.com/i/web/status/${tweet.id}`
    : null);

  return {
    post: {
      platform_id: platformId,
      competitor_id: competitorId,
      platform_post_id: tweet.id,
      url,
      content: getFullTweetText(tweet),
      published_at: tweet.created_at ?? null,
    },
    metrics: {
      likes: tweet.public_metrics?.like_count ?? 0,
      shares: tweet.public_metrics?.retweet_count ?? 0,
      comments: tweet.public_metrics?.reply_count ?? 0,
      other_json: {},
    },
    details: {
      author_name: author.name || handle || "X user",
      author_handle: handle,
      username: handle,
      author_profile_image_url: author.profile_image_url || tweet._authorProfileImageUrl || null,
      media: Array.isArray(tweet.media) ? tweet.media : [],
      url,
    },
  };
}
