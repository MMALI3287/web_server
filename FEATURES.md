# Secure File Server — Feature Checklist

> **Test Status Legend:** ✅ Passed | ❌ Failed | ⚠️ Partial | ⏭️ Requires external setup

---

## User Interface

- [x] **Login Page** — Glassmorphism login form with animated background
- [x] **Logout** — Ends session and redirects back to login
- [x] **Dark Mode** — Toggle between dark and light themes in the explorer
- [x] **File Explorer** — Browse files and folders with icons, sizes, and dates
- [x] **Breadcrumb Navigation** — Click path segments to jump to parent folders
- [x] **Sorting** — Sort files by name, size, date, or type (ascending/descending)
- [x] **Responsive Layout** — Works on both desktop and mobile screens

## File Operations

- [x] **Download File** — Download any allowed file from the server
- [x] **Download from Subdirectory** — Download files inside nested folders
- [x] **Download Folder as ZIP** — Download an entire folder as a ZIP archive
- [x] **Bulk Download** — Select multiple files and download as ZIP
- [x] **File Preview** — Inline preview for images, text, PDF, video, and audio
- [x] **Preview Check** — API to check if a file type is previewable
- [x] **Image Thumbnails** — Auto-generated WebP thumbnails for image files
- [x] **File Search** — Recursive case-insensitive search across all folders
- [x] **Create Folder** — Create new directories from the explorer
- [x] **Rename File/Folder** — Rename or move files and folders
- [x] **Delete File/Folder** — Delete files or entire directories
- [x] **Bulk Delete** — Select and delete multiple files at once
- [x] **File Versioning** — Automatic version history when files are overwritten

## Sharing & Collaboration

- [x] **Share Link** — Generate a shareable download link for any file
- [x] **Access Share Link** — Download files via share token without login
- [x] **Clipboard/Text Sharing** — Post and retrieve text snippets between devices
- [x] **QR Code** — Generate QR codes for any URL (SVG and data URL)
- [x] **Device Pairing** — Pair two devices using a 6-digit code

## Upload

- [x] **Single File Upload** — Upload one file via the web UI
- [x] **Multi-File Upload** — Upload up to 10 files at once
- [x] **Folder Upload** — Upload entire folder structures (max 3 levels)

## API & Integration

- [x] **REST API — List Files** — `GET /api/files` returns directory listing as JSON
- [x] **REST API — Server Info** — `GET /api/info` returns server name, version, user
- [x] **Sync Manifest** — `GET /sync/manifest` lists all files with sizes and timestamps
- [x] **WebDAV** — Mount the server as a network drive in any file manager
- [x] **URL Import** — Download a file from an external URL to the server

## Administration

- [x] **Activity Log** — View recent transfer and file operation history
- [x] **Storage Stats** — View disk usage, file counts, and quota info
- [x] **Settings — Get Config** — View current server configuration
- [x] **Settings — Update Extensions** — Change allowed file types at runtime

## Security (Verified by Behavior)

- [x] **Auth Required** — Unauthenticated requests redirect to login
- [x] **CSRF Protection** — State-changing requests require a CSRF token
- [x] **Rate Limiting** — Excessive requests get throttled (429 status)
- [x] **Path Traversal Blocked** — Attempts to escape public/ directory are rejected
- [x] **Security Headers** — Response includes Helmet headers (HSTS, CSP, X-Frame-Options)

## Infrastructure (Not Browser-Testable)

- ⏭️ **TLS/HTTPS** — Self-signed or CA certs from `certs/` directory
- ⏭️ **LAN Discovery** — mDNS/Bonjour advertising on local network
- ⏭️ **WebSocket** — Real-time client count at `/ws`
- ⏭️ **Email Notifications** — Send share links via email (requires SMTP config)
- ⏭️ **File Encryption** — AES-256-GCM encrypt/decrypt utility
- ⏭️ **Graceful Shutdown** — Handles SIGTERM/SIGINT signals cleanly

---

## How to Test Each Feature Manually

> **Prerequisites:** Start the server with `npm start`, then open `https://localhost:3000` in your browser. Accept the self-signed certificate warning.

### Login & Logout

1. Open `https://localhost:3000` — you should be redirected to `/login`
2. Enter your admin credentials and click **Login**
3. You should land on the file explorer (`/`)
4. Click **Logout** (or visit `/logout`) — you should return to the login page

### Dark Mode

1. In the file explorer, find the **theme toggle** button (usually a sun/moon icon)
2. Click it — the UI should switch between dark and light themes
3. Refresh the page — the theme preference should persist

### File Explorer & Navigation

1. The explorer shows files with icons, sizes, and modification dates
2. Click a **folder name** to navigate into it
3. Click path segments in the **breadcrumb bar** to jump back
4. Use the **sort dropdown** to sort by name, size, date, or type

### Download

1. Click a file's **download button** (or the download icon)
2. The file should start downloading in your browser
3. For **subfolder files**, navigate into a folder and download from there
4. To **download a folder as ZIP**, click the folder download/ZIP button

### File Preview

1. Click the **preview/eye icon** on a supported file (`.txt`, `.pdf`, `.jpg`, `.png`, etc.)
2. The file should display inline in the browser without downloading

### Search

1. Type a search term in the **search bar** at the top of the explorer
2. Results should appear matching files across all directories

### Create, Rename, Delete

1. Click **Create Folder** → enter a name → the folder should appear
2. Select a file → click **Rename** → enter new name → file is renamed
3. Select a file → click **Delete** → confirm → file is removed
4. Select multiple files → click **Bulk Delete** → all are removed

### Share Links

1. Select a file → click **Share** → a share link URL is generated
2. Copy the link and open it in an **incognito/private window** (no login needed)
3. The file should start downloading

### Clipboard / Text Sharing

1. Open the **text/clipboard** section in the UI
2. Type a message and click **Send** — the message appears in the list
3. Open the server on another device — the same message should be visible

### QR Code

1. Visit `https://localhost:3000/qr?url=https://example.com`
2. An SVG QR code should render in the browser

### Upload

1. In the explorer, click the **Upload** button or **drag and drop** files onto the page
2. Select one or more files — they should upload and appear in the file list
3. For folder upload, drag a folder onto the upload area

### REST API

1. Open `https://localhost:3000/api/files` in your browser — JSON file list appears
2. Open `https://localhost:3000/api/info` — JSON with server name, version, and user

### WebDAV

1. **Windows:** Open File Explorer → address bar → type `\\localhost@SSL@3000\webdav\`
2. **macOS:** Finder → Go → Connect to Server → `https://localhost:3000/webdav/`
3. **Linux:** File manager → connect to `davs://localhost:3000/webdav/`
4. Enter your admin credentials when prompted

### Activity & Storage

1. Visit `https://localhost:3000/activity` — JSON list of recent operations
2. Visit `https://localhost:3000/stats` — JSON with disk usage and quota info

### Admin Settings

1. Visit `https://localhost:3000/settings` — JSON with current allowed extensions and limits
2. Use `POST /settings/extensions` with a JSON body to change allowed file types

### Security Checks

1. Open an **incognito window** → visit `https://localhost:3000/` → should redirect to `/login`
2. Try `https://localhost:3000/download/../../../etc/passwd` → should get `400` or `403`
3. Open browser **DevTools → Network** → check response headers for `Strict-Transport-Security`, `Content-Security-Policy`, and `X-Frame-Options`
