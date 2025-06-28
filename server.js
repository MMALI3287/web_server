const express = require("express");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const multer = require("multer");
const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP to allow all JavaScript
    crossOriginEmbedderPolicy: false, // Allow file downloads
    hsts: false, // Disable HSTS to prevent HTTPS redirect
  })
);

// Middleware to prevent HTTPS redirects
app.use((req, res, next) => {
  // Remove any HSTS headers that might cause HTTPS redirects
  res.removeHeader("Strict-Transport-Security");

  // Add headers to indicate HTTP is intentional
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit downloads to 20 per 15 minutes per IP
  message: "Too many download requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit uploads to 10 per 15 minutes per IP
  message: "Too many upload requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : false,
    credentials: false,
  })
);

// Security functions
function sanitizeFilename(filename) {
  // Remove any path traversal attempts and dangerous characters
  // Be more permissive with allowed characters for filenames
  return filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\.\./g, "");
}

function sanitizePath(requestedPath) {
  // Sanitize the entire path, allowing forward slashes for directories
  return requestedPath
    .replace(/[<>:"|?*\x00-\x1f]/g, "")
    .replace(/\.\./g, "")
    .replace(/\\/g, "/");
}

function isValidFilename(filename) {
  // Check for valid filename patterns (more permissive for regular files)
  // Allow letters, numbers, dots, hyphens, underscores, spaces, and forward slashes for paths
  const validPattern = /^[a-zA-Z0-9._\-\s\/]+$/;
  return (
    validPattern.test(filename) && filename.length <= 500 && filename.length > 0
  );
}

function isAllowedFileType(filename) {
  const allowedExtensions = [
    ".pdf",
    ".txt",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".mp4",
    ".mp3",
    ".wav",
    ".avi",
    ".mov",
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".json",
    ".xml",
    ".csv",
    ".html",
    ".css",
    ".js",
  ];

  const ext = path.extname(filename).toLowerCase();
  return allowedExtensions.includes(ext);
}

function isSecurePath(requestedPath, baseDir) {
  const resolvedPath = path.resolve(baseDir, requestedPath);
  const resolvedBaseDir = path.resolve(baseDir);
  return resolvedPath.startsWith(resolvedBaseDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const requestedPath = req.body.uploadPath || "";
    const sanitizedPath = sanitizePath(requestedPath);
    const uploadsDir = path.join(__dirname, "uploads");
    const targetDir = path.join(uploadsDir, sanitizedPath);

    // Security check for path traversal
    if (sanitizedPath && !isSecurePath(sanitizedPath, uploadsDir)) {
      return cb(new Error("Invalid upload path"), null);
    }

    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    // Sanitize filename
    const sanitizedName = sanitizeFilename(file.originalname);

    if (
      !sanitizedName ||
      !isValidFilename(sanitizedName) ||
      !isAllowedFileType(sanitizedName)
    ) {
      return cb(new Error("Invalid file type or name"), null);
    }

    // Check if file already exists and add number suffix if needed
    const targetDir = req.body.uploadPath || "";
    const sanitizedDir = sanitizePath(targetDir);
    const uploadsDir = path.join(__dirname, "uploads");
    const fullDir = path.join(uploadsDir, sanitizedDir);

    let finalName = sanitizedName;
    let counter = 1;

    while (fs.existsSync(path.join(fullDir, finalName))) {
      const ext = path.extname(sanitizedName);
      const nameWithoutExt = sanitizedName.slice(0, -ext.length);
      finalName = `${nameWithoutExt}_${counter}${ext}`;
      counter++;
    }

    cb(null, finalName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1, // Only one file at a time
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

// Secure static file serving with validation (serves from public folder for client downloads)
app.use(
  "/download",
  downloadLimiter,
  (req, res, next) => {
    const requestedPath = decodeURIComponent(req.path.substring(1)); // Remove leading slash
    const sanitizedPath = sanitizePath(requestedPath);

    console.log(`Download request for: ${requestedPath}`);
    console.log(`Sanitized path: ${sanitizedPath}`);

    // Security checks
    if (!sanitizedPath || !isValidFilename(sanitizedPath)) {
      console.log(`Invalid path rejected: ${requestedPath}`);
      return res.status(400).json({ error: "Invalid path" });
    }

    const publicDir = path.join(__dirname, "public");
    const fullPath = path.join(publicDir, sanitizedPath);

    console.log(`Requested path: ${fullPath}`);

    // Check for path traversal
    if (!isSecurePath(sanitizedPath, publicDir)) {
      console.log(`Path traversal attempt blocked: ${sanitizedPath}`);
      return res.status(403).json({ error: "Access denied" });
    }

    // Check if file exists and is actually a file
    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        console.log(`File not found or not accessible: ${fullPath}`);
        return res.status(404).json({ error: "File not found" });
      }

      // Additional check for file type
      const filename = path.basename(fullPath);
      if (!isAllowedFileType(filename)) {
        console.log(`File type not allowed: ${filename}`);
        return res.status(403).json({ error: "File type not allowed" });
      }

      console.log(
        `File found, serving: ${sanitizedPath} (${stats.size} bytes)`
      );

      // Set security headers for downloads
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      next();
    });
  },
  express.static(path.join(__dirname, "public"))
);

// Function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Function to get file icon based on extension
function getFileIcon(filename) {
  const ext = path.extname(filename).toLowerCase();
  const iconMap = {
    ".pdf": "📄",
    ".zip": "🗜️",
    ".txt": "📝",
    ".doc": "📄",
    ".docx": "📄",
    ".xls": "📊",
    ".xlsx": "📊",
    ".ppt": "📊",
    ".pptx": "📊",
    ".jpg": "🖼️",
    ".jpeg": "🖼️",
    ".png": "🖼️",
    ".gif": "🖼️",
    ".mp4": "🎥",
    ".mp3": "🎵",
    ".wav": "🎵",
    ".exe": "⚙️",
    ".js": "📜",
    ".html": "🌐",
    ".css": "🎨",
    ".json": "📋",
  };
  return iconMap[ext] || "📁";
}

// Test route to verify file access
app.get("/test-download", (req, res) => {
  const filename = "DefenseVideo.mp4";
  const filePath = path.join(__dirname, "public", filename);

  console.log("Test download requested for:", filename);
  console.log("File path:", filePath);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      console.log("File stat error:", err);
      return res
        .status(404)
        .json({ error: "File not found", details: err.message });
    }

    console.log("File exists, size:", stats.size);
    res.json({
      message: "File found",
      filename: filename,
      size: stats.size,
      path: filePath,
      downloadUrl: `/download/${encodeURIComponent(filename)}`,
    });
  });
});

