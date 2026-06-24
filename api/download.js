module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const targetUrl = String(req.query.url || "").trim();
  const filename = String(req.query.filename || "video.mp4").replace(/[\\/:*?"<>|]/g, "").slice(0, 80);

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ ok: false, error: "Valid url is required" });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Referer: "https://www.xiaohongshu.com/",
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        ok: false,
        error: `Source download failed (Status: ${upstream.status})`,
      });
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const arrayBuffer = await upstream.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename || "video.mp4"}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "Download proxy failed",
      detail: error.message,
    });
  }
};
