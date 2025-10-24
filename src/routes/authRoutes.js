/**
 * Authentication Routes
 *
 * Defines authentication and user management endpoints
 */

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Public routes
router.post("/login", (req, res, next) => authController.login(req, res, next));
router.post("/refresh", (req, res, next) =>
  authController.refresh(req, res, next)
);
router.post("/verify", (req, res, next) =>
  authController.verifyToken(req, res, next)
);

// Protected routes (require authentication)
router.post("/logout", authenticateToken, (req, res, next) =>
  authController.logout(req, res, next)
);
router.get("/me", authenticateToken, (req, res, next) =>
  authController.getProfile(req, res, next)
);
router.post("/change-password", authenticateToken, (req, res, next) =>
  authController.changePassword(req, res, next)
);

// Admin-only routes
router.get(
  "/users",
  authenticateToken,
  requireRole("admin"),
  (req, res, next) => authController.getAllUsers(req, res, next)
);
router.post(
  "/users",
  authenticateToken,
  requireRole("admin"),
  (req, res, next) => authController.createUser(req, res, next)
);
router.put("/users/:id", authenticateToken, (req, res, next) =>
  authController.updateUser(req, res, next)
);
router.delete(
  "/users/:id",
  authenticateToken,
  requireRole("admin"),
  (req, res, next) => authController.deleteUser(req, res, next)
);

module.exports = router;
