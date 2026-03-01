// TODO #12: Bulk File Operations + TODO #2 (batch download)
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const { PROJECT_ROOT } = require("../config");
const { log, formatFileSize } = require("../utils");
const { sanitizePath, isSecurePath } = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");

module.exports = function registerBulkOpsRoutes(
  app,
  { auth, csrf, downloadLimiter },
) {
  const { requireRole } = auth;
  const { doubleCsrfProtection } = csrf;

  // Download multiple files as ZIP
  app.post(
    "/download-batch",
    downloadLimiter,
    doubleCsrfProtection,
    (req, res) => {
      const { files } = req.body;
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "files array is required" });
      }
      if (files.length > 100) {
        return res.status(400).json({ error: "Too many files (max 100)" });
      }

      // Validate all paths first
      const validFiles = [];
      for (const filePath of files) {
        if (typeof filePath !== "string") continue;
        const sanitized = sanitizePath(filePath);
        const fullPath = path.join(publicDir, sanitized);
        if (!isSecurePath(sanitized, publicDir)) continue;
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile() || stats.isDirectory()) {
            validFiles.push({
              sanitized,
              fullPath,
              isDir: stats.isDirectory(),
            });
          }
        } catch {
          // skip missing files
        }
      }

      if (validFiles.length === 0) {
        return res.status(400).json({ error: "No valid files found" });
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="selected-files.zip"',
      );
      res.setHeader("X-Content-Type-Options", "nosniff");

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err) => {
        log.error("Batch ZIP error:", err.message);
        if (!res.headersSent) res.status(500).json({ error: "Archive failed" });
      });

      archive.pipe(res);

      for (const { sanitized, fullPath, isDir } of validFiles) {
        const name = path.basename(sanitized);
        if (isDir) {
          archive.directory(fullPath, name);
        } else {
          archive.file(fullPath, { name });
        }
      }

      archive.finalize();
      log.info(
        `Batch download: ${validFiles.length} items by ${req.user ? req.user.username : "unknown"}`,
      );
    },
  );

  // Bulk delete
  app.post(
    "/delete-batch",
    requireRole("admin"),
    doubleCsrfProtection,
    (req, res) => {
      const { files } = req.body;
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "files array is required" });
      }

      const results = [];
      for (const filePath of files) {
        if (typeof filePath !== "string") continue;
        const sanitized = sanitizePath(filePath);
        const fullPath = path.join(publicDir, sanitized);

        if (!sanitized || !isSecurePath(sanitized, publicDir)) {
          results.push({
            path: filePath,
            success: false,
            error: "Access denied",
          });
          continue;
        }

        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          results.push({ path: sanitized, success: true });
          log.info(`Bulk delete: ${sanitized} by ${req.user.username}`);
        } catch (err) {
          results.push({
            path: filePath,
            success: false,
            error: err.code === "ENOENT" ? "Not found" : "Delete failed",
          });
        }
      }

      res.json({
        success: true,
        results,
        deleted: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      });
    },
  );
};
