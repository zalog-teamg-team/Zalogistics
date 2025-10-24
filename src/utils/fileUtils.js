/**
 * File Utilities
 *
 * Helper functions for file operations, validation, and versioning.
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const constants = require("../config/constants");

class FileUtils {
  /**
   * Validates and sanitizes a filename
   * @param {string} name - The filename to validate
   * @returns {string} - Sanitized filename with .json extension
   * @throws {Error} - If filename is invalid
   */
  static safeJsonName(name) {
    const fname = String(name || "").trim();
    const filename = fname.endsWith(".json") ? fname : `${fname}.json`;

    if (
      !constants.SAFE_FILENAME_REGEX.test(filename) ||
      filename.includes("..") ||
      /[\/\\]/.test(filename)
    ) {
      throw new Error(constants.ERRORS.INVALID_FILENAME);
    }

    return filename;
  }

  /**
   * Converts version to milliseconds timestamp
   * @param {number|string} version - Version number
   * @returns {number} - Version in milliseconds
   */
  static toMsVersion(version) {
    const n = Number(version || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n);
  }

  /**
   * Gets file version based on modification time
   * @param {string} filePath - Absolute path to file
   * @returns {Promise<number>} - Version timestamp in milliseconds
   */
  static async getFileVersion(filePath) {
    try {
      const st = await fsp.stat(filePath);
      return st.isFile() ? Math.floor(st.mtimeMs) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Writes file atomically using temp file and rename
   * @param {string} filePath - Absolute path to file
   * @param {string} content - Content to write
   * @returns {Promise<void>}
   */
  static async writeAtomic(filePath, content) {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });

    const tmp = `${dir}/.${path.basename(filePath)}.${
      process.pid
    }.${Date.now()}.tmp`;

    try {
      await fsp.writeFile(tmp, content, "utf8");
      await fsp.rename(tmp, filePath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fsp.unlink(tmp);
      } catch {}
      throw error;
    }
  }

  /**
   * Converts month display format (MM.YYYY) to YYYY-MM
   * @param {string} monthDisplay - Month in MM.YYYY format
   * @returns {string} - Month in YYYY-MM format
   */
  static monthDisplayToYM(monthDisplay) {
    const match = monthDisplay.match(constants.MONTH_DISPLAY_REGEX);
    return match ? `${match[2]}-${match[1]}` : "";
  }

  /**
   * Checks if a path exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   */
  static async pathExists(filePath) {
    try {
      await fsp.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Escapes special characters in a string for use in regex
   * @param {string} string - String to escape
   * @returns {string} - Escaped string
   */
  static escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Validates month display format
   * @param {string} monthDisplay - Month string to validate
   * @returns {boolean}
   */
  static isValidMonthDisplay(monthDisplay) {
    return constants.MONTH_DISPLAY_REGEX.test(monthDisplay);
  }

  /**
   * Gets file stats
   * @param {string} filePath - Path to file
   * @returns {Promise<object|null>} - File stats or null if not found
   */
  static async getFileStats(filePath) {
    try {
      return await fsp.stat(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Reads directory contents
   * @param {string} dirPath - Directory path
   * @param {object} options - Options for readdir
   * @returns {Promise<Array>} - Directory entries
   */
  static async readDirectory(dirPath, options = {}) {
    try {
      return await fsp.readdir(dirPath, options);
    } catch {
      return [];
    }
  }

  /**
   * Copies a file
   * @param {string} source - Source path
   * @param {string} dest - Destination path
   * @param {number} flags - Copy flags
   * @returns {Promise<void>}
   */
  static async copyFile(source, dest, flags = 0) {
    await fsp.copyFile(source, dest, flags);
  }

  /**
   * Sets file permissions
   * @param {string} filePath - File path
   * @param {number} mode - Permission mode
   * @returns {Promise<void>}
   */
  static async chmod(filePath, mode) {
    try {
      await fsp.chmod(filePath, mode);
    } catch {
      // Ignore chmod errors (may not work on all systems)
    }
  }
}

module.exports = FileUtils;
