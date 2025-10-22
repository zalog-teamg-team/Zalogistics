/**
 * File Controller
 *
 * Handles HTTP requests for file operations
 */

const fileService = require("../services/fileService");
const FileUtils = require("../utils/fileUtils");

class FileController {
  /**
   * Saves a file (handles both PUT and POST)
   */
  async saveFile(req, res, next) {
    try {
      const { monthdir, name } = req.params;
      const fileName = name || monthdir;

      // Get client version from headers or body
      const clientVersion =
        FileUtils.toMsVersion(req.headers["x-version"]) ||
        FileUtils.toMsVersion(req.body?.__version);

      // Get month version from query params
      const monthVersion = req.query.monthversion?.trim();

      const result = await fileService.saveFile({
        fileName,
        monthDir: name ? monthdir : undefined,
        data: req.body || {},
        clientVersion,
        monthVersion,
      });

      // Add Last-Modified header
      res.header("Last-Modified", new Date(result.version).toUTCString());
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Checks if a file exists and returns metadata
   */
  async checkExists(req, res, next) {
    try {
      const { name } = req.params;
      const result = await fileService.checkFileExists(name);

      if (result.exists) {
        res.header("Last-Modified", result.modified.toUTCString());
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lists all files for a specific month
   */
  async listFiles(req, res, next) {
    try {
      const monthDisplay = String(req.query.md || "").trim();
      const result = await fileService.listMonthFiles(monthDisplay);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FileController();
