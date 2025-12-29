#!/usr/bin/env python3
"""
Update product pages with consistent header/nav and footer from homepage.
This script replaces the simplified headers/footers on product pages with the full versions.
"""

import os
import re
import glob
from pathlib import Path

# Full header/nav HTML (matching homepage style)
FULL_HEADER = '''<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-P3XFDN8"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>

<div class="navbar-fixed_wrapper">
  <nav class="navbar_wrapper">
    <!-- Top Banner -->
    <div class="navbar-banner_component">
      <div class="navbar-banner_content-left">
        <a href="/get-a-free-estimate" class="showroom-hours_link w-inline-block">
          <div class="text-style-muted">Free</div>
          <div class="showroom-hours_tag"><div class="text-size-tiny">In-Home Estimate</div></div>
        </a>
        <a href="tel:+16028333189" class="button is-clear-link is-icon w-inline-block hide-tablet">
          <span class="text-color-yellow">📞</span>
          <span class="text-weight-bold text-color-white">Call (602) 833-3189</span>
        </a>
      </div>
      <div class="navbar-banner_content-right">
        <a href="tel:+16028333189" class="button is-clear-link is-icon w-inline-block show-tablet">
          <span class="text-weight-bold text-color-white">📞 (602) 833-3189</span>
        </a>
        <div class="button-group hide-mobile-landscape">
          <a href="https://form.jotform.com/232358852404053" target="_blank">Create Account</a>
          <a href="https://go.thryv.com/site/surprisegranite" target="_blank">Client Portal</a>
        </div>
      </div>
    </div>

    <!-- Main Navbar -->
    <div class="navbar_component" role="banner">
      <div class="navbar_container">
        <div class="navbar_top-row">
          <div class="navbar_menu-top-left">
            <!-- Mobile Menu Button -->
            <div class="hidden-desktop">
              <button class="navbar_menu-button" id="mobile-menu-toggle" aria-label="Toggle menu">
                <div class="menu-icon">
                  <span class="menu-icon_line"></span>
                  <span class="menu-icon_line"></span>
                  <span class="menu-icon_line"></span>
                </div>
              </button>
            </div>

            <!-- Logo -->
            <a href="/" class="navbar_logo-link">
              <div class="navbar_logo-wrapper">
                <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg"
                     loading="lazy" alt="Surprise Granite Logo" class="navbar_logo" height="32"/>
                <span class="navbar_tagline">Marble & Quartz</span>
              </div>
            </a>

            <!-- Search Bar -->
            <div class="nav-search_component hide-mobile-landscape">
              <form class="nav-search_form" action="/search" method="get">
                <input type="text" name="q" class="form-input is-nav-search"
                       placeholder="Search countertops, services, products..."
                       autocomplete="off" aria-label="Search"/>
                <button type="submit" class="search-btn" aria-label="Search">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                </button>
              </form>
            </div>
          </div>

          <!-- Desktop Navigation Links -->
          <div class="navbar_menu-top-right hide-tablet">
            <nav class="navbar_nav-links">
              <a href="/" class="navbar_link">Home</a>
              <a href="/shop" class="navbar_link">Shop</a>
              <div class="navbar_dropdown">
                <a href="/company/all-services" class="navbar_link">Services ▾</a>
                <div class="navbar_dropdown-menu">
                  <a href="/services/home/kitchen-remodeling-arizona">Kitchen Remodeling</a>
                  <a href="/services/home/bathroom-remodeling-arizona">Bathroom Remodeling</a>
                  <a href="/service/countertop-installation-arizona">Countertop Installation</a>
                  <a href="/service/sink-installation-arizona">Sink Installation</a>
                </div>
              </div>
              <div class="navbar_dropdown">
                <a href="/materials_all-countertops.html" class="navbar_link">Countertops ▾</a>
                <div class="navbar_dropdown-menu">
                  <a href="/materials_all-countertops.html">All Countertops</a>
                  <a href="/countertops/quartz-countertops">Quartz</a>
                  <a href="/countertops/granite-countertops">Granite</a>
                  <a href="/countertops/marble-countertops">Marble</a>
                  <a href="/countertops/porcelain-countertops">Porcelain</a>
                </div>
              </div>
              <div class="navbar_dropdown">
                <a href="#" class="navbar_link">Tools ▾</a>
                <div class="navbar_dropdown-menu">
                  <a href="/tools/countertop-edge-visualizer">Edge Visualizer</a>
                  <a href="/tools/interior-design-gallery">Design Gallery</a>
                  <a href="/ai-visualizer.html">AI Visualizer</a>
                </div>
              </div>
              <div class="navbar_dropdown">
                <a href="/company/about-us" class="navbar_link">Company ▾</a>
                <div class="navbar_dropdown-menu">
                  <a href="/company/about-us">About Us</a>
                  <a href="/company/reviews">Reviews</a>
                  <a href="/company/project-gallery">Project Gallery</a>
                  <a href="/company/vendors-list">Our Vendors</a>
                  <a href="/company/faq-center">FAQ</a>
                </div>
              </div>
              <a href="/blog" class="navbar_link">Blog</a>
              <a href="/commercial" class="navbar_link">Commercial</a>
            </nav>
          </div>

          <!-- CTA Buttons -->
          <div class="navbar_cta-wrapper">
            <a href="/get-a-free-estimate" class="button is-primary">Get a Free Estimate</a>
          </div>
        </div>
      </div>
    </div>
  </nav>
</div>

<!-- Mobile Menu Overlay -->
<div class="mobile-menu-overlay" id="mobile-menu">
  <div class="mobile-menu-header">
    <a href="/" class="mobile-logo">
      <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg" alt="Surprise Granite" height="28"/>
    </a>
    <button class="mobile-menu-close" id="mobile-menu-close" aria-label="Close menu">✕</button>
  </div>
  <nav class="mobile-menu-nav">
    <a href="/">Home</a>
    <a href="/shop">Shop</a>
    <a href="/company/all-services">Services</a>
    <a href="/materials_all-countertops.html">Countertops</a>
    <a href="/company/about-us">Company</a>
    <a href="/blog">Blog</a>
    <a href="/commercial">Commercial</a>
    <a href="/contact-us">Contact</a>
    <a href="/get-a-free-estimate" class="mobile-cta">Get Free Estimate</a>
    <a href="tel:+16028333189" class="mobile-phone">📞 (602) 833-3189</a>
  </nav>
</div>
'''

