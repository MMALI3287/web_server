const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { log } = require("./utils");

/**
 * Collect all local IPv4 addresses (including loopback).
 */
function getAllLocalIps() {
  const ips = new Set(["127.0.0.1"]);
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.add(iface.address);
      }
    }
  }
  return [...ips];
}

/**
 * Synchronously fetch public IP by spawning a Node subprocess.
 */
function getPublicIpSync() {
  const script = path.join(os.tmpdir(), `sfserver-ip-${process.pid}.js`);
  try {
    fs.writeFileSync(
      script,
      [
        'const https = require("https");',
        'const req = https.get("https://api.ipify.org", { timeout: 3000 }, (res) => {',
        '  let d = "";',
        '  res.on("data", (c) => (d += c));',
        '  res.on("end", () => process.stdout.write(d));',
        "});",
        'req.on("error", () => process.exit(1));',
        'req.on("timeout", () => { req.destroy(); process.exit(1); });',
      ].join("\n"),
    );
    const ip = execSync(`node "${script}"`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return ip;
  } catch {
    // Public IP detection failed — not critical
  } finally {
    try {
      fs.unlinkSync(script);
    } catch {}
  }
  return null;
}

/**
 * Parse Subject Alternative Names from an existing certificate.
 */
function getCertSans(certPath) {
  try {
    const pem = fs.readFileSync(certPath, "utf8");
    const cert = new crypto.X509Certificate(pem);
    if (!cert.subjectAltName) return { dns: [], ips: [] };

    const dns = [];
    const ips = [];
    for (const entry of cert.subjectAltName.split(",")) {
      const trimmed = entry.trim();
      if (trimmed.startsWith("DNS:")) dns.push(trimmed.slice(4));
      else if (trimmed.startsWith("IP Address:")) ips.push(trimmed.slice(11));
    }
    return { dns, ips };
  } catch {
    return { dns: [], ips: [] };
  }
}

/**
 * Check if the server cert needs regeneration.
 */
function needsRegeneration(certPath, keyPath, caPath, requiredIps) {
  if (
    !fs.existsSync(certPath) ||
    !fs.existsSync(keyPath) ||
    !fs.existsSync(caPath)
  )
    return true;

  try {
    // Check server cert expiry
    const pem = fs.readFileSync(certPath, "utf8");
    const cert = new crypto.X509Certificate(pem);
    const daysLeft = (new Date(cert.validTo) - Date.now()) / 86400000;
    if (daysLeft < 30) {
      log.info(
        `Server certificate expires in ${Math.floor(daysLeft)} days — regenerating`,
      );
      return true;
    }

    // Check CA cert expiry
    const caPem = fs.readFileSync(caPath, "utf8");
    const caCert = new crypto.X509Certificate(caPem);
    const caDaysLeft = (new Date(caCert.validTo) - Date.now()) / 86400000;
    if (caDaysLeft < 30) {
      log.info(
        `CA certificate expires in ${Math.floor(caDaysLeft)} days — regenerating`,
      );
      return true;
    }

    // Verify server cert is signed by our CA
    if (!cert.checkIssued(caCert)) return true;
  } catch {
    return true;
  }

  const sans = getCertSans(certPath);
  if (!sans.dns.includes("localhost")) return true;

  for (const ip of requiredIps) {
    if (!sans.ips.includes(ip)) return true;
  }

  return false;
}

/**
 * Generate a local CA + CA-signed server certificate with IP SANs.
 */
function generateCerts(certsDir, ips) {
  try {
    execSync("openssl version", { stdio: "pipe", timeout: 3000 });
  } catch {
    log.warn("OpenSSL not available — cannot auto-generate TLS certificate");
    return false;
  }

  const caKeyPath = path.join(certsDir, "ca-key.pem");
  const caCertPath = path.join(certsDir, "ca-cert.pem");
  const serverKeyPath = path.join(certsDir, "key.pem");
  const serverCsrPath = path.join(certsDir, "_server.csr");
  const serverCertPath = path.join(certsDir, "cert.pem");
  const caConfigPath = path.join(certsDir, "_ca.cnf");
  const csrConfigPath = path.join(certsDir, "_csr.cnf");
  const extPath = path.join(certsDir, "_ext.cnf");

  const sanLines = ["DNS.1 = localhost"];
  ips.forEach((ip, i) => sanLines.push(`IP.${i + 1} = ${ip}`));

  // CA config (self-signed root)
  const caConfig = [
    "[req]",
    "default_bits = 2048",
    "prompt = no",
    "default_md = sha256",
    "distinguished_name = dn",
    "x509_extensions = v3_ca",
    "",
    "[dn]",
    "CN = Secure File Server CA",
    "",
    "[v3_ca]",
    "basicConstraints = critical, CA:TRUE",
    "keyUsage = critical, keyCertSign, cRLSign",
    "",
  ].join("\n");

  // OpenSSL config for server CSR generation
  const csrConfig = [
    "[req]",
    "default_bits = 2048",
    "prompt = no",
    "default_md = sha256",
    "distinguished_name = dn",
    "",
    "[dn]",
    "CN = secure-file-server",
    "",
  ].join("\n");

  // Extensions config for signing (v3 extensions + SANs)
  const extConfig = [
    "basicConstraints = CA:FALSE",
    "keyUsage = digitalSignature, keyEncipherment",
    "extendedKeyUsage = serverAuth",
    "subjectAltName = @alt_names",
    "",
    "[alt_names]",
    ...sanLines,
    "",
  ].join("\n");

  try {
    // Step 1: Generate CA key + self-signed CA cert (if missing or expired)
    let regenerateCA = !fs.existsSync(caKeyPath) || !fs.existsSync(caCertPath);
    if (!regenerateCA) {
      try {
        const caPem = fs.readFileSync(caCertPath, "utf8");
        const caCert = new crypto.X509Certificate(caPem);
        const caDaysLeft = (new Date(caCert.validTo) - Date.now()) / 86400000;
        if (caDaysLeft < 30) regenerateCA = true;
      } catch {
        regenerateCA = true;
      }
    }

    if (regenerateCA) {
      fs.writeFileSync(caConfigPath, caConfig);
      execSync(
        `openssl req -x509 -new -newkey rsa:2048 -keyout "${caKeyPath}" -out "${caCertPath}" -days 825 -nodes -config "${caConfigPath}"`,
        { stdio: "pipe", timeout: 15000 },
      );
      log.info("Local CA certificate generated (certs/ca-cert.pem)");
    }

    // Step 2: Generate server private key + CSR
    fs.writeFileSync(csrConfigPath, csrConfig);
    execSync(
      `openssl req -new -newkey rsa:2048 -keyout "${serverKeyPath}" -out "${serverCsrPath}" -nodes -config "${csrConfigPath}"`,
      { stdio: "pipe", timeout: 15000 },
    );

    // Step 3: Sign server CSR with CA (825 days max per Apple/Mozilla rules)
    fs.writeFileSync(extPath, extConfig);
    execSync(
      `openssl x509 -req -in "${serverCsrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${serverCertPath}" -days 365 -sha256 -extfile "${extPath}"`,
      { stdio: "pipe", timeout: 15000 },
    );

    log.info(`TLS certificate generated — SANs: localhost, ${ips.join(", ")}`);
    log.info(
      "To remove 'Not Secure' warning, install certs/ca-cert.pem as a trusted root CA.",
    );
    return true;
  } catch (err) {
    log.error("Failed to generate TLS certificates:", err.message);
    return false;
  } finally {
    // Clean up temp files
    for (const f of [
      caConfigPath,
      csrConfigPath,
      extPath,
      serverCsrPath,
      path.join(certsDir, "ca-cert.srl"),
    ]) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
}

/**
 * Ensure TLS certificates exist and cover all current network addresses.
 * Uses a local CA so the CA cert can be installed in the OS trust store.
 */
function ensureCerts(certsDir) {
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const certPath = path.join(certsDir, "cert.pem");
  const keyPath = path.join(certsDir, "key.pem");
  const caPath = path.join(certsDir, "ca-cert.pem");
  const localIps = getAllLocalIps();
  const publicIp = getPublicIpSync();
  const allIps =
    publicIp && !localIps.includes(publicIp)
      ? [...localIps, publicIp]
      : localIps;

  if (!needsRegeneration(certPath, keyPath, caPath, allIps)) {
    return false;
  }

  return generateCerts(certsDir, allIps);
}

/**
 * Install the CA certificate into the Windows trusted root store.
 * Requires admin privileges. Returns true if successful.
 */
function trustCA(certsDir) {
  const caCertPath = path.join(certsDir, "ca-cert.pem");
  if (!fs.existsSync(caCertPath)) {
    log.warn(
      "CA certificate not found — run the server once first to generate it.",
    );
    return false;
  }

  if (process.platform !== "win32") {
    log.info(`To trust the CA on this OS, manually install: ${caCertPath}`);
    return false;
  }

  try {
    execSync(`certutil -addstore -user "Root" "${caCertPath}"`, {
      stdio: "pipe",
      timeout: 10000,
    });
    log.info("CA certificate installed in Windows user trust store.");
    return true;
  } catch (err) {
    log.warn("Could not auto-install CA cert (may need admin):", err.message);
    log.info(
      `Manually install: certutil -addstore -user "Root" "${caCertPath}"`,
    );
    return false;
  }
}

module.exports = { ensureCerts, trustCA };

module.exports = { ensureCerts };
