// TODO #3: File Preview in Browser
const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const { log } = require("../utils");
const { sanitizePath, isSecurePath } = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");

const previewableTypes = {
  // Images
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  // Text
  ".txt": "text/plain",
  ".csv": "text/plain",
  ".json": "application/json",
  ".xml": "text/xml",
  // PDF
  ".pdf": "application/pdf",
  // Video
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

module.exports = function registerPreviewRoutes(app, { downloadLimiter }) {
  app.get("/preview/{*path}", downloadLimiter, (req, res) => {
    const rawPath = Array.isArray(req.params.path)
      ? req.params.path.join("/")
      : req.params.path || "";
    const requestedPath = decodeURIComponent(rawPath);
    const sanitized = sanitizePath(requestedPath);
    const fullPath = path.join(publicDir, sanitized);

    if (!isSecurePath(sanitized, publicDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = previewableTypes[ext];
    if (!contentType) {
      return res.status(400).json({ error: "File type not previewable" });
    }

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        return res.status(404).json({ error: "File not found" });
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Content-Length", stats.size);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);
      stream.on("error", () => {
        if (!res.headersSent) res.status(500).json({ error: "Preview failed" });
      });
    });
  });

  // Endpoint to check if a file is previewable
  app.get("/preview-check/{*path}", (req, res) => {
    const rawPath = Array.isArray(req.params.path)
      ? req.params.path.join("/")
      : req.params.path || "";
    const requestedPath = decodeURIComponent(rawPath);
    const ext = path.extname(requestedPath).toLowerCase();
    const type = previewableTypes[ext];
    res.json({
      previewable: !!type,
      contentType: type || null,
      category: type
        ? type.startsWith("image/")
          ? "image"
          : type.startsWith("video/")
            ? "video"
            : type.startsWith("audio/")
              ? "audio"
              : type === "application/pdf"
                ? "pdf"
                : "text"
        : null,
    });
  });
};
