// TODO #2: Folder Download as ZIP
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const { PROJECT_ROOT } = require("../config");
const { log, formatFileSize } = require("../utils");
const { sanitizePath, isSecurePath } = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");
const MAX_ZIP_FILES = Number(process.env.MAX_ZIP_FILES) || 1000;
const MAX_ZIP_SIZE = Number(process.env.MAX_ZIP_SIZE) || 500 * 1024 * 1024; // 500MB

module.exports = function registerZipDownloadRoutes(app, { downloadLimiter }) {
  app.get("/download-folder/{*path}", downloadLimiter, async (req, res) => {
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
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: "Path is not a directory" });
      }
    } catch {
      return res.status(404).json({ error: "Directory not found" });
    }

    // Count files and total size to prevent DoS
    let fileCount = 0;
    let totalSize = 0;

    async function countFiles(dir) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (fileCount > MAX_ZIP_FILES) return;
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await countFiles(entryPath);
        } else if (entry.isFile()) {
          const st = await fs.promises.stat(entryPath);
          fileCount++;
          totalSize += st.size;
        }
      }
    }

    try {
      await countFiles(fullPath);
    } catch {
      return res.status(500).json({ error: "Failed to read directory" });
    }

    if (fileCount > MAX_ZIP_FILES) {
      return res
        .status(400)
        .json({ error: `Too many files (max ${MAX_ZIP_FILES})` });
    }
    if (totalSize > MAX_ZIP_SIZE) {
      return res.status(400).json({
        error: `Total size too large (max ${formatFileSize(MAX_ZIP_SIZE)})`,
      });
    }
    if (fileCount === 0) {
      return res.status(400).json({ error: "Directory is empty" });
    }

    const folderName = path.basename(sanitized) || "root";
    const safeName = folderName.replace(/["\r\n]/g, "");

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}.zip"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");

    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("error", (err) => {
      log.error("ZIP archive error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create archive" });
      }
    });

    archive.pipe(res);
    archive.directory(fullPath, folderName);
    archive.finalize();

    log.info(
      `ZIP download: ${sanitized} (${fileCount} files, ${formatFileSize(totalSize)})`,
    );
  });
};
