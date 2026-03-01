// TODO #32: URL Import (download file from external URL)
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const { PROJECT_ROOT } = require("../config");
const { log } = require("../utils");
const {
  sanitizeFilename,
  isAllowedFileType,
  isSecurePath,
} = require("../security");

const uploadsDir = path.join(PROJECT_ROOT, "uploads");
const MAX_IMPORT_SIZE =
  Number(process.env.MAX_IMPORT_SIZE) || 100 * 1024 * 1024; // 100MB
const IMPORT_TIMEOUT = 60000; // 60s

module.exports = function registerImportUrlRoutes(app, { auth, csrf }) {
  const { requireRole } = auth;
  const { doubleCsrfProtection } = csrf;

  app.post(
    "/import-url",
    requireRole("admin"),
    doubleCsrfProtection,
    (req, res) => {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required" });
      }

      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }

      // Only allow HTTP/HTTPS to prevent SSRF with other protocols
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res
          .status(400)
          .json({ error: "Only HTTP/HTTPS URLs are allowed" });
      }

      // Block private/internal IPs to prevent SSRF
      const hostname = parsed.hostname.toLowerCase();
      const blockedPatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^0\./,
        /^::1$/,
        /^fe80:/i,
        /^fc00:/i,
        /^fd/i,
      ];
      if (blockedPatterns.some((p) => p.test(hostname))) {
        return res.status(400).json({ error: "Internal URLs are not allowed" });
      }

      // Extract filename from URL
      const urlPath = parsed.pathname || "";
      let filename = path.basename(urlPath) || "imported-file";
      filename = sanitizeFilename(filename);
      if (!filename || !isAllowedFileType(filename)) {
        return res
          .status(400)
          .json({ error: "File type not allowed or invalid filename" });
      }

      const crypto = require("crypto");
      const ext = path.extname(filename);
      const nameNoExt = filename.slice(0, -ext.length || undefined);
      const uniqueName = `${nameNoExt}_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const destPath = path.join(uploadsDir, uniqueName);

      if (!isSecurePath(uniqueName, uploadsDir)) {
        return res.status(400).json({ error: "Invalid path" });
      }

      const client = parsed.protocol === "https:" ? https : http;
      const request = client.get(
        url,
        { timeout: IMPORT_TIMEOUT },
        (response) => {
          if (
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            // Don't follow redirects to prevent SSRF chains
            return res
              .status(400)
              .json({ error: "Redirects are not followed for security" });
          }

          if (response.statusCode !== 200) {
            return res
              .status(400)
              .json({
                error: `Remote server returned status ${response.statusCode}`,
              });
          }

          const contentLength = Number(response.headers["content-length"]);
          if (contentLength > MAX_IMPORT_SIZE) {
            response.destroy();
            return res
              .status(400)
              .json({
                error: `File too large (max ${Math.round(MAX_IMPORT_SIZE / 1024 / 1024)} MB)`,
              });
          }

          let downloadedSize = 0;
          const writeStream = fs.createWriteStream(destPath);

          response.on("data", (chunk) => {
            downloadedSize += chunk.length;
            if (downloadedSize > MAX_IMPORT_SIZE) {
              response.destroy();
              writeStream.destroy();
              fs.unlink(destPath, () => {});
              if (!res.headersSent) {
                res.status(400).json({ error: "File too large" });
              }
            }
          });

          response.pipe(writeStream);

          writeStream.on("finish", () => {
            log.info(
              `URL import complete: ${url} -> ${uniqueName} (${downloadedSize} bytes)`,
            );
            res.json({
              success: true,
              filename: uniqueName,
              size: downloadedSize,
              sourceUrl: url,
            });
          });

          writeStream.on("error", (err) => {
            fs.unlink(destPath, () => {});
            log.error("Import write error:", err.message);
            if (!res.headersSent) {
              res.status(500).json({ error: "Failed to save imported file" });
            }
          });
        },
      );

      request.on("error", (err) => {
        log.error("Import request error:", err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to fetch URL" });
        }
      });

      request.on("timeout", () => {
        request.destroy();
        if (!res.headersSent) {
          res.status(408).json({ error: "Import request timed out" });
        }
      });
    },
  );
};
