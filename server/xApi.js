import "dotenv/config";
import axios from "axios";

const BEARER = process.env.X_BEARER_TOKEN;

if (!BEARER) {
  throw new Error("X_BEARER_TOKEN is not set in .env");
}

const xClient = axios.create({
  baseURL: "https://api.x.com/2",
  headers: {
    Authorization: `Bearer ${BEARER}`,
    "User-Agent": "Chibitek-App",
    Accept: "application/json",
  },
  timeout: 15000,
});

export async function getUserIdByUsername(username) {
  try {
    const res = await xClient.get(
      `/users/by/username/${encodeURIComponent(username)}`
    );

    if (!res.data?.data?.id) {
      throw new Error(`No user found for username ${username}`);
    }

    return res.data.data.id;
  } catch (err) {
    if (err.response) {
      throw new Error(
        `X API user lookup failed: ${err.response.status} ${JSON.stringify(
          err.response.data
        )}`
      );
    }
    throw err;
  }
}

export async function fetchPostsByUserId(userId, maxResults = 5) {
  const clamped = Math.min(100, Math.max(5, maxResults));

  try {
    const res = await xClient.get(`/users/${userId}/tweets`, {
      params: { max_results: clamped },
    });

    return res.data?.data || [];
  } catch (err) {
    if (err.response) {
      throw new Error(
        `X API tweet fetch failed: ${err.response.status} ${JSON.stringify(
          err.response.data
        )}`
      );
    }
    throw err;
  }
}
