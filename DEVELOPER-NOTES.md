# Surprise Granite Site - Developer Notes

## Overview

This site is exported from Webflow and hosted on Render. The Webflow export includes JavaScript chunks that expect specific DOM elements to exist. Modifying the HTML structure can break these scripts.

---

## The Shop Page Fix (What We Learned)

### The Problem
- Original shop page had Webflow Swiper carousels that were broken
- Products wouldn't load, JavaScript errors in console
- Webflow JS threw "t is not a function" errors

### Why Simple HTML Replacement Failed
The Webflow JavaScript (`webflow.schunk.*.js` files) expects specific DOM elements. When we tried to:
1. Remove sections entirely - page went blank
2. Replace HTML content - JavaScript broke
3. Change the structure - errors everywhere

### The Solution: Hide, Don't Remove

**Key Insight**: Instead of removing Webflow sections, hide them with CSS and add new content.

```css
/* Hide the original section */
.section_contact23 { display: none !important; }
```

This keeps the DOM elements Webflow JS expects while making them invisible.

### Step-by-Step Process We Used

1. **Start with a working page as template**
   - We copied `contact-us.html` which was working perfectly
   - This preserved all header, footer, navigation, and Webflow JS

2. **Hide unwanted sections with CSS**
   ```css
   .section_contact23 { display: none !important; }
   ```

3. **Add new content after `<main class="main-wrapper">`**
   - Inject your custom HTML right after the main wrapper opens
   - This puts content in the right place in the page flow

4. **Add scripts before `</body></html>`**
   - Custom JavaScript goes at the end
   - Shopify SDK, custom interactions, etc.

5. **Test incrementally**
   - Make one change, refresh, verify it works
   - Don't make multiple changes at once

---

## File Structure

```
surprise-granite-site/
├── index.html              # Homepage
├── shop/
│   └── index.html          # Shop page (rebuilt)
├── shop-new/
│   └── index.html          # Shop page backup/development
├── contact-us.html         # Contact page (good template)
├── get-a-free-estimate.html
├── materials/
│   └── premium-sinks.html
├── countertops/
│   └── [stone-name]/
│       └── index.html      # Individual stone pages
├── css/
│   └── mobile-optimizations.css
└── js/
    └── [webflow files]
```

---

## Shopify Integration

### Buy Button SDK Setup

```javascript
(function(){
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";
  s.onload = function(){
    var client = ShopifyBuy.buildClient({
      domain: "surprise-granite.myshopify.com",
      storefrontAccessToken: "17a4557623df390a5a866c7640ec021a"
    });

    ShopifyBuy.UI.onReady(client).then(function(ui){
      // Create collection component
      ui.createComponent("collection", {
        id: "276721336455",  // Collection ID from Shopify
        node: document.getElementById("collection-featured"),
        moneyFormat: "%24%7B%7Bamount%7D%7D",
        options: {
          product: {
            contents: { img: true, title: true, price: true, button: true },
            text: { button: "Add to Cart" },
            styles: {
              button: { "background-color": "#cca600" }
            }
          }
        }
      });
    });
  };
  document.head.appendChild(s);
})();
```

### Shopify Credentials
- **Domain**: surprise-granite.myshopify.com
- **Storefront Access Token**: 17a4557623df390a5a866c7640ec021a
- **Collection IDs**:
  - Featured Products: `276721336455`
  - Sinks: `275066290311`
  - Countertop Samples: `278939041927`

---

## Side Tab Component (Reusable)

The slide-out estimate form tab we built:

### HTML (place right after `<body>`)

```html
<!-- Side Tab - Free Estimate -->
<div class="side-tab" id="sideTab">
    <div class="side-tab-handle" id="sideTabHandle">
        <span>FREE</span> ESTIMATE
    </div>
</div>
<div class="side-tab-overlay" id="sideTabOverlay"></div>
<div class="side-tab-panel" id="sideTabPanel">
    <div class="side-tab-panel-header">
        <h3>Get Your Free Estimate</h3>
        <button class="side-tab-close" id="sideTabClose">&times;</button>
    </div>
    <div class="side-tab-form">
        <form action="/get-a-free-estimate" method="get">
            <input type="text" name="name" placeholder="Your Name" required>
            <input type="email" name="email" placeholder="Email Address" required>
            <input type="tel" name="phone" placeholder="Phone Number" required>
            <select name="project">
                <option value="">Select Project Type</option>
                <option value="kitchen">Kitchen Countertops</option>
                <option value="bathroom">Bathroom Vanity</option>
                <option value="other">Other</option>
            </select>
            <textarea name="message" rows="3" placeholder="Tell us about your project..."></textarea>
            <button type="submit">Request Free Estimate</button>
        </form>
        <p>Or call us: <a href="tel:+16028333189">(602) 833-3189</a></p>
    </div>
</div>
```

### CSS

