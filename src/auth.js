const crypto = require("crypto");

// Users defined via environment variables with bcrypt-hashed passwords.
// Roles: "admin" (browse + upload) and "viewer" (browse + download only).
const users = {};
if (process.env.ADMIN_USER && process.env.ADMIN_PASS_HASH) {
  users[process.env.ADMIN_USER] = {
    passwordHash: process.env.ADMIN_PASS_HASH,
    role: "admin",
  };
}
if (process.env.VIEWER_USER && process.env.VIEWER_PASS_HASH) {
  users[process.env.VIEWER_USER] = {
    passwordHash: process.env.VIEWER_PASS_HASH,
    role: "viewer",
  };
}
const authEnabled = Object.keys(users).length > 0;

// Session token signing using HMAC-SHA256
const sessionSecret =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

function createSessionToken(username, role) {
  const payload = `${username}:${role}:${Date.now()}`;
  const hmac = crypto.createHmac("sha256", sessionSecret);
  hmac.update(payload);
  const signature = hmac.digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64");
}

function verifySessionToken(token) {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;
    const [username, role, timestamp, signature] = parts;
    const payload = `${username}:${role}:${timestamp}`;
    const hmac = crypto.createHmac("sha256", sessionSecret);
    hmac.update(payload);
    const expected = hmac.digest("hex");
    if (
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }
    // Sessions expire after 24 hours
    if (Date.now() - Number(timestamp) > 24 * 60 * 60 * 1000) return null;
    return { username, role };
  } catch {
    return null;
  }
}

function sessionAuth(req, res, next) {
  if (!authEnabled) return next();

  // Share links are authenticated by token, not session
  if (req.path.startsWith("/s/")) return next();

  // WebDAV uses its own HTTP Basic authentication
  if (req.path.startsWith("/webdav")) return next();

  // Login/logout routes bypass auth
  if (req.path === "/login" || req.path === "/logout") return next();

  const token = req.cookies.__session;
  if (token) {
    const session = verifySessionToken(token);
    if (session) {
      req.user = { username: session.username, role: session.role };
      return next();
    }
  }

  // For API requests, return JSON 401
  if (req.headers.accept && !req.headers.accept.includes("text/html")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // For browser requests, redirect to login
  return res.redirect("/login");
}

function requireRole(role) {
  return (req, res, next) => {
    if (!authEnabled) return next();
    if (!req.user || req.user.role !== role) {
      return res
        .status(403)
        .json({ error: "Forbidden: insufficient permissions" });
    }
    next();
  };
}

module.exports = {
  users,
  authEnabled,
  createSessionToken,
  verifySessionToken,
  sessionAuth,
  requireRole,
};
