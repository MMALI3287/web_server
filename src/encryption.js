// TODO #28: Encrypted Storage at Rest
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Transform } = require("stream");
const { log } = require("./utils");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

// Derive key from password using PBKDF2
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
}

// Get the master encryption key from env or generate one
function getMasterKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), "utf8");
  }
  return null;
}

// Encrypt a file and write to destination
async function encryptFile(sourcePath, destPath, password) {
  const key = password
    ? (() => {
        const salt = crypto.randomBytes(SALT_LENGTH);
        return { key: deriveKey(password, salt), salt };
      })()
    : (() => {
        const mk = getMasterKey();
        if (!mk) throw new Error("No encryption key configured");
        return { key: mk, salt: Buffer.alloc(SALT_LENGTH) };
      })();

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key.key, iv);

  const readStream = fs.createReadStream(sourcePath);
  const writeStream = fs.createWriteStream(destPath);

  // Write header: salt (16) + iv (12)
  writeStream.write(key.salt);
  writeStream.write(iv);

  return new Promise((resolve, reject) => {
    readStream.pipe(cipher).pipe(writeStream);
    writeStream.on("finish", () => {
      // Append auth tag
      const authTag = cipher.getAuthTag();
      fs.appendFileSync(destPath, authTag);
      resolve();
    });
    writeStream.on("error", reject);
    readStream.on("error", reject);
  });
}

// Decrypt a file and write to destination
async function decryptFile(sourcePath, destPath, password) {
  const fileData = await fs.promises.readFile(sourcePath);

  if (fileData.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted file");
  }

  const salt = fileData.subarray(0, SALT_LENGTH);
  const iv = fileData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = fileData.subarray(fileData.length - AUTH_TAG_LENGTH);
  const encrypted = fileData.subarray(
    SALT_LENGTH + IV_LENGTH,
    fileData.length - AUTH_TAG_LENGTH,
  );

  const key = password ? deriveKey(password, salt) : getMasterKey();
  if (!key) throw new Error("No decryption key available");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  await fs.promises.writeFile(destPath, decrypted);
}

module.exports = { encryptFile, decryptFile, getMasterKey };
