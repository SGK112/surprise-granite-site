#!/usr/bin/env python3
"""
Create a dynamic product page based on the countertops template.
This loads product data from slabs.json and renders the same layout.
"""

import re

# Read the template
with open('/Users/homepc/surprise-granite-site/countertops/calacatta-abezzo-quartz/index.html', 'r') as f:
    template = f.read()

# Find the </head> tag and insert our data loading script before it
head_insert = '''
  <!-- Dynamic Product Loading -->
  <script>
    // This will be populated by the data loader
    window.PRODUCT_DATA = null;
  </script>
'''

template = template.replace('</head>', head_insert + '</head>')

# Update title to be dynamic
template = re.sub(
    r'<title>.*?</title>',
    '<title id="page-title">Loading... | Surprise Granite</title>',
    template
)

# Update meta description
template = re.sub(
    r'<meta name="description" content="[^"]*"/>',
    '<meta name="description" id="meta-description" content="Premium countertop surface from Surprise Granite."/>',
    template
)

# Update canonical URL
template = re.sub(
    r'<link rel="canonical" href="[^"]*"/>',
    '<link rel="canonical" id="canonical-url" href=""/>',
    template
)

# Update OG tags
template = re.sub(
    r'<meta property="og:url" content="[^"]*"/>',
    '<meta property="og:url" id="og-url" content=""/>',
    template
)
template = re.sub(
    r'<meta property="og:title" content="[^"]*"/>',
    '<meta property="og:title" id="og-title" content=""/>',
    template
)
template = re.sub(
    r'<meta property="og:description" content="[^"]*"/>',
    '<meta property="og:description" id="og-description" content=""/>',
    template
)
template = re.sub(
    r'<meta property="og:image" content="[^"]*"/>',
    '<meta property="og:image" id="og-image" content=""/>',
    template
)

# Update structured data - we'll replace it dynamically
template = re.sub(
    r'<script type="application/ld\+json">[\s\S]*?</script>',
    '<script type="application/ld+json" id="structured-data">{}</script>',
    template,
    count=1
)

# Find and replace the breadcrumb section
breadcrumb_pattern = r'<nav class="breadcrumb">[\s\S]*?</nav>'
breadcrumb_replacement = '''<nav class="breadcrumb" id="breadcrumb">
      <a href="/">Home</a>
      <span>&rsaquo;</span>
      <a href="/marketplace/slabs/">Slabs</a>
      <span>&rsaquo;</span>
      <span id="breadcrumb-material">Material</span>
      <span>&rsaquo;</span>
      <strong id="breadcrumb-product">Loading...</strong>
    </nav>'''
template = re.sub(breadcrumb_pattern, breadcrumb_replacement, template)

# Replace the gallery section
gallery_pattern = r'<div class="gallery">[\s\S]*?</div>\s*</div>\s*<!-- Product Info -->'
gallery_replacement = '''<div class="gallery">
        <div class="main-image-container" onclick="openLightbox(0)">
          <img id="mainImage" src="" alt="" class="main-image"/>
          <span class="image-badge" id="material-badge">Loading</span>
          <span class="zoom-hint">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM13 6.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z"/><path d="M10.344 11.742c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1 6.538 6.538 0 0 1-1.398 1.4z"/><path d="M6.5 3a.5.5 0 0 1 .5.5V6h2.5a.5.5 0 0 1 0 1H7v2.5a.5.5 0 0 1-1 0V7H3.5a.5.5 0 0 1 0-1H6V3.5a.5.5 0 0 1 .5-.5z"/></svg>
            Click to zoom
          </span>
        </div>
        <div class="thumbnails" id="thumbnails">
          <!-- Thumbnails populated dynamically -->
        </div>
      </div>

      <!-- Product Info -->'''
template = re.sub(gallery_pattern, gallery_replacement, template)

# Replace product info section (brand, title, etc.)
# This is complex so we'll target specific elements
template = re.sub(
    r'<span class="brand-name">[^<]*</span>',
    '<span class="brand-name" id="brand-name">Loading...</span>',
    template
)
template = re.sub(
    r'<h1 class="product-title">[^<]*</h1>',
    '<h1 class="product-title" id="product-title">Loading...</h1>',
    template
)
template = re.sub(
    r'<p class="product-subtitle">[^<]*</p>',
    '<p class="product-subtitle" id="product-subtitle">Premium Countertop</p>',
    template
)

# Replace tier badge
template = re.sub(
    r'<div class="calc-tier-badge[^"]*">[\s\S]*?</div>',
    '<div class="calc-tier-badge" id="tier-badge" style="display:none;"></div>',
    template,
    count=1
)

