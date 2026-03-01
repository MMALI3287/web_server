// TODO #5: QR Code Generation for Quick Sharing
const QRCode = require("qrcode");
const { log } = require("../utils");

module.exports = function registerQrRoutes(app) {
  // Generate QR code as SVG for a URL
  app.get("/qr", async (req, res) => {
    const url = req.query.url;
    if (!url || typeof url !== "string" || url.length > 2048) {
      return res
        .status(400)
        .json({ error: "url parameter is required (max 2048 chars)" });
    }

    try {
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 2,
        width: 300,
      });
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(svg);
    } catch (err) {
      log.error("QR generation error:", err.message);
      res.status(500).json({ error: "Failed to generate QR code" });
    }
  });

  // Generate QR code as data URL (for embedding in HTML)
  app.get("/qr-data", async (req, res) => {
    const url = req.query.url;
    if (!url || typeof url !== "string" || url.length > 2048) {
      return res.status(400).json({ error: "url parameter is required" });
    }

    try {
      const dataUrl = await QRCode.toDataURL(url, { margin: 2, width: 300 });
      res.json({ dataUrl, url });
    } catch (err) {
      log.error("QR generation error:", err.message);
      res.status(500).json({ error: "Failed to generate QR code" });
    }
  });
};
