// TODO #13: File Versioning
const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const { log, formatFileSize } = require("../utils");
const { sanitizePath, isSecurePath } = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");
const MAX_VERSIONS = Number(process.env.MAX_FILE_VERSIONS) || 5;

// Create a version backup of a file before overwrite
async function createVersion(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const versionsDir = path.join(dir, ".versions");

  try {
    await fs.promises.access(filePath);
  } catch {
    return; // File doesn't exist yet, no version needed
  }

  await fs.promises.mkdir(versionsDir, { recursive: true });

  const stats = await fs.promises.stat(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = path.extname(base);
  const nameNoExt = base.slice(0, -ext.length || undefined);
  const versionName = `${nameNoExt}_v${timestamp}${ext}`;
  const versionPath = path.join(versionsDir, versionName);

  await fs.promises.copyFile(filePath, versionPath);
  log.info(`Version created: ${versionName}`);

  // Cleanup old versions beyond retention limit
  const allVersions = (await fs.promises.readdir(versionsDir))
    .filter((f) => f.startsWith(nameNoExt + "_v"))
    .sort()
    .reverse();

  for (let i = MAX_VERSIONS; i < allVersions.length; i++) {
    const old = path.join(versionsDir, allVersions[i]);
    await fs.promises.unlink(old).catch(() => {});
  }
}

module.exports = function registerVersioningRoutes(app) {
  // List versions for a file
  app.get("/versions/{*path}", async (req, res) => {
    const rawPath = Array.isArray(req.params.path)
      ? req.params.path.join("/")
      : req.params.path || "";
    const requestedPath = decodeURIComponent(rawPath);
    const sanitized = sanitizePath(requestedPath);
    const fullPath = path.join(publicDir, sanitized);

    if (!isSecurePath(sanitized, publicDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const dir = path.dirname(fullPath);
    const base = path.basename(fullPath);
    const nameNoExt = base.slice(0, -path.extname(base).length || undefined);
    const versionsDir = path.join(dir, ".versions");

    try {
      const files = await fs.promises.readdir(versionsDir);
      const versions = [];

      for (const f of files) {
        if (f.startsWith(nameNoExt + "_v")) {
          const vPath = path.join(versionsDir, f);
          const stats = await fs.promises.stat(vPath);
          versions.push({
            name: f,
            size: stats.size,
            formattedSize: formatFileSize(stats.size),
            modified: stats.mtime.toISOString(),
          });
        }
      }

      versions.sort((a, b) => b.modified.localeCompare(a.modified));
      res.json({ file: sanitized, versions, maxVersions: MAX_VERSIONS });
    } catch {
      res.json({ file: sanitized, versions: [], maxVersions: MAX_VERSIONS });
    }
  });
};

module.exports.createVersion = createVersion;
