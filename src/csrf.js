const crypto = require("crypto");
const { doubleCsrf } = require("csrf-csrf");

const csrfSecret =
  process.env.CSRF_SECRET || crypto.randomBytes(32).toString("hex");

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => csrfSecret,
  getSessionIdentifier: (req) => (req.user ? req.user.username : ""),
  cookieName: "__csrf",
  cookieOptions: { httpOnly: true, sameSite: "strict", secure: true },
  getTokenFromRequest: (req) => req.headers["x-csrf-token"] || req.body._csrf,
});

module.exports = { generateCsrfToken, doubleCsrfProtection };
