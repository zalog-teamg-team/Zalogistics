// public/auth.js - Authentication module for Zalog-hung
class AuthManager {
  constructor() {
    this.tokenKey = 'accessToken';
    this.userKey = 'user';
    this.refreshKey = 'refreshToken';
  }

  getAccessToken() {
    return localStorage.getItem(this.tokenKey);
  }

  getUser() {
    try {
      const userStr = localStorage.getItem(this.userKey);
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      return null;
    }
  }

  isAuthenticated() {
    return !!this.getAccessToken() && !!this.getUser();
  }

  async login(username, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      if (data.success && data.data) {
        localStorage.setItem(this.tokenKey, data.data.accessToken);
        localStorage.setItem(this.userKey, JSON.stringify(data.data.user));
        localStorage.setItem(this.refreshKey, data.data.refreshToken);
        return data.data;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async logout() {
    const token = this.getAccessToken();
    const refreshToken = localStorage.getItem(this.refreshKey);

    if (token && refreshToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.refreshKey);
    window.location.href = '/';
  }

  async fetch(url, options = {}) {
    const token = this.getAccessToken();
    
    if (!token) {
      throw new Error('No access token available');
    }

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.logout();
      throw new Error('Token expired');
    }

    return response;
  }

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  updateUserDisplay() {
    const user = this.getUser();
    if (user) {
      const userNameEl = document.getElementById('userName');
      const userEmailEl = document.getElementById('userEmail');
      if (userNameEl) userNameEl.textContent = user.fullName || user.username;
      if (userEmailEl) userEmailEl.textContent = user.email || '';
    }
  }
}

const auth = new AuthManager();
export default auth;
