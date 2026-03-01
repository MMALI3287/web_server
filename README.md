# Secure File Server

A secure Node.js/Express file server with web-based folder navigation, file downloads, and file uploads. Features session-based authentication, HTTPS, CSRF protection, dark mode, real-time WebSocket updates, and 30+ built-in features rivaling desktop file transfer applications.

## Features

### Security

- **HTTPS** with TLS certificates
- **Session-based authentication** — HMAC-SHA256 signed cookie tokens (24h expiry)
- **Role-based authorization** — `admin` (browse + upload + manage) and `viewer` (browse + download)
- **CSRF protection** — double-submit cookie pattern via `csrf-csrf`
- **Magic-byte file validation** — rejects files whose content doesn't match their extension
- **Path traversal prevention** — all paths sanitized and validated against base directory
- **Rate limiting** — separate limits for general requests, downloads, and uploads
- **Security headers** — Helmet.js with per-request CSP nonces, HSTS, COEP
- **File type whitelisting** — configurable allowed extensions via admin UI or `config.json`
- **Encrypted storage** — AES-256-GCM encryption at rest with PBKDF2 key derivation
- **SSRF protection** — URL imports block private IP ranges

### Web Interface

- **Glassmorphism login page** with animated background
- **Modern file explorer** with card-based grid layout, folder navigation, breadcrumbs, and file statistics
- **Dark mode** — toggleable theme with `localStorage` persistence and `prefers-color-scheme` default
- **Responsive mobile UI** — adaptive breakpoints, single-column on mobile, 44px touch targets
- **Search & filter** — search bar with client-side live filtering and server-side recursive search
- **File sorting** — sort by name, size, date, or type with clickable column headers
- **File preview** — in-browser preview for images, text, PDF, video, and audio
- **Thumbnail generation** — on-demand WebP thumbnails for image files via `sharp`
- **Bulk operations** — multi-select checkboxes with bulk ZIP download and bulk delete
- **Drag & drop** — upload files plus drag-and-drop file moving between folders
- **QR code** — generate scannable QR codes for quick URL sharing between devices
- **Text/clipboard sharing** — ephemeral in-memory text messages with 1-hour TTL
- **Keyboard navigation** — Backspace/Alt+Up for parent directory

### File Management

- **Drag & drop uploads** — single, multiple, and folder uploads
- **Chunked uploads** — large files uploaded in 5MB chunks with resume support
- **Folder download** — download entire folders as streaming ZIP archives
- **File operations** — rename, move, delete files and folders (admin only)
- **Create folders** — new folder creation from the UI
- **File versioning** — automatic backup to `.versions/` before overwrite (configurable retention)
- **Shareable links** — time-limited, download-limited, optionally password-protected sharing tokens
- **URL import** — import files from external URLs with SSRF protection

### Real-Time & Collaboration

- **WebSocket live updates** — real-time connected client count, auto-refresh on file changes
- **Activity log** — in-memory ring buffer of upload/download/delete events
- **Device pairing** — 6-digit code pairing system for quick device connections
- **LAN discovery** — mDNS/Zeroconf service advertising and peer discovery

### API & Integration

- **RESTful API** — JSON API at `/api/files/*`, `/api/download/*`, `/api/info`
- **Email notifications** — send file links via email (requires SMTP config)
- **Bidirectional sync** — file manifest comparison for sync workflows
- **Bandwidth throttling** — configurable download speed limits
- **Response compression** — gzip via `compression` middleware

### Storage

- **Dual storage** — `public/` for browsable files, `uploads/` for server-side uploaded files
- **Disk usage & quota** — storage usage display with configurable quota limits
- **Auto-expiring uploads** — configurable TTL for uploaded files
- **No database** — filesystem is the only data store

## Quick Start

### Prerequisites

- Node.js v18+
- npm

### Installation

```bash
git clone https://github.com/MMALI3287/secure-file-server.git
cd secure-file-server
npm install
```

