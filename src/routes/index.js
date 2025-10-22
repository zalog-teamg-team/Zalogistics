/**
 * Main Router
 *
 * Aggregates all route modules and exports a single router
 */

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");

// Import route modules
const authRoutes = require("./authRoutes");
const fileRoutes = require("./fileRoutes");
const monthRoutes = require("./monthRoutes");
const zonesRoutes = require("./zonesRoutes");
const proxyRoutes = require("./proxyRoutes");
const utilRoutes = require("./utilRoutes");

// Public routes (no authentication required)
router.use("/auth", authRoutes);

// Protected routes (require authentication)
router.use("/filejson", authenticateToken, fileRoutes);
router.use("/month", authenticateToken, monthRoutes);
router.use("/zones", authenticateToken, zonesRoutes);
router.use("/proxy", authenticateToken, proxyRoutes);
router.use("/", authenticateToken, utilRoutes);

module.exports = router;
