# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.0.0] - 2025-07-01

### Added

- **Folder download as ZIP** (`GET /download-folder/*`): Stream ZIP archives via `archiver` with file count/size limits
- **File preview** (`GET /preview/*`, `GET /preview-check/*`): In-browser preview for images, text, PDF, video, and audio
- **WebSocket live updates** (`/ws`): Real-time connected client count and automatic UI refresh on file changes
- **QR code generation** (`GET /qr`, `GET /qr-data`): SVG QR codes for quick URL sharing between devices
- **Text/clipboard sharing** (`POST /text`, `GET /text`, `DELETE /text/:id`): In-memory ephemeral text messages with 1h TTL
- **Password-protected share links**: Optional bcrypt-hashed password on shared links with verification form
- **Search/filter** (`GET /search?q=`): Recursive filename search with client-side live filtering
- **File operations**: Rename (`POST /rename`), delete (`DELETE /file/*`), create folder (`POST /mkdir`) — admin only
- **Sorting**: Server-side sort by name/size/date/type with clickable column headers in UI
- **Bulk operations**: Multi-select with checkboxes, bulk ZIP download (`POST /download-batch`), bulk delete (`POST /delete-batch`)
- **File versioning** (`GET /versions/*`): Auto-backup to `.versions/` directory before overwrite, configurable retention
- **Activity log** (`GET /activity`): In-memory ring buffer (500 entries) of upload/download/delete events
- **Storage management** (`GET /stats`): Disk usage display with quota support and auto-expiring uploads
- **Thumbnail generation** (`GET /thumbnail/*`): On-demand WebP thumbnails via `sharp` with `.thumbnails/` cache
- **URL import** (`POST /import-url`): Download files from external URLs with SSRF protection (private IP blocking)
- **RESTful API** (`/api/files/*`, `/api/download/*`, `/api/info`): JSON API for programmatic access
- **Email notifications** (`POST /send-email`): Send file links via email using `nodemailer` (requires SMTP config)
- **Device pairing** (`POST /pair`, `POST /pair/join`): 6-digit code pairing system with 5-minute TTL
- **LAN discovery**: mDNS service advertising and peer discovery via `bonjour-service`
- **Folder sync** (`GET /sync/manifest`, `POST /sync/compare`): File manifest comparison for sync operations
- **Admin settings** (`GET /settings`, `POST /settings/extensions`): UI for managing allowed file extensions via `config.json`
- **Encrypted storage**: AES-256-GCM file encryption/decryption with PBKDF2 key derivation
- **Dark mode**: CSS custom properties theme system with toggle button and `localStorage` persistence
- **Responsive mobile UI**: Improved breakpoints, single-column layout on mobile, 44px touch targets
- **Drag-and-drop move**: Drag files onto folder cards to move them (calls `/rename`)
- **Keyboard navigation**: Backspace/Alt+Up to go to parent directory
- **Disk usage bar**: Fetches `/stats` and displays storage usage in the header
- **Bandwidth throttling**: Configurable download speed limit via `DOWNLOAD_THROTTLE_RATE` env var
- **Response compression**: gzip compression via `compression` middleware

### Changed

- Explorer UI completely rewritten with modern card-based design, modals, and FAB buttons
- File cards show thumbnails for images, action buttons for download/preview/share/rename/delete
- `server.js` wires 19 route modules plus upload module
- Download route rewritten from `express.static` to explicit stream piping (supports throttling)
- Security module `isAllowedFileType()` now reads from `config.json` with expanded defaults
- Express 5 wildcard routes updated to `{*path}` parameter syntax

### Dependencies Added

- `compression` — gzip response compression
- `archiver` — ZIP archive streaming
- `sharp` — image thumbnail generation
- `ws` — WebSocket server
- `qrcode` — QR code SVG generation
- `nodemailer` — email sending
- `stream-throttle` — bandwidth throttling
- `bonjour-service` — mDNS/Zeroconf LAN discovery

## [5.0.0] - 2026-03-01

### Added

- **Session-based authentication**: Replaced HTTP Basic Auth with HMAC-SHA256 signed cookie tokens (24h expiry)
- **Glassmorphism login page**: Full-featured login UI with animated background orbs, error handling, and redirect logic
- **Logout**: `GET /logout` endpoint and logout button in the file explorer header
- **Shareable links**: `POST /share` to create time-limited, download-limited file share tokens; `GET /s/:token` to download
- **Chunked uploads**: Large file upload in 5MB chunks with init/chunk/complete flow and 30-minute TTL
- **Folder uploads**: `POST /upload-folder` preserving directory structure via `webkitRelativePath`
- **Modular architecture**: Split 3085-line `server.js` into 13 focused modules under `src/`
  - Core modules: `config.js`, `utils.js`, `security.js`, `auth.js`, `csrf.js`, `middleware.js`, `upload.js`, `startup.js`
  - Route modules: `routes/login.js`, `routes/download.js`, `routes/share.js`, `routes/explorer.js`
  - Entry point reduced to ~54 lines

### Changed

- `server.js` is now a slim wiring file; all logic lives in `src/` modules
- Route modules export `function(app, { deps })` pattern
- Session auth replaces Basic Auth — users from env vars, bcrypt-verified
- `.env.example` updated with all current settings including `SESSION_SECRET` and share link variables
- Removed unused dependencies: `express-basic-auth`, `path-exists`, `webpack-cli`

### Security

- `.gitignore` now excludes `certs/` to prevent committing TLS private keys
- CSRF token endpoint (`GET /csrf-token`) for client-side token fetching
- Share link tokens are cryptographically random (24 bytes, base64url)
- Chunked upload state cleaned up after 30-minute TTL

