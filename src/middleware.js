const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const express = require("express");
const compression = require("compression");

module.exports = function setupMiddleware(app) {
  // Response compression (gzip/brotli) for HTML, JSON, CSS, JS, text
  app.use(compression());

  // Generate a nonce per request for CSP
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
    next();
  });

  // Security middleware
  app.use((req, res, next) => {
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", `'nonce-${res.locals.cspNonce}'`],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })(req, res, next);
  });

  // Permissions-Policy: restrict access to sensitive browser APIs
  app.use((req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    next();
  });

  // Trust first proxy hop for rate limiting behind reverse proxies
  app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

  // Rate limiting
  const rateLimitWindowMs =
    Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

  const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  const downloadLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: Number(process.env.DOWNLOAD_RATE_LIMIT_MAX) || 20,
    message: "Too many download requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  const uploadLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 10,
    message: "Too many upload requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Strict limiter for auth endpoints (login, pairing, share password)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many attempts, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);

  // CORS configuration
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : false,
      credentials: false,
    }),
  );

  // Cookie parser (required for CSRF tokens)
  app.use(cookieParser());

  // Body parser size limits to prevent memory exhaustion
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  return { downloadLimiter, uploadLimiter, authLimiter };
};
