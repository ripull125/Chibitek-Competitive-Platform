import express from "express";
import { legacyLinkedInSearch, lookupLinkedInInput } from "../linkedinApi.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, route: "linkedin", ok: true });
});

router.post("/search", async (req, res) => {
  try {
    const body = req.body || {};
    const q = body.q ?? body.query ?? body.inputs?.query ?? null;
    const limit = body.limit ?? 10;

    const result = q
      ? await lookupLinkedInInput(q, limit)
      : await legacyLinkedInSearch(body.options || {}, body.inputs || {}, limit);

    return res.json(result);
  } catch (err) {
    console.error("[LinkedIn search]", err);
    return res.status(err?.status || 500).json({
      success: false,
      error: err?.message || "LinkedIn lookup failed.",
      errors: err?.errors || [],
    });
  }
});

export default router;
