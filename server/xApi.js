// server/xApi.js

const BEARER = process.env.X_BEARER_TOKEN || "AAAAAAAAAAAAAAAAAAAAADsX5gEAAAAAoHshZqkZsHDIna4hl0BiA2SnWHg%3D7REFZaBuGPSdII63M4bKx5bpDNImzdB2XzGioNU7L8YReYHbaQ";

export async function getUserIdByUsername(username) {
  const url = `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`;
  const resp = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${BEARER}`,
      "User-Agent": "Chibitek-App"
    }
  });
  if (!resp.ok) {
    throw new Error(`X API error fetching user id: ${resp.status} ${await resp.text()}`);
  }
  const json = await resp.json();
  if (!json.data || !json.data.id) {
    throw new Error(`No user found for username ${username}`);
  }
  return json.data.id;
}

export async function fetchPostsByUserId(userId, maxResults = 2) {
  const url = `https://api.x.com/2/users/${userId}/tweets?max_results=${maxResults}`;
  const resp = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${BEARER}`,
      "User-Agent": "Chibitek-App"
    }
  });
  if (!resp.ok) {
    throw new Error(`X API error fetching tweets: ${resp.status} ${await resp.text()}`);
  }
  const json = await resp.json();
  return json.data;
}