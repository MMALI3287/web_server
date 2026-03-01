const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { PROJECT_ROOT } = require("./config");
const { log } = require("./utils");
const {
  sanitizeFilename,
  sanitizePath,
  isValidFilename,
  isAllowedFileType,
  isSecurePath,
} = require("./security");

// Map of allowed extensions to expected MIME type prefixes for magic-byte validation
const extensionMimeMap = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".7z": "application/x-7z-compressed",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".xml": "application/xml",
};

// Extensions that are text-based and have no magic bytes (skip validation)
const textExtensions = new Set([
  ".txt",
  ".csv",
  ".json",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
]);

async function validateFileMagic(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (textExtensions.has(ext)) return true;
  const expectedMime = extensionMimeMap[ext];
  if (!expectedMime) return true;

  try {
    const { fileTypeFromFile } = await import("file-type");
    const detected = await fileTypeFromFile(filePath);
    if (!detected) return true;
    return detected.mime === expectedMime;
  } catch {
    return true;
  }
}

async function validateUploadedFiles(files) {
  const invalid = [];
  for (const file of files) {
    const ok = await validateFileMagic(file.path, file.originalname);
    if (!ok) {
      invalid.push(file);
      try {
        await fs.promises.unlink(file.path);
      } catch {
        /* ignore */
      }
    }
  }
  return invalid;
}

