const path = require("path");
const fs = require("fs");
const { PROJECT_ROOT } = require("../config");
const { log, escapeHtml, formatFileSize, getFileIcon } = require("../utils");
const {
  sanitizePath,
  sanitizeFilename,
  isValidFilename,
  isAllowedFileType,
  isSecurePath,
} = require("../security");

const publicDir = path.join(PROJECT_ROOT, "public");

// Image extensions for thumbnail display
const imageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
]);

module.exports = function registerExplorerRoutes(app) {
  // Main route
  app.get("/", (req, res) => {
    handleDirectoryListing(req, res);
  });

  // Catch-all for subfolder navigation
  app.use((req, res, next) => {
    if (req.path.startsWith("/download/")) return next();
    if (req.method === "GET") {
      handleDirectoryListing(req, res);
    } else {
      next();
    }
  });

  async function handleDirectoryListing(req, res) {
    const requestedPath = req.path.substring(1) || "";
    const sanitizedPath = sanitizePath(requestedPath);
    const currentDir = path.join(publicDir, sanitizedPath);

    if (sanitizedPath && !isSecurePath(sanitizedPath, publicDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const stats = await fs.promises.stat(currentDir);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: "Path is not a directory" });
      }
    } catch {
      return res.status(404).json({ error: "Directory not found" });
    }

    try {
      const dirEntries = await fs.promises.readdir(currentDir);

      const validItems = [];
      for (const item of dirEntries) {
        if (item.startsWith(".")) continue; // Hide dot-files/folders
        const itemPath = path.join(currentDir, item);
        try {
          const stats = await fs.promises.stat(itemPath);
          if (stats.isDirectory()) {
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
        } catch {
          // Skip items that can't be stat'd
        }
      }

      const filePromises = validItems.map(async (item) => {
        if (item.isDirectory) {
          return {
            name: item.name,
            isDirectory: true,
            path: item.path,
            icon: "📁",
            type: "Folder",
          };
        }
        const filePath = path.join(currentDir, item.name);
        try {
          const stats = await fs.promises.stat(filePath);
          if (!stats.isFile()) return null;
          const ext = path.extname(item.name).toLowerCase();
          return {
            name: item.name,
            path: item.path,
            size: stats.size,
            formattedSize: formatFileSize(stats.size),
            modified: stats.mtime.toISOString(),
            modifiedDisplay: stats.mtime.toLocaleString(),
            modifiedMs: stats.mtimeMs,
            isDirectory: false,
            icon: getFileIcon(item.name),
            extension:
              path.extname(item.name).substring(1).toUpperCase() || "FILE",
            isImage: imageExtensions.has(ext),
          };
        } catch {
          return null;
        }
      });
      const itemData = await Promise.all(filePromises);
      const resolvedItems = itemData.filter((item) => item !== null);

      // Server-side sorting (TODO #11)
      const sortBy = req.query.sort || "name";
      const sortOrder = req.query.order || "asc";
      const sortMultiplier = sortOrder === "desc" ? -1 : 1;

      const folders = resolvedItems.filter((item) => item.isDirectory);
      const files = resolvedItems.filter((item) => !item.isDirectory);

      function sortItems(arr) {
        return arr.sort((a, b) => {
          let cmp = 0;
          switch (sortBy) {
            case "size":
              cmp = (a.size || 0) - (b.size || 0);
              break;
            case "date":
              cmp = (a.modifiedMs || 0) - (b.modifiedMs || 0);
              break;
            case "type":
              cmp = (a.extension || "").localeCompare(b.extension || "");
              break;
            default: // name
              cmp = a.name.localeCompare(b.name, undefined, {
                sensitivity: "base",
              });
          }
          return cmp * sortMultiplier;
        });
      }
      sortItems(folders);
      sortItems(files);

      // Breadcrumb navigation
      const pathParts = sanitizedPath
        ? sanitizedPath.split("/").filter((p) => p)
        : [];
      let breadcrumbPath = "";
      const breadcrumbs = [{ name: "Home", path: "" }];
      pathParts.forEach((part) => {
        breadcrumbPath += (breadcrumbPath ? "/" : "") + part;
        breadcrumbs.push({ name: part, path: breadcrumbPath });
      });

      const nonce = res.locals.cspNonce;
      const html = buildExplorerHtml({
        sanitizedPath,
        folders,
        files,
        validItems,
        breadcrumbs,
        nonce,
        user: req.user,
        sortBy,
        sortOrder,
      });
      res.send(html);
    } catch (error) {
      log.error("Error processing files:", error);
      res.status(500).json({ error: "Error processing files" });
    }
  }
};

