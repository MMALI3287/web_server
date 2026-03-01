// TODO #31: Thumbnail Generation for Images
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { PROJECT_ROOT } = require("../config");
const { log } = require("../utils");
const { sanitizePath, isSecurePath } = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");
const thumbnailDir = path.join(PROJECT_ROOT, ".thumbnails");

// Ensure thumbnail directory exists
fs.mkdirSync(thumbnailDir, { recursive: true });

const THUMB_SIZE = 200;
const imageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
]);

function getThumbnailPath(relativePath) {
  const hash = relativePath.replace(/[/\\:]/g, "_");
  return path.join(thumbnailDir, hash + ".webp");
}

module.exports = function registerThumbnailRoutes(app) {
  app.get("/thumbnail/{*path}", async (req, res) => {
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
    if (!imageExtensions.has(ext)) {
      return res.status(400).json({ error: "Not an image file" });
    }

    try {
      await fs.promises.access(fullPath);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }

    const thumbPath = getThumbnailPath(sanitized);

    // Check if thumbnail already exists and is newer than source
    try {
      const [srcStat, thumbStat] = await Promise.all([
        fs.promises.stat(fullPath),
        fs.promises.stat(thumbPath),
      ]);
      if (thumbStat.mtimeMs >= srcStat.mtimeMs) {
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return fs.createReadStream(thumbPath).pipe(res);
      }
    } catch {
      // Thumbnail doesn't exist yet
    }

    // Generate thumbnail
    try {
      await sharp(fullPath)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
        .webp({ quality: 75 })
        .toFile(thumbPath);

      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=86400");
      fs.createReadStream(thumbPath).pipe(res);
    } catch (err) {
      log.error("Thumbnail generation error:", err.message);
      res.status(500).json({ error: "Failed to generate thumbnail" });
    }
  });
};
