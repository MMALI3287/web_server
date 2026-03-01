// TODO #10: File Rename / Move / Delete
const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const { log } = require("../utils");
const { sanitizePath, isSecurePath } = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");

module.exports = function registerFileOpsRoutes(app, { auth, csrf }) {
  const { requireRole } = auth;
  const { doubleCsrfProtection } = csrf;

  // Rename / Move a file
  app.post(
    "/rename",
    requireRole("admin"),
    doubleCsrfProtection,
    (req, res) => {
      const { oldPath, newPath } = req.body;
      if (
        !oldPath ||
        !newPath ||
        typeof oldPath !== "string" ||
        typeof newPath !== "string"
      ) {
        return res
          .status(400)
          .json({ error: "oldPath and newPath are required" });
      }

      const sanitizedOld = sanitizePath(oldPath);
      const sanitizedNew = sanitizePath(newPath);
      const fullOld = path.join(publicDir, sanitizedOld);
      const fullNew = path.join(publicDir, sanitizedNew);

      if (
        !isSecurePath(sanitizedOld, publicDir) ||
        !isSecurePath(sanitizedNew, publicDir)
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!fs.existsSync(fullOld)) {
        return res.status(404).json({ error: "Source not found" });
      }
      if (fs.existsSync(fullNew)) {
        return res.status(409).json({ error: "Destination already exists" });
      }

      // Ensure destination directory exists
      const destDir = path.dirname(fullNew);
      fs.mkdirSync(destDir, { recursive: true });

      try {
        fs.renameSync(fullOld, fullNew);
        log.info(
          `File renamed: ${sanitizedOld} -> ${sanitizedNew} by ${req.user.username}`,
        );
        res.json({
          success: true,
          oldPath: sanitizedOld,
          newPath: sanitizedNew,
        });
      } catch (err) {
        log.error("Rename error:", err.message);
        res.status(500).json({ error: "Rename failed" });
      }
    },
  );

  // Delete a file or empty directory
  app.delete(
    "/file/{*path}",
    requireRole("admin"),
    doubleCsrfProtection,
    (req, res) => {
      const rawPath = Array.isArray(req.params.path)
        ? req.params.path.join("/")
        : req.params.path || "";
      const requestedPath = decodeURIComponent(rawPath);
      const sanitized = sanitizePath(requestedPath);
      const fullPath = path.join(publicDir, sanitized);

      if (!sanitized || !isSecurePath(sanitized, publicDir)) {
        return res.status(403).json({ error: "Access denied" });
      }

      try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true });
          log.info(`Directory deleted: ${sanitized} by ${req.user.username}`);
        } else {
          fs.unlinkSync(fullPath);
          log.info(`File deleted: ${sanitized} by ${req.user.username}`);
        }
        res.json({ success: true, path: sanitized });
      } catch (err) {
        if (err.code === "ENOENT") {
          return res.status(404).json({ error: "File not found" });
        }
        log.error("Delete error:", err.message);
        res.status(500).json({ error: "Delete failed" });
      }
    },
  );

  // Create a new folder
  app.post("/mkdir", requireRole("admin"), doubleCsrfProtection, (req, res) => {
    const { dirPath } = req.body;
    if (!dirPath || typeof dirPath !== "string") {
      return res.status(400).json({ error: "dirPath is required" });
    }

    const sanitized = sanitizePath(dirPath);
    const fullPath = path.join(publicDir, sanitized);

    if (!isSecurePath(sanitized, publicDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (fs.existsSync(fullPath)) {
      return res.status(409).json({ error: "Already exists" });
    }

    try {
      fs.mkdirSync(fullPath, { recursive: true });
      log.info(`Directory created: ${sanitized} by ${req.user.username}`);
      res.json({ success: true, path: sanitized });
    } catch (err) {
      log.error("Mkdir error:", err.message);
      res.status(500).json({ error: "Failed to create directory" });
    }
  });
};
