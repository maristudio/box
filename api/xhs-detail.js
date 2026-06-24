const REDNOTE_HOST = "rednote-hd-video-api.p.rapidapi.com";
const LEGACY_XHS_HOST = "xiaohongshu-all-api.p.rapidapi.com";

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-client-rapidapi-key");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const noteId = String(req.query.noteId || "").trim();
  const sourceUrl = String(req.query.url || "").trim();
  const apiKey = process.env.RAPIDAPI_KEY || req.headers["x-client-rapidapi-key"];

  if (!noteId && !sourceUrl) {
    return res.status(400).json({ ok: false, error: "url or noteId is required" });
  }

  if (!apiKey) {
    return res.status(400).json({
      ok: false,
      error: "RapidAPI key is missing. Set RAPIDAPI_KEY in Vercel or save it in app settings.",
    });
  }

  async function callLegacyXhsApi() {
    if (!noteId) {
      throw new Error("noteId is required for fallback");
    }

    const fallbackUrl =
      `https://${LEGACY_XHS_HOST}/api/xiaohongshu/get-note-detail/v5?noteId=${encodeURIComponent(noteId)}`;

    const fallback = await fetch(fallbackUrl, {
      method: "GET",
      headers: {
        "x-rapidapi-host": LEGACY_XHS_HOST,
        "x-rapidapi-key": apiKey,
      },
    });

    const text = await fallback.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!fallback.ok) {
      return {
        ok: false,
        status: fallback.status,
        error: data?.message || data?.msg || data?.error || "Fallback XHS API request failed",
        data,
      };
    }

    return { ok: true, data };
  }

  try {
    const upstreamUrl = `https://${REDNOTE_HOST}/parse`;
    const rednoteUrl =
      sourceUrl || `https://www.xiaohongshu.com/discovery/item/${encodeURIComponent(noteId)}`;

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": REDNOTE_HOST,
        "x-rapidapi-key": apiKey,
      },
      body: JSON.stringify({ url: rednoteUrl }),
    });

    const text = await upstream.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    res.setHeader("x-ratelimit-requests-remaining", upstream.headers.get("x-ratelimit-requests-remaining") || "");
    res.setHeader("x-ratelimit-requests-limit", upstream.headers.get("x-ratelimit-requests-limit") || "");

    if (!upstream.ok) {
      if (upstream.status >= 500 && noteId) {
        const fallbackResult = await callLegacyXhsApi().catch((fallbackError) => ({
          ok: false,
          status: 502,
          error: fallbackError.message,
        }));

        if (fallbackResult.ok) {
          return res.status(200).json({
            ok: true,
            source: "fallback-xhs",
            warning: `Rednote HD Video API failed first (Status: ${upstream.status}), fallback succeeded.`,
            data: fallbackResult.data,
          });
        }

        return res.status(upstream.status).json({
          ok: false,
          status: upstream.status,
          error: `Rednote HD Video API failed (Status: ${upstream.status}); fallback also failed (Status: ${fallbackResult.status || "unknown"})`,
          data,
          fallback: fallbackResult,
        });
      }

      return res.status(upstream.status).json({
        ok: false,
        status: upstream.status,
        error: data?.message || data?.msg || data?.error || `Rednote HD Video API request failed (Status: ${upstream.status})`,
        data,
      });
    }

    return res.status(200).json({ ok: true, data });
  } catch (error) {
    if (!noteId) {
      return res.status(502).json({
        ok: false,
        error: "RapidAPI proxy failed",
        detail: error.message,
      });
    }

    try {
      const fallbackResult = await callLegacyXhsApi();

      if (!fallbackResult.ok) {
        return res.status(fallbackResult.status || 502).json(fallbackResult);
      }

      return res.status(200).json({ ok: true, source: "fallback-xhs", data: fallbackResult.data });
    } catch (fallbackError) {
      return res.status(502).json({
        ok: false,
        error: "RapidAPI proxy failed",
        detail: fallbackError.message,
      });
    }
  }
};
