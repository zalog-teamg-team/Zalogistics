/**
 * Month Controller
 *
 * Handles HTTP requests for month operations
 */

const monthService = require("../services/monthService");

class MonthController {
  /**
   * Builds a new month directory from template
   * This replaces the old build.php functionality
   */
  async buildMonth(req, res, next) {
    try {
      const monthDisplay = String(req.query.monthdisplay || "").trim();
      const result = await monthService.buildMonth(monthDisplay);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Gets list of all available months
   */
  async listMonths(req, res, next) {
    try {
      const months = await monthService.getAvailableMonths();
      res.json({
        ok: true,
        count: months.length,
        months,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MonthController();
