/**
 * Utility Routes
 *
 * Defines utility endpoints (health check, file exists, etc.)
 */

const express = require("express");
const router = express.Router();
const fileController = require("../controllers/fileController");
const proxyController = require("../controllers/proxyController");

// Health check
router.get("/health", (req, res) => proxyController.healthCheck(req, res));

// Check if file exists
router.get("/exists/:name", (req, res, next) =>
  fileController.checkExists(req, res, next)
);

module.exports = router;
