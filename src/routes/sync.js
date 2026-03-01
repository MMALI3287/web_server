// TODO #30: Bidirectional Folder Sync
const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const { log, computeFileHash, formatFileSize } = require("../utils");
const {
  sanitizePath,
  isSecurePath,
  isAllowedFileType,
} = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");

// Build a manifest of all files in a directory
async function buildManifest(dir, relativeTo, maxDepth = 5) {
  const manifest = {};

  async function walk(currentDir, relPath, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentDir, entry.name);
      const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(fullPath, entryRel, depth + 1);
      } else if (entry.isFile() && isAllowedFileType(entry.name)) {
        try {
          const stats = await fs.promises.stat(fullPath);
          manifest[entryRel] = {
            size: stats.size,
            modified: stats.mtime.toISOString(),
            mtimeMs: stats.mtimeMs,
          };
        } catch {
          // skip
        }
      }
    }
  }

  await walk(dir, "", 0);
  return manifest;
}

module.exports = function registerSyncRoutes(app, { auth, csrf }) {
  const { requireRole } = auth;
  const { doubleCsrfProtection } = csrf;

  // Get server manifest (list of all files with metadata)
  app.get("/sync/manifest", requireRole("admin"), async (req, res) => {
    try {
      const manifest = await buildManifest(publicDir, publicDir);
      res.json({ manifest, generatedAt: new Date().toISOString() });
    } catch (err) {
      log.error("Sync manifest error:", err.message);
      res.status(500).json({ error: "Failed to generate manifest" });
    }
  });

  // Compare client manifest with server manifest
  app.post(
    "/sync/compare",
    requireRole("admin"),
    doubleCsrfProtection,
    async (req, res) => {
      const { clientManifest } = req.body;
      if (!clientManifest || typeof clientManifest !== "object") {
        return res.status(400).json({ error: "clientManifest is required" });
      }

      try {
        const serverManifest = await buildManifest(publicDir, publicDir);

        const toDownload = []; // Files that are newer on server or missing on client
        const toUpload = []; // Files that are newer on client or missing on server
        const inSync = []; // Files that are identical

        // Check server files
        for (const [filePath, serverInfo] of Object.entries(serverManifest)) {
          const clientInfo = clientManifest[filePath];
          if (!clientInfo) {
            toDownload.push({
              path: filePath,
              reason: "missing_on_client",
              ...serverInfo,
            });
          } else if (serverInfo.mtimeMs > clientInfo.mtimeMs) {
            toDownload.push({
              path: filePath,
              reason: "newer_on_server",
              ...serverInfo,
            });
          } else if (serverInfo.size === clientInfo.size) {
            inSync.push(filePath);
          }
        }

        // Check client files not on server
        for (const [filePath, clientInfo] of Object.entries(clientManifest)) {
          if (!serverManifest[filePath]) {
            toUpload.push({
              path: filePath,
              reason: "missing_on_server",
              ...clientInfo,
            });
          } else if (clientInfo.mtimeMs > serverManifest[filePath].mtimeMs) {
            toUpload.push({
              path: filePath,
              reason: "newer_on_client",
              ...clientInfo,
            });
          }
        }

        res.json({
          toDownload,
          toUpload,
          inSync: inSync.length,
          totalServer: Object.keys(serverManifest).length,
          totalClient: Object.keys(clientManifest).length,
        });
      } catch (err) {
        log.error("Sync compare error:", err.message);
        res.status(500).json({ error: "Failed to compare manifests" });
      }
    },
  );
};
