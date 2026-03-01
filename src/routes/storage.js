// TODO #17: Auto-Expiring Uploads
// TODO #18: Disk Usage Display & Quota
const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const { log, formatFileSize } = require("../utils");

const publicDir = path.join(PROJECT_ROOT, "public");
const uploadsDir = path.join(PROJECT_ROOT, "uploads");
const UPLOAD_TTL = Number(process.env.UPLOAD_TTL_MS) || 24 * 60 * 60 * 1000;
const MAX_STORAGE = Number(process.env.MAX_STORAGE) || 10 * 1024 * 1024 * 1024; // 10GB

// Recursively calculate directory size
async function getDirSize(dir) {
  let size = 0;
  let fileCount = 0;
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await getDirSize(fullPath);
        size += sub.size;
        fileCount += sub.fileCount;
      } else if (entry.isFile()) {
        const stats = await fs.promises.stat(fullPath);
        size += stats.size;
        fileCount++;
      }
    }
  } catch {
    // directory may not exist
  }
  return { size, fileCount };
}

// Cleanup expired uploads every 30 minutes
setInterval(
  async () => {
    const now = Date.now();
    try {
      const entries = await fs.promises.readdir(uploadsDir, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        const fullPath = path.join(uploadsDir, entry.name);
        try {
          const stats = await fs.promises.stat(fullPath);
          if (now - stats.mtimeMs > UPLOAD_TTL) {
            if (entry.isDirectory()) {
              fs.rmSync(fullPath, { recursive: true });
            } else {
              fs.unlinkSync(fullPath);
            }
            log.info(`Auto-expired upload: ${entry.name}`);
          }
        } catch {
          // skip
        }
      }
    } catch {
      // uploads dir may not exist
    }
  },
  30 * 60 * 1000,
);

module.exports = function registerStorageRoutes(app) {
  // Disk usage stats
  app.get("/stats", async (req, res) => {
    const [publicStats, uploadsStats] = await Promise.all([
      getDirSize(publicDir),
      getDirSize(uploadsDir),
    ]);

    const totalUsed = publicStats.size + uploadsStats.size;

    res.json({
      public: {
        size: publicStats.size,
        formattedSize: formatFileSize(publicStats.size),
        fileCount: publicStats.fileCount,
      },
      uploads: {
        size: uploadsStats.size,
        formattedSize: formatFileSize(uploadsStats.size),
        fileCount: uploadsStats.fileCount,
        ttl: UPLOAD_TTL,
      },
      total: {
        size: totalUsed,
        formattedSize: formatFileSize(totalUsed),
        fileCount: publicStats.fileCount + uploadsStats.fileCount,
      },
      quota: {
        max: MAX_STORAGE,
        formattedMax: formatFileSize(MAX_STORAGE),
        used: totalUsed,
        remaining: Math.max(0, MAX_STORAGE - totalUsed),
        percentUsed: Math.round((totalUsed / MAX_STORAGE) * 100),
      },
    });
  });
};

module.exports.getDirSize = getDirSize;
module.exports.MAX_STORAGE = MAX_STORAGE;
