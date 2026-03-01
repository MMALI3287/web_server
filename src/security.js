const path = require("path");

function sanitizeFilename(filename) {
  // Decode URI-encoded characters first to prevent bypass
  let decoded = filename;
  try {
    decoded = decodeURIComponent(filename);
  } catch (e) {
    // If decoding fails, use the original
  }
  // Remove any path traversal attempts and dangerous characters
  return decoded.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\.\./g, "");
}

function sanitizePath(requestedPath) {
  // Sanitize the entire path, allowing forward slashes for directories
  return requestedPath
    .replace(/[<>:"|?*\x00-\x1f]/g, "")
    .replace(/\.\./g, "")
    .replace(/\\/g, "/");
}

function isValidFilename(filename) {
  // Block path traversal, control characters, and OS-reserved characters
  // Allow Unicode letters/numbers (CJK, Arabic, etc.) and common punctuation
  if (!filename || filename.length === 0 || filename.length > 500) return false;
  if (/[\x00-\x1f<>:"|?*\\]/.test(filename)) return false;
  if (/\.\./.test(filename)) return false;
  return true;
}

const defaultAllowedExtensions = [
  ".pdf",
  ".txt",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".mp4",
  ".mp3",
  ".wav",
  ".avi",
  ".mov",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".json",
  ".xml",
  ".csv",
  ".svg",
  ".md",
  ".html",
  ".css",
  ".js",
];

function getConfiguredExtensions() {
  try {
    const configPath = path.join(__dirname, "..", "config.json");
    const data = require("fs").readFileSync(configPath, "utf8");
    const config = JSON.parse(data);
    if (
      Array.isArray(config.allowedExtensions) &&
      config.allowedExtensions.length > 0
    ) {
      return config.allowedExtensions;
    }
  } catch {
    // No config file or invalid — use defaults
  }
  return null;
}

function isAllowedFileType(filename) {
  const extensions = getConfiguredExtensions() || defaultAllowedExtensions;
  const ext = path.extname(filename).toLowerCase();
  return extensions.includes(ext);
}

function isSecurePath(requestedPath, baseDir) {
  const resolvedPath = path.resolve(baseDir, requestedPath);
  const resolvedBaseDir = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBaseDir)) return false;

  // Resolve symlinks to prevent symlink escape attacks
  try {
    const fs = require("fs");
    if (fs.existsSync(resolvedPath)) {
      const realPath = fs.realpathSync(resolvedPath);
      if (!realPath.startsWith(resolvedBaseDir)) return false;
    }
  } catch {
    return false;
  }
  return true;
}

module.exports = {
  sanitizeFilename,
  sanitizePath,
  isValidFilename,
  isAllowedFileType,
  isSecurePath,
};
