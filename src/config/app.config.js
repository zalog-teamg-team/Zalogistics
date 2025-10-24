/**
 * Application Configuration
 *
 * Centralized configuration for the logistics application.
 * All settings can be overridden via environment variables.
 */

const path = require("path");

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.BIND || "127.0.0.1",
    env: process.env.NODE_ENV || "development",
  },

  // CORS Configuration
  cors: {
    allowOrigin: process.env.ALLOW_ORIGIN || "*",
    allowMethods: "GET,POST,PUT,OPTIONS",
    allowHeaders: "Content-Type, x-api-key, x-version",
  },

  // Data Directory Configuration
  paths: {
    // Base data directory
    dataDir: process.env.DATA_DIR || path.join(__dirname, "../../filejson"),

    // Public directory for static files
    publicDir: path.join(__dirname, "../../public"),

    // Root directory
    rootDir: path.join(__dirname, "../../"),
  },

  // File Upload Limits
  upload: {
    jsonLimit: "20mb",
  },

  // External API Configuration
  api: {
    // Google Apps Script URL
    googleSheetsUrl:
      process.env.GAS_URL ||
      "https://script.google.com/macros/s/AKfycbyX6ipz7UA0LwDJKlMvRaRXfzo0R1BP_GMO2PaRlQAYcxxhnDdC7CO6DSduhrMDIhZ8Fw/exec",

    // GPS API Configuration
    gps: {
      baseUrl: "https://gps-api.eup.net.vn/gateway2/zalogistics",
      consumerId: process.env.GPS_CONSUMER_ID || "QQnbP59SEjt4PEVaKr3I",
      apiKey: process.env.GPS_API_KEY || "236799fb-1490-42af-b4cb-3399386c1cb4",
    },
  },

  // Cache Configuration
  cache: {
    enabled: process.env.CACHE_ENABLED !== "false",
    maxAge: parseInt(process.env.CACHE_MAX_AGE || "0", 10),
  },
};

module.exports = config;