# Full footer HTML (matching homepage style)
FULL_FOOTER = '''
<!-- Full Footer -->
<footer class="simple-footer">
  <div class="footer-cta">
    <h2>Ready to Start Your Project?</h2>
    <p>Free estimates for Phoenix metro homeowners</p>
    <div class="footer-cta-btns">
      <a href="/get-a-free-estimate" class="btn-footer-primary">Get Free Estimate</a>
      <a href="tel:+16028333189" class="btn-footer-secondary">📞 (602) 833-3189</a>
    </div>
  </div>

  <div class="footer-main">
    <div class="footer-grid">
      <div class="footer-col">
        <h4>Countertops</h4>
        <a href="/materials_all-countertops.html">All Countertops</a>
        <a href="/countertops/quartz-countertops">Quartz Countertops</a>
        <a href="/countertops/granite-countertops">Granite Countertops</a>
        <a href="/countertops/marble-countertops">Marble Countertops</a>
        <a href="/countertops/porcelain-countertops">Porcelain Countertops</a>
      </div>
      <div class="footer-col">
        <h4>Services</h4>
        <a href="/services/home/kitchen-remodeling-arizona">Kitchen Remodeling</a>
        <a href="/services/home/bathroom-remodeling-arizona">Bathroom Remodeling</a>
        <a href="/service/countertop-installation-arizona">Countertop Installation</a>
        <a href="/service/sink-installation-arizona">Sink Installation</a>
        <a href="/commercial">Commercial Services</a>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <a href="/company/about-us">About Us</a>
        <a href="/company/reviews">Reviews</a>
        <a href="/company/project-gallery">Project Gallery</a>
        <a href="/company/vendors-list">Our Vendors</a>
        <a href="/company/faq-center">FAQ</a>
        <a href="/contact-us">Contact Us</a>
      </div>
      <div class="footer-col">
        <h4>Contact</h4>
        <div class="footer-contact">
          <p><strong>Surprise Granite</strong></p>
          <p>Marble & Quartz</p>
          <p><a href="tel:+16028333189">(602) 833-3189</a></p>
          <p>Serving Phoenix Metro Area</p>
        </div>
        <div class="footer-socials">
          <a href="https://www.facebook.com/surprisegranite" target="_blank" aria-label="Facebook">FB</a>
          <a href="https://www.instagram.com/surprisegranite" target="_blank" aria-label="Instagram">IG</a>
          <a href="https://www.youtube.com/@surprisegranite" target="_blank" aria-label="YouTube">YT</a>
        </div>
      </div>
    </div>
  </div>

  <div class="footer-bottom">
    <div class="footer-legal">
      <a href="/legal/privacy-policy">Privacy Policy</a>
      <a href="/legal/terms-of-use">Terms of Use</a>
      <a href="/legal/refund-policy">Refund Policy</a>
      <a href="/legal/lifetime-warranty">Warranty</a>
    </div>
    <p class="footer-copyright">© 2025 Surprise Granite Marble & Quartz. All rights reserved.</p>
  </div>
</footer>
'''

