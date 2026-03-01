// TODO #9: Search / Filter Files
const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const {
  sanitizePath,
  isSecurePath,
  isAllowedFileType,
} = require("../security");
const { formatFileSize, getFileIcon } = require("../utils");

const publicDir = path.join(PROJECT_ROOT, "public");
const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_DEPTH = 10;

module.exports = function registerSearchRoutes(app, { auth }) {
  const { requireRole } = auth;

  app.get("/search", requireRole("viewer"), async (req, res) => {
    const query = (req.query.q || "").trim().toLowerCase();
    if (!query) {
      return res.status(400).json({ error: "Search query (q) is required" });
    }
    if (query.length > 200) {
      return res.status(400).json({ error: "Query too long" });
    }

    const results = [];

    async function searchDir(dir, relativePath, depth) {
      if (depth > MAX_SEARCH_DEPTH || results.length >= MAX_SEARCH_RESULTS)
        return;

      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= MAX_SEARCH_RESULTS) return;
        const entryRelative = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;
        const entryFull = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name.toLowerCase().includes(query)) {
            results.push({
              name: entry.name,
              path: entryRelative,
              isDirectory: true,
              icon: "📁",
              type: "Folder",
            });
          }
          await searchDir(entryFull, entryRelative, depth + 1);
        } else if (entry.isFile()) {
          if (
            entry.name.toLowerCase().includes(query) &&
            isAllowedFileType(entry.name)
          ) {
            try {
              const stats = await fs.promises.stat(entryFull);
              results.push({
                name: entry.name,
                path: entryRelative,
                isDirectory: false,
                size: stats.size,
                formattedSize: formatFileSize(stats.size),
                modified: stats.mtime.toISOString(),
                icon: getFileIcon(entry.name),
                extension:
                  path.extname(entry.name).substring(1).toUpperCase() || "FILE",
              });
            } catch {
              // skip
            }
          }
        }
      }
    }

    await searchDir(publicDir, "", 0);
    res.json({
      query,
      results,
      total: results.length,
      truncated: results.length >= MAX_SEARCH_RESULTS,
    });
  });
};
