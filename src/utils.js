const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Simple log-level helper: debug logs only in development
const isProduction = process.env.NODE_ENV === "production";
const log = {
  debug: (...args) => {
    if (!isProduction) console.log(...args);
  },
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

// HTML escaping to prevent XSS
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Generate a SHA-256 checksum for a file
function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

// Format file size for display
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Get emoji icon based on file extension
function getFileIcon(filename) {
  const ext = path.extname(filename).toLowerCase();
  const iconMap = {
    ".pdf": "📄",
    ".zip": "🗜️",
    ".rar": "🗜️",
    ".7z": "🗜️",
    ".tar": "🗜️",
    ".gz": "🗜️",
    ".txt": "📝",
    ".doc": "📄",
    ".docx": "📄",
    ".xls": "📊",
    ".xlsx": "📊",
    ".ppt": "📊",
    ".pptx": "📊",
    ".jpg": "🖼️",
    ".jpeg": "🖼️",
    ".png": "🖼️",
    ".gif": "🖼️",
    ".bmp": "🖼️",
    ".webp": "🖼️",
    ".svg": "🖼️",
    ".mp4": "🎥",
    ".avi": "🎥",
    ".mov": "🎥",
    ".mp3": "🎵",
    ".wav": "🎵",
    ".exe": "⚙️",
    ".js": "📜",
    ".html": "🌐",
    ".css": "🎨",
    ".json": "📋",
    ".xml": "📋",
    ".csv": "📊",
    ".md": "📝",
  };
  return iconMap[ext] || "�";
}

module.exports = {
  log,
  escapeHtml,
  computeFileHash,
  formatFileSize,
  getFileIcon,
};