### TLS Certificates

On startup the server **auto-generates** a self-signed certificate in `certs/` that covers `localhost`, every local IP, and your public IP (via Subject Alternative Names). The certificate is regenerated automatically whenever your IPs change or it is within 30 days of expiry. OpenSSL must be installed and on your PATH.

To supply your own certificate instead, place `key.pem` and `cert.pem` in `certs/` — the auto-generator will leave them alone as long as they cover your current IPs.

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Generate password hashes for authentication:

```bash
node -e "require('bcrypt').hash('yourpassword', 10).then(h => console.log(h))"
```

Key environment variables:

| Variable                           | Default        | Description                                      |
| ---------------------------------- | -------------- | ------------------------------------------------ |
| `PORT`                             | `3000`         | Server port                                      |
| `HOST`                             | `0.0.0.0`      | Bind address                                     |
| `NODE_ENV`                         | `development`  | Environment (`production` suppresses debug logs) |
| `ADMIN_USER` / `ADMIN_PASS_HASH`   | —              | Admin credentials (bcrypt hash)                  |
| `VIEWER_USER` / `VIEWER_PASS_HASH` | —              | Viewer credentials (bcrypt hash)                 |
| `SESSION_SECRET`                   | auto-generated | HMAC key for session tokens                      |
| `CSRF_SECRET`                      | auto-generated | HMAC key for CSRF tokens                         |
| `MAX_FILE_SIZE`                    | `104857600`    | Upload size limit in bytes (100MB)               |
| `RATE_LIMIT_MAX_REQUESTS`          | `100`          | General rate limit per 15min window              |

See `.env.example` for the full list.

### Start

```bash
npm start            # Start server (HTTPS)
npm run dev          # Start with nodemon for auto-reload
```

Open `https://localhost:3000` in your browser. Default credentials: `admin`/`admin`, `viewer`/`viewer`.

## Architecture

```
server.js                   — Entry point (~70 lines): wires all modules
src/
  config.js                 — PROJECT_ROOT constant
  utils.js                  — log, escapeHtml, computeFileHash, formatFileSize, getFileIcon
  security.js               — sanitizeFilename, sanitizePath, isValidFilename, isAllowedFileType, isSecurePath
  auth.js                   — Session auth (HMAC-SHA256 tokens), sessionAuth middleware, requireRole
  csrf.js                   — CSRF double-submit cookie config (csrf-csrf)
  middleware.js              — Helmet, CSP nonces, rate limiters, CORS, cookie/body parsers, compression
  upload.js                 — Multer config, magic-byte validation, upload routes (single/multi/folder/chunked)
  startup.js                — TLS cert loading, port fallback, WebSocket server, signal handlers
  discovery.js              — mDNS/Zeroconf LAN discovery via bonjour-service
  encryption.js             — AES-256-GCM file encryption/decryption with PBKDF2 key derivation
  routes/
    login.js                — GET/POST /login, GET /logout
    download.js             — /download/* with bandwidth throttling
    share.js                — Shareable links with optional password protection, CSRF token endpoint
    explorer.js             — Directory listing + full HTML/CSS/JS file explorer UI (dark mode, search, sort, bulk ops)
    zip-download.js         — /download-folder/* streaming ZIP archives
    preview.js              — /preview/*, /preview-check/* for in-browser file preview
    text.js                 — POST/GET/DELETE /text for text/clipboard sharing
    search.js               — GET /search recursive file search
    file-ops.js             — POST /rename, DELETE /file/*, POST /mkdir
    bulk-ops.js             — POST /download-batch, POST /delete-batch
    activity.js             — GET /activity transfer history log
    storage.js              — GET /stats disk usage, auto-expiring uploads
    qr.js                   — GET /qr, GET /qr-data QR code generation
    thumbnails.js           — GET /thumbnail/* on-demand image thumbnails
    versioning.js           — GET /versions/* file version history
    import-url.js           — POST /import-url with SSRF protection
    api.js                  — GET /api/files/*, /api/download/*, /api/info
    email.js                — POST /send-email via nodemailer
    pairing.js              — POST /pair, POST /pair/join device pairing
    sync.js                 — GET /sync/manifest, POST /sync/compare
    settings.js             — GET/POST/DELETE /settings admin configuration
public/                     — Browsable/downloadable files
uploads/                    — Server-side uploaded files
certs/                      — TLS certificate and private key
```

