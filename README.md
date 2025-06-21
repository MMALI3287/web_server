# 🗂️ Secure File Server with Folder Navigation

A secure, feature-rich Node.js/Express file server that provides web-based folder navigation and file downloads with comprehensive security measures.

## ✨ Features

### 🔒 Security Features

- **Path Traversal Protection** - Prevents `../` directory traversal attacks
- **File Type Validation** - Only allows whitelisted file extensions
- **Rate Limiting** - Configurable request and download limits
- **CORS Protection** - Configurable cross-origin resource sharing
- **Security Headers** - Helmet.js integration for HTTP security headers
- **Input Sanitization** - All file paths and names are sanitized
- **Secure File Serving** - Validates file existence and permissions

### 🌐 Web Interface

- **Folder Navigation** - Browse directories through a clean web UI
- **Breadcrumb Navigation** - Easy navigation with clickable breadcrumbs
- **File Download** - Secure file downloads from any subdirectory
- **Responsive Design** - Works on desktop and mobile devices
- **File Type Icons** - Visual file type indicators
- **File Information** - Displays file size, type, and modification date

### 📁 File Management

- **Multi-level Directories** - Navigate through nested folder structures
- **File Statistics** - Shows total files, folders, and combined size
- **Empty Directory Handling** - Graceful handling of empty directories
- **Large File Support** - Handles files of various sizes efficiently

## 🚀 Quick Start

### Prerequisites

- Node.js (v12 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository:**

   ```bash
   git clone <your-repo-url>
   cd web_server
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create uploads directory:**

   ```bash
   mkdir uploads
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
  "cors": "^2.x.x"
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

## 🛡️ Security Measures

### Path Security

- All paths are sanitized to remove dangerous characters
- Directory traversal attempts (e.g., `../`) are blocked
- File access is restricted to the `uploads` directory only

### File Validation

- Only whitelisted file types are accessible
- File existence and permissions are verified before serving
- Maximum filename length enforcement (500 characters)

### HTTP Security

- Security headers via Helmet.js
- CORS protection with configurable origins
- Content-Type validation
- XSS protection headers

## 📖 API Endpoints

### GET `/`

- **Description:** Main interface for browsing the root directory
- **Response:** HTML page with file/folder listing

### GET `/{path}`

- **Description:** Browse any subdirectory
- **Parameters:** `path` - Relative path to directory
- **Response:** HTML page with file/folder listing for the specified path

### GET `/download/{filepath}`

- **Description:** Download a file from any directory
- **Parameters:** `filepath` - Relative path to file
- **Response:** File download with appropriate headers
- **Rate Limited:** Yes (20 requests per 15 minutes)

### GET `/test-download`

- **Description:** Test endpoint to verify file access
- **Response:** JSON with file information

## 🔧 Development

### Project Structure

```
web_server/
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── uploads/           # File storage directory
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

2. **File Upload:** This server is designed for file serving only. File upload functionality should be implemented separately with additional security measures.

3. **Production Deployment:**

   - Use a reverse proxy (nginx/Apache) in production
   - Implement proper logging and monitoring
   - Consider additional authentication/authorization layers

4. **File Permissions:** Ensure the uploads directory has appropriate permissions and is not executable.

## 🐛 Troubleshooting

### Common Issues

**Server won't start:**

- Check if port 3000 is already in use
- Verify Node.js version compatibility
- Ensure all dependencies are installed

**Files not accessible:**

- Verify file exists in uploads directory
- Check file permissions
- Ensure file type is in allowed extensions list

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

## 📞 Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Review the server logs for error messages
3. Open an issue on GitHub with detailed information

---

**⚠️ Disclaimer:** This software is provided as-is. Always review and test security measures before deploying in production environments.
