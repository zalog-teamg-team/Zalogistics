/**
 * Zone Routes
 *
 * Defines all zone-related API endpoints
 */

const express = require("express");
const router = express.Router();
const zonesController = require("../controllers/zonesController");

// Load zones
router.get("/load", (req, res, next) =>
  zonesController.loadZones(req, res, next)
);

// Save zones
router.post("/save", (req, res, next) =>
  zonesController.saveZones(req, res, next)
);

module.exports = router;
