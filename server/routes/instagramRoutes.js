import express from "express";
import { lookupInstagramInput } from "../instagramApi.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, route: "instagram", ok: true });
});

router.post("/search", async (req, res, next) => {
  try {
    const body = req.body || {};
    const q = body.q ?? body.query ?? body.input;

    // Preserve the old options/inputs endpoint. If the request does not use
    // the one-bar q/query/input shape, let the legacy server.js route handle it.
    if (!q) return next();

    const limit = body.limit ?? 10;
    const result = await lookupInstagramInput(q, limit);
    return res.json(result);
  } catch (err) {
    console.error("Instagram one-bar search error:", err);
    return res.status(err?.status || 500).json({
      success: false,
      platform: "instagram",
      error: err?.message || "Instagram search failed.",
      details: err?.body || err?.errors || undefined,
    });
  }
});

export default router;
