# Contributing to Secure File Server

Thank you for your interest in contributing to the Secure File Server project! We welcome contributions from developers of all skill levels.

## 🚀 Getting Started

### Prerequisites

- Node.js (v12 or higher)
- Git
- Basic knowledge of JavaScript and Express.js

### Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork:**

   ```bash
   git clone https://github.com/yourusername/secure-file-server.git
   cd secure-file-server
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Set up environment:**

   ```bash
   cp .env.example .env
   # Edit .env — generate bcrypt hashes for ADMIN_PASS_HASH and VIEWER_PASS_HASH:
   # node -e "require('bcrypt').hash('admin', 10).then(h => console.log(h))"
   ```

5. **TLS certificates** are auto-generated on first start (requires OpenSSL on PATH). The cert includes SANs for `localhost`, all detected LAN IPs, and your public IP. To force regeneration, delete `certs/cert.pem` and `certs/key.pem` and restart.

6. **Create storage directories** (if not present):

   ```bash
   mkdir -p uploads public
   ```

7. **Start the development server:**

   ```bash
   npm run dev
   ```

## 📝 Development Guidelines

### Code Standards

- Use consistent indentation (2 spaces)
- Follow camelCase naming convention
- CommonJS `require()` — not ES modules
- Route modules export `function(app, { deps })` and register routes on the Express app
- Utility/security functions go in the appropriate `src/` module
- Add new routes as modules under `src/routes/`
- Log with `log.info()` / `log.error()` / `log.warn()` / `log.debug()` from `src/utils.js`

### Security Considerations

- Always validate and sanitize user input
- Test for path traversal vulnerabilities
- Ensure rate limiting is respected
- Verify file type restrictions work correctly

### Testing Your Changes

Before submitting a PR, please test:

1. **Basic functionality:**
   - Server starts without errors
   - Root directory loads correctly
   - File downloads work

2. **Folder navigation:**
   - Can browse into subdirectories
   - Breadcrumb navigation works
   - Back navigation functions properly

3. **Security features:**
   - Path traversal attempts are blocked
   - Invalid file types are rejected
   - Rate limiting prevents abuse

4. **Edge cases:**
   - Empty directories display correctly
   - Large files download properly
   - Special characters in filenames are handled

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment details:**
   - Node.js version
   - Operating system
   - Browser (if web-related)

2. **Steps to reproduce:**
   - Detailed steps to recreate the issue
   - Expected vs actual behavior
   - Screenshots if applicable

3. **Error logs:**
   - Server console output
   - Browser console errors
   - Network tab information

## 💡 Feature Requests

For new features, please:

1. **Check existing issues** to avoid duplicates
2. **Describe the feature** and its benefits
3. **Consider security implications**
4. **Provide use cases** and examples

## 🔄 Pull Request Process

1. **Create a feature branch:**

   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Make your changes:**
   - Write clean, documented code
   - Test thoroughly
   - Update README if needed

3. **Commit your changes:**

   ```bash
   git add .
   git commit -m "Add amazing feature"
   ```

4. **Push to your fork:**

   ```bash
   git push origin feature/amazing-feature
   ```

5. **Create a Pull Request:**
   - Use a descriptive title
   - Explain what your changes do
   - Reference any related issues
   - Include testing information

### PR Requirements

- [ ] Code follows project standards
- [ ] All tests pass
- [ ] Security implications considered
- [ ] Documentation updated if needed
- [ ] No breaking changes (or clearly documented)

## 🏷️ Issue Labels

We use these labels to categorize issues:

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `security` - Security-related issues
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed

## 🤝 Code of Conduct

Please be respectful and considerate in all interactions:

- Use welcoming and inclusive language
- Respect differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what's best for the community

## 📞 Getting Help

If you need help with development:

1. Check the README.md for setup instructions
2. Look through existing issues and discussions
3. Create a new issue with the `help wanted` label
4. Join our discussions in the repository

## 🎯 Priority Areas

We're especially interested in contributions for:

- **Security enhancements** - Additional protection measures
- **Performance improvements** - Faster file serving and navigation
- **UI/UX improvements** - Better user interface and experience
- **Testing** - Unit tests and integration tests
- **Documentation** - Code comments and user guides
- **Mobile responsiveness** - Better mobile device support

Thank you for contributing to make this project better! 🚀
