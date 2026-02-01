/**
 * Report Generator
 * Generates scraper run reports
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
  constructor(vendorId) {
    this.vendorId = vendorId;
    this.startTime = new Date();
    this.endTime = null;
    this.stats = {
      total_scraped: 0,
      new_products: 0,
      updated_products: 0,
      discontinued: 0,
      errors: 0,
      images_downloaded: 0
    };
    this.changes = [];
    this.errors = [];
    this.discontinued = [];
  }

  /**
   * Record a scraped product result
   */
  recordProduct(changeInfo) {
    this.stats.total_scraped++;

    if (changeInfo.isNew) {
      this.stats.new_products++;
    } else if (changeInfo.changes.length > 0) {
      this.stats.updated_products++;
    }

    if (changeInfo.changes.length > 0) {
      this.changes.push(changeInfo);
    }
  }

  /**
   * Record an error
   */
  recordError(error) {
    this.stats.errors++;
    this.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message || error,
      stack: error.stack
    });
  }

  /**
   * Record a discontinued product
   */
  recordDiscontinued(product) {
    this.stats.discontinued++;
    this.discontinued.push(product);
  }

  /**
   * Record image download
   */
  recordImageDownload() {
    this.stats.images_downloaded++;
  }

  /**
   * Complete the report
   */
  complete() {
    this.endTime = new Date();
  }

  /**
   * Get duration in seconds
   */
  getDuration() {
    const end = this.endTime || new Date();
    return Math.round((end - this.startTime) / 1000);
  }

  /**
   * Generate summary
   */
  getSummary() {
    return {
      vendor_id: this.vendorId,
      started_at: this.startTime.toISOString(),
      completed_at: this.endTime?.toISOString(),
      duration_seconds: this.getDuration(),
      status: this.stats.errors > 0 ? 'completed_with_errors' : 'completed',
      stats: this.stats,
      summary: {
        total: this.stats.total_scraped,
        new: this.stats.new_products,
        updated: this.stats.updated_products,
        discontinued: this.stats.discontinued,
        errors: this.stats.errors
      }
    };
  }

  /**
   * Generate full report object
   */
  getFullReport() {
    return {
      ...this.getSummary(),
      changes: this.changes,
      discontinued: this.discontinued,
      errors: this.errors
    };
  }

  /**
   * Save report to file
   */
  saveToFile(outputDir) {
    const timestamp = this.startTime.toISOString().replace(/[:.]/g, '-');
    const filename = `${this.vendorId}-${timestamp}.json`;
    const filepath = path.join(outputDir, filename);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(this.getFullReport(), null, 2));

    return filepath;
  }

  /**
   * Generate console-friendly output
   */
  toConsole() {
    const duration = this.getDuration();
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    let output = `
========================================
Scraper Report: ${this.vendorId.toUpperCase()}
========================================
Duration: ${minutes}m ${seconds}s
Status: ${this.stats.errors > 0 ? 'Completed with errors' : 'Completed'}

STATISTICS:
  Total Scraped:     ${this.stats.total_scraped}
  New Products:      ${this.stats.new_products}
  Updated Products:  ${this.stats.updated_products}
  Discontinued:      ${this.stats.discontinued}
  Images Downloaded: ${this.stats.images_downloaded}
  Errors:            ${this.stats.errors}
`;

    if (this.changes.length > 0) {
      output += `
CHANGES DETECTED (${this.changes.length}):
`;
      for (const change of this.changes.slice(0, 20)) {
        output += `  - ${change.sku}: ${change.changes.map(c => c.message).join('; ')}\n`;
      }
      if (this.changes.length > 20) {
        output += `  ... and ${this.changes.length - 20} more\n`;
      }
    }

    if (this.discontinued.length > 0) {
      output += `
POTENTIALLY DISCONTINUED (${this.discontinued.length}):
`;
      for (const product of this.discontinued.slice(0, 10)) {
        output += `  - ${product.sku}: ${product.name}\n`;
      }
      if (this.discontinued.length > 10) {
        output += `  ... and ${this.discontinued.length - 10} more\n`;
      }
    }

    if (this.errors.length > 0) {
      output += `
ERRORS (${this.errors.length}):
`;
      for (const error of this.errors.slice(0, 5)) {
        output += `  - ${error.message}\n`;
      }
      if (this.errors.length > 5) {
        output += `  ... and ${this.errors.length - 5} more\n`;
      }
    }

    output += `
========================================
`;
    return output;
  }
}

module.exports = ReportGenerator;
