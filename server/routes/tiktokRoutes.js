import express from "express";
import { lookupTikTokAdvanced, lookupTikTokInput } from "../tiktokApi.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, route: "tiktok", ok: true });
});

router.post("/search", async (req, res, next) => {
  try {
    const body = req.body || {};
    const q = body.q ?? body.query ?? body.input;

    if (q) {
      const result = await lookupTikTokInput(q, body.limit ?? 10);
      return res.json(result);
    }

    if (body.options || body.inputs) {
      const result = await lookupTikTokAdvanced(body.options || {}, body.inputs || {}, body.limit ?? 10);
      return res.json(result);
    }

    return next();
  } catch (err) {
    console.error("TikTok search error:", err);
    return res.status(err?.status || 500).json({
      success: false,
      platform: "tiktok",
      error: err?.message || "TikTok search failed.",
      details: err?.body || err?.errors || undefined,
    });
  }
});

export default router;
