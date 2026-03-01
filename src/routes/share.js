const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { PROJECT_ROOT } = require("../config");
const { log, escapeHtml } = require("../utils");
const { sanitizePath, isSecurePath } = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");

// In-memory store for share links
const shareLinks = new Map();
const SHARE_LINK_TTL =
  Number(process.env.SHARE_LINK_TTL_MS) || 24 * 60 * 60 * 1000;
const SHARE_MAX_DOWNLOADS = Number(process.env.SHARE_MAX_DOWNLOADS) || 0;

// Cleanup expired share links every 10 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [token, link] of shareLinks) {
      if (link.expiresAt <= now) {
        shareLinks.delete(token);
      }
    }
  },
  10 * 60 * 1000,
);

module.exports = function registerShareRoutes(
  app,
  { auth, csrf, authLimiter },
) {
  const { requireRole } = auth;
  const { generateCsrfToken, doubleCsrfProtection } = csrf;

  // CSRF token endpoint — client fetches this before making POST requests
  app.get("/csrf-token", (req, res) => {
    const token = generateCsrfToken(req, res);
    res.json({ csrfToken: token });
  });

  // Create a shareable link (admin only)
  app.post(
    "/share",
    requireRole("admin"),
    doubleCsrfProtection,
    async (req, res) => {
      const {
        filePath: reqPath,
        maxDownloads,
        expiryHours,
        password,
      } = req.body;
      if (!reqPath || typeof reqPath !== "string") {
        return res.status(400).json({ error: "filePath is required" });
      }

      const sanitized = sanitizePath(reqPath);
      const fullPath = path.join(publicDir, sanitized);

      if (!isSecurePath(sanitized, publicDir)) {
        return res.status(403).json({ error: "Access denied" });
      }

      try {
        const stats = fs.statSync(fullPath);
        if (!stats.isFile()) {
          return res.status(400).json({ error: "Path is not a file" });
        }
      } catch {
        return res.status(404).json({ error: "File not found" });
      }

      const token = crypto.randomBytes(24).toString("base64url");
      const ttl =
        expiryHours && Number(expiryHours) > 0
          ? Number(expiryHours) * 60 * 60 * 1000
          : SHARE_LINK_TTL;
      const max =
        maxDownloads && Number(maxDownloads) > 0
          ? Number(maxDownloads)
          : SHARE_MAX_DOWNLOADS;

      // Hash password if provided
      let passwordHash = null;
      if (password && typeof password === "string" && password.length > 0) {
        passwordHash = await bcrypt.hash(password, 10);
      }

      shareLinks.set(token, {
        filePath: sanitized,
        expiresAt: Date.now() + ttl,
        maxDownloads: max,
        downloads: 0,
        createdBy: req.user ? req.user.username : "unknown",
        passwordHash,
      });

      log.info(
        `Share link created for ${sanitized} by ${req.user ? req.user.username : "unknown"} (token: ${token.slice(0, 8)}..., protected: ${!!passwordHash})`,
      );

      res.json({
        success: true,
        token,
        url: `/s/${token}`,
        expiresAt: new Date(Date.now() + ttl).toISOString(),
        maxDownloads: max || "unlimited",
        passwordProtected: !!passwordHash,
      });
    },
  );

  // Serve shared file (no auth required — the token IS the auth)
  app.get("/s/:token", (req, res) => {
    const link = shareLinks.get(req.params.token);
    if (!link) {
      return res.status(404).json({ error: "Link not found or expired" });
    }
    if (link.expiresAt <= Date.now()) {
      shareLinks.delete(req.params.token);
      return res.status(410).json({ error: "Link has expired" });
    }
    if (link.maxDownloads > 0 && link.downloads >= link.maxDownloads) {
      shareLinks.delete(req.params.token);
      return res.status(410).json({ error: "Download limit reached" });
    }

    // If password protected and not yet verified, show password form
    if (
      link.passwordHash &&
      req.cookies[`__share_${req.params.token}`] !== "1"
    ) {
      const nonce = res.locals.cspNonce;
      const filename = path.basename(link.filePath);
      return res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Password Required</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:white;border-radius:15px;padding:40px;max-width:400px;width:90%;box-shadow:0 20px 40px rgba(0,0,0,0.2);text-align:center}
h2{margin-bottom:10px;color:#333}p{color:#666;margin-bottom:20px}
input[type=password]{width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:1rem;margin-bottom:15px}
input[type=password]:focus{outline:none;border-color:#667eea}
button{background:linear-gradient(45deg,#667eea,#764ba2);color:white;border:none;padding:12px 30px;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:bold}
button:hover{opacity:0.9}.error{color:#f44336;margin-top:10px;display:none}</style></head>
<body><div class="card"><h2>🔒 Password Required</h2>
<p>File: <strong>${escapeHtml(filename)}</strong></p>
<form id="f" method="POST" action="/s/${escapeHtml(req.params.token)}/verify">
<input type="password" name="password" placeholder="Enter password" required autofocus>
<button type="submit">Download</button>
<div class="error" id="err"></div></form>
<script nonce="${nonce}">document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();
fetch('/s/${escapeHtml(req.params.token)}/verify',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({password:this.password.value})}).then(function(r){if(r.ok){window.location.href='/s/${escapeHtml(req.params.token)}'}else{return r.json().then(function(d){var err=document.getElementById('err');err.textContent=d.error;err.style.display='block'})}}).catch(function(){var err=document.getElementById('err');err.textContent='Network error';err.style.display='block'})});</script>
</div></body></html>`);
    }

    const fullPath = path.join(publicDir, link.filePath);

    if (!isSecurePath(link.filePath, publicDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        return res.status(404).json({ error: "File no longer available" });
      }

      link.downloads++;
      const filename = path.basename(link.filePath);
      const safeName = filename.replace(/["\r\n]/g, "");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.setHeader("Content-Length", stats.size);

      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);
      stream.on("error", () => {
        if (!res.headersSent)
          res.status(500).json({ error: "Download failed" });
      });
    });
  });

  // Verify password for protected share links
  app.post("/s/:token/verify", authLimiter, async (req, res) => {
    const link = shareLinks.get(req.params.token);
    if (!link) {
      return res.status(404).json({ error: "Link not found" });
    }
    if (!link.passwordHash) {
      return res.json({ success: true });
    }

    const { password } = req.body;
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password is required" });
    }

    try {
      const valid = await bcrypt.compare(password, link.passwordHash);
      if (!valid) {
        return res.status(403).json({ error: "Incorrect password" });
      }
      // Set a secure httpOnly cookie to mark this share link as verified
      res.cookie(`__share_${req.params.token}`, "1", {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 10 * 60 * 1000, // 10 minutes
        path: `/s/${req.params.token}`,
      });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Verification failed" });
    }
  });
};
