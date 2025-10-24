/**
 * Frontend Authentication Module
 * 
 * Handles client-side authentication, token management, and user state
 */

class Auth {
  constructor() {
    this.tokenKey = 'accessToken';
    this.userKey = 'userData';
    this.loginPage = '/login.html';
  }

  /**
   * Get stored authentication token
   * @returns {string|null} JWT token or null if not found
   */
  getToken() {
    try {
      return localStorage.getItem(this.tokenKey);
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  }

  /**
   * Get stored user data
   * @returns {object|null} User object or null if not found
   */
  getUser() {
    try {
      const userData = localStorage.getItem(this.userKey);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error getting user data:', error);
      return null;
    }
  }

  /**
   * Save authentication data to localStorage
   * @param {string} token - JWT access token
   * @param {object} user - User data object
   */
  saveAuth(token, user) {
    try {
      localStorage.setItem(this.tokenKey, token);
      localStorage.setItem(this.userKey, JSON.stringify(user));
    } catch (error) {
      console.error('Error saving auth data:', error);
      throw new Error('Failed to save authentication data');
    }
  }

  /**
   * Clear all authentication data
   */
  clearAuth() {
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
    } catch (error) {
      console.error('Error clearing auth data:', error);
    }
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} True if authenticated, false otherwise
   */
  isAuthenticated() {
    const token = this.getToken();
    const user = this.getUser();
    return !!(token && user);
  }

  /**
   * Require authentication - redirect to login if not authenticated
   * @returns {boolean} True if authenticated, false if redirecting
   */
  requireAuth() {
    if (!this.isAuthenticated()) {
      // Store current page to redirect back after login
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== this.loginPage) {
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }
      window.location.href = this.loginPage;
      return false;
    }
    return true;
  }

  /**
   * Logout - clear authentication and redirect to login
   */
  logout() {
    this.clearAuth();
    window.location.href = this.loginPage;
  }

  /**
   * Authenticated fetch wrapper
   * Adds Authorization header with Bearer token and handles 401/403 responses
   * @param {string} url - Request URL
   * @param {object} options - Fetch options
   * @returns {Promise<Response>} Fetch response
   */
  async fetch(url, options = {}) {
    const token = this.getToken();
    
    if (!token) {
      console.warn('No auth token available for request:', url);
      this.logout();
      throw new Error('Authentication required');
    }

    // Add Authorization header
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await window.fetch(url, options);

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        console.warn('Authentication failed, logging out');
        this.logout();
        throw new Error('Authentication failed');
      }

      return response;
    } catch (error) {
      // If it's a network error, just rethrow
      if (error.message === 'Authentication failed' || error.message === 'Authentication required') {
        throw error;
      }
      // For other errors, log and rethrow
      console.error('Fetch error:', error);
      throw error;
    }
  }

  /**
   * Update user display elements in the UI
   * Updates: userDisplay, userRole, userFullName, userEmail
   */
  updateUserDisplay() {
    const user = this.getUser();
    
    if (!user) {
      console.warn('No user data available to display');
      return;
    }

    // Update user display name
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
      userDisplay.textContent = user.username || 'User';
    }

    // Update user role badge
    const userRole = document.getElementById('userRole');
    if (userRole) {
      userRole.textContent = user.role || 'user';
    }

    // Update user full name
    const userFullName = document.getElementById('userFullName');
    if (userFullName) {
      userFullName.textContent = user.fullName || user.username || 'User';
    }

    // Update user email
    const userEmail = document.getElementById('userEmail');
    if (userEmail) {
      userEmail.textContent = user.email || '';
    }
  }

  /**
   * Login method
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<object>} Login response data
   */
  async login(username, password) {
    try {
      const response = await window.fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      if (!data.success) {
        throw new Error(data.message || 'Login failed');
      }

      // Save authentication data
      const { accessToken, user } = data.data;
      this.saveAuth(accessToken, user);

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Legacy method for compatibility
   * @returns {string|null} Access token
   */
  getAccessToken() {
    return this.getToken();
  }
}

// Export singleton instance
const auth = new Auth();
export default auth;
