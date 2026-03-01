// TODO #27: Email Notification on Transfer
const nodemailer = require("nodemailer");
const { log, escapeHtml } = require("../utils");

// Only create transporter if SMTP is configured
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

module.exports = function registerEmailRoutes(app, { auth, csrf }) {
  const { requireRole } = auth;
  const { doubleCsrfProtection } = csrf;

  // Send a share link via email
  app.post(
    "/send-email",
    requireRole("admin"),
    doubleCsrfProtection,
    async (req, res) => {
      if (!transporter) {
        return res
          .status(503)
          .json({ error: "Email not configured. Set SMTP_HOST in .env" });
      }

      const { to, subject, shareUrl, filename } = req.body;
      if (!to || typeof to !== "string" || !shareUrl) {
        return res.status(400).json({ error: "to and shareUrl are required" });
      }

      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const emailSubject =
        subject || `File shared with you: ${filename || "Download"}`;
      const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(45deg, #2196F3, #21CBF3); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">📁 File Shared With You</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
          ${filename ? `<p><strong>File:</strong> ${escapeHtml(filename)}</p>` : ""}
          <p><a href="${escapeHtml(shareUrl)}" style="display: inline-block; background: #4caf50; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Download File</a></p>
          <p style="color: #666; font-size: 0.9rem;">This link may expire. Download promptly.</p>
        </div>
      </div>
    `;

      try {
        await transporter.sendMail({
          from:
            process.env.SMTP_FROM ||
            process.env.SMTP_USER ||
            "noreply@fileserver.local",
          to,
          subject: emailSubject,
          html,
        });
        log.info(`Email sent to ${to} for ${filename || shareUrl}`);
        res.json({ success: true, message: `Email sent to ${to}` });
      } catch (err) {
        log.error("Email send error:", err.message);
        res.status(500).json({ error: "Failed to send email" });
      }
    },
  );
};