function buildExplorerHtml({
  sanitizedPath,
  folders,
  files,
  validItems,
  breadcrumbs,
  nonce,
  user,
  sortBy,
  sortOrder,
}) {
  const isAdmin = user && user.role === "admin";
  const totalSize = files.reduce((total, file) => total + (file.size || 0), 0);

  // Sort arrow helper
  function sortArrow(field) {
    if (sortBy === field) return sortOrder === "asc" ? " ▲" : " ▼";
    return "";
  }
  function sortLink(field) {
    const newOrder = sortBy === field && sortOrder === "asc" ? "desc" : "asc";
    const base = sanitizedPath ? `/${sanitizedPath}` : "/";
    return `${base}?sort=${field}&order=${newOrder}`;
  }

  return `
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>File Explorer - ${escapeHtml(sanitizedPath || "Root")}</title>
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="X-Frame-Options" content="DENY">
    <style>
        :root {
            --bg-primary: #f5f7fb;
            --bg-secondary: #ffffff;
            --bg-tertiary: #f0f2f5;
            --text-primary: #1a1a2e;
            --text-secondary: #555;
            --text-muted: #888;
            --border-color: #e0e0e0;
            --accent: #4361ee;
            --accent-hover: #3a56d4;
            --accent-light: #eef0ff;
            --success: #2ec4b6;
            --warning: #ff9f1c;
            --danger: #e71d36;
            --card-shadow: 0 2px 8px rgba(0,0,0,0.06);
            --card-shadow-hover: 0 8px 24px rgba(0,0,0,0.12);
            --gradient-header: linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%);
            --gradient-success: linear-gradient(135deg, #2ec4b6 0%, #20a4f3 100%);
            --folder-accent: #ff9f1c;
            --radius: 12px;
            --radius-sm: 8px;
        }
        [data-theme="dark"] {
            --bg-primary: #0f0f23;
            --bg-secondary: #1a1a2e;
            --bg-tertiary: #16213e;
            --text-primary: #e0e0e0;
            --text-secondary: #aaa;
            --text-muted: #777;
            --border-color: #2a2a4a;
            --accent: #4cc9f0;
            --accent-hover: #4895ef;
            --accent-light: #1a1a3e;
            --card-shadow: 0 2px 8px rgba(0,0,0,0.3);
            --card-shadow-hover: 0 8px 24px rgba(0,0,0,0.5);
            --gradient-header: linear-gradient(135deg, #1a1a3e 0%, #0f0f23 100%);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            transition: background 0.3s, color 0.3s;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        /* Top bar */
        .topbar {
            background: var(--gradient-header);
            color: white;
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
        }
        .topbar-left { display: flex; align-items: center; gap: 15px; }
        .topbar-left h1 { font-size: 1.3rem; font-weight: 700; white-space: nowrap; }
        .topbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .topbar-right a, .topbar-right button {
            color: white; text-decoration: none; background: rgba(255,255,255,0.15);
            padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; border: none;
            cursor: pointer; transition: background 0.2s; white-space: nowrap;
        }
        .topbar-right a:hover, .topbar-right button:hover { background: rgba(255,255,255,0.25); }
        .user-info { font-size: 0.85rem; opacity: 0.9; }

        /* Search bar */
        .search-bar {
            background: var(--bg-secondary);
            padding: 12px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
        }
        .search-input {
            flex: 1; min-width: 200px; padding: 10px 16px;
            border: 2px solid var(--border-color); border-radius: var(--radius-sm);
            font-size: 0.95rem; background: var(--bg-tertiary);
            color: var(--text-primary); outline: none; transition: border-color 0.2s;
        }
        .search-input:focus { border-color: var(--accent); }
        .search-input::placeholder { color: var(--text-muted); }

        /* Breadcrumb */
        .breadcrumb {
            background: var(--bg-secondary);
            padding: 12px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            gap: 4px;
            flex-wrap: wrap;
            font-size: 0.9rem;
        }
        .breadcrumb a {
            color: var(--accent);
            text-decoration: none;
            padding: 4px 8px;
            border-radius: 6px;
            transition: background 0.2s;
        }
        .breadcrumb a:hover { background: var(--accent-light); }
        .breadcrumb .sep { color: var(--text-muted); font-size: 0.8rem; }
        .breadcrumb .current { font-weight: 600; color: var(--text-primary); padding: 4px 8px; }

        /* Sort bar */
        .sort-bar {
            background: var(--bg-secondary);
            padding: 8px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.85rem;
            color: var(--text-secondary);
            flex-wrap: wrap;
        }
        .sort-bar span { margin-right: 4px; }
        .sort-bar a {
            color: var(--text-secondary); text-decoration: none;
            padding: 4px 10px; border-radius: 6px; transition: all 0.2s;
        }
        .sort-bar a:hover { background: var(--accent-light); color: var(--accent); }
        .sort-bar a.active { background: var(--accent); color: white; font-weight: 600; }

        /* Bulk action bar */
        .bulk-bar {
            display: none; position: sticky; top: 0; z-index: 100;
            background: var(--accent); color: white;
            padding: 10px 24px; align-items: center; gap: 12px;
            font-size: 0.9rem; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .bulk-bar.active { display: flex; }
        .bulk-bar button {
            background: rgba(255,255,255,0.2); color: white; border: none;
            padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;
        }
        .bulk-bar button:hover { background: rgba(255,255,255,0.3); }
        .bulk-bar .bulk-count { font-weight: 700; }

        /* Stats row */
        .stats-row {
            display: flex; gap: 20px; padding: 16px 24px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            flex-wrap: wrap;
        }
        .stat { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; color: var(--text-secondary); }
        .stat strong { color: var(--text-primary); font-size: 1.1rem; }

        /* Disk usage bar */
        .disk-bar-wrap { flex: 1; min-width: 150px; }
        .disk-bar { height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; }
        .disk-bar-fill { height: 100%; background: var(--gradient-success); border-radius: 4px; transition: width 0.5s; }
        .disk-label { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }

        /* File grid */
        .file-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px;
            padding: 24px;
        }
        .file-card, .folder-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            padding: 16px;
            transition: all 0.2s;
            cursor: pointer;
            text-decoration: none;
            color: inherit;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-shadow: var(--card-shadow);
            position: relative;
        }
        .file-card:hover, .folder-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--card-shadow-hover);
            border-color: var(--accent);
        }
        .folder-card { border-left: 4px solid var(--folder-accent); }
        .folder-card:hover { border-color: var(--folder-accent); }

        .card-top { display: flex; align-items: flex-start; gap: 12px; }
        .card-icon { font-size: 2.2rem; flex-shrink: 0; line-height: 1; }
        .card-info { flex: 1; min-width: 0; }
        .card-name {
            font-weight: 600; font-size: 0.95rem;
            word-break: break-all; line-height: 1.3;
            color: var(--text-primary);
        }
        .card-meta {
            display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
            font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;
        }
        .badge {
            padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600;
        }
        .badge-type { background: var(--accent-light); color: var(--accent); }
        .badge-folder { background: #fff3e0; color: var(--folder-accent); }
        .badge-size { color: var(--success); font-weight: 600; }
        .card-thumb {
            width: 100%; height: 120px; object-fit: cover;
            border-radius: var(--radius-sm); background: var(--bg-tertiary);
        }

        /* Card actions */
        .card-actions {
            display: flex; gap: 4px; flex-wrap: wrap; margin-top: auto; padding-top: 8px;
            border-top: 1px solid var(--border-color);
        }
        .card-actions a, .card-actions button {
            font-size: 0.8rem; padding: 4px 10px; border-radius: 6px;
            text-decoration: none; border: 1px solid var(--border-color);
            background: var(--bg-tertiary); color: var(--text-secondary);
            cursor: pointer; transition: all 0.2s; white-space: nowrap;
        }
        .card-actions a:hover, .card-actions button:hover {
            background: var(--accent); color: white; border-color: var(--accent);
        }
        .card-actions .danger:hover { background: var(--danger); border-color: var(--danger); }

        /* Checkbox */
        .card-check {
            position: absolute; top: 10px; right: 10px; width: 20px; height: 20px;
            cursor: pointer; accent-color: var(--accent);
        }

        /* Empty state */
        .empty-state {
            text-align: center; padding: 60px 30px; color: var(--text-muted);
        }
        .empty-icon { font-size: 4rem; margin-bottom: 16px; }
        .empty-title { font-size: 1.4rem; margin-bottom: 8px; color: var(--text-secondary); }

        /* FAB buttons */
        .fab-group {
            position: fixed; bottom: 24px; right: 24px;
            display: flex; flex-direction: column; gap: 10px; z-index: 1000;
        }
        .fab {
            width: 52px; height: 52px; border-radius: 50%;
            border: none; cursor: pointer; font-size: 1.3rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
            color: white;
        }
        .fab:hover { transform: scale(1.1); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
        .fab-upload { background: var(--gradient-success); }
        .fab-text { background: linear-gradient(135deg, #ff6b6b, #ee5a24); }
        .fab-qr { background: linear-gradient(135deg, #a29bfe, #6c5ce7); }

        /* Modals */
        .modal-overlay {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 10000;
            justify-content: center; align-items: center;
            backdrop-filter: blur(4px);
        }
        .modal-overlay.active { display: flex; }
        .modal {
            background: var(--bg-secondary); border-radius: var(--radius);
            padding: 24px; max-width: 550px; width: 92%;
            max-height: 85vh; overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            color: var(--text-primary);
        }
        .modal h2 { margin-bottom: 16px; font-size: 1.3rem; }
        .modal-close {
            float: right; background: none; border: none; font-size: 1.5rem;
            cursor: pointer; color: var(--text-muted); line-height: 1;
        }
        .modal-close:hover { color: var(--text-primary); }

        /* Upload area */
        .file-drop-zone {
            border: 2px dashed var(--border-color); border-radius: var(--radius-sm);
            padding: 30px 16px; text-align: center; margin-bottom: 16px;
            transition: all 0.2s; cursor: pointer;
        }
        .file-drop-zone.dragover { border-color: var(--accent); background: var(--accent-light); }
        .drop-icon { font-size: 2.5rem; margin-bottom: 10px; }

        /* Upload progress */
        .upload-progress { display: none; margin-top: 16px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-sm); }
        .progress-bar { width: 100%; height: 10px; background: var(--bg-tertiary); border-radius: 5px; overflow: hidden; border: 1px solid var(--border-color); }
        .progress-fill { height: 100%; background: var(--gradient-success); width: 0%; transition: width 0.3s; }

        /* Buttons */
        .btn {
            padding: 8px 18px; border: none; border-radius: var(--radius-sm);
            cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s;
        }
        .btn-primary { background: var(--accent); color: white; }
        .btn-primary:hover { background: var(--accent-hover); }
        .btn-secondary { background: var(--bg-tertiary); color: var(--text-secondary); }
        .btn-secondary:hover { background: var(--border-color); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .upload-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

        /* Preview modal */
        .preview-content { text-align: center; }
        .preview-content img { max-width: 100%; max-height: 60vh; border-radius: var(--radius-sm); }
        .preview-content video, .preview-content audio { max-width: 100%; }
        .preview-content pre { text-align: left; background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-sm); overflow-x: auto; max-height: 60vh; font-size: 0.85rem; }
        .preview-content iframe { width: 100%; height: 60vh; border: none; border-radius: var(--radius-sm); }

        /* Text share panel */
        .text-panel textarea {
            width: 100%; height: 100px; padding: 10px; border: 2px solid var(--border-color);
            border-radius: var(--radius-sm); font-family: inherit; font-size: 0.9rem;
            resize: vertical; background: var(--bg-tertiary); color: var(--text-primary);
        }
        .text-panel textarea:focus { outline: none; border-color: var(--accent); }
        .text-messages { margin-top: 16px; max-height: 300px; overflow-y: auto; }
        .text-msg {
            background: var(--bg-tertiary); padding: 10px; border-radius: var(--radius-sm);
            margin-bottom: 8px; font-size: 0.9rem; position: relative; word-break: break-word;
        }
        .text-msg small { color: var(--text-muted); display: block; margin-top: 4px; }
        .text-msg .del-msg {
            position: absolute; top: 6px; right: 8px; background: none; border: none;
            cursor: pointer; color: var(--text-muted); font-size: 1rem;
        }
        .text-msg .del-msg:hover { color: var(--danger); }

        /* QR modal */
        .qr-content { text-align: center; }
        .qr-content svg { max-width: 250px; margin: 16px auto; }

        /* Connected clients */
        .ws-clients { display: flex; align-items: center; gap: 4px; font-size: 0.85rem; }
        .ws-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; display: inline-block; }

        /* Responsive */
        @media (max-width: 768px) {
            .file-grid { grid-template-columns: 1fr; padding: 12px; gap: 10px; }
            .topbar { padding: 10px 12px; }
            .topbar-left h1 { font-size: 1rem; }
            .search-bar, .breadcrumb, .sort-bar, .stats-row { padding: 10px 12px; }
            .modal { width: 96%; padding: 16px; }
            .fab-group { bottom: 16px; right: 16px; }
            .fab { width: 46px; height: 46px; font-size: 1.1rem; }
            .card-actions { font-size: 0.75rem; }
        }
        @media (max-width: 480px) {
            .file-grid { padding: 8px; gap: 8px; }
            .file-card, .folder-card { padding: 12px; }
            .stats-row { gap: 10px; }
            .topbar-right { gap: 6px; }
        }

        /* Dark mode auto detect */
        @media (prefers-color-scheme: dark) {
            html:not([data-theme="light"]) {
                --bg-primary: #0f0f23;
                --bg-secondary: #1a1a2e;
                --bg-tertiary: #16213e;
                --text-primary: #e0e0e0;
                --text-secondary: #aaa;
                --text-muted: #777;
                --border-color: #2a2a4a;
                --accent: #4cc9f0;
                --accent-hover: #4895ef;
                --accent-light: #1a1a3e;
                --card-shadow: 0 2px 8px rgba(0,0,0,0.3);
                --card-shadow-hover: 0 8px 24px rgba(0,0,0,0.5);
                --gradient-header: linear-gradient(135deg, #1a1a3e 0%, #0f0f23 100%);
            }
        }

        #selectedFiles { display: none; margin-top: 10px; padding: 10px; background: var(--accent-light); border-radius: var(--radius-sm); }
    </style>
</head>
<body>
    <!-- Top bar -->
    <div class="topbar">
        <div class="topbar-left">
            <h1>📁 File Explorer</h1>
            <div class="ws-clients" id="wsClients"><span class="ws-dot"></span> <span id="clientCount">-</span> online</div>
        </div>
        <div class="topbar-right">
            <span class="user-info">👤 ${escapeHtml(user ? user.username : "guest")} (${escapeHtml(user ? user.role : "")})</span>
            <button id="themeToggle" title="Toggle dark mode">🌓</button>
            <a href="/activity" target="_blank" title="Activity log">📊</a>
            <a href="/logout" title="Sign out">🚪 Logout</a>
        </div>
    </div>

    <!-- Search bar -->
    <div class="search-bar">
        <input type="text" class="search-input" id="searchInput" placeholder="🔍 Search files and folders..." autocomplete="off">
    </div>

    <!-- Breadcrumb -->
    <div class="breadcrumb" id="breadcrumb">
        ${breadcrumbs
          .map((crumb, index) => {
            if (index === breadcrumbs.length - 1) {
              return `<span class="current">${escapeHtml(crumb.name)}</span>`;
            } else {
              return `<a href="/${encodeURI(crumb.path)}">${escapeHtml(crumb.name)}</a><span class="sep">›</span>`;
            }
          })
          .join("")}
    </div>

    <!-- Sort bar -->
    <div class="sort-bar">
        <span>Sort:</span>
        <a href="${sortLink("name")}" class="${sortBy === "name" ? "active" : ""}">Name${sortArrow("name")}</a>
        <a href="${sortLink("size")}" class="${sortBy === "size" ? "active" : ""}">Size${sortArrow("size")}</a>
        <a href="${sortLink("date")}" class="${sortBy === "date" ? "active" : ""}">Date${sortArrow("date")}</a>
        <a href="${sortLink("type")}" class="${sortBy === "type" ? "active" : ""}">Type${sortArrow("type")}</a>
        ${isAdmin ? `<span style="margin-left:auto"><button class="btn btn-secondary" style="padding:4px 10px;font-size:0.8rem" onclick="openMkdirModal()">➕ New Folder</button></span>` : ""}
    </div>

    <!-- Bulk action bar -->
    <div class="bulk-bar" id="bulkBar">
        <span><span class="bulk-count" id="bulkCount">0</span> selected</span>
        <button onclick="bulkDownload()">📥 Download ZIP</button>
        ${isAdmin ? '<button onclick="bulkDelete()" style="background:rgba(231,29,54,0.3)">🗑️ Delete</button>' : ""}
        <button onclick="clearSelection()">✖ Clear</button>
    </div>

    <!-- Stats row + disk usage -->
    <div class="stats-row">
        <div class="stat">📁 <strong>${folders.length}</strong> folders</div>
        <div class="stat">📄 <strong>${files.length}</strong> files</div>
        <div class="stat">💾 <strong>${formatFileSize(totalSize)}</strong></div>
        <div class="disk-bar-wrap" id="diskBarWrap" style="display:none">
            <div class="disk-bar"><div class="disk-bar-fill" id="diskBarFill"></div></div>
            <div class="disk-label" id="diskLabel"></div>
        </div>
    </div>

    <div class="container">
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
    <div class="file-grid" id="fileGrid">
        ${folders
          .map(
            (folder) => `
        <div class="folder-card" data-name="${escapeHtml(folder.name)}" data-folder-path="${escapeHtml(folder.path)}" draggable="true">
            <input type="checkbox" class="card-check bulk-check" data-path="${escapeHtml(folder.path)}" data-is-dir="1" onclick="event.stopPropagation();updateBulkBar()">
            <div class="card-top">
                <div class="card-icon">📁</div>
                <div class="card-info">
                    <div class="card-name">${escapeHtml(folder.name)}</div>
                    <div class="card-meta"><span class="badge badge-folder">FOLDER</span></div>
                </div>
            </div>
            <div class="card-actions">
                <a href="/${encodeURI(folder.path)}" onclick="event.stopPropagation()">📂 Open</a>
                <a href="/download-folder/${encodeURIComponent(folder.path)}" onclick="event.stopPropagation()">📥 ZIP</a>
                ${isAdmin ? `<button class="danger" onclick="event.stopPropagation();deleteItem('${escapeHtml(folder.path)}',true)">🗑️</button>` : ""}
                ${isAdmin ? `<button onclick="event.stopPropagation();renameItem('${escapeHtml(folder.path)}','${escapeHtml(folder.name)}')">✏️</button>` : ""}
            </div>
        </div>
        `,
          )
          .join("")}
        ${files
          .map(
            (file) => `
        <div class="file-card" data-name="${escapeHtml(file.name)}" data-filename="${encodeURIComponent(file.path)}">
            <input type="checkbox" class="card-check bulk-check" data-path="${escapeHtml(file.path)}" onclick="event.stopPropagation();updateBulkBar()">
            ${file.isImage ? `<img class="card-thumb" src="/thumbnail/${encodeURIComponent(file.path)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ""}
            <div class="card-top">
                <div class="card-icon">${file.icon}</div>
                <div class="card-info">
                    <div class="card-name">${escapeHtml(file.name)}</div>
                    <div class="card-meta">
                        <span class="badge badge-type">${escapeHtml(file.extension)}</span>
                        <span class="badge-size">${file.formattedSize}</span>
                    </div>
                </div>
            </div>
            <div class="card-actions">
                <a href="/download/${encodeURIComponent(file.path)}" onclick="event.stopPropagation()">📥</a>
                <button onclick="event.stopPropagation();previewFile('${encodeURIComponent(file.path)}','${escapeHtml(file.name)}')">👁️</button>
                <button onclick="event.stopPropagation();shareFile('${encodeURIComponent(file.path)}',this)">🔗</button>
                ${isAdmin ? `<button class="danger" onclick="event.stopPropagation();deleteItem('${escapeHtml(file.path)}',false)">🗑️</button>` : ""}
                ${isAdmin ? `<button onclick="event.stopPropagation();renameItem('${escapeHtml(file.path)}','${escapeHtml(file.name)}')">✏️</button>` : ""}
            </div>
        </div>
        `,
          )
          .join("")}
    </div>
    `
    }
    </div>

    <!-- FAB buttons -->
    <div class="fab-group">
        ${isAdmin ? '<button class="fab fab-upload" onclick="openUploadModal()" title="Upload files">📤</button>' : ""}
        <button class="fab fab-text" onclick="openTextModal()" title="Text sharing">💬</button>
        <button class="fab fab-qr" onclick="openQrModal()" title="QR Code">📱</button>
    </div>

    <!-- Upload Modal -->
    <div class="modal-overlay" id="uploadModal">
        <div class="modal">
            <button class="modal-close" onclick="closeUploadModal()">&times;</button>
            <h2>📤 Upload Files</h2>
            <p style="font-size:0.9rem;color:var(--text-muted);margin-bottom:16px">Upload to: <strong>${escapeHtml(sanitizedPath || "Root")}</strong></p>
            <form id="uploadForm" enctype="multipart/form-data">
                <input type="hidden" name="uploadPath" value="${escapeHtml(sanitizedPath)}">
                <div class="file-drop-zone" id="dropZone">
                    <div class="drop-icon">📁</div>
                    <p><strong>Drop files here</strong> or click to browse</p>
                    <div style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                        <button type="button" class="btn btn-secondary" id="selectFilesBtn" style="font-size:0.85rem">📄 Files</button>
                        <button type="button" class="btn btn-secondary" id="selectFolderBtn" style="font-size:0.85rem">📂 Folder</button>
                    </div>
                    <div id="selectedFiles"><div id="selectedFilesList"></div></div>
                    <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px">Max: 100 MB per file, 10 files at once</p>
                    <input type="file" id="fileInput" name="file" style="display:none" multiple>
                    <input type="file" id="folderInput" name="folder" style="display:none" webkitdirectory>
                </div>
                <div class="upload-progress" id="uploadProgress">
                    <p style="margin-bottom:6px;font-weight:600">Upload Progress</p>
                    <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
                    <p id="progressText" style="margin-top:4px;font-size:0.85rem">0%</p>
                    <div class="progress-bar" style="margin-top:10px"><div class="progress-fill" id="overallProgressFill" style="background:var(--accent)"></div></div>
                    <p id="overallProgressText" style="margin-top:4px;font-size:0.85rem">Preparing...</p>
                    <p id="uploadStatusText" style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin-top:8px">Ready</p>
                </div>
                <div class="upload-buttons">
                    <button type="button" class="btn btn-secondary" id="cancelUploadBtn" onclick="closeUploadModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="uploadBtn">Upload</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Preview Modal -->
    <div class="modal-overlay" id="previewModal">
        <div class="modal" style="max-width:800px">
            <button class="modal-close" onclick="closePreview()">&times;</button>
            <h2 id="previewTitle">Preview</h2>
            <div class="preview-content" id="previewContent"></div>
        </div>
    </div>

    <!-- Text Share Modal -->
    <div class="modal-overlay" id="textModal">
        <div class="modal">
            <button class="modal-close" onclick="closeTextModal()">&times;</button>
            <h2>💬 Text Sharing</h2>
            <div class="text-panel">
                <textarea id="textInput" placeholder="Type or paste text to share..."></textarea>
                <div class="upload-buttons" style="margin-top:8px">
                    <button class="btn btn-primary" onclick="sendText()">Send</button>
                </div>
                <div class="text-messages" id="textMessages"></div>
            </div>
        </div>
    </div>

    <!-- QR Modal -->
    <div class="modal-overlay" id="qrModal">
        <div class="modal" style="max-width:380px">
            <button class="modal-close" onclick="closeQrModal()">&times;</button>
            <h2>📱 QR Code</h2>
            <div class="qr-content" id="qrContent">
                <p style="color:var(--text-muted);margin-bottom:12px">Scan to open this page</p>
                <div id="qrImage"></div>
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:12px;word-break:break-all" id="qrUrl"></p>
            </div>
        </div>
    </div>

    <!-- Mkdir Modal -->
    <div class="modal-overlay" id="mkdirModal">
        <div class="modal" style="max-width:400px">
            <button class="modal-close" onclick="closeMkdirModal()">&times;</button>
            <h2>➕ New Folder</h2>
            <input type="text" id="mkdirName" class="search-input" placeholder="Folder name" style="width:100%;margin-bottom:12px">
            <div class="upload-buttons"><button class="btn btn-primary" onclick="createFolder()">Create</button></div>
        </div>
    </div>

    <script nonce="${nonce}">
    /* ===== Theme Toggle (TODO #19) ===== */
    function toggleTheme() {
        var html = document.documentElement;
        var current = html.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    }
    (function() {
        var saved = localStorage.getItem('theme');
        if (saved) document.documentElement.setAttribute('data-theme', saved);
        document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    })();

    /* ===== WebSocket (TODO #4) ===== */
    var ws;
    function connectWs() {
        var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(proto + '//' + location.host + '/ws');
        ws.onmessage = function(e) {
            try {
                var data = JSON.parse(e.data);
                if (data.type === 'connected' || data.type === 'clients') {
                    document.getElementById('clientCount').textContent = data.count || data.clients || '-';
                }
                if (data.type === 'fileChange') {
                    // Auto-refresh on file changes
                    window.location.reload();
                }
            } catch(err) {}
        };
        ws.onclose = function() { setTimeout(connectWs, 3000); };
        ws.onerror = function() {};
    }
    connectWs();

    /* ===== Search (TODO #9) ===== */
    var searchTimeout;
    document.getElementById('searchInput').addEventListener('input', function(e) {
        var q = e.target.value.trim().toLowerCase();
        clearTimeout(searchTimeout);
        if (!q) {
            // Show all cards
            document.querySelectorAll('.file-card,.folder-card').forEach(function(c) { c.style.display = ''; });
            return;
        }
        // Client-side filter first
        document.querySelectorAll('.file-card,.folder-card').forEach(function(c) {
            var name = (c.getAttribute('data-name') || '').toLowerCase();
            c.style.display = name.includes(q) ? '' : 'none';
        });
        // Server-side search for deeper results
        searchTimeout = setTimeout(function() {
            if (q.length >= 2) {
                fetch('/search?q=' + encodeURIComponent(q)).then(function(r) { return r.json(); }).then(function(data) {
                    if (data.results && data.results.length > 0) {
                        // Could show a dropdown with search results from nested dirs
                    }
                }).catch(function() {});
            }
        }, 500);
    });

    /* ===== Keyboard Navigation (TODO #23) ===== */
    document.addEventListener('keydown', function(e) {
        if (e.altKey && e.key === 'ArrowUp') {
            e.preventDefault();
            var crumbs = document.querySelectorAll('.breadcrumb a');
            if (crumbs.length > 0) crumbs[crumbs.length - 1].click();
        }
        if (e.key === 'Backspace' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            var crumbs = document.querySelectorAll('.breadcrumb a');
            if (crumbs.length > 0) crumbs[crumbs.length - 1].click();
        }
    });

    /* ===== Disk Usage (TODO #18) ===== */
    fetch('/stats').then(function(r) { return r.json(); }).then(function(data) {
        if (data.quota) {
            var wrap = document.getElementById('diskBarWrap');
            wrap.style.display = '';
            document.getElementById('diskBarFill').style.width = data.quota.percentUsed + '%';
            document.getElementById('diskLabel').textContent = data.total.formattedSize + ' / ' + data.quota.formattedMax + ' (' + data.quota.percentUsed + '%)';
        }
    }).catch(function() {});

    /* ===== Bulk Select (TODO #12) ===== */
    function updateBulkBar() {
        var checked = document.querySelectorAll('.bulk-check:checked');
        var bar = document.getElementById('bulkBar');
        document.getElementById('bulkCount').textContent = checked.length;
        bar.classList.toggle('active', checked.length > 0);
    }
    function clearSelection() {
        document.querySelectorAll('.bulk-check:checked').forEach(function(c) { c.checked = false; });
        updateBulkBar();
    }
    function getSelectedPaths() {
        return Array.from(document.querySelectorAll('.bulk-check:checked')).map(function(c) { return c.getAttribute('data-path'); });
    }
    function bulkDownload() {
        var paths = getSelectedPaths();
        if (paths.length === 0) return;
        fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) {
            return fetch('/download-batch', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'x-csrf-token': data.csrfToken },
                body: JSON.stringify({ files: paths })
            });
        }).then(function(r) { return r.blob(); }).then(function(blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a'); a.href = url; a.download = 'selected-files.zip';
            a.click(); URL.revokeObjectURL(url); clearSelection();
        }).catch(function(err) { showNotification('Download failed: ' + err.message, 'error'); });
    }
    function bulkDelete() {
        var paths = getSelectedPaths();
        if (paths.length === 0) return;
        if (!confirm('Delete ' + paths.length + ' items? This cannot be undone.')) return;
        fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) {
            return fetch('/delete-batch', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'x-csrf-token': data.csrfToken },
                body: JSON.stringify({ files: paths })
            });
        }).then(function(r) { return r.json(); }).then(function(result) {
            showNotification(result.deleted + ' items deleted', 'success');
            setTimeout(function() { location.reload(); }, 1000);
        }).catch(function(err) { showNotification('Delete failed: ' + err.message, 'error'); });
    }

    /* ===== File Actions (TODO #10) ===== */
    function deleteItem(filePath, isDir) {
        var name = filePath.split('/').pop();
        if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
        fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) {
            return fetch('/file/' + encodeURIComponent(filePath), {
                method: 'DELETE', credentials: 'same-origin',
                headers: { 'x-csrf-token': data.csrfToken }
            });
        }).then(function(r) { return r.json(); }).then(function(result) {
            if (result.success) { showNotification('Deleted: ' + name, 'success'); setTimeout(function() { location.reload(); }, 800); }
            else showNotification('Delete failed: ' + result.error, 'error');
        }).catch(function(err) { showNotification('Delete failed: ' + err.message, 'error'); });
    }
    function renameItem(filePath, currentName) {
        var newName = prompt('New name for "' + currentName + '":', currentName);
        if (!newName || newName === currentName) return;
        var dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/') + 1) : '';
        var newPath = dir + newName;
        fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) {
            return fetch('/rename', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'x-csrf-token': data.csrfToken },
                body: JSON.stringify({ oldPath: filePath, newPath: newPath })
            });
        }).then(function(r) { return r.json(); }).then(function(result) {
            if (result.success) { showNotification('Renamed to: ' + newName, 'success'); setTimeout(function() { location.reload(); }, 800); }
            else showNotification('Rename failed: ' + result.error, 'error');
        }).catch(function(err) { showNotification('Rename failed: ' + err.message, 'error'); });
    }

    /* ===== Mkdir ===== */
    function openMkdirModal() { document.getElementById('mkdirModal').classList.add('active'); document.getElementById('mkdirName').focus(); }
    function closeMkdirModal() { document.getElementById('mkdirModal').classList.remove('active'); document.getElementById('mkdirName').value = ''; }
    function createFolder() {
        var name = document.getElementById('mkdirName').value.trim();
        if (!name) return;
        var currentPath = '${escapeHtml(sanitizedPath)}';
        var fullDir = currentPath ? currentPath + '/' + name : name;
        fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) {
            return fetch('/mkdir', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'x-csrf-token': data.csrfToken },
                body: JSON.stringify({ dirPath: fullDir })
            });
        }).then(function(r) { return r.json(); }).then(function(result) {
            if (result.success) { closeMkdirModal(); showNotification('Folder created: ' + name, 'success'); setTimeout(function() { location.reload(); }, 800); }
            else showNotification(result.error, 'error');
        }).catch(function(err) { showNotification('Failed: ' + err.message, 'error'); });
    }

    /* ===== Preview (TODO #3) ===== */
    function previewFile(encodedPath, name) {
        document.getElementById('previewTitle').textContent = 'Preview: ' + decodeURIComponent(name);
        var content = document.getElementById('previewContent');
        content.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';
        document.getElementById('previewModal').classList.add('active');

        fetch('/preview-check/' + encodedPath).then(function(r) { return r.json(); }).then(function(info) {
            if (!info.previewable) { content.innerHTML = '<p>This file type cannot be previewed.</p><p style="margin-top:12px"><a href="/download/' + encodedPath + '" class="btn btn-primary" style="text-decoration:none;color:white">Download instead</a></p>'; return; }
            var url = '/preview/' + encodedPath;
            if (info.category === 'image') { content.innerHTML = '<img src="' + url + '" alt="Preview">'; }
            else if (info.category === 'video') { content.innerHTML = '<video controls autoplay><source src="' + url + '"></video>'; }
            else if (info.category === 'audio') { content.innerHTML = '<audio controls autoplay><source src="' + url + '"></audio>'; }
            else if (info.category === 'pdf') { content.innerHTML = '<iframe src="' + url + '"></iframe>'; }
            else { fetch(url).then(function(r) { return r.text(); }).then(function(text) { content.innerHTML = '<pre>' + escapeHtmlJs(text) + '</pre>'; }); }
        }).catch(function() { content.innerHTML = '<p>Preview failed.</p>'; });
    }
    function closePreview() { document.getElementById('previewModal').classList.remove('active'); document.getElementById('previewContent').innerHTML = ''; }
    function escapeHtmlJs(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    /* ===== Share (TODO #5 QR + share link) ===== */
    function shareFile(encodedPath, btn) {
        fetch('/csrf-token', { credentials: 'same-origin' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            return fetch('/share', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json', 'x-csrf-token': data.csrfToken },
              body: JSON.stringify({ filePath: decodeURIComponent(encodedPath) })
            });
          })
          .then(function(r) { return r.json(); })
          .then(function(result) {
            if (result.success) {
              var shareUrl = location.origin + result.url;
              if (navigator.clipboard) navigator.clipboard.writeText(shareUrl);
              btn.textContent = '✅';
              showNotification('Share link copied: ' + shareUrl, 'success');
              setTimeout(function() { btn.textContent = '🔗'; }, 3000);
            } else {
              showNotification('Share failed: ' + (result.error || 'Unknown'), 'error');
            }
          })
          .catch(function(err) { showNotification('Share failed: ' + err.message, 'error'); });
    }

    /* ===== Text Sharing (TODO #6) ===== */
    function openTextModal() { document.getElementById('textModal').classList.add('active'); loadTextMessages(); }
    function closeTextModal() { document.getElementById('textModal').classList.remove('active'); }
    function sendText() {
        var input = document.getElementById('textInput');
        var text = input.value.trim();
        if (!text) return;
        fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) {
            return fetch('/text', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'x-csrf-token': data.csrfToken },
                body: JSON.stringify({ text: text })
            });
        }).then(function(r) { return r.json(); }).then(function(result) {
            if (result.success) { input.value = ''; loadTextMessages(); showNotification('Text shared!', 'success'); }
            else showNotification(result.error, 'error');
        }).catch(function(err) { showNotification('Failed: ' + err.message, 'error'); });
    }
    function loadTextMessages() {
        fetch('/text').then(function(r) { return r.json(); }).then(function(data) {
            var container = document.getElementById('textMessages');
            if (!data.messages || data.messages.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px">No messages yet</p>'; return; }
            container.innerHTML = data.messages.map(function(m) {
                return '<div class="text-msg"><button class="del-msg" onclick="deleteTextMsg(\\'' + m.id + '\\')">&times;</button>' +
                    escapeHtmlJs(m.text) + '<small>' + m.createdBy + ' · ' + new Date(m.createdAt).toLocaleString() + '</small></div>';
            }).join('');
        }).catch(function() {});
    }
    function deleteTextMsg(id) {
        fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) {
            return fetch('/text/' + id, { method: 'DELETE', credentials: 'same-origin', headers: { 'x-csrf-token': data.csrfToken } });
        }).then(function() { loadTextMessages(); }).catch(function() {});
    }

    /* ===== QR Code (TODO #5) ===== */
    function openQrModal() {
        document.getElementById('qrModal').classList.add('active');
        var url = location.href;
        document.getElementById('qrUrl').textContent = url;
        document.getElementById('qrImage').innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';
        fetch('/qr?url=' + encodeURIComponent(url)).then(function(r) { return r.text(); }).then(function(svg) {
            document.getElementById('qrImage').innerHTML = svg;
        }).catch(function() { document.getElementById('qrImage').innerHTML = '<p>Failed to generate QR code</p>'; });
    }
    function closeQrModal() { document.getElementById('qrModal').classList.remove('active'); }

    /* ===== Drag and Drop Move (TODO #22) ===== */
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.folder-card').forEach(function(folder) {
            folder.addEventListener('dragover', function(e) { e.preventDefault(); folder.style.borderColor = 'var(--accent)'; folder.style.background = 'var(--accent-light)'; });
            folder.addEventListener('dragleave', function() { folder.style.borderColor = ''; folder.style.background = ''; });
            folder.addEventListener('drop', function(e) {
                e.preventDefault();
                folder.style.borderColor = ''; folder.style.background = '';
                var source = e.dataTransfer.getData('text/plain');
                var dest = folder.getAttribute('data-folder-path');
                if (!source || source === dest) return;
                var fileName = source.split('/').pop();
                var newPath = dest + '/' + fileName;
                fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) {
                    return fetch('/rename', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json', 'x-csrf-token': data.csrfToken },
                        body: JSON.stringify({ oldPath: source, newPath: newPath })
                    });
                }).then(function(r) { return r.json(); }).then(function(result) {
                    if (result.success) { showNotification('Moved to ' + dest, 'success'); setTimeout(function() { location.reload(); }, 800); }
                    else showNotification('Move failed: ' + result.error, 'error');
                }).catch(function(err) { showNotification('Move failed', 'error'); });
            });
        });
        document.querySelectorAll('.file-card,.folder-card').forEach(function(card) {
            card.addEventListener('dragstart', function(e) {
                var p = card.getAttribute('data-folder-path') || decodeURIComponent(card.getAttribute('data-filename') || '');
                e.dataTransfer.setData('text/plain', p);
            });
        });
    });

    /* ===== Notifications ===== */
    function showNotification(message, type) {
        var n = document.createElement('div');
        n.textContent = message;
        n.style.cssText = 'position:fixed;top:20px;right:20px;padding:14px 20px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:10001;font-size:14px;max-width:400px;word-break:break-all;color:white;background:' + (type === 'success' ? 'var(--success)' : 'var(--danger)');
        document.body.appendChild(n);
        setTimeout(function() { if (n.parentNode) n.parentNode.removeChild(n); }, type === 'success' ? 3000 : 5000);
    }

    /* ===== Card clicks ===== */
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.file-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var fn = card.getAttribute('data-filename');
                if (fn) window.location.href = '/download/' + fn;
            });
        });
        document.querySelectorAll('.folder-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var fp = card.getAttribute('data-folder-path');
                if (fp) window.location.href = '/' + fp;
            });
        });
    });

    /* ===== Upload Logic ===== */
    function openUploadModal() { document.getElementById('uploadModal').classList.add('active'); }
    function closeUploadModal() {
        if (window.uploadInProgress && window.currentUploadXHR) { window.currentUploadXHR.abort(); window.uploadInProgress = false; window.currentUploadXHR = null; }
        document.getElementById('uploadModal').classList.remove('active');
        document.getElementById('uploadForm').reset();
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressText').textContent = '0%';
        document.getElementById('overallProgressFill').style.width = '0%';
        document.getElementById('overallProgressText').textContent = 'Preparing...';
        document.getElementById('uploadStatusText').textContent = 'Ready';
        document.getElementById('uploadBtn').disabled = false;
        document.getElementById('uploadBtn').textContent = 'Upload';
        document.getElementById('selectedFiles').style.display = 'none';
        document.getElementById('selectedFilesList').innerHTML = '';
        window.selectedFiles = null;
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        var k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showSelectedFiles(files, isFolder) {
        var div = document.getElementById('selectedFiles'), list = document.getElementById('selectedFilesList');
        if (!files.length) { div.style.display = 'none'; return; }
        var total = 0, html = isFolder ? '<strong>📂 Folder (' + files.length + ' files)</strong><br>' : '';
        var max = Math.min(files.length, 15);
        Array.from(files).slice(0, max).forEach(function(f, i) { total += f.size; var n = isFolder && f.webkitRelativePath ? f.webkitRelativePath : f.name; html += (i+1) + '. ' + n + ' (' + formatFileSize(f.size) + ')<br>'; });
        if (files.length > max) { for (var i = max; i < files.length; i++) total += files[i].size; html += '...and ' + (files.length - max) + ' more<br>'; }
        html += '<strong>Total: ' + files.length + ' files, ' + formatFileSize(total) + '</strong>';
        list.innerHTML = html; div.style.display = 'block';
    }

    var CHUNKED_THRESHOLD = 5 * 1024 * 1024, CHUNK_SIZE = 5 * 1024 * 1024;

    function uploadFiles(files) {
        if (window.uploadInProgress) return;
        window.uploadInProgress = true;
        var uploadProgress = document.getElementById('uploadProgress');
        var progressFill = document.getElementById('progressFill');
        var progressText = document.getElementById('progressText');
        var overallProgressFill = document.getElementById('overallProgressFill');
        var overallProgressText = document.getElementById('overallProgressText');
        var uploadStatusText = document.getElementById('uploadStatusText');
        var uploadBtn = document.getElementById('uploadBtn');
        uploadProgress.style.display = 'block'; uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading...';

        function updateProgress(pct, msg) {
            progressFill.style.width = pct + '%'; progressText.textContent = Math.round(pct) + '%';
            overallProgressFill.style.width = pct + '%';
            if (msg) { overallProgressText.textContent = msg; uploadStatusText.textContent = msg; }
        }

        var needsChunked = !window.isFolderUpload && files.length === 1 && files[0].size > CHUNKED_THRESHOLD;
        if (window.isFolderUpload) folderUpload(files);
        else if (needsChunked) chunkedUploadFile(files[0]);
        else standardUpload(files);

        function standardUpload(files) {
            var fd = new FormData();
            if (files.length === 1) fd.append('file', files[0]); else Array.from(files).forEach(function(f) { fd.append('files', f); });
            fd.append('uploadPath', document.querySelector('input[name="uploadPath"]').value);
            var xhr = new XMLHttpRequest(); window.currentUploadXHR = xhr;
            xhr.upload.addEventListener('progress', function(e) { if (e.lengthComputable) { var p = (e.loaded/e.total)*100; updateProgress(p, p < 100 ? 'Uploading...' : 'Processing...'); } });
            xhr.addEventListener('load', function() {
                if (xhr.status === 200) { updateProgress(100, 'Complete!'); showNotification('Upload successful!', 'success'); completeUpload(); }
                else { try { var e = JSON.parse(xhr.responseText); showNotification('Upload failed: ' + e.error, 'error'); } catch(e) { showNotification('Upload failed', 'error'); } resetUploadState(); }
            });
            xhr.addEventListener('error', function() { showNotification('Upload failed: Network error', 'error'); resetUploadState(); });
            xhr.timeout = 600000;
            var endpoint = files.length > 1 ? '/upload-multiple' : '/upload';
            fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) { xhr.open('POST', endpoint); xhr.setRequestHeader('x-csrf-token', data.csrfToken); xhr.send(fd); }).catch(function() { showNotification('CSRF token error', 'error'); resetUploadState(); });
        }

        function folderUpload(files) {
            var fd = new FormData(), rp = [];
            Array.from(files).forEach(function(f) { fd.append('files', f); rp.push(f.webkitRelativePath || f.name); });
            fd.append('relativePaths', JSON.stringify(rp));
            fd.append('uploadPath', document.querySelector('input[name="uploadPath"]').value);
            var xhr = new XMLHttpRequest(); window.currentUploadXHR = xhr;
            xhr.upload.addEventListener('progress', function(e) { if (e.lengthComputable) { var p = (e.loaded/e.total)*100; updateProgress(p, p < 100 ? 'Uploading folder...' : 'Processing...'); } });
            xhr.addEventListener('load', function() {
                if (xhr.status === 200) { updateProgress(100, 'Complete!'); showNotification('Folder uploaded!', 'success'); completeUpload(); }
                else { showNotification('Upload failed', 'error'); resetUploadState(); }
            });
            xhr.addEventListener('error', function() { showNotification('Upload failed', 'error'); resetUploadState(); });
            xhr.timeout = 600000;
            fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(data) { xhr.open('POST', '/upload-folder'); xhr.setRequestHeader('x-csrf-token', data.csrfToken); xhr.send(fd); }).catch(function() { resetUploadState(); });
        }

        function chunkedUploadFile(file) {
            var uploadPath = document.querySelector('input[name="uploadPath"]').value;
            var totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            updateProgress(0, 'Initializing chunked upload...');
            fetch('/csrf-token', { credentials: 'same-origin' }).then(function(r) { return r.json(); }).then(function(csrfData) {
                var csrfToken = csrfData.csrfToken;
                return fetch('/upload-init', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ filename: file.name, totalSize: file.size, uploadPath: uploadPath }) })
                .then(function(r) { if (!r.ok) return r.json().then(function(e) { throw new Error(e.error); }); return r.json(); })
                .then(function(initData) {
                    var uploadId = initData.uploadId, chunkIndex = 0;
                    function sendNext() {
                        if (chunkIndex >= totalChunks) {
                            updateProgress(95, 'Verifying...');
                            return fetch('/upload-complete', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ uploadId: uploadId }) })
                            .then(function(r) { if (!r.ok) return r.json().then(function(e) { throw new Error(e.error); }); return r.json(); })
                            .then(function() { updateProgress(100, 'Complete!'); showNotification('Upload successful!', 'success'); completeUpload(); });
                        }
                        var start = chunkIndex * CHUNK_SIZE, end = Math.min(start + CHUNK_SIZE, file.size);
                        updateProgress(((chunkIndex+1)/totalChunks)*90, 'Chunk ' + (chunkIndex+1) + '/' + totalChunks);
                        return fetch('/upload-chunk', { method: 'POST', credentials: 'same-origin', headers: { 'x-upload-id': uploadId, 'x-chunk-offset': String(start), 'Content-Type': 'application/octet-stream' }, body: file.slice(start, end) })
                        .then(function(r) { if (!r.ok) return r.json().then(function(e) { throw new Error(e.error); }); return r.json(); })
                        .then(function() { chunkIndex++; return sendNext(); });
                    }
                    return sendNext();
                });
            }).catch(function(err) { showNotification('Chunked upload failed: ' + err.message, 'error'); resetUploadState(); });
        }

        function resetUploadState() {
            window.uploadInProgress = false; window.currentUploadXHR = null;
            uploadBtn.disabled = false; uploadBtn.textContent = 'Upload';
            uploadProgress.style.display = 'none';
        }
        function completeUpload() {
            window.uploadInProgress = false; window.currentUploadXHR = null;
            setTimeout(function() { closeUploadModal(); setTimeout(function() { location.reload(); }, 300); }, 1500);
        }
    }

    /* ===== Upload Event Bindings ===== */
    document.addEventListener('DOMContentLoaded', function() {
        var dropZone = document.getElementById('dropZone'), fileInput = document.getElementById('fileInput');
        var folderInput = document.getElementById('folderInput'), uploadForm = document.getElementById('uploadForm');
        window.uploadInProgress = false; window.currentUploadXHR = null; window.selectedFiles = null; window.isFolderUpload = false;
        document.getElementById('selectFilesBtn').addEventListener('click', function(e) { e.stopPropagation(); fileInput.click(); });
        document.getElementById('selectFolderBtn').addEventListener('click', function(e) { e.stopPropagation(); folderInput.click(); });
        dropZone.addEventListener('click', function(e) { if (e.target.tagName === 'BUTTON') return; fileInput.click(); });
        fileInput.addEventListener('change', function(e) { if (e.target.files.length > 0) { window.isFolderUpload = false; showSelectedFiles(e.target.files); window.selectedFiles = e.target.files; } });
        folderInput.addEventListener('change', function(e) { if (e.target.files.length > 0) { window.isFolderUpload = true; showSelectedFiles(e.target.files, true); window.selectedFiles = e.target.files; } });
        dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', function(e) { e.preventDefault(); dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', function(e) { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length > 0) { showSelectedFiles(e.dataTransfer.files); window.selectedFiles = e.dataTransfer.files; } });
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault(); if (window.uploadInProgress) return;
            var f = window.selectedFiles || fileInput.files;
            if (f && f.length > 0) uploadFiles(f); else showNotification('Please select files first', 'error');
        });
        document.getElementById('uploadModal').addEventListener('click', function(e) { if (e.target === this) closeUploadModal(); });
        document.getElementById('previewModal').addEventListener('click', function(e) { if (e.target === this) closePreview(); });
        document.getElementById('textModal').addEventListener('click', function(e) { if (e.target === this) closeTextModal(); });
        document.getElementById('qrModal').addEventListener('click', function(e) { if (e.target === this) closeQrModal(); });
        document.getElementById('mkdirModal').addEventListener('click', function(e) { if (e.target === this) closeMkdirModal(); });
    });
    </script>
</body>
</html>`;
}
