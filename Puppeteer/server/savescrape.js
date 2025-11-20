import { supabase } from "./supabase.js";

export async function saveScrape(scraped) {
  // scraped should look like:
  // { platform_id, competitor_id, platform_post_id, url, content }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      platform_id: scraped.platform_id,
      competitor_id: scraped.competitor_id,
      platform_post_id: scraped.platform_post_id,
      url: scraped.url,
      content: scraped.content,
    })
    .select()
    .single();

  if (error) {
    console.error("Error inserting post:", error);
    return null;
  }

  return data;
}
