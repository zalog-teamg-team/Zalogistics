// config.js — cấu hình chung cho API
// Mặc định: đọc JSON từ /filejson, ghi bằng PUT /api/filejson/<tên_file>
(function () {
  'use strict';

  // === Có thể chỉnh: ===
  var CONFIG = {
    BASE_URL: '',                 // '' => cùng domain hiện tại
    JSON_PREFIX: '/filejson',     // nơi chứa các file JSON tĩnh
    API_PREFIX: '/api/filejson',  // API ghi (PUT)
    TOKEN: ''                     // nếu server yêu cầu, đặt x-api-key tại đây
  };

  // Cho phép override qua global trước đó
  if (typeof window.APP_CONFIG === 'object') {
    CONFIG = Object.assign({}, CONFIG, window.APP_CONFIG);
  }
  window.APP_CONFIG = CONFIG;

  // Helper dựng URL
  function join(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a.replace(/\/+$/, '') + '/' + b.replace(/^\/+/, '');
  }

  window.API_URLS = {
    // Tên file tháng dạng Chamcong_MM_YYYY.json
    monthFile: function (m, y) {
      m = m || (new Date().getMonth() + 1);
      y = y || (new Date().getFullYear());
      var mm = String(m).padStart(2, '0');
      return 'Chamcong_' + mm + '_' + y + '.json';
    },
    readUrl: function (fileName) {
      return join(CONFIG.BASE_URL, join(CONFIG.JSON_PREFIX, fileName));
    },
    writeUrl: function (fileName) {
      return join(CONFIG.BASE_URL, join(CONFIG.API_PREFIX, fileName));
    },
    finalData: function () {
      return join(CONFIG.BASE_URL, join(CONFIG.JSON_PREFIX, 'final_data.json'));
    }
  };

  // Header chung cho fetch
  window.API_HEADERS = function () {
    var h = { 'Content-Type': 'application/json;charset=UTF-8' };
    if (CONFIG.TOKEN) h['x-api-key'] = CONFIG.TOKEN;
    return h;
  };

  console.log('[config] APP_CONFIG =', CONFIG);
})();