# CSS for the new header/nav/footer
HEADER_FOOTER_CSS = '''
<style>
/* Navbar Fixed Wrapper */
.navbar-fixed_wrapper {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.navbar_wrapper {
  max-width: 1400px;
  margin: 0 auto;
}

/* Top Banner */
.navbar-banner_component {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  background: rgba(0,0,0,0.2);
  font-size: 0.85rem;
}

.navbar-banner_content-left,
.navbar-banner_content-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.showroom-hours_link {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  text-decoration: none;
}

.showroom-hours_link:hover { color: white; }

.showroom-hours_tag {
  background: #b8860b;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.text-style-muted { color: #94a3b8; }
.text-color-white { color: white; }
.text-color-yellow { color: #ffc107; }
.text-weight-bold { font-weight: 600; }

.button-group {
  display: flex;
  gap: 15px;
}

.button-group a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.85rem;
}

.button-group a:hover { color: white; }

/* Main Navbar */
.navbar_component {
  padding: 12px 20px;
}

.navbar_container {
  max-width: 1400px;
  margin: 0 auto;
}

.navbar_top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.navbar_menu-top-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.navbar_logo-link {
  text-decoration: none;
}

.navbar_logo-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.navbar_logo {
  height: 32px;
  filter: brightness(0) invert(1);
}

.navbar_tagline {
  font-size: 0.55rem;
  color: #b8860b;
  letter-spacing: 1.5px;
  font-weight: 600;
  text-transform: uppercase;
  margin-top: 2px;
}

/* Search */
.nav-search_component {
  position: relative;
}

.nav-search_form {
  display: flex;
  align-items: center;
}

.form-input.is-nav-search {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 10px 40px 10px 16px;
  color: white;
  font-size: 0.9rem;
  width: 280px;
  outline: none;
}

.form-input.is-nav-search::placeholder { color: #94a3b8; }
.form-input.is-nav-search:focus { border-color: #b8860b; }

.search-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  padding: 4px;
}

.search-btn:hover { color: white; }

/* Navigation Links */
.navbar_nav-links {
  display: flex;
  align-items: center;
  gap: 8px;
}

.navbar_link {
  color: #e2e8f0;
  text-decoration: none;
  padding: 8px 12px;
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: 6px;
  transition: all 0.2s;
}

.navbar_link:hover {
  background: rgba(255,255,255,0.1);
  color: white;
}

.navbar_dropdown {
  position: relative;
}

.navbar_dropdown-menu {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.15);
  min-width: 200px;
  padding: 8px 0;
  z-index: 100;
}

.navbar_dropdown:hover .navbar_dropdown-menu {
  display: block;
}

.navbar_dropdown-menu a {
  display: block;
  padding: 10px 16px;
  color: #1e293b;
  text-decoration: none;
  font-size: 0.9rem;
}

.navbar_dropdown-menu a:hover {
  background: #f1f5f9;
  color: #b8860b;
}

/* CTA Button */
.navbar_cta-wrapper .button.is-primary {
  background: linear-gradient(135deg, #ffc107 0%, #ffca28 100%);
  color: #1a1a2e;
  padding: 10px 20px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.navbar_cta-wrapper .button.is-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 193, 7, 0.4);
}

/* Mobile Menu Button */
.navbar_menu-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.menu-icon_line {
  display: block;
  width: 24px;
  height: 2px;
  background: white;
  border-radius: 2px;
}

/* Mobile Menu Overlay */
.mobile-menu-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #1a1a2e;
  z-index: 2000;
  flex-direction: column;
}

.mobile-menu-overlay.active { display: flex; }

.mobile-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.mobile-logo img {
  height: 28px;
  filter: brightness(0) invert(1);
}

.mobile-menu-close {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 8px;
}

.mobile-menu-nav {
  display: flex;
  flex-direction: column;
  padding: 20px;
}

.mobile-menu-nav a {
  color: white;
  text-decoration: none;
  padding: 16px 0;
  font-size: 1.1rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.mobile-menu-nav a:hover { color: #ffc107; }

.mobile-menu-nav .mobile-cta {
  background: linear-gradient(135deg, #ffc107 0%, #ffca28 100%);
  color: #1a1a2e;
  text-align: center;
  border-radius: 8px;
  margin-top: 20px;
  font-weight: 600;
}

.mobile-menu-nav .mobile-phone {
  text-align: center;
  margin-top: 10px;
  color: #ffc107;
}

/* Footer Styles */
.simple-footer {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: white;
}

.footer-cta {
  text-align: center;
  padding: 60px 20px;
  background: rgba(0,0,0,0.2);
}

.footer-cta h2 {
  font-size: 2rem;
  margin-bottom: 10px;
}

.footer-cta p {
  color: #94a3b8;
  margin-bottom: 24px;
}

.footer-cta-btns {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

.btn-footer-primary {
  background: linear-gradient(135deg, #ffc107 0%, #ffca28 100%);
  color: #1a1a2e;
  padding: 14px 28px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
}

.btn-footer-secondary {
  background: transparent;
  color: white;
  padding: 14px 28px;
  border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.3);
  text-decoration: none;
}

.footer-main {
  padding: 60px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.footer-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 40px;
}

@media (max-width: 768px) {
  .footer-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
  .footer-grid { grid-template-columns: 1fr; }
}

.footer-col h4 {
  color: #ffc107;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 16px;
}

.footer-col a {
  display: block;
  color: #94a3b8;
  text-decoration: none;
  padding: 6px 0;
  font-size: 0.9rem;
}

.footer-col a:hover { color: white; }

.footer-contact p {
  color: #94a3b8;
  margin: 4px 0;
  font-size: 0.9rem;
}

.footer-contact a { color: #ffc107; }

.footer-socials {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.footer-socials a {
  background: rgba(255,255,255,0.1);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
}

.footer-bottom {
  border-top: 1px solid rgba(255,255,255,0.1);
  padding: 24px 20px;
  text-align: center;
}

.footer-legal {
  display: flex;
  justify-content: center;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.footer-legal a {
  color: #64748b;
  text-decoration: none;
  font-size: 0.85rem;
}

.footer-legal a:hover { color: white; }

.footer-copyright {
  color: #64748b;
  font-size: 0.85rem;
}

/* Responsive Utilities */
.hidden-desktop { display: none; }
.hide-tablet { display: block; }
.hide-mobile-landscape { display: flex; }
.show-tablet { display: none; }

@media (max-width: 991px) {
  .hide-tablet { display: none; }
  .show-tablet { display: block; }
  .hidden-desktop { display: block; }
}

@media (max-width: 767px) {
  .hide-mobile-landscape { display: none; }
  .form-input.is-nav-search { width: 200px; }
}

@media (max-width: 479px) {
  .nav-search_component { display: none; }
}
</style>

<script>
// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const menuClose = document.getElementById('mobile-menu-close');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', function() {
      mobileMenu.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  }

  if (menuClose && mobileMenu) {
    menuClose.addEventListener('click', function() {
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    });
  }
});
</script>
'''


