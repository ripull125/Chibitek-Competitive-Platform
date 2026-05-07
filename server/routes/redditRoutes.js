import express from "express";
import { lookupRedditAdvanced, lookupRedditInput } from "../redditApi.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, route: "reddit", ok: true });
});

router.post("/search", async (req, res, next) => {
  try {
    const body = req.body || {};
    const q = body.q ?? body.query ?? body.input;

    if (q) {
      const result = await lookupRedditInput(q, body.limit ?? 10);
      return res.json(result);
    }

    if (body.options || body.inputs) {
      const result = await lookupRedditAdvanced(body.options || {}, body.inputs || {}, body.limit ?? 10);
      return res.json(result);
    }

    return next();
  } catch (err) {
    console.error("Reddit search error:", err);
    return res.status(err?.status || 500).json({
      success: false,
      platform: "reddit",
      error: err?.message || "Reddit search failed.",
      details: err?.body || err?.errors || undefined,
    });
  }
});

export default router;
