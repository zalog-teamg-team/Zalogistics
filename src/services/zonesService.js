/**
 * Zones Service
 *
 * Handles zone data operations including:
 * - Loading zones
 * - Saving zones with versioning
 * - Conflict detection
 */

const path = require("path");
const fsp = require("fs").promises;
const FileUtils = require("../utils/fileUtils");
const config = require("../config/app.config");
const constants = require("../config/constants");

class ZonesService {
  constructor() {
    this.zonesFile = path.join(config.paths.dataDir, constants.ZONES_FILE);
  }

  /**
   * Loads zones data from file
   * @returns {Promise<object>} - Zones data with header and zones array
   */
  async loadZones() {
    const stats = await FileUtils.getFileStats(this.zonesFile);

    if (!stats) {
      return {
        ok: true,
        header: { version: "1.0", type: "zones" },
        zones: [],
        version: 0,
      };
    }

    const text = await fsp.readFile(this.zonesFile, "utf8");
    const json = JSON.parse(text);

    // Support both formats: {zones: [...]} or [...]
    const zones = Array.isArray(json?.zones)
      ? json.zones
      : Array.isArray(json)
      ? json
      : [];

    return {
      ok: true,
      header: json.header || { version: "1.0", type: "zones" },
      zones,
      version: Math.floor(stats.mtimeMs),
    };
  }

  /**
   * Saves zones data to file
   * @param {object} options - Save options
   * @param {Array} options.zones - Array of zones to save
   * @param {number} options.clientVersion - Client's version for conflict detection
   * @returns {Promise<object>} - Save result with metadata
   */
  async saveZones({ zones, clientVersion }) {
    // Check for conflicts
    if (clientVersion) {
      const currentVersion = await FileUtils.getFileVersion(this.zonesFile);
      const clientVer = FileUtils.toMsVersion(clientVersion);

      if (currentVersion && clientVer && clientVer !== currentVersion) {
        throw new Error(constants.ERRORS.CONFLICT);
      }
    }

    // Validate zones data
    const zonesArray = Array.isArray(zones) ? zones : [];

    // Create payload with header
    const payload = {
      header: {
        version: "1.0",
        type: "zones",
        savedAt: new Date().toISOString(),
        app: "css-map",
      },
      zones: zonesArray,
    };

    // Write file atomically
    const text = JSON.stringify(payload, null, 2);
    await FileUtils.writeAtomic(this.zonesFile, text);

    // Get new version
    const version = await FileUtils.getFileVersion(this.zonesFile);

    return {
      ok: true,
      file: constants.ZONES_FILE,
      url: `/filejson/${constants.ZONES_FILE}`,
      version,
      saved_at: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Gets zones file version
   * @returns {Promise<number>} - File version timestamp
   */
  async getZonesVersion() {
    return await FileUtils.getFileVersion(this.zonesFile);
  }
}

module.exports = new ZonesService();
