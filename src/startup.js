const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { WebSocketServer } = require("ws");
const { PROJECT_ROOT } = require("./config");
const { log } = require("./utils");
const { ensureCerts, trustCA } = require("./cert-gen");

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  let fallback = null;
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      // Skip link-local (169.254.x.x)
      if (iface.address.startsWith("169.254.")) {
        if (!fallback) fallback = iface.address;
        continue;
      }
      return iface.address;
    }
  }
  return fallback;
}

function getPublicIp() {
  return new Promise((resolve) => {
    const req = https.get("https://api.ipify.org", { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve(data.trim() || null));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

module.exports = function startServer(app) {
  const ENV_PORT = Number(process.env.PORT) || 3000;
  const ENV_HOST = process.env.HOST || "0.0.0.0";

  const hostCandidates = Array.from(new Set([ENV_HOST, "127.0.0.1"]));
  const portCandidates = Array.from(new Set([ENV_PORT, 3080, 5000, 8080, 0]));

  let hi = 0;
  let pi = 0;
  let server;

  function tryNext() {
    if (hi >= hostCandidates.length) {
      log.error("Failed to bind server: exhausted host candidates.");
      process.exit(1);
      return;
    }
    const host = hostCandidates[hi];
    const port = portCandidates[pi];
    tryListen(host, port);
  }

  function advance() {
    pi++;
    if (pi >= portCandidates.length) {
      pi = 0;
      hi++;
    }
    tryNext();
  }

  // Auto-generate/update TLS certificate with SANs for all current IPs
  const certsDir = path.join(PROJECT_ROOT, "certs");
  const certsGenerated = ensureCerts(certsDir);

  // Handle --trust-ca flag: install CA cert into OS trust store
  if (process.argv.includes("--trust-ca")) {
    trustCA(certsDir);
  } else if (certsGenerated) {
    log.info(
      'Run "node server.js --trust-ca" to install CA and remove browser warnings.',
    );
  }

  let httpsOptions = null;
  if (
    fs.existsSync(path.join(certsDir, "key.pem")) &&
    fs.existsSync(path.join(certsDir, "cert.pem"))
  ) {
    httpsOptions = {
      key: fs.readFileSync(path.join(certsDir, "key.pem")),
      cert: fs.readFileSync(path.join(certsDir, "cert.pem")),
    };
  }

  // WebSocket clients tracking
  const wsClients = new Set();

  function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(msg);
      }
    }
  }

  // Export broadcast so other modules can use it
  app.set("wsBroadcast", broadcast);
  app.set("wsClients", wsClients);

  function setupWebSocket(httpServer) {
    const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

    wss.on("connection", (ws, req) => {
      wsClients.add(ws);
      log.info(`WebSocket connected (${wsClients.size} clients)`);

      // Send initial state
      ws.send(JSON.stringify({ type: "connected", clients: wsClients.size }));

      // Broadcast updated client count
      broadcast({ type: "clients", count: wsClients.size });

      ws.on("close", () => {
        wsClients.delete(ws);
        broadcast({ type: "clients", count: wsClients.size });
        log.debug(`WebSocket disconnected (${wsClients.size} clients)`);
      });

      ws.on("error", (err) => {
        log.error("WebSocket error:", err.message);
        wsClients.delete(ws);
      });
    });

    return wss;
  }

  function tryListen(host, port) {
    if (httpsOptions) {
      server = https.createServer(httpsOptions, app).listen(port, host);
    } else {
      log.warn("TLS certificates not found in certs/. Starting in HTTP mode.");
      server = app.listen(port, host);
    }

    const scheme = httpsOptions ? "https" : "http";

    server.once("listening", () => {
      const addressInfo = server.address();
      const actualHost =
        addressInfo.address === "::" ? host : addressInfo.address;
      const actualPort = addressInfo.port;
      const lanIp = getLocalIp();
      log.info(`Server running on ${scheme}://${actualHost}:${actualPort}`);
      log.info(`Local access: ${scheme}://localhost:${actualPort}`);
      if (lanIp) {
        log.info(`LAN access: ${scheme}://${lanIp}:${actualPort}`);
      }
      getPublicIp().then((publicIp) => {
        if (publicIp) {
          log.info(`Public access: ${scheme}://${publicIp}:${actualPort}`);
        }
      });

      // Setup WebSocket server
      setupWebSocket(server);
      log.info("WebSocket server running on /ws");

      // Setup device discovery (mDNS)
      try {
        const setupDiscovery = require("./discovery");
        setupDiscovery(actualPort);
      } catch (err) {
        log.debug("mDNS discovery not available:", err.message);
      }

      // Lifecycle instrumentation
      server.on("close", () => {
        log.info(`${scheme.toUpperCase()} server closed`);
        try {
          const discovery = require("./discovery");
          discovery.shutdown();
        } catch {
          /* ignore */
        }
      });
    });

    server.once("error", (err) => {
      log.error("Server error:", err);
      advance();
    });
  }

  // Global process-level handlers
  process.on("uncaughtException", (err) => {
    log.error("Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled promise rejection:", reason);
  });

  process.on("SIGINT", () => {
    log.info("SIGINT received (Ctrl+C). Shutting down gracefully...");
    if (server) server.close(() => process.exit(0));
    else process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("SIGTERM received. Shutting down gracefully...");
    if (server) server.close(() => process.exit(0));
    else process.exit(0);
  });

  tryNext();
};
