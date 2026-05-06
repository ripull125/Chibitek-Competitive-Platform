import express from "express";
import { lookupInstagramAdvanced, lookupInstagramInput } from "../instagramApi.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, route: "instagram", ok: true });
});

router.post("/search", async (req, res, next) => {
  try {
    const body = req.body || {};
    const q = body.q ?? body.query ?? body.input;

    if (q) {
      const limit = body.limit ?? 10;
      const result = await lookupInstagramInput(q, limit);
      return res.json(result);
    }

    // The checkbox/advanced Instagram scraper posts { options, inputs, limit }.
    // Do not fall through to the legacy server.js route because that route uses
    // trimmed Instagram responses in some branches, which removes author/date/
    // metric fields and makes the UI display @unknown and dashes.
    if (body.options || body.inputs) {
      const result = await lookupInstagramAdvanced(body.options || {}, body.inputs || {}, body.limit ?? 10);
      return res.json(result);
    }

    return next();
  } catch (err) {
    console.error("Instagram search error:", err);
    return res.status(err?.status || 500).json({
      success: false,
      platform: "instagram",
      error: err?.message || "Instagram search failed.",
      details: err?.body || err?.errors || undefined,
    });
  }
});

export default router;
