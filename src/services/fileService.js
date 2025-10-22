/**
 * File Service
 *
 * Handles all file-related operations including:
 * - Saving files (with versioning)
 * - Reading files
 * - File metadata
 * - Directory listing
 */

const path = require("path");
const FileUtils = require("../utils/fileUtils");
const config = require("../config/app.config");
const constants = require("../config/constants");

class FileService {
  constructor() {
    this.dataDir = config.paths.dataDir;
  }

  /**
   * Saves a JSON file with optional versioning and month-specific copy
   * @param {object} options - Save options
   * @param {string} options.fileName - File name
   * @param {string} options.monthDir - Optional month directory (MM.YYYY)
   * @param {object} options.data - Data to save
   * @param {number} options.clientVersion - Client's version for conflict detection
   * @param {string} options.monthVersion - Optional month version for creating monthly copy
   * @returns {Promise<object>} - Save result with metadata
   */
  async saveFile({ fileName, monthDir, data, clientVersion, monthVersion }) {
    const fname = FileUtils.safeJsonName(fileName);

    // Determine file path
    let filePath;
    if (monthDir && FileUtils.isValidMonthDisplay(monthDir)) {
      const subDir = path.join(this.dataDir, monthDir);
      filePath = path.join(subDir, fname);
    } else {
      filePath = path.join(this.dataDir, fname);
    }

    // Check for conflicts
    if (clientVersion) {
      const currentVersion = await FileUtils.getFileVersion(filePath);
      const clientVer = FileUtils.toMsVersion(clientVersion);

      if (currentVersion && clientVer && clientVer !== currentVersion) {
        throw new Error(constants.ERRORS.CONFLICT);
      }
    }

    // Write file
    const text = JSON.stringify(data || {}, null, 2);
    await FileUtils.writeAtomic(filePath, text);

    // Create month-versioned copy if requested
    let monthVersioned = null;
    if (monthVersion && FileUtils.isValidMonthDisplay(monthVersion)) {
      monthVersioned = await this._createMonthVersionedCopy(
        fname,
        text,
        monthVersion
      );
    }

    // Get file metadata
    const version = await FileUtils.getFileVersion(filePath);
    const urlPath = monthDir
      ? `/filejson/${monthDir}/${fname}`
      : `/filejson/${fname}`;

    return {
      ok: true,
      file: fname,
      url: urlPath,
      bytes: Buffer.byteLength(text),
      version,
      saved_at: Math.floor(Date.now() / 1000),
      month_version: monthVersioned,
    };
  }

  /**
   * Creates a month-versioned copy of a file
   * @private
   */
  async _createMonthVersionedCopy(fileName, content, monthDisplay) {
    const baseName = fileName.replace(/\.json$/, "");
    const monthFileName = `${baseName}.${monthDisplay}.json`;
    const monthSubDir = path.join(this.dataDir, monthDisplay);
    const monthFilePath = path.join(monthSubDir, monthFileName);

    const fileExists = await FileUtils.pathExists(monthFilePath);
    await FileUtils.writeAtomic(monthFilePath, content);

    return {
      file: monthFileName,
      url: `/filejson/${monthDisplay}/${monthFileName}`,
      version: await FileUtils.getFileVersion(monthFilePath),
      is_new: !fileExists,
    };
  }

  /**
   * Checks if a file exists and returns metadata
   * @param {string} fileName - File name to check
   * @returns {Promise<object>} - File metadata or {exists: false}
   */
  async checkFileExists(fileName) {
    const fname = FileUtils.safeJsonName(fileName);
    const filePath = path.join(this.dataDir, fname);
    const stats = await FileUtils.getFileStats(filePath);

    if (!stats) {
      return { exists: false };
    }

    return {
      exists: true,
      size: stats.size,
      modified: stats.mtime,
      version: Math.floor(stats.mtimeMs),
    };
  }

  /**
   * Lists all JSON files for a specific month
   * @param {string} monthDisplay - Month in MM.YYYY format
   * @returns {Promise<object>} - List of files with metadata
   */
  async listMonthFiles(monthDisplay) {
    if (!FileUtils.isValidMonthDisplay(monthDisplay)) {
      throw new Error(constants.ERRORS.INVALID_MONTH);
    }

    const dir = path.join(this.dataDir, monthDisplay);
    const stats = await FileUtils.getFileStats(dir);

    if (!stats?.isDirectory()) {
      return { ok: true, dir: monthDisplay, count: 0, items: [] };
    }

    const pattern = new RegExp(
      `^(.+)\\.${FileUtils.escapeRegExp(monthDisplay)}\\.json$`
    );
    const entries = await FileUtils.readDirectory(dir, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

      const match = entry.name.match(pattern);
      if (!match) continue;

      const filePath = path.join(dir, entry.name);
      const fileStats = await FileUtils.getFileStats(filePath);
      if (!fileStats) continue;

      items.push({
        name: entry.name,
        title: match[1],
        url: `/filejson/${encodeURIComponent(
          monthDisplay
        )}/${encodeURIComponent(entry.name)}`,
        size: fileStats.size,
        version: Math.floor(fileStats.mtimeMs),
      });
    }

    items.sort((a, b) => a.title.localeCompare(b.title, "vi"));

    return {
      ok: true,
      dir: monthDisplay,
      count: items.length,
      items,
    };
  }

  /**
   * Gets the absolute path to the data directory
   * @returns {string}
   */
  getDataDir() {
    return this.dataDir;
  }
}

module.exports = new FileService();
