# 🗂️ Secure File Server with Upload and Download Capabilities

A secure, feature-rich Node.js/Express file server that provides web-based folder navigation, file downloads, and secure file uploads with comprehensive security measures and dual storage architecture.

## ✨ Features

### 🔒 Security Features

- **Path Traversal Protection** - Prevents `../` directory traversal attacks
- **File Type Validation** - Only allows whitelisted file extensions
- **Rate Limiting** - Configurable request, download, and upload limits
- **CORS Protection** - Configurable cross-origin resource sharing
- **Security Headers** - Helmet.js integration for HTTP security headers
- **Input Sanitization** - All file paths and names are sanitized
- **Secure File Serving** - Validates file existence and permissions
- **Dual Storage Architecture** - Separates public files from server-side uploads

### 🌐 Web Interface

- **Folder Navigation** - Browse directories through a clean web UI
- **Breadcrumb Navigation** - Easy navigation with clickable breadcrumbs
- **File Download** - Secure file downloads from public storage
- **File Upload** - Secure file uploads with dual progress tracking
- **Responsive Design** - Works on desktop and mobile devices
- **File Type Icons** - Visual file type indicators
- **File Information** - Displays file size, type, and modification date
- **Drag & Drop Upload** - Modern file upload interface

### 📁 File Management

- **Multi-level Directories** - Navigate through nested folder structures
- **File Statistics** - Shows total files, folders, and combined size
- **Empty Directory Handling** - Graceful handling of empty directories
- **Large File Support** - Handles files up to 100MB efficiently
- **Automatic File Renaming** - Prevents conflicts with existing files
- **Real-time Upload Progress** - Dual progress bars for detailed feedback

## 🚀 Quick Start

### Prerequisites

- Node.js (v12 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/MMALI3287/web_server.git
   cd web_server
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create storage directories:**

   ```bash
   mkdir uploads
   mkdir public
   ```

4. **Start the server:**

   ```bash
   node server.js
   ```

5. **Access the web interface:**
   Open [http://localhost:3000](http://localhost:3000) in your browser

## 📋 Dependencies

```json
{
  "express": "^4.x.x",
  "helmet": "^7.x.x",
  "express-rate-limit": "^6.x.x",
  "cors": "^2.x.x",
  "multer": "^1.x.x"
}
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory to customize settings:

```env
PORT=3000
HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Allowed File Types

The server supports the following file extensions by default:

**Documents:** `.pdf`, `.txt`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
**Images:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`
**Media:** `.mp4`, `.mp3`, `.wav`, `.avi`, `.mov`
**Archives:** `.zip`, `.rar`, `.7z`, `.tar`, `.gz`
**Web:** `.html`, `.css`, `.js`, `.json`, `.xml`, `.csv`

### Rate Limiting

- **General requests:** 100 requests per 15 minutes per IP
- **Downloads:** 20 downloads per 15 minutes per IP
- **Uploads:** 10 uploads per 15 minutes per IP (100MB max file size)

## 🏗️ Architecture

### Dual Storage System

The server implements a dual storage architecture for enhanced security:

- **Public Storage (`/public`)**: Files visible to clients for browsing and downloading
- **Server Storage (`/uploads`)**: Files uploaded by users, stored server-side for review

This separation ensures that uploaded content doesn't immediately become public and can be reviewed before being moved to the public area.

## 🛡️ Security Measures

### Path Security

- All paths are sanitized to remove dangerous characters
- Directory traversal attempts (e.g., `../`) are blocked
- File access is restricted to the `uploads` directory only

### File Validation

- Only whitelisted file types are accessible
- File existence and permissions are verified before serving
- Maximum filename length enforcement (500 characters)
- Client-side and server-side upload validation
- Automatic file conflict resolution (renamed if duplicate)

### HTTP Security

- Security headers via Helmet.js
- CORS protection with configurable origins
- Content-Type validation
- XSS protection headers

## 📖 API Endpoints

### GET `/`

- **Description:** Main interface for browsing the root directory
- **Response:** HTML page with file/folder listing from public storage

### GET `/{path}`

- **Description:** Browse any subdirectory in public storage
- **Parameters:** `path` - Relative path to directory
- **Response:** HTML page with file/folder listing for the specified path

### GET `/download/{filepath}`

- **Description:** Download a file from public storage
- **Parameters:** `filepath` - Relative path to file
- **Response:** File download with appropriate headers
- **Rate Limited:** Yes (20 requests per 15 minutes)

### POST `/upload`

- **Description:** Upload a file to server storage
- **Parameters:**
  - `file` - File to upload (multipart/form-data)
  - `uploadPath` - Target directory path (optional)
- **Response:** JSON with upload status and file information
- **Rate Limited:** Yes (10 requests per 15 minutes)
- **File Size Limit:** 100MB

### GET `/test-download`

- **Description:** Test endpoint to verify file access
- **Response:** JSON with file information

## 🔧 Development

### Project Structure

```text
web_server/
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── public/            # Public file storage (client accessible)
├── uploads/           # Server-side upload storage
├── .env              # Environment variables
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

### Adding New File Types

To add support for new file types, edit the `allowedExtensions` array in `server.js`:

```javascript
const allowedExtensions = [
  // ... existing extensions
  ".newext", // Add your new extension here
];
```

### Customizing Rate Limits

Modify the rate limiting configuration in `server.js`:

```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Time window
  max: 100, // Max requests per window
  message: "Rate limit exceeded",
});
```

## 🚨 Important Security Notes

1. **HTTP vs HTTPS:** The server is configured for HTTP to avoid mixed content issues. For production, consider implementing proper HTTPS with valid certificates.

2. **File Upload:** The server now includes secure file upload functionality with dual storage architecture. Uploaded files are stored server-side for review before being made public.

3. **Production Deployment:**

   - Use a reverse proxy (nginx/Apache) in production
   - Implement proper logging and monitoring
   - Consider additional authentication/authorization layers

4. **File Permissions:** Ensure both the `public` and `uploads` directories have appropriate permissions and are not executable.

5. **Upload Review Process:** Implement a process to review uploaded files in the `uploads` directory before moving them to `public` for client access.

## 🐛 Troubleshooting

### Common Issues

**Server won't start:**

- Check if port 3000 is already in use
- Verify Node.js version compatibility
- Ensure all dependencies are installed

**Files not accessible:**

- Verify file exists in public directory (not uploads)
- Check file permissions
- Ensure file type is in allowed extensions list

**Upload failures:**

- Check file size (max 100MB)
- Verify file type is allowed
- Ensure uploads directory exists and is writable
- Check rate limits

**Rate limit errors:**

- Wait for the rate limit window to reset
- Adjust rate limit settings if needed

**Path traversal blocked:**

- This is expected security behavior
- Ensure file paths don't contain `../` sequences

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🔄 Version History

- **v1.0.0** - Initial release with basic file serving
- **v2.0.0** - Added folder navigation and enhanced security
- **v2.1.0** - Fixed path-to-regexp routing issues and improved UI
- **v3.0.0** - Added secure file upload with dual storage architecture
  - Implemented multer-based file upload system
  - Added dual progress bars for upload tracking
  - Separated public and server-side storage
  - Enhanced security with upload rate limiting
  - Added drag & drop file upload interface
  - Implemented automatic file conflict resolution

## 📞 Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Review the server logs for error messages
3. Open an issue on GitHub with detailed information

---

**⚠️ Disclaimer:** This software is provided as-is. Always review and test security measures before deploying in production environments.
