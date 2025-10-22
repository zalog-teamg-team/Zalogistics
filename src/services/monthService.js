/**
 * Month Service
 *
 * Handles month-related operations including:
 * - Building new month directories from templates
 * - Copying template files
 * - Renaming files with month suffix
 */

const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const FileUtils = require("../utils/fileUtils");
const config = require("../config/app.config");
const constants = require("../config/constants");

class MonthService {
  constructor() {
    this.dataDir = config.paths.dataDir;
    this.templateDir = path.join(this.dataDir, constants.MONTH_TEMPLATE_FOLDER);
  }

  /**
   * Builds a new month directory from the template
   * @param {string} monthDisplay - Month in MM.YYYY format
   * @returns {Promise<object>} - Build result with status and counts
   */
  async buildMonth(monthDisplay) {
    // Validate month format
    if (!FileUtils.isValidMonthDisplay(monthDisplay)) {
      throw new Error(constants.ERRORS.INVALID_MONTH);
    }

    // Check if template directory exists
    const templateStats = await FileUtils.getFileStats(this.templateDir);
    if (!templateStats?.isDirectory()) {
      throw new Error(constants.ERRORS.TEMPLATE_NOT_FOUND);
    }

    const destDir = path.join(this.dataDir, monthDisplay);
    const existed = await FileUtils.pathExists(destDir);

    // Create destination directory
    await fsp.mkdir(destDir, { recursive: true });

    // Copy files and track counts
    const counts = {
      files_copied: 0,
      files_skipped: 0,
      files_renamed: 0,
      files_removed: 0,
    };

    await this._copyAllFiles(this.templateDir, destDir, counts);
    await this._renameJsonFiles(destDir, monthDisplay, counts);

    // Determine status
    let status = existed ? "exists" : "created";
    if (existed && counts.files_copied > 0) {
      status = "exists-updated";
    }

    const ym = FileUtils.monthDisplayToYM(monthDisplay);

    return {
      ok: true,
      status,
      dest: monthDisplay,
      month: ym,
      counts,
    };
  }

  /**
   * Recursively copies all files from source to destination
   * @private
   */
  async _copyAllFiles(src, dest, counts) {
    const entries = await fsp.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fsp.mkdir(destPath, { recursive: true });
        await this._copyAllFiles(srcPath, destPath, counts);
      } else {
        // Handle JSON file duplication check
        if (entry.name.endsWith(".json")) {
          const isDuplicate = await this._checkDuplicateJson(dest, entry.name);
          if (isDuplicate) {
            counts.files_skipped++;
            continue;
          }
        }

        try {
          await FileUtils.copyFile(
            srcPath,
            destPath,
            fs.constants.COPYFILE_EXCL
          );
          await FileUtils.chmod(destPath, 0o644);
          counts.files_copied++;
        } catch (err) {
          if (err.code === "EEXIST") {
            counts.files_skipped++;
          } else {
            throw err;
          }
        }
      }
    }
  }

  /**
   * Checks if a duplicate JSON file exists (by base name)
   * @private
   */
  async _checkDuplicateJson(dir, fileName) {
    const baseName = fileName.replace(/(?:\.[0-9]{2}\.[0-9]{4})?\.json$/, "");
    const existingFiles = await FileUtils.readDirectory(dir);
    const pattern = new RegExp(
      `^${FileUtils.escapeRegExp(baseName)}(?:\\.[0-9]{2}\\.[0-9]{4})?\\.json$`
    );

    return existingFiles.some((file) => pattern.test(file));
  }

  /**
   * Renames JSON files to include month suffix
   * @private
   */
  async _renameJsonFiles(dir, monthDisplay, counts) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        await this._renameJsonFiles(fullPath, monthDisplay, counts);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        !entry.name.includes(`.${monthDisplay}.`)
      ) {
        await this._renameFileWithMonth(dir, entry.name, monthDisplay, counts);
      }
    }
  }

  /**
   * Renames a single file to include month suffix
   * @private
   */
  async _renameFileWithMonth(dir, fileName, monthDisplay, counts) {
    const baseName = fileName.replace(/\.json$/, "");
    const newName = `${baseName}.${monthDisplay}.json`;
    const oldPath = path.join(dir, fileName);
    const newPath = path.join(dir, newName);

    // Check if a file with month version already exists
    const dirEntries = await fsp.readdir(dir);
    const basePattern = new RegExp(
      `^${FileUtils.escapeRegExp(baseName)}\\.[0-9]{2}\\.[0-9]{4}\\.json$`
    );
    const fileExists = dirEntries.some((filename) =>
      basePattern.test(filename)
    );

    if (fileExists) {
      // Remove the template file if month version exists
      try {
        await fsp.unlink(oldPath);
        counts.files_removed++;
      } catch {}
    } else {
      // Rename to include month suffix
      try {
        await fsp.rename(oldPath, newPath);
        counts.files_renamed++;
      } catch (err) {
        // If rename fails, just log it but don't throw
        console.warn(`Failed to rename ${fileName}:`, err.message);
      }
    }
  }

  /**
   * Gets list of all available months
   * @returns {Promise<Array<string>>} - Array of month directories
   */
  async getAvailableMonths() {
    const entries = await FileUtils.readDirectory(this.dataDir, {
      withFileTypes: true,
    });

    return entries
      .filter(
        (entry) =>
          entry.isDirectory() && FileUtils.isValidMonthDisplay(entry.name)
      )
      .map((entry) => entry.name)
      .sort((a, b) => {
        // Sort by year then month
        const [monthA, yearA] = a.split(".");
        const [monthB, yearB] = b.split(".");
        return yearA === yearB
          ? monthA.localeCompare(monthB)
          : yearA.localeCompare(yearB);
      });
  }
}

module.exports = new MonthService();
