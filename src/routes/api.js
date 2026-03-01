// TODO #26: RESTful API for Programmatic Access
const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const { formatFileSize, getFileIcon, log } = require("../utils");
const {
  sanitizePath,
  isSecurePath,
  isAllowedFileType,
  isValidFilename,
} = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");

module.exports = function registerApiRoutes(app, { auth, downloadLimiter }) {
  const { requireRole } = auth;

  // List directory contents as JSON
  app.get("/api/files", requireRole("viewer"), apiListDir);
  app.get("/api/files/{*path}", requireRole("viewer"), apiListDir);

  async function apiListDir(req, res) {
    const rawPath = Array.isArray(req.params.path)
      ? req.params.path.join("/")
      : req.params.path || "";
    const requestedPath = rawPath ? decodeURIComponent(rawPath) : "";
    const sanitized = sanitizePath(requestedPath);
    const currentDir = path.join(publicDir, sanitized);

    if (sanitized && !isSecurePath(sanitized, publicDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const stats = await fs.promises.stat(currentDir);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: "Not a directory" });
      }
    } catch {
      return res.status(404).json({ error: "Directory not found" });
    }

    try {
      const entries = await fs.promises.readdir(currentDir, {
        withFileTypes: true,
      });
      const items = [];

      for (const entry of entries) {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          items.push({
            name: entry.name,
            type: "directory",
            path: sanitized ? `${sanitized}/${entry.name}` : entry.name,
          });
        } else if (
          entry.isFile() &&
          isAllowedFileType(entry.name) &&
          isValidFilename(entry.name)
        ) {
          try {
            const st = await fs.promises.stat(entryPath);
            items.push({
              name: entry.name,
              type: "file",
              path: sanitized ? `${sanitized}/${entry.name}` : entry.name,
              size: st.size,
              formattedSize: formatFileSize(st.size),
              modified: st.mtime.toISOString(),
              icon: getFileIcon(entry.name),
              extension:
                path.extname(entry.name).substring(1).toUpperCase() || "FILE",
            });
          } catch {
            // skip
          }
        }
      }

      res.json({
        path: sanitized || "/",
        items,
        folders: items.filter((i) => i.type === "directory").length,
        files: items.filter((i) => i.type === "file").length,
      });
    } catch (err) {
      log.error("API list error:", err.message);
      res.status(500).json({ error: "Failed to list directory" });
    }
  }

  // Download a file via API
  app.get(
    "/api/download/{*path}",
    requireRole("viewer"),
    downloadLimiter,
    (req, res) => {
      const rawPath = Array.isArray(req.params.path)
        ? req.params.path.join("/")
        : req.params.path || "";
      const requestedPath = decodeURIComponent(rawPath);
      const sanitized = sanitizePath(requestedPath);
      const fullPath = path.join(publicDir, sanitized);

      if (!isSecurePath(sanitized, publicDir)) {
        return res.status(403).json({ error: "Access denied" });
      }

      try {
        const stats = fs.statSync(fullPath);
        if (!stats.isFile()) {
          return res.status(400).json({ error: "Not a file" });
        }

        const filename = path.basename(sanitized);
        const safeName = filename.replace(/["\r\n]/g, "");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${safeName}"`,
        );
        res.setHeader("Content-Length", stats.size);
        res.setHeader("X-Content-Type-Options", "nosniff");
        fs.createReadStream(fullPath).pipe(res);
      } catch {
        res.status(404).json({ error: "File not found" });
      }
    },
  );

  // Server info endpoint
  app.get("/api/info", (req, res) => {
    res.json({
      name: "secure-file-server",
      version: require(path.join(PROJECT_ROOT, "package.json")).version,
      user: req.user
        ? { username: req.user.username, role: req.user.role }
        : null,
    });
  });
};
