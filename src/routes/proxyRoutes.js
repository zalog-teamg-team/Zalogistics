/**
 * Proxy Routes
 *
 * Defines all proxy-related API endpoints for external services
 */

const express = require("express");
const router = express.Router();
const proxyController = require("../controllers/proxyController");

// Google Sheets proxy
router.post("/sheets", (req, res, next) =>
  proxyController.googleSheets(req, res, next)
);

// GPS tracking proxy
router.post("/gps/:endpoint", (req, res, next) =>
  proxyController.gpsTracking(req, res, next)
);

module.exports = router;
