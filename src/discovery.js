// TODO #24: Device Discovery on LAN (mDNS/Bonjour)
const Bonjour = require("bonjour-service");
const { log } = require("./utils");

let bonjourInstance = null;
const discoveredPeers = [];

module.exports = function setupDiscovery(port) {
  if (process.env.DISABLE_DISCOVERY === "true") return;

  try {
    bonjourInstance = new Bonjour.default();

    // Advertise this server
    const serviceName = process.env.SERVER_NAME || "Secure File Server";
    bonjourInstance.publish({
      name: serviceName,
      type: "http",
      port: port,
      txt: {
        path: "/",
        version: require(require("path").join(__dirname, "..", "package.json"))
          .version,
      },
    });
    log.info(`mDNS: Advertising "${serviceName}" on port ${port}`);

    // Browse for other instances
    const browser = bonjourInstance.find({ type: "http" }, (service) => {
      // Only track services that look like our file server
      if (service.txt && service.txt.version) {
        const peer = {
          name: service.name,
          host: service.host,
          port: service.port,
          addresses: service.addresses || [],
          discoveredAt: new Date().toISOString(),
        };
        const exists = discoveredPeers.findIndex(
          (p) => p.host === peer.host && p.port === peer.port,
        );
        if (exists === -1) {
          discoveredPeers.push(peer);
          log.info(
            `mDNS: Discovered peer "${service.name}" at ${service.host}:${service.port}`,
          );
        }
      }
    });

    // Handle service removal
    browser.on("down", (service) => {
      const idx = discoveredPeers.findIndex(
        (p) => p.host === service.host && p.port === service.port,
      );
      if (idx !== -1) {
        discoveredPeers.splice(idx, 1);
        log.info(`mDNS: Peer "${service.name}" went offline`);
      }
    });
  } catch (err) {
    log.warn("mDNS discovery failed to start:", err.message);
  }
};

// Get list of discovered peers
module.exports.getDiscoveredPeers = function () {
  return discoveredPeers;
};

// Cleanup
module.exports.shutdown = function () {
  if (bonjourInstance) {
    bonjourInstance.unpublishAll();
    bonjourInstance.destroy();
    bonjourInstance = null;
  }
};
