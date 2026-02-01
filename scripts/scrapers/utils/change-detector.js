/**
 * Change Detector
 * Compares scraped data with existing data to detect changes
 */

class ChangeDetector {
  constructor(existingProducts = []) {
    this.existingMap = new Map();

    for (const product of existingProducts) {
      const key = this.normalizeKey(product.sku || product.product_sku);
      if (key) {
        this.existingMap.set(key, product);
      }
    }
  }

  /**
   * Normalize SKU for comparison
   */
  normalizeKey(sku) {
    if (!sku) return null;
    return sku.toString().toLowerCase().trim().replace(/\s+/g, '-');
  }

  /**
   * Detect changes between scraped and existing product
   */
  detectChanges(scrapedProduct) {
    const key = this.normalizeKey(scrapedProduct.sku);
    const existing = this.existingMap.get(key);

    const changes = {
      sku: scrapedProduct.sku,
      name: scrapedProduct.name,
      isNew: !existing,
      isDiscontinued: false,
      priceChanged: false,
      imageChanged: false,
      dataChanged: false,
      changes: []
    };

    if (!existing) {
      changes.changes.push({ field: 'product', type: 'new', message: 'New product detected' });
      return changes;
    }

    // Check price
    if (scrapedProduct.price !== undefined) {
      const oldPrice = existing.wholesale_cost || existing.price || existing.unit_price;
      if (oldPrice && Math.abs(scrapedProduct.price - parseFloat(oldPrice)) > 0.01) {
        changes.priceChanged = true;
        changes.changes.push({
          field: 'price',
          type: 'changed',
          old: oldPrice,
          new: scrapedProduct.price,
          message: `Price: $${oldPrice} -> $${scrapedProduct.price}`
        });
      }
    }

    // Check images
    if (scrapedProduct.images?.length > 0) {
      const oldImages = existing.images || existing.image_urls || [];
      const newImages = scrapedProduct.images;

      if (JSON.stringify(oldImages) !== JSON.stringify(newImages)) {
        changes.imageChanged = true;
        changes.changes.push({
          field: 'images',
          type: 'changed',
          old: oldImages.length,
          new: newImages.length,
          message: `Images updated (${oldImages.length} -> ${newImages.length})`
        });
      }
    }

    // Check name
    if (scrapedProduct.name && existing.name !== scrapedProduct.name) {
      changes.dataChanged = true;
      changes.changes.push({
        field: 'name',
        type: 'changed',
        old: existing.name,
        new: scrapedProduct.name,
        message: `Name: "${existing.name}" -> "${scrapedProduct.name}"`
      });
    }

    // Check other fields
    const fieldsToCheck = ['color', 'material', 'thickness', 'category'];
    for (const field of fieldsToCheck) {
      if (scrapedProduct[field] && existing[field] !== scrapedProduct[field]) {
        changes.dataChanged = true;
        changes.changes.push({
          field,
          type: 'changed',
          old: existing[field],
          new: scrapedProduct[field],
          message: `${field}: "${existing[field]}" -> "${scrapedProduct[field]}"`
        });
      }
    }

    return changes;
  }

  /**
   * Find products that exist in DB but weren't scraped (potentially discontinued)
   */
  findMissingProducts(scrapedSkus) {
    const scrapedSet = new Set(scrapedSkus.map(s => this.normalizeKey(s)));
    const missing = [];

    for (const [key, product] of this.existingMap) {
      if (!scrapedSet.has(key)) {
        missing.push({
          sku: product.sku || product.product_sku,
          name: product.name || product.product_name,
          product_id: product.id,
          reason: 'not_found_in_scrape'
        });
      }
    }

    return missing;
  }
}

module.exports = ChangeDetector;