Route modules export `function(app, { deps })` and register their routes on the Express app. No templating engine — UI is generated via template literals.

## API Endpoints

All state-changing endpoints require authentication and a valid CSRF token.

| Method | Path                       | Auth  | Description                        |
| ------ | -------------------------- | ----- | ---------------------------------- |
| `GET`  | `/login`                   | No    | Login page                         |
| `POST` | `/login`                   | No    | Authenticate (username + password) |
| `GET`  | `/logout`                  | No    | Clear session                      |
| `GET`  | `/`                        | Yes   | File explorer (root directory)     |
| `GET`  | `/{path}`                  | Yes   | Browse subdirectory                |
| `GET`  | `/download/{filepath}`     | Yes   | Download a file (rate limited)     |
| `GET`  | `/csrf-token`              | Yes   | Get CSRF token for uploads/shares  |
| `POST` | `/upload`                  | Admin | Upload single file                 |
| `POST` | `/upload-multiple`         | Admin | Upload multiple files (up to 10)   |
| `POST` | `/upload-folder`           | Admin | Upload folder preserving structure |
| `POST` | `/upload-chunked/init`     | Admin | Initialize chunked upload          |
| `POST` | `/upload-chunked/chunk`    | Admin | Upload a chunk (5MB)               |
| `POST` | `/upload-chunked/complete` | Admin | Finalize chunked upload            |
| `POST` | `/share`                   | Admin | Create a shareable download link   |
| `GET`  | `/s/:token`                | No    | Download via share token           |

### Allowed File Types

**Documents:** `.pdf`, `.txt`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
**Images:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`
**Media:** `.mp4`, `.mp3`, `.wav`, `.avi`, `.mov`
**Archives:** `.zip`, `.rar`, `.7z`, `.tar`, `.gz`
**Data:** `.json`, `.xml`, `.csv`

To add file types, update `isAllowedFileType()` in `src/security.js` and `extensionMimeMap`/`textExtensions` in `src/upload.js`.

## Dependencies

| Package                    | Purpose                                |
| -------------------------- | -------------------------------------- |
| `express` 5.1.0            | Web framework                          |
| `helmet` 8.1.0             | Security headers                       |
| `express-rate-limit` 7.5.0 | Request rate limiting                  |
| `cors` 2.8.5               | Cross-origin resource sharing          |
| `multer` 2.0.1             | Multipart file upload handling         |
| `bcrypt` 6.0.0             | Password hashing                       |
| `cookie-parser` 1.4.7      | Cookie parsing                         |
| `csrf-csrf` 4.0.3          | CSRF protection (double-submit cookie) |
| `file-type` 21.3.0         | Magic-byte file validation             |
| `dotenv` 17.3.1            | Environment variable loading           |

## Troubleshooting

**Server won't start** — Check if the port is in use. The server automatically tries fallback ports (3080, 5000, 8080). Ensure `certs/cert.pem` and `certs/key.pem` exist.

**Login not working** — Verify `ADMIN_USER`/`ADMIN_PASS_HASH` are set in `.env`. Generate a fresh hash with `node -e "require('bcrypt').hash('password', 10).then(h => console.log(h))"`.

**Upload rejected** — Check file extension is in the allowed list, file size is under `MAX_FILE_SIZE`, and you're logged in as admin with a valid CSRF token.

**Certificate errors in browser** — Expected with self-signed certs. Click through the warning or add the cert to your trust store.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.
