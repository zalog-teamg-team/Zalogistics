/**
 * Month Routes
 *
 * Defines all month-related API endpoints
 */

const express = require("express");
const router = express.Router();
const monthController = require("../controllers/monthController");

// Build a new month from template (replaces build.php)
router.get("/build", (req, res, next) =>
  monthController.buildMonth(req, res, next)
);

// List all available months
router.get("/list", (req, res, next) =>
  monthController.listMonths(req, res, next)
);

module.exports = router;