def update_product_page(filepath):
    """Update a single product page with consistent header/nav and footer."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check if this is a product page with simplified header
        if 'class="header"' not in content:
            return False, "Not a product page with simplified header"

        # Extract the head section (everything between <head> and </head>)
        head_match = re.search(r'(<head[^>]*>)(.*?)(</head>)', content, re.DOTALL | re.IGNORECASE)
        if not head_match:
            return False, "Could not find head section"

        head_content = head_match.group(2)

        # Find where footer begins
        footer_start = re.search(r'<footer class="footer">', content)
        if not footer_start:
            return False, "Could not find footer"

        # Try multiple patterns for main content extraction
        main_content = None

        # Pattern 1: <div class="container">
        content_start = content.find('<div class="container">')
        if content_start != -1:
            content_end = content.find('<footer class="footer">')
            if content_end != -1:
                main_content = content[content_start:content_end]

        # Pattern 2: <main class="main">
        if main_content is None:
            main_match = re.search(r'<main class="main">(.*?)</main>', content, re.DOTALL)
            if main_match:
                main_content = f'<div class="container">\n{main_match.group(1)}\n</div>'

        # Pattern 3: Look for breadcrumb as start marker
        if main_content is None:
            breadcrumb_match = re.search(r'(<div class="breadcrumb">.*?)<footer', content, re.DOTALL)
            if breadcrumb_match:
                main_content = f'<div class="container">\n{breadcrumb_match.group(1)}\n</div>'

        if main_content is None:
            return False, "Could not extract main content"

        # Extract existing chat widget if present
        chat_widget_match = re.search(
            r'(<!-- SG Chat Widget -->.*?</script>\s*</body>)',
            content,
            re.DOTALL
        )
        chat_widget = chat_widget_match.group(1) if chat_widget_match else ''

        # Build the new page
        new_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
{head_content}
{HEADER_FOOTER_CSS}
</head>
<body>
{FULL_HEADER}

<main class="main-wrapper">
{main_content}
</main>

{FULL_FOOTER}

{chat_widget}
</body>
</html>
'''

        # Write the updated content
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

        return True, "Updated successfully"

    except Exception as e:
        return False, str(e)


def main():
    """Main function to update all product pages."""
    base_path = Path('/Users/homepc/surprise-granite-site')

    # Find all product pages in countertops folder
    countertop_pages = list(base_path.glob('countertops/*/index.html'))

    # Add vendor pages
    vendor_pages = list(base_path.glob('vendors/*/index.html'))

    all_pages = countertop_pages + vendor_pages

    print(f"Found {len(all_pages)} pages to process")

    updated = 0
    skipped = 0
    errors = 0

    for filepath in all_pages:
        success, message = update_product_page(str(filepath))
        if success:
            updated += 1
            if updated % 100 == 0:
                print(f"Updated {updated} pages...")
        else:
            if "Not a product page" in message:
                skipped += 1
            else:
                errors += 1
                print(f"Error updating {filepath}: {message}")

    print(f"\nComplete!")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")
    print(f"Errors: {errors}")


if __name__ == '__main__':
    main()