# Replace colors section
colors_pattern = r'<div class="colors-section">[\s\S]*?</div></div></div>'
colors_replacement = '<div class="colors-section" id="colors-section"></div>'
template = re.sub(colors_pattern, colors_replacement, template, count=1)

# Replace specs grid
specs_pattern = r'<div class="specs-grid">[\s\S]*?</div>\s*</div>\s*<!-- Inline Price'
specs_replacement = '''<div class="specs-grid" id="specs-grid">
          <!-- Specs populated dynamically -->
        </div>

        <!-- Inline Price'''
template = re.sub(specs_pattern, specs_replacement, template)

# Add loading overlay
loading_overlay = '''
  <!-- Loading Overlay -->
  <div id="loading-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:white;z-index:9999;display:flex;align-items:center;justify-content:center;">
    <div style="text-align:center;">
      <div style="width:40px;height:40px;border:3px solid #e5e5e5;border-top-color:#f9cb00;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
      <p style="color:#666;">Loading product...</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  </div>
'''

# Insert after <body>
template = template.replace('<body>', '<body>' + loading_overlay)

# Now add the main data loading script before </body>
data_loader_script = '''
<script>
(function() {
  // Get product handle and category from URL
  const params = new URLSearchParams(window.location.search);
  const handle = params.get('handle');
  const category = params.get('category') || 'slabs';

  if (!handle) {
    document.getElementById('loading-overlay').innerHTML = '<div style="text-align:center;padding:40px;"><h2>Product Not Found</h2><p>No product handle specified.</p><a href="/marketplace/slabs/" style="color:#f9cb00;">Browse all slabs</a></div>';
    return;
  }

  // Color mapping
  const colorHex = {
    'white': '#ffffff', 'black': '#1a1a1a', 'gray': '#808080', 'grey': '#808080',
    'gold': '#FFD700', 'brown': '#8B4513', 'beige': '#F5F5DC', 'cream': '#FFFDD0',
    'blue': '#4169E1', 'green': '#228B22', 'red': '#DC143C', 'pink': '#FFB6C1',
    'tan': '#D2B48C', 'silver': '#C0C0C0', 'taupe': '#483C32', 'ivory': '#FFFFF0',
    'charcoal': '#36454F', 'navy': '#000080', 'burgundy': '#800020', 'orange': '#FF8C00',
    'yellow': '#FFD700', 'purple': '#800080'
  };

  function getColorHex(name) {
    if (!name) return '#cccccc';
    return colorHex[name.toLowerCase()] || '#cccccc';
  }

  // Fetch product data
  fetch(`/data/${category}.json`)
    .then(res => res.json())
    .then(products => {
      const product = products.find(p => p.handle === handle);
      if (!product) {
        document.getElementById('loading-overlay').innerHTML = '<div style="text-align:center;padding:40px;"><h2>Product Not Found</h2><p>Could not find product: ' + handle + '</p><a href="/marketplace/slabs/" style="color:#f9cb00;">Browse all slabs</a></div>';
        return;
      }

      // Store for lightbox
      window.PRODUCT_DATA = product;
      window.productImages = product.images || [];

      // Update page title and meta
      const title = product.title || product.name || 'Product';
      const brand = product.brandDisplay || product.vendor || 'Premium Brand';
      const material = product.productType || 'Stone';
      const description = product.description || `Premium ${material} from ${brand}. Perfect for countertops, kitchen islands, and bathroom vanities.`;

      document.getElementById('page-title').textContent = `${title} | ${material} Countertops | Surprise Granite`;
      document.getElementById('meta-description').content = description;

      // Update OG tags
      const pageUrl = window.location.href;
      document.getElementById('og-url')?.setAttribute('content', pageUrl);
      document.getElementById('og-title')?.setAttribute('content', `${title} | ${material} Countertops`);
      document.getElementById('og-description')?.setAttribute('content', description);
      if (product.images && product.images[0]) {
        document.getElementById('og-image')?.setAttribute('content', product.images[0]);
      }

      // Update structured data
      const structuredData = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": title,
        "description": description,
        "image": product.images || [],
        "brand": { "@type": "Brand", "name": brand },
        "category": `${material} Countertops`,
        "material": material,
        "offers": {
          "@type": "Offer",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "seller": { "@type": "Organization", "name": "Surprise Granite", "url": "https://surprisegranite.com" }
        }
      };
      document.getElementById('structured-data').textContent = JSON.stringify(structuredData);

      // Update breadcrumb
      document.getElementById('breadcrumb-material').innerHTML = `<a href="/materials/countertops/${material.toLowerCase()}-countertops">${material}</a>`;
      document.getElementById('breadcrumb-product').textContent = title;

      // Update main image
      const mainImg = document.getElementById('mainImage');
      if (product.images && product.images.length > 0) {
        mainImg.src = product.images[0];
        mainImg.alt = title;
      }

      // Update material badge
      document.getElementById('material-badge').textContent = material;

      // Update thumbnails
      const thumbsContainer = document.getElementById('thumbnails');
      if (product.images && product.images.length > 0) {
        thumbsContainer.innerHTML = product.images.map((img, i) => `
          <div class="thumb ${i === 0 ? 'active' : ''}" onclick="changeImage(${i}, this)">
            <img src="${img}" alt="${title} view ${i + 1}"/>
          </div>
        `).join('');
      }

      // Update product info
      document.getElementById('brand-name').textContent = brand;
      document.getElementById('product-title').textContent = title;
      document.getElementById('product-subtitle').textContent = `Premium ${material} Countertop`;

      // Update tier badge based on brand tier
      const tierBadge = document.getElementById('tier-badge');
      if (product.brandTier) {
        const tierClasses = {
          'budget': 'budget-friendly',
          'mid': 'popular-choice',
          'premium': 'premium-select',
          'luxury': 'luxury-tier'
        };
        const tierLabels = {
          'budget': 'Budget Friendly',
          'mid': 'Popular Choice',
          'premium': 'Premium Select',
          'luxury': 'Luxury Tier'
        };
        tierBadge.className = 'calc-tier-badge ' + (tierClasses[product.brandTier] || 'popular-choice');
        tierBadge.innerHTML = `<svg fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg> ${tierLabels[product.brandTier] || 'Quality Selection'}`;
        tierBadge.style.display = 'inline-flex';
      }

      // Update colors section
      const colorsSection = document.getElementById('colors-section');
      if (product.primaryColor || product.accentColor) {
        let colorsHtml = '<div class="section-label">Colors</div><div class="color-swatches">';
        if (product.primaryColor) {
          colorsHtml += `<div class="color-swatch"><span class="swatch-dot" style="background: ${getColorHex(product.primaryColor)};"></span><span class="swatch-label">Primary: ${product.primaryColor}</span></div>`;
        }
        if (product.accentColor && product.accentColor !== product.primaryColor) {
          colorsHtml += `<div class="color-swatch"><span class="swatch-dot" style="background: ${getColorHex(product.accentColor)};"></span><span class="swatch-label">Accent: ${product.accentColor}</span></div>`;
        }
        colorsHtml += '</div>';
        colorsSection.innerHTML = colorsHtml;
      }

      // Update specs grid
      const specsGrid = document.getElementById('specs-grid');
      let specsHtml = '';
      specsHtml += `<div class="spec-item"><span class="spec-label">Material</span><span class="spec-value">${material}</span></div>`;
      if (product.style) {
        specsHtml += `<div class="spec-item"><span class="spec-label">Style</span><span class="spec-value">${product.style}</span></div>`;
      }
      specsHtml += `<div class="spec-item"><span class="spec-label">Thickness</span><span class="spec-value">2cm, 3cm</span></div>`;
      specsHtml += `<div class="spec-item"><span class="spec-label">Finish</span><span class="spec-value">Polished</span></div>`;
      specsGrid.innerHTML = specsHtml;

      // Update description tab
      const descTab = document.getElementById('description');
      if (descTab) {
        const descContent = descTab.querySelector('p') || descTab;
        if (description && description.length > 20) {
          descContent.innerHTML = `<p>${description}</p>`;
        }
      }

      // Hide loading overlay
      document.getElementById('loading-overlay').style.display = 'none';
    })
    .catch(err => {
      console.error('Error loading product:', err);
      document.getElementById('loading-overlay').innerHTML = '<div style="text-align:center;padding:40px;"><h2>Error Loading Product</h2><p>Please try again later.</p><a href="/marketplace/slabs/" style="color:#f9cb00;">Browse all slabs</a></div>';
    });
})();
</script>
'''

template = template.replace('</body>', data_loader_script + '</body>')

# Write the output
with open('/Users/homepc/surprise-granite-site/marketplace/product/index.html', 'w') as f:
    f.write(template)

print("Dynamic product page created successfully!")
print("Location: /marketplace/product/index.html")
