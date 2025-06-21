# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-06-22

### Added

- Comprehensive README.md with installation and usage instructions
- CONTRIBUTING.md with development guidelines
- GitHub Actions CI/CD workflow
- MIT License file
- Environment variables example file (.env.example)
- Proper package.json with repository information

### Fixed

- Path-to-regexp routing errors causing server startup failures
- Replaced problematic wildcard routes with middleware approach
- Improved error handling and logging

### Changed

- Updated project structure for GitHub readiness
- Enhanced documentation and code comments
- Improved .gitignore with comprehensive exclusions

## [2.0.0] - 2025-06-22

### Added

- Folder navigation through web interface
- Breadcrumb navigation for easy directory traversal
- Support for multi-level directory structures
- Enhanced UI with folder/file distinction
- JavaScript event listeners for better user interaction
- File statistics display (count, total size)
- Empty directory handling
- Test folder and files for demonstration

### Changed

- Refactored main route to support folder browsing
- Updated HTML generation for folder navigation
- Improved security with path validation for directories
- Enhanced user interface with modern styling

### Security

- Path traversal protection for directory navigation
- Secure folder access validation
- Maintained all existing file security measures

## [1.0.0] - 2025-06-21

### Added

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

### Security

- Comprehensive path sanitization
- File type restrictions
- Directory traversal prevention
- Rate limiting protection
- Security headers implementation
- Input validation and sanitization
