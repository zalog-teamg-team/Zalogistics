/**
 * Authentication Service
 *
 * Handles user authentication, JWT token generation/verification,
 * and role-based access control
 */

const jwt = require("jsonwebtoken");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

// JWT Configuration
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const JWT_EXPIRES_IN = "24h"; // Token expiration
const REFRESH_TOKEN_EXPIRES_IN = "7d"; // Refresh token expiration

// User roles hierarchy
const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  USER: "user",
};

const ROLE_HIERARCHY = {
  admin: 3,
  manager: 2,
  user: 1,
};

class AuthService {
  constructor() {
    this.usersFile = path.join(__dirname, "../config/users.json");
    this.users = null;
    this.refreshTokens = new Map(); // In-memory refresh token storage
  }

  /**
   * Load users from configuration file
   */
  async loadUsers() {
    try {
      const data = await fs.readFile(this.usersFile, "utf8");
      this.users = JSON.parse(data);
      return this.users;
    } catch (error) {
      console.error("Error loading users:", error.message);
      // Return default admin user if file doesn't exist
      this.users = {
        users: [
          {
            id: 1,
            username: "admin",
            password: this.hashPassword("admin123"), // Default password
            fullName: "Administrator",
            role: ROLES.ADMIN,
            email: "admin@logistics.local",
            active: true,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      await this.saveUsers();
      return this.users;
    }
  }

  /**
   * Save users to configuration file
   */
  async saveUsers() {
    try {
      await fs.writeFile(
        this.usersFile,
        JSON.stringify(this.users, null, 2),
        "utf8"
      );
    } catch (error) {
      console.error("Error saving users:", error.message);
      throw new Error("Failed to save user data");
    }
  }

  /**
   * Hash password using SHA-256
   */
  hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  /**
   * Authenticate user credentials
   */
  async authenticate(username, password) {
    if (!this.users) {
      await this.loadUsers();
    }

    const user = this.users.users.find((u) => u.username === username);

    if (!user) {
      throw new Error("Invalid username or password");
    }

    if (!user.active) {
      throw new Error("Account is deactivated");
    }

    const hashedPassword = this.hashPassword(password);
    if (user.password !== hashedPassword) {
      throw new Error("Invalid username or password");
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Store refresh token
    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      username: user.username,
      createdAt: Date.now(),
    });

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      type: "refresh",
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new Error("Token expired");
      }
      throw new Error("Invalid token");
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    // Verify refresh token exists
    if (!this.refreshTokens.has(refreshToken)) {
      throw new Error("Invalid refresh token");
    }

    // Verify token signature
    const decoded = this.verifyToken(refreshToken);

    if (decoded.type !== "refresh") {
      throw new Error("Invalid token type");
    }

    // Get user
    if (!this.users) {
      await this.loadUsers();
    }

    const user = this.users.users.find((u) => u.id === decoded.id);
    if (!user || !user.active) {
      throw new Error("User not found or inactive");
    }

    // Generate new access token
    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Logout - invalidate refresh token
   */
  logout(refreshToken) {
    if (refreshToken) {
      this.refreshTokens.delete(refreshToken);
    }
    return true;
  }

  /**
   * Check if user has required role
   */
  hasRole(userRole, requiredRole) {
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Remove sensitive data from user object
   */
  sanitizeUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers() {
    if (!this.users) {
      await this.loadUsers();
    }
    return this.users.users.map((u) => this.sanitizeUser(u));
  }

  /**
   * Create new user (admin only)
   */
  async createUser(userData) {
    if (!this.users) {
      await this.loadUsers();
    }

    // Check if username already exists
    const exists = this.users.users.find(
      (u) => u.username === userData.username
    );
    if (exists) {
      throw new Error("Username already exists");
    }

    const newUser = {
      id: Math.max(...this.users.users.map((u) => u.id), 0) + 1,
      username: userData.username,
      password: this.hashPassword(userData.password),
      fullName: userData.fullName,
      role: userData.role || ROLES.USER,
      email: userData.email || "",
      active: true,
      createdAt: new Date().toISOString(),
    };

    this.users.users.push(newUser);
    await this.saveUsers();

    return this.sanitizeUser(newUser);
  }

  /**
   * Update user (admin or self)
   */
  async updateUser(userId, updates) {
    if (!this.users) {
      await this.loadUsers();
    }

    const userIndex = this.users.users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    const user = this.users.users[userIndex];

    // Update allowed fields
    if (updates.fullName) user.fullName = updates.fullName;
    if (updates.email) user.email = updates.email;
    if (updates.password) user.password = this.hashPassword(updates.password);
    if (updates.role && Object.values(ROLES).includes(updates.role)) {
      user.role = updates.role;
    }
    if (typeof updates.active === "boolean") user.active = updates.active;

    user.updatedAt = new Date().toISOString();

    await this.saveUsers();
    return this.sanitizeUser(user);
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId) {
    if (!this.users) {
      await this.loadUsers();
    }

    const userIndex = this.users.users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    // Prevent deleting the last admin
    const user = this.users.users[userIndex];
    if (user.role === ROLES.ADMIN) {
      const adminCount = this.users.users.filter(
        (u) => u.role === ROLES.ADMIN
      ).length;
      if (adminCount <= 1) {
        throw new Error("Cannot delete the last admin user");
      }
    }

    this.users.users.splice(userIndex, 1);
    await this.saveUsers();

    return true;
  }

  /**
   * Change password
   */
  async changePassword(userId, oldPassword, newPassword) {
    if (!this.users) {
      await this.loadUsers();
    }

    const user = this.users.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error("User not found");
    }

    const hashedOldPassword = this.hashPassword(oldPassword);
    if (user.password !== hashedOldPassword) {
      throw new Error("Current password is incorrect");
    }

    user.password = this.hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();

    await this.saveUsers();
    return true;
  }
}

// Export singleton instance
module.exports = new AuthService();
module.exports.ROLES = ROLES;