module.exports = function registerUploadRoutes(
  app,
  { auth, csrf, uploadLimiter },
) {
  const { requireRole } = auth;
  const { doubleCsrfProtection } = csrf;
  const uploadsDir = path.join(PROJECT_ROOT, "uploads");

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
      const requestedPath = req.body.uploadPath || "";
      const sanitizedPath = sanitizePath(requestedPath);
      const targetDir = path.join(uploadsDir, sanitizedPath);

      if (sanitizedPath && !isSecurePath(sanitizedPath, uploadsDir)) {
        return cb(new Error("Invalid upload path"), null);
      }

      const pathSegments = sanitizedPath.split("/").filter(Boolean);
      if (pathSegments.length > 3) {
        return cb(new Error("Upload path too deep (max 3 levels)"), null);
      }

      try {
        await fs.promises.mkdir(targetDir, { recursive: true });
      } catch (err) {
        return cb(new Error("Failed to create upload directory"), null);
      }

      cb(null, targetDir);
    },
    filename: function (req, file, cb) {
      const sanitizedName = sanitizeFilename(file.originalname);

      if (
        !sanitizedName ||
        !isValidFilename(sanitizedName) ||
        !isAllowedFileType(sanitizedName)
      ) {
        return cb(new Error("Invalid file type or name"), null);
      }

      const ext = path.extname(sanitizedName);
      const nameWithoutExt = sanitizedName.slice(0, -ext.length);
      const uniqueSuffix = crypto.randomUUID().slice(0, 8);
      const finalName = `${nameWithoutExt}_${uniqueSuffix}${ext}`;

      cb(null, finalName);
    },
  });

  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 10,
    },
    fileFilter: function (req, file, cb) {
      const sanitizedName = sanitizeFilename(file.originalname);
      if (
        !sanitizedName ||
        !isValidFilename(sanitizedName) ||
        !isAllowedFileType(sanitizedName)
      ) {
        cb(new Error("File type not allowed"), false);
      } else {
        cb(null, true);
      }
    },
  });

  // Upload endpoint for single file
  app.post(
    "/upload",
    uploadLimiter,
    requireRole("admin"),
    doubleCsrfProtection,
    upload.single("file"),
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const invalid = await validateUploadedFiles([req.file]);
      if (invalid.length > 0) {
        return res
          .status(400)
          .json({ error: "File content does not match its extension" });
      }

      log.info(`File uploaded: ${req.file.filename} (${req.file.size} bytes)`);

      res.json({
        success: true,
        message: "File uploaded successfully",
        filename: req.file.filename,
        size: req.file.size,
        path: req.body.uploadPath || "",
      });
    },
  );

  // Upload endpoint for multiple files
  app.post(
    "/upload-multiple",
    uploadLimiter,
    requireRole("admin"),
    doubleCsrfProtection,
    upload.array("files", 10),
    async (req, res) => {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const invalid = await validateUploadedFiles(req.files);
      if (invalid.length > 0) {
        return res.status(400).json({
          error: `${invalid.length} file(s) rejected: content does not match extension`,
        });
      }

      const uploadedFiles = req.files.map((file) => ({
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        path: req.body.uploadPath || "",
      }));

      log.info(`${req.files.length} files uploaded successfully`);

      res.json({
        success: true,
        message: `${req.files.length} files uploaded successfully`,
        files: uploadedFiles,
        totalSize: req.files.reduce((total, file) => total + file.size, 0),
        path: req.body.uploadPath || "",
      });
    },
  );

  // Upload endpoint for folder (files with relative paths preserved)
  app.post(
    "/upload-folder",
    uploadLimiter,
    requireRole("admin"),
    doubleCsrfProtection,
    upload.array("files", 50),
    async (req, res) => {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      let relativePaths;
      try {
        relativePaths = JSON.parse(req.body.relativePaths || "[]");
      } catch {
        return res.status(400).json({ error: "Invalid relativePaths" });
      }

      if (relativePaths.length !== req.files.length) {
        return res
          .status(400)
          .json({ error: "relativePaths count does not match files count" });
      }

      const invalid = await validateUploadedFiles(req.files);
      if (invalid.length > 0) {
        return res.status(400).json({
          error: `${invalid.length} file(s) rejected: content does not match extension`,
        });
      }

      const baseUploadPath = sanitizePath(req.body.uploadPath || "");
      const movedFiles = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const relPath = relativePaths[i];

        const segments = relPath.split("/").filter(Boolean);
        if (segments.length > 5) {
          continue;
        }
        const sanitizedSegments = segments.map((s, idx) =>
          idx < segments.length - 1 ? sanitizePath(s) : sanitizeFilename(s),
        );
        if (sanitizedSegments.some((s) => !s)) {
          continue;
        }

        const targetRelPath = path.join(
          baseUploadPath,
          ...sanitizedSegments.slice(0, -1),
        );
        const targetDir = path.join(uploadsDir, targetRelPath);
        const targetFile = path.join(
          targetDir,
          sanitizedSegments[sanitizedSegments.length - 1],
        );

        if (!isSecurePath(targetFile, uploadsDir)) {
          continue;
        }

        await fs.promises.mkdir(targetDir, { recursive: true });
        await fs.promises.rename(file.path, targetFile);
        movedFiles.push({
          originalname: file.originalname,
          filename: sanitizedSegments[sanitizedSegments.length - 1],
          relativePath: path.join(
            targetRelPath,
            sanitizedSegments[sanitizedSegments.length - 1],
          ),
          size: file.size,
        });
      }

      log.info(
        `Folder upload: ${movedFiles.length} files moved to correct paths`,
      );

      res.json({
        success: true,
        message: `${movedFiles.length} files uploaded successfully`,
        files: movedFiles,
        totalSize: movedFiles.reduce((t, f) => t + f.size, 0),
      });
    },
  );

  // --- Chunked Upload System ---
  const chunkedUploads = new Map();
  const CHUNK_SIZE = 5 * 1024 * 1024;
  const CHUNKED_UPLOAD_TTL = 30 * 60 * 1000;

  // Cleanup stale chunked uploads every 5 minutes
  setInterval(
    async () => {
      const now = Date.now();
      for (const [id, upl] of chunkedUploads) {
        if (now - upl.createdAt > CHUNKED_UPLOAD_TTL) {
          try {
            if (upl.fd) await upl.fd.close();
            await fs.promises.unlink(upl.filePath);
          } catch {
            /* ignore */
          }
          chunkedUploads.delete(id);
        }
      }
    },
    5 * 60 * 1000,
  );

  // Initialize a chunked upload
  app.post(
    "/upload-init",
    requireRole("admin"),
    doubleCsrfProtection,
    (req, res) => {
      const { filename, totalSize, uploadPath } = req.body;
      if (
        !filename ||
        typeof filename !== "string" ||
        !totalSize ||
        Number(totalSize) <= 0
      ) {
        return res
          .status(400)
          .json({ error: "filename and totalSize are required" });
      }

      const size = Number(totalSize);
      const maxSize = Number(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024;
      if (size > maxSize) {
        return res.status(400).json({
          error: `File too large (max ${Math.round(maxSize / 1024 / 1024)} MB)`,
        });
      }

      const sanitizedName = sanitizeFilename(filename);
      if (
        !sanitizedName ||
        !isValidFilename(sanitizedName) ||
        !isAllowedFileType(sanitizedName)
      ) {
        return res.status(400).json({ error: "Invalid file type or name" });
      }

      const requestedPath = uploadPath || "";
      const sanitizedPath = sanitizePath(requestedPath);
      const targetDir = path.join(uploadsDir, sanitizedPath);

      if (sanitizedPath && !isSecurePath(sanitizedPath, uploadsDir)) {
        return res.status(400).json({ error: "Invalid upload path" });
      }
      const pathSegments = sanitizedPath.split("/").filter(Boolean);
      if (pathSegments.length > 3) {
        return res
          .status(400)
          .json({ error: "Upload path too deep (max 3 levels)" });
      }

      const ext = path.extname(sanitizedName);
      const nameWithoutExt = sanitizedName.slice(0, -ext.length);
      const uniqueSuffix = crypto.randomUUID().slice(0, 8);
      const finalName = `${nameWithoutExt}_${uniqueSuffix}${ext}`;
      const uploadId = crypto.randomUUID();

      fs.promises
        .mkdir(targetDir, { recursive: true })
        .then(() => {
          const filePath = path.join(targetDir, finalName);
          return fs.promises.open(filePath, "w").then((fd) => {
            chunkedUploads.set(uploadId, {
              filePath,
              finalName,
              originalName: sanitizedName,
              totalSize: size,
              receivedSize: 0,
              uploadPath: sanitizedPath,
              fd,
              createdAt: Date.now(),
            });

            res.json({
              success: true,
              uploadId,
              chunkSize: CHUNK_SIZE,
              totalChunks: Math.ceil(size / CHUNK_SIZE),
            });
          });
        })
        .catch((err) => {
          log.error("Chunked upload init error:", err.message);
          res.status(500).json({ error: "Failed to initialize upload" });
        });
    },
  );

  // Upload a chunk (raw binary in request body)
  app.post("/upload-chunk", requireRole("admin"), (req, res) => {
    const uploadId = req.headers["x-upload-id"];
    const offset = Number(req.headers["x-chunk-offset"]);

    if (!uploadId || isNaN(offset) || offset < 0) {
      return res
        .status(400)
        .json({ error: "Missing x-upload-id or x-chunk-offset headers" });
    }

    const upl = chunkedUploads.get(uploadId);
    if (!upl) {
      return res
        .status(404)
        .json({ error: "Upload session not found or expired" });
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const buffer = Buffer.concat(chunks);
      if (offset + buffer.length > upl.totalSize) {
        return res
          .status(400)
          .json({ error: "Chunk exceeds declared total size" });
      }

      try {
        await upl.fd.write(buffer, 0, buffer.length, offset);
        upl.receivedSize += buffer.length;

        res.json({
          success: true,
          receivedSize: upl.receivedSize,
          totalSize: upl.totalSize,
          complete: upl.receivedSize >= upl.totalSize,
        });
      } catch (err) {
        log.error("Chunk write error:", err.message);
        res.status(500).json({ error: "Failed to write chunk" });
      }
    });
    req.on("error", () => {
      res.status(500).json({ error: "Stream error" });
    });
  });

  // Complete a chunked upload — verify integrity
  app.post(
    "/upload-complete",
    requireRole("admin"),
    doubleCsrfProtection,
    async (req, res) => {
      const { uploadId, sha256 } = req.body;
      if (!uploadId) {
        return res.status(400).json({ error: "uploadId is required" });
      }

      const upl = chunkedUploads.get(uploadId);
      if (!upl) {
        return res
          .status(404)
          .json({ error: "Upload session not found or expired" });
      }

      try {
        await upl.fd.close();
        upl.fd = null;

        const stats = await fs.promises.stat(upl.filePath);
        if (stats.size !== upl.totalSize) {
          await fs.promises.unlink(upl.filePath);
          chunkedUploads.delete(uploadId);
          return res
            .status(400)
            .json({ error: "File size mismatch — upload incomplete" });
        }

        if (sha256) {
          const { computeFileHash } = require("./utils");
          const hash = await computeFileHash(upl.filePath);
          if (hash !== sha256) {
            await fs.promises.unlink(upl.filePath);
            chunkedUploads.delete(uploadId);
            return res.status(400).json({ error: "SHA-256 checksum mismatch" });
          }
        }

        const invalid = await validateUploadedFiles([
          { path: upl.filePath, originalname: upl.originalName },
        ]);
        if (invalid.length > 0) {
          chunkedUploads.delete(uploadId);
          return res
            .status(400)
            .json({ error: "File content does not match its extension" });
        }

        log.info(
          `Chunked upload complete: ${upl.finalName} (${stats.size} bytes)`,
        );

        chunkedUploads.delete(uploadId);
        res.json({
          success: true,
          message: "File uploaded successfully",
          filename: upl.finalName,
          size: stats.size,
          path: upl.uploadPath,
        });
      } catch (err) {
        log.error("Chunked upload complete error:", err.message);
        res.status(500).json({ error: "Failed to complete upload" });
      }
    },
  );
};
