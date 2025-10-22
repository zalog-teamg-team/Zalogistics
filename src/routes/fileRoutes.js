/**
 * File Routes
 *
 * Defines all file-related API endpoints
 */

const express = require("express");
const router = express.Router();
const fileController = require("../controllers/fileController");

// Save file (root level or in month directory)
router.put("/:name", (req, res, next) =>
  fileController.saveFile(req, res, next)
);
router.post("/:name", (req, res, next) =>
  fileController.saveFile(req, res, next)
);

// Save file in month subdirectory
router.put("/:monthdir/:name", (req, res, next) =>
  fileController.saveFile(req, res, next)
);
router.post("/:monthdir/:name", (req, res, next) =>
  fileController.saveFile(req, res, next)
);

// List files for a month
router.get("/list", (req, res, next) =>
  fileController.listFiles(req, res, next)
);

module.exports = router;