## [4.0.0] - 2025-03-01

### Added

- **Authentication**: HTTP Basic Auth with bcrypt-hashed passwords stored in `.env`
- **Role-Based Authorization**: Two roles — `admin` (browse + upload) and `viewer` (browse + download only)
- **CSRF Protection**: Double-submit cookie pattern via `csrf-csrf` on all upload endpoints
- **File Type Magic Byte Validation**: Post-upload validation using `file-type` to reject files whose content doesn't match their extension (e.g., PNG renamed to .pdf)
- **CSRF Token Endpoint**: `GET /csrf-token` for client-side token fetching before uploads
- **Environment Configuration**: All settings (auth, rate limits, CSRF secret, file size limit) configurable via `.env` using `dotenv`

### Changed

- Upload endpoints require `admin` role and valid CSRF token
- Rate limiters now use `.env` variables instead of hardcoded values
- Error handler catches CSRF token errors and returns 403 with clear message

### Security

- All 25 original security vulnerabilities addressed (see TODO.md for feature backlog)
- Passwords never stored in plaintext — only bcrypt hashes in `.env`
- CSRF tokens tied to authenticated session identity
- Magic byte validation prevents extension spoofing for common file types

### Dependencies Added

- `dotenv` — environment variable loading
- `bcrypt` — password hashing
- `cookie-parser` — cookie handling for CSRF
- `csrf-csrf` — double-submit CSRF protection
- `file-type` — magic byte file type detection

## [3.0.0] - 2025-06-29

### Added

- **File Upload System**: Complete file upload functionality with multer
- **Dual Storage Architecture**: Separated public files (client-accessible) and server uploads
- **Upload Progress Tracking**: Dual progress bars showing current file and overall upload status
- **Drag & Drop Interface**: Modern file upload interface with drag and drop support
- **File Validation**: Client-side and server-side file validation
- **Upload Rate Limiting**: Dedicated rate limiting for upload endpoints (10 uploads per 15 minutes)
- **Automatic File Conflict Resolution**: Automatic renaming of duplicate files
- **Upload State Management**: Prevention of multiple simultaneous uploads
- **File Size Limits**: 100MB maximum file size with validation
- **Enhanced Error Handling**: Comprehensive error handling for upload operations
- **Upload Cancellation**: Ability to cancel ongoing uploads
- **Auto Page Refresh**: Automatic page refresh after successful uploads

### Changed in 3.0.0

- **Storage Structure**: Moved existing files from `uploads/` to `public/` directory
- **Server Routing**: Updated all file serving routes to use `public/` directory
- **UI Interface**: Enhanced upload modal with dual progress bars and status indicators
- **Security Headers**: Updated security banner to reflect upload processing
- **File Access**: Client downloads now serve from `public/` directory only
- **Test Endpoint**: Updated test download to reference files in public directory

### Security

- **Upload Validation**: Multi-layer file type and size validation
- **Path Security**: Upload path sanitization and traversal protection
- **Rate Limited Uploads**: Separate rate limiting for upload operations
- **Server-Side Storage**: Uploaded files stored server-side for review
- **File Type Restrictions**: Strict file type validation on uploads
- **Size Limits**: 100MB file size limit enforcement

### Fixed

- **Upload Response Handling**: Improved upload response processing and user feedback
- **Progress Bar Accuracy**: Enhanced progress tracking with real-time updates
- **File Selection Feedback**: Clear indication of selected files before upload
- **Upload State Persistence**: Proper cleanup of upload state on completion/error
- **Error Message Display**: Better error message formatting and display duration

## [2.1.0] - 2025-06-22

### Added in 2.1.0

- Comprehensive README.md with installation and usage instructions
- CONTRIBUTING.md with development guidelines
- GitHub Actions CI/CD workflow
- MIT License file
- Environment variables example file (.env.example)
- Proper package.json with repository information

### Fixed in 2.1.0

- Path-to-regexp routing errors causing server startup failures
- Replaced problematic wildcard routes with middleware approach
- Improved error handling and logging

### Changed in 2.1.0

- Updated project structure for GitHub readiness
- Enhanced documentation and code comments
- Improved .gitignore with comprehensive exclusions

## [2.0.0] - 2025-06-22

### Added in 2.0.0

- Folder navigation through web interface
- Breadcrumb navigation for easy directory traversal
- Support for multi-level directory structures
- Enhanced UI with folder/file distinction
- JavaScript event listeners for better user interaction
- File statistics display (count, total size)
- Empty directory handling
- Test folder and files for demonstration

### Changed in 2.0.0

- Refactored main route to support folder browsing
- Updated HTML generation for folder navigation
- Improved security with path validation for directories
- Enhanced user interface with modern styling

### Security in 2.0.0

- Path traversal protection for directory navigation
- Secure folder access validation
- Maintained all existing file security measures

## [1.0.0] - 2025-06-21

### Added in 1.0.0

- Initial secure file server implementation
- Express.js web server with security middleware
- File download functionality with validation
- Rate limiting for requests and downloads
- CORS protection with configurable origins
- Security headers via Helmet.js
- File type validation with whitelist
- Path traversal attack prevention
- Input sanitization for filenames and paths
- Responsive web interface for file listing
- File type icons and metadata display
- Direct download links with fallback options
- Error handling and logging
- Test endpoint for file access verification

### Security in 1.0.0

- Comprehensive path sanitization
- File type restrictions
- Directory traversal prevention
- Rate limiting protection
- Security headers implementation
- Input validation and sanitization
