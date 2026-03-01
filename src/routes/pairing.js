// TODO #25: Pairing System with Codes
const crypto = require("crypto");
const { log } = require("../utils");

// In-memory pairing store (code -> session info)
const pairingSessions = new Map();
const PAIRING_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup expired pairing sessions
setInterval(() => {
  const now = Date.now();
  for (const [code, session] of pairingSessions) {
    if (now - session.createdAt > PAIRING_TTL) {
      pairingSessions.delete(code);
    }
  }
}, 60 * 1000);

function generatePairingCode() {
  return String(crypto.randomInt(100000, 999999));
}

module.exports = function registerPairingRoutes(app) {
  // Create a new pairing session
  app.post("/pair", (req, res) => {
    const code = generatePairingCode();
    pairingSessions.set(code, {
      createdAt: Date.now(),
      initiator: req.user ? req.user.username : req.ip,
      paired: false,
      receiver: null,
    });

    log.info(
      `Pairing session created: ${code} by ${req.user ? req.user.username : req.ip}`,
    );
    res.json({
      success: true,
      code,
      expiresIn: PAIRING_TTL / 1000,
    });
  });

  // Join an existing pairing session
  app.post("/pair/join", (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code is required" });
    }

    const session = pairingSessions.get(code);
    if (!session) {
      return res.status(404).json({ error: "Invalid or expired pairing code" });
    }

    if (Date.now() - session.createdAt > PAIRING_TTL) {
      pairingSessions.delete(code);
      return res.status(410).json({ error: "Pairing code has expired" });
    }

    if (session.paired) {
      return res.status(409).json({ error: "Session already paired" });
    }

    session.paired = true;
    session.receiver = req.user ? req.user.username : req.ip;
    log.info(`Pairing session joined: ${code} by ${session.receiver}`);

    res.json({
      success: true,
      message: "Paired successfully",
      initiator: session.initiator,
    });
  });

  // Check pairing status
  app.get("/pair/:code", (req, res) => {
    const session = pairingSessions.get(req.params.code);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({
      code: req.params.code,
      paired: session.paired,
      initiator: session.initiator,
      receiver: session.receiver,
      expiresIn: Math.max(
        0,
        Math.round((PAIRING_TTL - (Date.now() - session.createdAt)) / 1000),
      ),
    });
  });
};
