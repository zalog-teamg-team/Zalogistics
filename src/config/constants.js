/**
 * Application Constants
 *
 * Defines all constant values used throughout the application.
 */

const constants = {
  // File Naming Patterns
  SAFE_FILENAME_REGEX: /^[\p{L}\p{N}_. \-]+$/u,

  // Month Display Format: MM.YYYY (e.g., 01.2025, 12.2025)
  MONTH_DISPLAY_REGEX: /^(0[1-9]|1[0-2])\.(20\d{2})$/,

  // File Extensions
  JSON_EXTENSION: ".json",

  // Special Filenames
  ZONES_FILE: "zones.json",
  FINAL_DATA_FILE: "final_data.json",

  // Template Folder
  MONTH_TEMPLATE_FOLDER: "month_template",

  // File Types for Monthly Data (English names, URL-friendly)
  MONTHLY_FILE_TYPES: {
    CHAM_CONG: "Chamcong",
    CHUYEN: "Chuyen",
    CONG_NO: "Congno",
    LOG_CHUYEN: "Logchuyen",
    LUONG_CHUYEN: "Luongchuyen",
    LUONG_THANG: "Luongthang",
    MUC_LUONG: "Mucluong",
  },

  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
  },

  // Error Messages
  ERRORS: {
    INVALID_FILENAME: "Invalid filename format",
    INVALID_MONTH: "Month display must be in MM.YYYY format",
    INVALID_YEAR: "Invalid year",
    TEMPLATE_NOT_FOUND: "Template folder not found",
    FILE_NOT_FOUND: "File not found",
    CONFLICT: "File has been modified by another process",
    INVALID_JSON: "Invalid JSON data",
    INVALID_DATA_FORMAT: "Invalid data format",
  },
};

module.exports = constants;
