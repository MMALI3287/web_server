const path = require("path");
const fs = require("fs");
const express = require("express");
const { PROJECT_ROOT } = require("../config");
const { log, computeFileHash } = require("../utils");
const {
  sanitizePath,
  isValidFilename,
  isAllowedFileType,
  isSecurePath,
} = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");

// Bandwidth throttling (TODO #16)
const THROTTLE_RATE = Number(process.env.DOWNLOAD_THROTTLE_RATE) || 0; // bytes/sec, 0 = unlimited
let ThrottleGroup = null;
let throttleGroup = null;
if (THROTTLE_RATE > 0) {
  try {
    ThrottleGroup = require("stream-throttle").ThrottleGroup;
    throttleGroup = new ThrottleGroup({ rate: THROTTLE_RATE });
    log.info(
      `Download throttling enabled: ${Math.round(THROTTLE_RATE / 1024)} KB/s per connection`,
    );
  } catch {
    log.warn("stream-throttle not available, throttling disabled");
  }
}

module.exports = function registerDownloadRoutes(app, { downloadLimiter }) {
  app.get("/download/{*path}", downloadLimiter, (req, res) => {
    const rawPath = Array.isArray(req.params.path)
      ? req.params.path.join("/")
      : req.params.path || "";
    const requestedPath = decodeURIComponent(rawPath);
    const sanitizedPath = sanitizePath(requestedPath);

    log.debug(`Download request for: ${requestedPath}`);

    if (!sanitizedPath || !isValidFilename(sanitizedPath)) {
      log.debug(`Invalid path rejected: ${requestedPath}`);
      return res.status(400).json({ error: "Invalid path" });
    }

    const fullPath = path.join(publicDir, sanitizedPath);

    if (!isSecurePath(sanitizedPath, publicDir)) {
      log.warn(`Path traversal attempt blocked: ${sanitizedPath}`);
      return res.status(403).json({ error: "Access denied" });
    }

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        log.debug(`File not found: ${sanitizedPath}`);
        return res.status(404).json({ error: "File not found" });
      }

      const filename = path.basename(fullPath);
      if (!isAllowedFileType(filename)) {
        log.debug(`File type not allowed: ${filename}`);
        return res.status(403).json({ error: "File type not allowed" });
      }

      log.debug(`Serving: ${sanitizedPath} (${stats.size} bytes)`);

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      const safeName = filename.replace(/["\r\n]/g, "");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.setHeader("Content-Length", stats.size);

      computeFileHash(fullPath)
        .then((hash) => {
          res.setHeader("X-Content-SHA256", hash);
        })
        .catch(() => {})
        .finally(() => {
          const readStream = fs.createReadStream(fullPath);
          if (throttleGroup) {
            readStream.pipe(throttleGroup.throttle()).pipe(res);
          } else {
            readStream.pipe(res);
          }
          readStream.on("error", () => {
            if (!res.headersSent)
              res.status(500).json({ error: "Download failed" });
          });
        });
    });
  });
};
