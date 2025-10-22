/**
 * Zones Controller
 *
 * Handles HTTP requests for zone operations
 */

const zonesService = require("../services/zonesService");
const FileUtils = require("../utils/fileUtils");

class ZonesController {
  /**
   * Loads zones data
   */
  async loadZones(req, res, next) {
    try {
      const result = await zonesService.loadZones();
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Saves zones data
   */
  async saveZones(req, res, next) {
    try {
      // Get client version from headers or body
      const clientVersion =
        FileUtils.toMsVersion(req.headers["x-version"]) ||
        FileUtils.toMsVersion(req.body?.__version);

      // Get zones from body
      const zones = Array.isArray(req.body?.zones)
        ? req.body.zones
        : Array.isArray(req.body)
        ? req.body
        : [];

      const result = await zonesService.saveZones({
        zones,
        clientVersion,
      });

      // Add Last-Modified header
      res.header("Last-Modified", new Date(result.version).toUTCString());
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ZonesController();
