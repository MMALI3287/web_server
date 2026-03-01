# Project Guidelines

## Overview

This is **secure-file-server**, a Node.js/Express file server with web-based folder navigation, file downloads, and secure file uploads. It uses a modular architecture with `server.js` as a slim entry point and logic organized under `src/`.

## Architecture

- **Entry point**: `server.js` (~54 lines) wires together all modules
- **Modules in `src/`**: Each concern has its own file (auth, security, upload, routes, etc.)
- **Dual storage**: `public/` for browsable/downloadable files, `uploads/` for server-side uploaded files
- **No frontend build step**: The UI is generated as template literals inside route modules
- **No database**: File system is the only data store

### Project Structure

```
server.js                   — Entry point: requires and wires all modules
src/
  config.js                 — PROJECT_ROOT constant
  utils.js                  — log, escapeHtml, computeFileHash, formatFileSize, getFileIcon
  security.js               — sanitizeFilename, sanitizePath, isValidFilename, isAllowedFileType, isSecurePath
  auth.js                   — Session-based auth (HMAC-SHA256 tokens), sessionAuth middleware, requireRole
  csrf.js                   — CSRF double-submit cookie config (csrf-csrf)
  middleware.js              — Helmet, CSP nonces, rate limiters, CORS, cookie/body parsers, compression
  upload.js                 — Multer config, magic-byte validation, all upload routes (single/multi/folder/chunked)
  cert-gen.js               — Auto-generate/renew self-signed TLS certs with IP SANs via OpenSSL
  startup.js                — TLS cert loading, port fallback, WebSocket server, signal handlers
  discovery.js              — mDNS/Zeroconf LAN discovery via bonjour-service
  encryption.js             — AES-256-GCM file encryption/decryption
  routes/
    login.js                — GET/POST /login (glassmorphism UI), GET /logout
    download.js             — /download/* with bandwidth throttling
    share.js                — Shareable links with password protection, CSRF token endpoint
    explorer.js             — Directory listing + full HTML/CSS/JS file explorer (dark mode, search, sort, bulk ops)
    zip-download.js         — /download-folder/* streaming ZIP archives
    preview.js              — /preview/*, /preview-check/* file preview
    text.js                 — POST/GET/DELETE /text clipboard sharing
    search.js               — GET /search recursive file search
    file-ops.js             — POST /rename, DELETE /file/*, POST /mkdir
    bulk-ops.js             — POST /download-batch, POST /delete-batch
    activity.js             — GET /activity transfer history
    storage.js              — GET /stats disk usage, auto-expiring uploads
    qr.js                   — GET /qr QR code generation
    thumbnails.js           — GET /thumbnail/* image thumbnails
    versioning.js           — GET /versions/* file version history
    import-url.js           — POST /import-url URL import with SSRF protection
    api.js                  — RESTful API endpoints
    email.js                — POST /send-email notifications
    pairing.js              — Device pairing with codes
    sync.js                 — Bidirectional sync manifests
    settings.js             — Admin settings UI
    webdav.js               — WebDAV endpoint at /webdav/ for native file manager access
```

## Code Style

- 2-space indentation
- camelCase for variables and functions
- Express.js middleware pattern throughout
- `require()` (CommonJS) — not ES modules
- Inline HTML generation via template literals (no templating engine)
- Route modules export `function(app, { deps })` that register routes on the Express app

## Security

Security is a core concern. All changes must preserve these protections:

- **Path traversal prevention**: Always use `sanitizePath()` / `sanitizeFilename()` and `isSecurePath()` from `src/security.js`
- **File type whitelisting**: Only extensions in the `allowedExtensions` array are permitted
- **Rate limiting**: Separate limiters for general requests, downloads, and uploads — do not remove or weaken them
- **Input sanitization**: All user-supplied paths and filenames must be sanitized before use
- **Helmet.js**: Security headers applied via `src/middleware.js` with per-request CSP nonces
- **Session auth**: HMAC-SHA256 signed cookie tokens (24h expiry) via `src/auth.js`
- **CSRF protection**: Double-submit cookie pattern via `src/csrf.js` on all state-changing routes
- **Magic-byte validation**: Uploaded files validated against extension-MIME map in `src/upload.js`
- Never serve files outside `public/` or `uploads/` directories

## Build and Test

```bash
npm install          # Install dependencies
npm start            # Start server (node server.js)
npm run dev          # Start with nodemon for auto-reload
```

No automated test suite exists. Manually verify:

1. Server starts without errors
2. Unauthenticated requests redirect to `/login`
3. Login with valid credentials works
4. Directory listing and navigation works
5. File download works
6. File upload works (single, multiple, folder, chunked)
7. Share link creation and access works
8. Path traversal attempts are blocked

## Conventions

- `server.js` is the slim entry point — add new routes as modules under `src/routes/`
- Utility/security functions go in the appropriate `src/` module
- Log with `log.info()` / `log.error()` / `log.warn()` / `log.debug()` from `src/utils.js`
- Return JSON error responses with appropriate HTTP status codes
- When adding new file extensions, update `isAllowedFileType()` in `src/security.js` and `extensionMimeMap`/`textExtensions` in `src/upload.js`

## Dependencies

- `express` — web framework
- `helmet` — security headers
- `express-rate-limit` — request rate limiting
- `cors` — cross-origin resource sharing
- `multer` — multipart file upload handling
- `bcrypt` — password hashing
- `cookie-parser` — cookie parsing
- `csrf-csrf` — CSRF protection (double-submit cookie)
- `file-type` — magic-byte file validation
- `dotenv` — environment variable loading
- `compression` — gzip response compression
- `archiver` — ZIP archive streaming
- `sharp` — image thumbnail generation
- `ws` — WebSocket server
- `qrcode` — QR code SVG generation
- `nodemailer` — email sending
- `stream-throttle` — bandwidth throttling
- `bonjour-service` — mDNS/Zeroconf LAN discovery
- `webdav-server` — WebDAV protocol for native OS file manager integration
