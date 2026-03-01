// TODO #33: Configurable File Type Allowlist via UI
const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const { log } = require("../utils");

const configPath = path.join(PROJECT_ROOT, "config.json");

// Load config from file or use defaults
function loadConfig() {
  try {
    const data = fs.readFileSync(configPath, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

// Get the allowed extensions (from config.json or default)
function getAllowedExtensions() {
  const config = loadConfig();
  return config.allowedExtensions || null; // null means use default
}

module.exports = function registerSettingsRoutes(app, { auth, csrf }) {
  const { requireRole } = auth;
  const { doubleCsrfProtection } = csrf;

  // Get current settings
  app.get("/settings", requireRole("admin"), (req, res) => {
    const config = loadConfig();
    res.json({
      allowedExtensions: config.allowedExtensions || null,
      maxFileSize: Number(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024,
      maxStorage: Number(process.env.MAX_STORAGE) || 10 * 1024 * 1024 * 1024,
      uploadTtl: Number(process.env.UPLOAD_TTL_MS) || 24 * 60 * 60 * 1000,
    });
  });

  // Update allowed extensions
  app.post(
    "/settings/extensions",
    requireRole("admin"),
    doubleCsrfProtection,
    (req, res) => {
      const { extensions } = req.body;
      if (!Array.isArray(extensions)) {
        return res.status(400).json({ error: "extensions must be an array" });
      }

      // Validate each extension
      const validated = extensions
        .filter(
          (ext) =>
            typeof ext === "string" && ext.length > 1 && ext.length <= 10,
        )
        .map((ext) =>
          ext.startsWith(".") ? ext.toLowerCase() : "." + ext.toLowerCase(),
        );

      if (validated.length === 0) {
        return res.status(400).json({ error: "No valid extensions provided" });
      }

      const config = loadConfig();
      config.allowedExtensions = validated;
      saveConfig(config);

      log.info(`Allowed extensions updated: ${validated.join(", ")}`);
      res.json({ success: true, allowedExtensions: validated });
    },
  );

  // Reset to default extensions
  app.delete(
    "/settings/extensions",
    requireRole("admin"),
    doubleCsrfProtection,
    (req, res) => {
      const config = loadConfig();
      delete config.allowedExtensions;
      saveConfig(config);

      log.info("Allowed extensions reset to defaults");
      res.json({ success: true, message: "Reset to default extensions" });
    },
  );
};

module.exports.getAllowedExtensions = getAllowedExtensions;
