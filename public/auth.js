// Tạo file public/auth.js
const auth = {
  getAccessToken() {
    return localStorage.getItem('accessToken');
  },
  
  async fetch(url, options = {}) {
    const token = this.getAccessToken();
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }
    return fetch(url, options);
  },
  
  requireAuth() {
    return !!this.getAccessToken();
  }
};

export default auth;
