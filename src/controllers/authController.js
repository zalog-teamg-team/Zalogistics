/**
 * Authentication Controller
 *
 * Handles HTTP requests for authentication endpoints
 */

const authService = require("../services/authService");

class AuthController {
  /**
   * Login endpoint
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: "Username and password are required",
        });
      }

      const result = await authService.authenticate(username, password);

      res.json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh token endpoint
   * POST /api/auth/refresh
   */
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: "Refresh token is required",
        });
      }

      const result = await authService.refreshAccessToken(refreshToken);

      res.json({
        success: true,
        message: "Token refreshed successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout endpoint
   * POST /api/auth/logout
   */
  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      authService.logout(refreshToken);

      res.json({
        success: true,
        message: "Logout successful",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  async getProfile(req, res, next) {
    try {
      // User is attached by auth middleware
      res.json({
        success: true,
        data: req.user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change password
   * POST /api/auth/change-password
   */
  async changePassword(req, res, next) {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Old and new passwords are required",
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters",
        });
      }

      await authService.changePassword(req.user.id, oldPassword, newPassword);

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all users (admin only)
   * GET /api/auth/users
   */
  async getAllUsers(req, res, next) {
    try {
      const users = await authService.getAllUsers();

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create new user (admin only)
   * POST /api/auth/users
   */
  async createUser(req, res, next) {
    try {
      const { username, password, fullName, role, email } = req.body;

      if (!username || !password || !fullName) {
        return res.status(400).json({
          success: false,
          message: "Username, password, and full name are required",
        });
      }

      const user = await authService.createUser({
        username,
        password,
        fullName,
        role,
        email,
      });

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user (admin or self)
   * PUT /api/auth/users/:id
   */
  async updateUser(req, res, next) {
    try {
      const userId = parseInt(req.params.id);
      const updates = req.body;

      // Check if user can update this profile
      if (req.user.role !== "admin" && req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          message: "You can only update your own profile",
        });
      }

      // Non-admin users cannot change role
      if (req.user.role !== "admin" && updates.role) {
        delete updates.role;
      }

      const user = await authService.updateUser(userId, updates);

      res.json({
        success: true,
        message: "User updated successfully",
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user (admin only)
   * DELETE /api/auth/users/:id
   */
  async deleteUser(req, res, next) {
    try {
      const userId = parseInt(req.params.id);

      // Prevent deleting self
      if (req.user.id === userId) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete your own account",
        });
      }

      await authService.deleteUser(userId);

      res.json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify token (for debugging)
   * POST /api/auth/verify
   */
  async verifyToken(req, res, next) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: "Token is required",
        });
      }

      const decoded = authService.verifyToken(token);

      res.json({
        success: true,
        data: decoded,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