// Upload endpoint
app.post("/upload", uploadLimiter, upload.single("file"), (req, res) => {
  console.log("Upload request received");
  console.log("Request body:", req.body);
  console.log("Request file:", req.file);

  if (!req.file) {
    console.log("No file received");
    return res.status(400).json({ error: "No file uploaded" });
  }

  console.log(
    `File uploaded successfully: ${req.file.filename} (${req.file.size} bytes)`
  );

  res.json({
    success: true,
    message: "File uploaded successfully",
    filename: req.file.filename,
    size: req.file.size,
    path: req.body.uploadPath || "",
  });
});

// Handle upload errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large (max 100MB)" });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ error: "Too many files" });
    }
  }

  if (error.message) {
    return res.status(400).json({ error: error.message });
  }

  next(error);
});

// Main route - display file listing with security (supports folder navigation)
app.get("/", (req, res) => {
  handleDirectoryListing(req, res);
});

// Handle subfolder navigation - this will catch all paths not handled by other routes
app.use((req, res, next) => {
  // Skip if this is a download request
  if (req.path.startsWith("/download/")) {
    return next();
  }

  // Only handle GET requests for directory listing
  if (req.method === "GET") {
    handleDirectoryListing(req, res);
  } else {
    next();
  }
});

function handleDirectoryListing(req, res) {
  console.log("Main page requested");
  const requestedPath = req.path.substring(1) || ""; // Get the path after the domain, remove leading slash
  const sanitizedPath = sanitizePath(requestedPath);

  console.log(`Requested directory path: ${requestedPath}`);
  console.log(`Sanitized directory path: ${sanitizedPath}`);

  const publicDir = path.join(__dirname, "public");
  const currentDir = path.join(publicDir, sanitizedPath);

  // Security check for path traversal
  if (sanitizedPath && !isSecurePath(sanitizedPath, publicDir)) {
    console.log(`Path traversal attempt blocked: ${sanitizedPath}`);
    return res.status(403).json({ error: "Access denied" });
  }

  // Check if directory exists
  if (!fs.existsSync(currentDir)) {
    console.log(`Directory not found: ${currentDir}`);
    return res.status(404).json({ error: "Directory not found" });
  }

  // Check if it's actually a directory
  const stats = fs.statSync(currentDir);
  if (!stats.isDirectory()) {
    console.log(`Path is not a directory: ${currentDir}`);
    return res.status(400).json({ error: "Path is not a directory" });
  }
  fs.readdir(currentDir, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return res.status(500).json({ error: "Error reading directory" });
    }

    // Filter and validate files and folders
    const validItems = [];

    files.forEach((item) => {
      const itemPath = path.join(currentDir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        // Add directory to the list
        validItems.push({
          name: item,
          isDirectory: true,
          path: sanitizedPath ? `${sanitizedPath}/${item}` : item,
        });
      } else if (stats.isFile()) {
        const sanitized = sanitizeFilename(item);
        if (
          sanitized &&
          isValidFilename(sanitized) &&
          isAllowedFileType(sanitized)
        ) {
          validItems.push({
            name: item,
            isDirectory: false,
            path: sanitizedPath ? `${sanitizedPath}/${item}` : item,
          });
        }
      }
    });

    // Get detailed stats for files only
    const filePromises = validItems.map((item) => {
      return new Promise((resolve) => {
        if (item.isDirectory) {
          resolve({
            name: item.name,
            isDirectory: true,
            path: item.path,
            icon: "📁",
            type: "Folder",
          });
        } else {
          const filePath = path.join(currentDir, item.name);

          fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
              resolve(null);
            } else {
              resolve({
                name: item.name,
                path: item.path,
                size: stats.size,
                formattedSize: formatFileSize(stats.size),
                modified: stats.mtime.toLocaleString(),
                isDirectory: false,
                icon: getFileIcon(item.name),
                extension:
                  path.extname(item.name).substring(1).toUpperCase() || "FILE",
              });
            }
          });
        }
      });
    });
    Promise.all(filePromises)
      .then((itemData) => {
        const validItems = itemData.filter((item) => item !== null);
        const folders = validItems.filter((item) => item.isDirectory);
        const files = validItems.filter((item) => !item.isDirectory);

        // Create breadcrumb navigation
        const pathParts = sanitizedPath
          ? sanitizedPath.split("/").filter((p) => p)
          : [];
        let breadcrumbPath = "";
        const breadcrumbs = [{ name: "Home", path: "" }];

        pathParts.forEach((part) => {
          breadcrumbPath += (breadcrumbPath ? "/" : "") + part;
          breadcrumbs.push({ name: part, path: breadcrumbPath });
        });

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>File Explorer - ${sanitizedPath || "Root"}</title>
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="X-Frame-Options" content="DENY">
    <meta http-equiv="X-XSS-Protection" content="1; mode=block">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .security-banner {
            background: linear-gradient(45deg, #4caf50, #45a049);
            color: white;
            padding: 10px;
            text-align: center;
            font-size: 0.9rem;
        }
        
        .header {
            background: linear-gradient(45deg, #2196F3, #21CBF3);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            opacity: 0.9;
            font-size: 1.1rem;
        }
        
        .breadcrumb {
            background: #f5f5f5;
            padding: 15px 30px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .breadcrumb a {
            color: #2196F3;
            text-decoration: none;
            margin-right: 5px;
        }
        
        .breadcrumb a:hover {
            text-decoration: underline;
        }
        
        .breadcrumb span {
            margin: 0 5px;
            color: #666;
        }
        
        .stats {
            display: flex;
            justify-content: center;
            gap: 40px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        
        .stat-item {
            text-align: center;
        }
        
        .stat-number {
            font-size: 2rem;
            font-weight: bold;
        }
        
        .stat-label {
            opacity: 0.8;
            font-size: 0.9rem;
        }
        
        .file-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            padding: 30px;
        }
        
        .file-card, .folder-card {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            padding: 20px;
            transition: all 0.3s ease;
            cursor: pointer;
            text-decoration: none;
            color: inherit;
            display: block;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            position: relative;
        }
        
        .file-card:hover, .folder-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            border-color: #2196F3;
        }
        
        .folder-card {
            border-color: #ff9800;
        }
        
        .folder-card:hover {
            border-color: #ff5722;
        }
        
        .security-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #4caf50;
            color: white;
            font-size: 0.7rem;
            padding: 2px 6px;
            border-radius: 8px;
            font-weight: 500;
        }
        
        .folder-badge {
            background: #ff9800;
        }
        
        .file-icon {
            font-size: 3rem;
            text-align: center;
            margin-bottom: 15px;
        }
        
        .file-name {
            font-weight: 600;
            font-size: 1.1rem;
            margin-bottom: 8px;
            color: #333;
            word-break: break-all;
            line-height: 1.3;
            margin-right: 50px;
        }
        
        .file-details {
            display: flex;
            flex-direction: column;
            gap: 5px;
            color: #666;
            font-size: 0.9rem;
        }
        
        .file-detail {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .file-type {
            background: #e3f2fd;
            color: #1976d2;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .folder-type {
            background: #fff3e0;
            color: #f57c00;
        }
        
        .file-size {
            font-weight: 500;
            color: #4caf50;
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 30px;
            color: #666;
        }
        
        .empty-icon {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        
        .empty-title {
            font-size: 1.5rem;
            margin-bottom: 10px;
            color: #333;
        }
        
        .upload-button {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: linear-gradient(45deg, #4caf50, #45a049);
            color: white;
            border: none;
            border-radius: 50px;
            padding: 15px 25px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
            transition: all 0.3s ease;
            z-index: 1000;
        }
        
        .upload-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
        }
        
        .upload-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            justify-content: center;
            align-items: center;
        }
        
        .upload-modal.active {
            display: flex;
        }
        
        .upload-content {
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .upload-header {
            text-align: center;
            margin-bottom: 25px;
        }
        
        .upload-header h2 {
            color: #333;
            margin-bottom: 10px;
        }
        
        .file-drop-zone {
            border: 2px dashed #ddd;
            border-radius: 10px;
            padding: 40px 20px;
            text-align: center;
            margin-bottom: 20px;
            transition: all 0.3s ease;
            cursor: pointer;
        }
        
        .file-drop-zone.dragover {
            border-color: #4caf50;
            background: #f8fff8;
        }
        
        .file-drop-zone:hover {
            border-color: #4caf50;
        }
        
        .drop-icon {
            font-size: 3rem;
            margin-bottom: 15px;
            color: #666;
        }
        
        .upload-progress {
            display: none;
            margin-top: 20px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #e9ecef;
        }
        
        .progress-bar {
            width: 100%;
            height: 12px;
            background: #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(45deg, #4caf50, #45a049);
            width: 0%;
            transition: width 0.3s ease;
            position: relative;
        }
        
        .progress-fill::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            bottom: 0;
            right: 0;
            background: linear-gradient(
                -45deg,
                transparent 35%,
                rgba(255,255,255,0.2) 35%,
                rgba(255,255,255,0.2) 65%,
                transparent 65%
            );
            animation: progressAnimation 1s linear infinite;
        }
        
        @keyframes progressAnimation {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        
        .upload-buttons {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: linear-gradient(45deg, #2196F3, #21CBF3);
            color: white;
        }
        
        .btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        }
        
        .btn-secondary {
            background: #f5f5f5;
            color: #666;
        }
        
        .btn-secondary:hover {
            background: #e0e0e0;
        }
        
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        @media (max-width: 768px) {
            .file-grid {
                grid-template-columns: 1fr;
                padding: 20px;
            }
            
            .header {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .stats {
                gap: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="security-banner">
            🔒 Secure File Transfer • Rate Limited • Validated Files Only • Server-Side Upload Processing
        </div>
        <div class="header">
            <h1>📁 Secure File Explorer</h1>
            <p>Browse and download your files securely from public storage</p>
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-number">${folders.length}</div>
                    <div class="stat-label">Folders</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${files.length}</div>
                    <div class="stat-label">Files</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${formatFileSize(
                      files.reduce((total, file) => total + (file.size || 0), 0)
                    )}</div>
                    <div class="stat-label">Total Size</div>
                </div>
            </div>
        </div>
        
        <div class="breadcrumb">
            ${breadcrumbs
              .map((crumb, index) => {
                if (index === breadcrumbs.length - 1) {
                  return `<strong>${crumb.name}</strong>`;
                } else {
                  return `<a href="/${crumb.path}">${crumb.name}</a><span>/</span>`;
                }
              })
              .join("")}
        </div>
        
        ${
          validItems.length === 0
            ? `
        <div class="empty-state">
            <div class="empty-icon">📂</div>
            <div class="empty-title">No Items Found</div>
            <p>This directory is empty or contains no accessible files.</p>
        </div>
        `
            : `
        <div class="file-grid">
            ${folders
              .map(
                (folder) => `
            <div class="folder-card" data-folder-path="${folder.path}">
                <div class="security-badge folder-badge">📁</div>
                <div class="file-icon">${folder.icon}</div>
                <div class="file-name">${folder.name}</div>
                <div class="file-details">
                    <div class="file-detail">
                        <span>Type:</span>
                        <span class="file-type folder-type">FOLDER</span>
                    </div>
                </div>
            </div>
            `
              )
              .join("")}
            ${files
              .map(
                (file) => `
            <div class="file-card" data-filename="${encodeURIComponent(
              file.path
            )}">
                <div class="security-badge">✓</div>
                <div class="file-icon">${file.icon}</div>
                <div class="file-name">${file.name}</div>
                <div class="file-details">
                    <div class="file-detail">
                        <span>Type:</span>
                        <span class="file-type">${file.extension}</span>
                    </div>
                    <div class="file-detail">
                        <span>Size:</span>
                        <span class="file-size">${file.formattedSize}</span>
                    </div>
                    <div class="file-detail">
                        <span>Modified:</span>
                        <span>${file.modified}</span>
                    </div>
                    <div class="file-detail">
                        <span>Direct Link:</span>
                        <a href="/download/${encodeURIComponent(
                          file.path
                        )}" style="color: #2196F3; text-decoration: none;" onclick="event.stopPropagation();">Download</a>
                    </div>
                </div>
            </div>
            `
              )
              .join("")}
        </div>
        `
        }
    </div>
    
    <!-- Upload Button -->
    <button class="upload-button" onclick="openUploadModal()">
        📤 Upload File
    </button>
    
    <!-- Upload Modal -->
    <div class="upload-modal" id="uploadModal">
        <div class="upload-content">
            <div class="upload-header">
                <h2>📤 Upload File</h2>
                <p>Upload a file to server storage (will be reviewed before making public): <strong>${
                  sanitizedPath || "Root"
                }</strong></p>
            </div>
            
            <form id="uploadForm" enctype="multipart/form-data">
                <input type="hidden" name="uploadPath" value="${sanitizedPath}">
                
                <div class="file-drop-zone" id="dropZone">
                    <div class="drop-icon">📁</div>
                    <p><strong>Drop files here</strong> or <strong>click to browse</strong></p>
                    <div id="selectedFile" style="display: none; margin-top: 15px; padding: 10px; background: #e8f5e8; border-radius: 8px; color: #2d5f2d;">
                        <strong>Selected:</strong> <span id="selectedFileName"></span>
                    </div>
                    <p style="font-size: 0.9rem; color: #666; margin-top: 10px;">
                        Maximum file size: 100MB<br>
                        Allowed types: PDF, Images, Videos, Documents, Archives
                    </p>
                    <input type="file" id="fileInput" name="file" style="display: none;" accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.webp,.mp4,.mp3,.wav,.avi,.mov,.zip,.rar,.7z,.tar,.gz,.json,.xml,.csv,.html,.css,.js">
                </div>
                
                <div class="upload-progress" id="uploadProgress">
                    <div style="margin-bottom: 15px;">
                        <p style="margin-bottom: 5px;"><strong>Current File Progress:</strong></p>
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill"></div>
                        </div>
                        <p id="progressText" style="margin-top: 5px;">0%</p>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <p style="margin-bottom: 5px;"><strong>Overall Upload Status:</strong></p>
                        <div class="progress-bar">
                            <div class="progress-fill" id="overallProgressFill" style="background: linear-gradient(45deg, #2196F3, #21CBF3);"></div>
                        </div>
                        <p id="overallProgressText" style="margin-top: 5px;">Preparing...</p>
                    </div>
                    
                    <div id="uploadStatus" style="text-align: center; color: #666; font-size: 0.9rem;">
                        <span id="uploadStatusText">Starting upload...</span>
                    </div>
                </div>
                
                <div class="upload-buttons">
                    <button type="button" class="btn btn-secondary" onclick="closeUploadModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="uploadBtn">Upload File</button>
                </div>
            </form>
        </div>
    </div>    <script>
    function downloadFile(filename) {
        try {
            console.log('Download function called for:', filename);
            
            // Force HTTP download by creating a temporary link
            const protocol = window.location.protocol === 'https:' ? 'http:' : window.location.protocol;
            const host = window.location.host;
            const downloadUrl = protocol + '//' + host + '/download/' + filename;
            
            console.log('Download URL:', downloadUrl);
            
            // Create temporary link and trigger download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = decodeURIComponent(filename.split('/').pop()); // Use just the filename for download
            link.style.display = 'none';
            link.setAttribute('target', '_blank');
            
            document.body.appendChild(link);
            
            console.log('Link created, triggering click');
            link.click();
            
            // Clean up
            setTimeout(() => {
                if (link.parentNode) {
                    document.body.removeChild(link);
                }
            }, 100);
            
            // Show user-friendly message
            showDownloadMessage(decodeURIComponent(filename.split('/').pop()));
            
        } catch (error) {
            console.error('Download error:', error);
            alert('Download failed. Please try using the direct download link.');
        }
    }
    
    function navigateToFolder(folderPath) {
        try {
            console.log('Navigating to folder:', folderPath);
            window.location.href = '/' + folderPath;
        } catch (error) {
            console.error('Navigation error:', error);
            alert('Navigation failed.');
        }
    }
    
    function showDownloadMessage(filename) {
        try {
            // Create a temporary notification
            const notification = document.createElement('div');
            notification.innerHTML = '📥 Downloading: ' + filename;
            notification.style.position = 'fixed';
            notification.style.top = '20px';
            notification.style.right = '20px';
            notification.style.background = '#4caf50';
            notification.style.color = 'white';
            notification.style.padding = '15px 20px';
            notification.style.borderRadius = '8px';
            notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            notification.style.zIndex = '10000';
            notification.style.fontFamily = 'Segoe UI, sans-serif';
            notification.style.fontSize = '14px';
            notification.style.maxWidth = '300px';
            notification.style.wordWrap = 'break-word';
            
            document.body.appendChild(notification);
            
            // Remove notification after 3 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
        } catch (error) {
            console.error('Notification error:', error);
        }
    }
    
    function openUploadModal() {
        document.getElementById('uploadModal').classList.add('active');
    }
    
    function closeUploadModal() {
        // Cancel ongoing upload if any
        if (window.uploadInProgress && window.currentUploadXHR) {
            console.log('Cancelling ongoing upload');
            window.currentUploadXHR.abort();
            window.uploadInProgress = false;
            window.currentUploadXHR = null;
        }
        
        const modal = document.getElementById('uploadModal');
        modal.classList.remove('active');
        
        // Reset form
        document.getElementById('uploadForm').reset();
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressText').textContent = '0%';
        document.getElementById('overallProgressFill').style.width = '0%';
        document.getElementById('overallProgressText').textContent = 'Preparing...';
        document.getElementById('uploadStatusText').textContent = 'Ready';
        document.getElementById('uploadBtn').disabled = false;
        document.getElementById('uploadBtn').textContent = 'Upload File';
        document.getElementById('selectedFile').style.display = 'none';
        document.getElementById('selectedFileName').textContent = '';
        
        // Clear the stored file
        window.selectedFile = null;
    }
    
    function showSelectedFile(file) {
        const selectedFileDiv = document.getElementById('selectedFile');
        const selectedFileName = document.getElementById('selectedFileName');
        
        selectedFileName.textContent = file.name + ' (' + formatFileSize(file.size) + ')';
        selectedFileDiv.style.display = 'block';
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function validateFile(file) {
        // Check file size (100MB = 100 * 1024 * 1024 bytes)
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            showUploadMessage('❌ File too large. Maximum size is 100MB.', 'error');
            return false;
        }
        
        // Check file type
        const allowedExtensions = [
            '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
            '.mp4', '.mp3', '.wav', '.avi', '.mov',
            '.zip', '.rar', '.7z', '.tar', '.gz',
            '.json', '.xml', '.csv', '.html', '.css', '.js'
        ];
        
        const fileName = file.name.toLowerCase();
        const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
        
        if (!hasValidExtension) {
            showUploadMessage('❌ File type not allowed. Please check the allowed file types.', 'error');
            return false;
        }
        
        return true;
    }
    
    function uploadFile(file) {
        console.log('Upload function called with file:', file);
        
        // Prevent multiple uploads
        if (window.uploadInProgress) {
            console.log('Upload already in progress, ignoring request');
            showUploadMessage('⚠️ Upload already in progress. Please wait.', 'error');
            return;
        }
        
        // Validate file on client side first
        if (!validateFile(file)) {
            console.log('File validation failed');
            return; // Stop if validation fails
        }
        
        console.log('File validation passed, starting upload...');
        window.uploadInProgress = true;
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('uploadPath', document.querySelector('input[name="uploadPath"]').value);
        
        const uploadProgress = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const overallProgressFill = document.getElementById('overallProgressFill');
        const overallProgressText = document.getElementById('overallProgressText');
        const uploadStatusText = document.getElementById('uploadStatusText');
        const uploadBtn = document.getElementById('uploadBtn');
        
        // Show progress section
        uploadProgress.style.display = 'block';
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
        
        // Initialize progress
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        overallProgressFill.style.width = '0%';
        overallProgressText.textContent = 'Initializing...';
        uploadStatusText.textContent = 'Preparing upload...';
        
        const xhr = new XMLHttpRequest();
        
        // Store xhr reference for potential cancellation
        window.currentUploadXHR = xhr;
        
        // Track upload progress
        xhr.upload.addEventListener('progress', function(e) {
            console.log('Upload progress event:', e);
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                
                // Update current file progress
                progressFill.style.width = percentComplete + '%';
                progressText.textContent = Math.round(percentComplete) + '%';
                
                // Update overall progress (for single file, it's the same)
                overallProgressFill.style.width = percentComplete + '%';
                
                // Update status text based on progress
                if (percentComplete < 25) {
                    overallProgressText.textContent = 'Uploading...';
                    uploadStatusText.textContent = 'Sending file data...';
                } else if (percentComplete < 75) {
                    overallProgressText.textContent = 'Processing...';
                    uploadStatusText.textContent = 'Transferring ' + formatFileSize(e.loaded) + ' of ' + formatFileSize(e.total);
                } else if (percentComplete < 100) {
                    overallProgressText.textContent = 'Finalizing...';
                    uploadStatusText.textContent = 'Almost complete...';
                } else {
                    overallProgressText.textContent = 'Completing...';
                    uploadStatusText.textContent = 'Processing on server...';
                }
            }
        });
        
        // Handle successful upload
        xhr.addEventListener('load', function() {
            console.log('Upload load event, status:', xhr.status);
            console.log('Response text:', xhr.responseText);
            console.log('Response headers:', xhr.getAllResponseHeaders());
            
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    console.log('Upload successful:', response);
                    
                    // Complete the progress bars
                    progressFill.style.width = '100%';
                    progressText.textContent = '100%';
                    overallProgressFill.style.width = '100%';
                    overallProgressText.textContent = 'Complete!';
                    uploadStatusText.textContent = 'Upload successful!';
                    
                    showUploadMessage('✅ File uploaded successfully: ' + response.filename, 'success');
                    
                    // Complete upload process
                    completeUpload();
                    
                } catch (e) {
                    console.error('Error parsing response:', e);
                    console.error('Raw response:', xhr.responseText);
                    showUploadMessage('❌ Upload failed: Invalid server response', 'error');
                    resetUploadState();
                }
            } else {
                console.log('Upload failed with status:', xhr.status);
                console.log('Response:', xhr.responseText);
                try {
                    const errorResponse = JSON.parse(xhr.responseText);
                    showUploadMessage('❌ Upload failed: ' + errorResponse.error, 'error');
                } catch (e) {
                    showUploadMessage('❌ Upload failed: Server error (status ' + xhr.status + ')', 'error');
                }
                resetUploadState();
            }
        });
        
        // Handle network errors
        xhr.addEventListener('error', function() {
            console.error('Upload network error');
            showUploadMessage('❌ Upload failed: Network error', 'error');
            resetUploadState();
        });
        
        // Handle timeout
        xhr.addEventListener('timeout', function() {
            console.error('Upload timeout');
            showUploadMessage('❌ Upload failed: Request timeout', 'error');
            resetUploadState();
        });
        
        // Set timeout (5 minutes for large files)
        xhr.timeout = 5 * 60 * 1000;
        
        console.log('Sending upload request...');
        
        // Small delay to ensure UI is updated
        setTimeout(() => {
            xhr.open('POST', '/upload');
            xhr.send(formData);
        }, 100);
        
        function resetUploadState() {
            console.log('Resetting upload state');
            window.uploadInProgress = false;
            window.currentUploadXHR = null;
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload File';
            uploadProgress.style.display = 'none';
            progressFill.style.width = '0%';
            progressText.textContent = '0%';
            overallProgressFill.style.width = '0%';
            overallProgressText.textContent = 'Preparing...';
            uploadStatusText.textContent = 'Ready';
        }
        
        function completeUpload() {
            console.log('Completing upload process');
            window.uploadInProgress = false;
            window.currentUploadXHR = null;
            
            // Close modal after showing success
            setTimeout(() => {
                closeUploadModal();
                
                // Refresh the page to show the new file
                console.log('Refreshing page to show new file...');
                setTimeout(() => {
                    window.location.reload();
                }, 300);
            }, 2000); // 2 seconds to show success message
        }
    }
    
    function showUploadMessage(message, type) {
        const notification = document.createElement('div');
        notification.innerHTML = message;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.background = type === 'success' ? '#4caf50' : '#f44336';
        notification.style.color = 'white';
        notification.style.padding = '15px 20px';
        notification.style.borderRadius = '8px';
        notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        notification.style.zIndex = '10001';
        notification.style.fontFamily = 'Segoe UI, sans-serif';
        notification.style.fontSize = '14px';
        notification.style.maxWidth = '350px';
        notification.style.wordWrap = 'break-word';
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, type === 'success' ? 3000 : 5000);
    }
    
    // Initialize event listeners when page loads
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, setting up event listeners');
        
        // Initialize upload state
        window.uploadInProgress = false;
        window.currentUploadXHR = null;
        window.selectedFile = null;
        
        // Add click event listeners to all file cards
        const fileCards = document.querySelectorAll('.file-card');
        console.log('Found', fileCards.length, 'file cards');
        
        fileCards.forEach(function(card, index) {
            const filename = card.getAttribute('data-filename');
            console.log('Setting up listener for file card', index, 'filename:', filename);
            
            card.addEventListener('click', function(event) {
                console.log('File card clicked:', filename);
                downloadFile(filename);
            });
            
            // Add visual feedback on hover
            card.style.cursor = 'pointer';
        });
        
        // Add click event listeners to all folder cards
        const folderCards = document.querySelectorAll('.folder-card');
        console.log('Found', folderCards.length, 'folder cards');
        
        folderCards.forEach(function(card, index) {
            const folderPath = card.getAttribute('data-folder-path');
            console.log('Setting up listener for folder card', index, 'path:', folderPath);
            
            card.addEventListener('click', function(event) {
                console.log('Folder card clicked:', folderPath);
                navigateToFolder(folderPath);
            });
            
            // Add visual feedback on hover
            card.style.cursor = 'pointer';
        });
        
        // Setup upload functionality
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const uploadForm = document.getElementById('uploadForm');
        
        // Click to browse files
        dropZone.addEventListener('click', function() {
            fileInput.click();
        });
        
        // File input change event
        fileInput.addEventListener('change', function(e) {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                showSelectedFile(file);
                // Don't auto-upload, just show selection
            }
        });
        
        // Drag and drop events
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            
            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                // Set the file input value (this is tricky, but we can work around it)
                showSelectedFile(file);
                
                // Store the file for later upload
                window.selectedFile = file;
            }
        });
        
        // Form submit event
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Form submitted');
            
            // Prevent double submission
            if (window.uploadInProgress) {
                console.log('Upload already in progress, ignoring form submission');
                return;
            }
            
            let fileToUpload = null;
            
            // Check if we have a file from drag & drop
            if (window.selectedFile) {
                fileToUpload = window.selectedFile;
                console.log('Using drag & drop file:', fileToUpload.name);
            } 
            // Or from file input
            else if (fileInput.files.length > 0) {
                fileToUpload = fileInput.files[0];
                console.log('Using file input file:', fileToUpload.name);
            }
            
            if (fileToUpload) {
                console.log('Starting upload for file:', fileToUpload.name, 'Size:', fileToUpload.size);
                uploadFile(fileToUpload);
            } else {
                console.log('No file selected for upload');
                showUploadMessage('❌ Please select a file first.', 'error');
            }
        });
        
        // Also add click event to upload button for additional debugging
        document.getElementById('uploadBtn').addEventListener('click', function(e) {
            console.log('Upload button clicked, upload in progress:', window.uploadInProgress);
            // The form submit event should handle this, but let's add logging
            if (window.uploadInProgress) {
                e.preventDefault();
                console.log('Preventing double click - upload already in progress');
            }
        });
        
        // Close modal when clicking outside
        document.getElementById('uploadModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeUploadModal();
            }
        });
    });
    
    // Test function to verify JavaScript is working
    console.log('JavaScript loaded successfully');
    </script>
</body>
</html>`;

        res.send(html);
      })
      .catch((error) => {
        console.error("Error processing files:", error);
        res.status(500).json({ error: "Error processing files" });
      });
  });
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // Listen on all interfaces

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://[your-ip]:${PORT}`);
  console.log("Note: Use HTTP (not HTTPS) to access the server");
});
