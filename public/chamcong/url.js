// url.js — quản lý tháng/năm hiện tại + phát sự kiện khi đổi
(function () {
  'use strict';

  window.currentMonth = window.currentMonth || (new Date().getMonth() + 1);
  window.currentYear  = window.currentYear  || (new Date().getFullYear());

  function setMonth(m){
    m = +m;
    if (m>=1 && m<=12){
      window.currentMonth = m;
      window.dispatchEvent(new CustomEvent('month:changed', { detail:{m:m,y:window.currentYear} }));
    }
  }
  function setYear(y){
    y = +y;
    if (y>=2000 && y<=3000){
      window.currentYear = y;
      window.dispatchEvent(new CustomEvent('month:changed', { detail:{m:window.currentMonth,y:y} }));
    }
  }

  window.MonthAPI = { setMonth: setMonth, setYear: setYear };
})();
