require("dotenv").config();
const express = require("express");
const multer = require("multer");
const app = express();

// Setup global middleware (helmet, rate limiters, CORS, parsers, compression)
const { downloadLimiter, uploadLimiter } = require("./src/middleware")(app);

// Authentication
const auth = require("./src/auth");
app.use(auth.sessionAuth);

// CSRF protection
const csrf = require("./src/csrf");

// --- Routes ---
require("./src/routes/login")(app, { auth });
require("./src/routes/download")(app, { downloadLimiter });
require("./src/routes/share")(app, { auth, csrf });
require("./src/routes/zip-download")(app, { downloadLimiter });
require("./src/routes/preview")(app, { downloadLimiter });
require("./src/routes/search")(app);
require("./src/routes/text")(app, { auth, csrf });
require("./src/routes/file-ops")(app, { auth, csrf });
require("./src/routes/bulk-ops")(app, { auth, csrf, downloadLimiter });
require("./src/routes/activity")(app);
require("./src/routes/storage")(app);
require("./src/routes/qr")(app);
require("./src/routes/thumbnails")(app);
require("./src/routes/versioning")(app);
require("./src/routes/pairing")(app);
require("./src/routes/api")(app, { downloadLimiter });
require("./src/routes/email")(app, { auth, csrf });
require("./src/routes/import-url")(app, { auth, csrf });
require("./src/routes/sync")(app, { csrf });
require("./src/routes/settings")(app, { auth, csrf });
require("./src/routes/webdav")(app);
require("./src/upload")(app, { auth, csrf, uploadLimiter });

// Error handler (CSRF + multer + generic)
const { log } = require("./src/utils");
app.use((error, req, res, next) => {
  if (
    error.code === "EBADCSRFTOKEN" ||
    error.message === "invalid csrf token"
  ) {
    return res.status(403).json({ error: "Invalid or missing CSRF token" });
  }
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ error: "Too many files (max 10)" });
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large (max 100 MB)" });
    }
  }
  if (error.message) {
    log.error("Upload error:", error.message);
    return res
      .status(400)
      .json({ error: "Upload failed. Please check your file and try again." });
  }
  log.error("Internal error:", error);
  res.status(500).json({ error: "An internal error occurred" });
});

// Explorer (directory listing) — must be last since it has a catch-all
require("./src/routes/explorer")(app);

// Start server (includes WebSocket + mDNS discovery)
require("./src/startup")(app);
