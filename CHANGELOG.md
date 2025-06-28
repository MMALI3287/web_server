# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
