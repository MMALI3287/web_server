// TODO #6: Text / Clipboard Sharing
const { log, escapeHtml } = require("../utils");

// In-memory store for text messages
const textMessages = [];
const MAX_MESSAGES = Number(process.env.TEXT_MAX_MESSAGES) || 50;
const MAX_MESSAGE_SIZE = Number(process.env.TEXT_MAX_SIZE) || 10240; // 10KB
const TEXT_TTL = Number(process.env.TEXT_TTL_MS) || 60 * 60 * 1000; // 1 hour

// Cleanup expired messages every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (let i = textMessages.length - 1; i >= 0; i--) {
      if (textMessages[i].expiresAt <= now) {
        textMessages.splice(i, 1);
      }
    }
  },
  5 * 60 * 1000,
);

module.exports = function registerTextRoutes(app, { auth, csrf }) {
  const { requireRole } = auth;
  const { doubleCsrfProtection } = csrf;

  // Post a text message
  app.post("/text", requireRole("viewer"), doubleCsrfProtection, (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    if (text.length > MAX_MESSAGE_SIZE) {
      return res
        .status(400)
        .json({ error: `Text too long (max ${MAX_MESSAGE_SIZE} bytes)` });
    }

    // Trim old messages if at capacity
    while (textMessages.length >= MAX_MESSAGES) {
      textMessages.shift();
    }

    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + TEXT_TTL,
      createdBy: req.user ? req.user.username : "anonymous",
    };

    textMessages.push(msg);
    log.info(
      `Text shared by ${msg.createdBy}: ${text.slice(0, 50)}${text.length > 50 ? "..." : ""}`,
    );
    res.json({ success: true, message: msg });
  });

  // Get recent text messages
  app.get("/text", (req, res) => {
    const now = Date.now();
    const active = textMessages.filter((m) => m.expiresAt > now);
    res.json({ messages: active });
  });

  // Delete a text message
  app.delete(
    "/text/:id",
    requireRole("admin"),
    doubleCsrfProtection,
    (req, res) => {
      const idx = textMessages.findIndex((m) => m.id === req.params.id);
      if (idx === -1) {
        return res.status(404).json({ error: "Message not found" });
      }
      textMessages.splice(idx, 1);
      res.json({ success: true });
    },
  );
};