```css
.side-tab {
    position: fixed;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 9999;
}
.side-tab-handle {
    background: #1a1a1a;
    color: #fff;
    padding: 15px 8px;
    border-radius: 0 8px 8px 0;
    cursor: pointer;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 1px;
    box-shadow: 2px 0 10px rgba(0,0,0,0.15);
}
.side-tab-handle:hover { background: #333; }
.side-tab-handle span { color: #cca600; }

.side-tab-panel {
    position: fixed;
    left: -320px;
    top: 0;
    width: 320px;
    height: 100%;
    background: #fff;
    box-shadow: 4px 0 20px rgba(0,0,0,0.15);
    transition: left 0.3s ease;
    z-index: 10000;
    overflow-y: auto;
}
.side-tab-panel.open { left: 0; }

.side-tab-panel-header {
    background: #1a1a1a;
    color: #fff;
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.side-tab-panel-header h3 { margin: 0; font-size: 18px; }
.side-tab-close {
    background: none;
    border: none;
    color: #fff;
    font-size: 24px;
    cursor: pointer;
}

.side-tab-form { padding: 20px; }
.side-tab-form input,
.side-tab-form textarea,
.side-tab-form select {
    width: 100%;
    padding: 12px;
    margin-bottom: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
}
.side-tab-form input:focus,
.side-tab-form textarea:focus,
.side-tab-form select:focus {
    outline: none;
    border-color: #cca600;
}
.side-tab-form button {
    width: 100%;
    background: #cca600;
    color: #fff;
    border: none;
    padding: 14px;
    border-radius: 6px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
}
.side-tab-form button:hover { background: #b89500; }

.side-tab-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.4);
    z-index: 9998;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s;
}
.side-tab-overlay.open { opacity: 1; visibility: visible; }

@media (max-width: 480px) {
    .side-tab-panel { width: 100%; left: -100%; }
}
```

### JavaScript

```javascript
(function(){
    var handle = document.getElementById('sideTabHandle');
    var panel = document.getElementById('sideTabPanel');
    var overlay = document.getElementById('sideTabOverlay');
    var close = document.getElementById('sideTabClose');

    function toggle() {
        panel.classList.toggle('open');
        overlay.classList.toggle('open');
    }

    handle.addEventListener('click', toggle);
    overlay.addEventListener('click', toggle);
    close.addEventListener('click', toggle);
})();
```

---

## Building New Pages

### Method 1: Copy a Working Page (Recommended)

1. Copy `contact-us.html` or another working page
2. Rename appropriately
3. Update the `<title>` tag
4. Hide unwanted sections with CSS:
   ```css
   .section_[original-section-class] { display: none !important; }
   ```
5. Add your new content after `<main class="main-wrapper">`
6. Test locally before deploying

### Method 2: Modify Existing Page

1. Identify the section class you want to replace
2. Add CSS to hide it (don't remove the HTML)
3. Add your new HTML content
4. Keep all Webflow scripts intact

### Important Rules

1. **Never remove Webflow script tags** - they're required
2. **Keep the page-wrapper and main-wrapper structure**
3. **Hide sections with CSS, don't delete them**
4. **Place fixed elements (like side tab) right after `<body>`** - not nested inside Webflow containers
5. **Test incrementally** - one change at a time
6. **Always backup before major changes**

---

## Local Development

### Start Local Server

```bash
cd /Users/homepc/surprise-granite-site
python3 -m http.server 8080
```

Then visit: http://localhost:8080

### Testing Changes

1. Make edits to HTML files
2. Hard refresh browser: `Cmd + Shift + R`
3. Check browser console for JavaScript errors
4. Test all interactive elements

---

## Deployment

The site auto-deploys from GitHub to Render.

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "description of changes"

# Push to deploy
git push origin main
```

Render will automatically rebuild and deploy within a few minutes.

---

## Brand Colors

- **Gold/Accent**: #cca600
- **Dark/Primary**: #1a1a1a
- **Hover Gold**: #b89500
- **Light Background**: #f8f9fa
- **Text Gray**: #555

---

## Common Issues & Solutions

### Page Goes Blank
- Check browser console for JS errors
- Verify you didn't remove required DOM elements
- Try reverting to backup and making smaller changes

### Styles Not Applying
- Check CSS specificity - may need `!important`
- Verify the element isn't being overridden by Webflow CSS
- Use browser dev tools to inspect computed styles

### Fixed Elements Not Showing
- Place them directly after `<body>`, not inside Webflow containers
- Check z-index (use 9999+ for fixed overlays)
- Verify no parent has `overflow: hidden`

### Shopify Products Not Loading
- Check browser console for CORS or script errors
- Verify the storefront access token is correct
- Make sure the collection ID exists

---

## Files Modified in Shop Page Fix

1. `/shop/index.html` - Main shop page (rebuilt)
2. `/shop-new/index.html` - Development/backup copy
3. `/shop/index.html.backup` - Original backup

---

## Contact

- **Phone**: (602) 833-3189
- **Website**: surprisegranite.com
- **Shopify Admin**: surprise-granite.myshopify.com/admin
