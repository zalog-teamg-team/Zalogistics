/**
 * Logistics Management System - API Server
 *
 * A professional Node.js application for managing logistics data,
 * including file management, monthly reports, zones, and GPS tracking.
 *
 * This is the main entry point of the application.
 */

// Load environment variables FIRST
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

// Import configuration
const config = require("./src/config/app.config");

// Import middleware
const corsMiddleware = require("./src/middleware/cors");
const {
  errorHandler,
  notFoundHandler,
} = require("./src/middleware/errorHandler");

// Import routes
const apiRoutes = require("./src/routes");

// Initialize Express app
const app = express();

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

// Parse JSON bodies (with size limit)
app.use(express.json({ limit: config.upload.jsonLimit }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use(corsMiddleware);

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

// Serve static files from public directory first (for auth.js, etc.)
app.use(
  express.static(config.paths.publicDir, {
    index: false,
    etag: true,
    maxAge: config.cache.maxAge,
  })
);

// Serve static files from root directory (for backward compatibility)
app.use(
  express.static(config.paths.rootDir, {
    index: false,
    etag: true,
    maxAge: config.cache.maxAge,
  })
);

// Serve data directory at /filejson endpoint
app.use(
  "/filejson",
  express.static(config.paths.dataDir, {
    index: false,
    etag: true,
    cacheControl: false,
    dotfiles: "ignore",
    maxAge: config.cache.maxAge,
  })
);

// ============================================================================
// API ROUTES
// ============================================================================

// For backward compatibility with old build.php endpoint
const monthController = require("./src/controllers/monthController");
app.get("/api/filejson/build.php", (req, res, next) => {
  monthController.buildMonth(req, res, next);
});

// Mount all API routes under /api
app.use("/api", apiRoutes);

// ============================================================================
// ROOT ENDPOINT
// ============================================================================

// Serve index.html at root
app.get("/", (req, res) => {
  res.sendFile(path.join(config.paths.rootDir, "index.html"));
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler (must be after all other routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Ensure data directory exists
fs.mkdirSync(config.paths.dataDir, { recursive: true });

// Start server
app.listen(config.server.port, config.server.host, () => {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Logistics Management System - API Server");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log(
    `  ✅ Server running at: http://${config.server.host}:${config.server.port}`
  );
  console.log(`  📁 Data directory:    ${config.paths.dataDir}`);
  console.log(`  🌍 Environment:       ${config.server.env}`);
  console.log("");
  console.log("  API Endpoints:");
  console.log("    - File Management:  /api/filejson/*");
  console.log("    - Month Building:   /api/month/*");
  console.log("    - Zones:            /api/zones/*");
  console.log("    - Proxy Services:   /api/proxy/*");
  console.log("    - Health Check:     /api/health");
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\nSIGINT signal received: closing HTTP server");
  process.exit(0);
});

module.exports = app;
