#!/usr/bin/env python3
"""
Update all Webflow pages with:
1. The new simplified footer from the homepage
2. The correct SG chat widget from the homepage
"""

import os
import re
import glob

# New footer HTML from homepage
NEW_FOOTER = '''
<!-- Simplified Footer -->
<footer class="simple-footer">
  <div class="footer-cta">
    <h2>Ready to Start Your Project?</h2>
    <p>Free estimates for Phoenix metro homeowners</p>
    <div class="footer-cta-btns">
      <a href="/get-a-free-estimate" class="footer-btn-primary">Get Free Estimate</a>
      <a href="tel:+16028333189" class="footer-btn-secondary">(602) 833-3189</a>
    </div>
  </div>

  <div class="footer-main">
    <div class="footer-grid">
      <div class="footer-col">
        <h4>Products</h4>
        <a href="/materials_all-countertops.html">Countertops</a>
        <a href="/materials/all-cabinets">Cabinets</a>
        <a href="/materials/flooring">Flooring</a>
        <a href="/materials/all-tile">Tile & Backsplash</a>
        <a href="https://store.surprisegranite.com" target="_blank">Online Store</a>
      </div>
      <div class="footer-col">
        <h4>Services</h4>
        <a href="/services/home/kitchen-remodeling-arizona">Kitchen Remodeling</a>
        <a href="/services/home/bathroom-remodeling-arizona">Bathroom Remodeling</a>
        <a href="/get-a-free-estimate">Free Estimate</a>
        <a href="/tools/virtual-kitchen-design-tool">Design Tools</a>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <a href="/company/about-us">About Us</a>
        <a href="/company/project-gallery">Gallery</a>
        <a href="/company/reviews">Reviews</a>
        <a href="/blog">Blog</a>
        <a href="/contact-us">Contact</a>
      </div>
      <div class="footer-col">
        <h4>Connect</h4>
        <div class="footer-contact">
          <p><strong>Service Area:</strong><br>Greater Phoenix, AZ<br>We Come to You!</p>
          <p><strong>Hours:</strong><br>Mon-Fri 8am-5pm<br>Sat 9am-2pm</p>
        </div>
        <div class="footer-socials">
          <a href="https://www.facebook.com/surprisegranitetops" target="_blank" aria-label="Facebook">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 6H13.5C12.9477 6 12.5 6.44772 12.5 7V10H16.5C16.6137 9.99748 16.7216 10.0504 16.7892 10.1419C16.8568 10.2334 16.8758 10.352 16.84 10.46L16.1 12.66C16.0318 12.8619 15.8431 12.9984 15.63 13H12.5V20.5C12.5 20.7761 12.2761 21 12 21H9.5C9.22386 21 9 20.7761 9 20.5V13H7.5C7.22386 13 7 12.7761 7 12.5V10.5C7 10.2239 7.22386 10 7.5 10H9V7C9 4.79086 10.7909 3 13 3H16.5C16.7761 3 17 3.22386 17 3.5V5.5C17 5.77614 16.7761 6 16.5 6Z"/></svg>
          </a>
          <a href="https://www.instagram.com/surprisegranite/" target="_blank" aria-label="Instagram">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3H8C5.23858 3 3 5.23858 3 8V16C3 18.7614 5.23858 21 8 21H16C18.7614 21 21 18.7614 21 16V8C21 5.23858 18.7614 3 16 3ZM19.25 16C19.2445 17.7926 17.7926 19.2445 16 19.25H8C6.20735 19.2445 4.75549 17.7926 4.75 16V8C4.75549 6.20735 6.20735 4.75549 8 4.75H16C17.7926 4.75549 19.2445 6.20735 19.25 8V16ZM16.75 8.25C17.3023 8.25 17.75 7.80228 17.75 7.25C17.75 6.69772 17.3023 6.25 16.75 6.25C16.1977 6.25 15.75 6.69772 15.75 7.25C15.75 7.80228 16.1977 8.25 16.75 8.25ZM12 7.5C9.51472 7.5 7.5 9.51472 7.5 12C7.5 14.4853 9.51472 16.5 12 16.5C14.4853 16.5 16.5 14.4853 16.5 12C16.5 9.51472 14.4853 7.5 12 7.5ZM9.25 12C9.25 13.5188 10.4812 14.75 12 14.75C13.5188 14.75 14.75 13.5188 14.75 12C14.75 10.4812 13.5188 9.25 12 9.25C10.4812 9.25 9.25 10.4812 9.25 12Z"/></svg>
          </a>
          <a href="https://www.youtube.com/@surprisegranite6491" target="_blank" aria-label="YouTube">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.9999 4.48992C21.7284 4.68529 23.0264 6.16064 22.9999 7.89992V16.0999C23.0264 17.8392 21.7284 19.3146 19.9999 19.5099L18.5999 19.6599C14.2315 20.1099 9.82835 20.1099 5.45991 19.6599L3.99991 19.5099C2.27143 19.3146 0.973464 17.8392 0.999909 16.0999V7.89992C0.973464 6.16064 2.27143 4.68529 3.99991 4.48992L5.39991 4.33992C9.76835 3.88995 14.1715 3.88995 18.5399 4.33992L19.9999 4.48992ZM11.1099 15.2199L14.9999 12.6199C15.2695 12.4833 15.3959 12.2501 15.3959 11.9999C15.3959 11.7497 15.2695 11.5165 15.0599 11.3799L11.1699 8.77992C10.9402 8.62469 10.6437 8.60879 10.3987 8.73859C10.1538 8.86839 10.0004 9.12271 9.99991 9.39992V14.5999C10.0128 14.858 10.1576 15.0913 10.3832 15.2173C10.6088 15.3433 10.8834 15.3443 11.1099 15.2199Z"/></svg>
          </a>
          <a href="https://www.pinterest.com/surprisegranite1/" target="_blank" aria-label="Pinterest">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor"><path d="M16 2a14 14 0 0 0-5.1 27a13.24 13.24 0 0 1 0-4l1.65-7a5.05 5.05 0 0 1-.38-2c0-1.94 1.13-3.4 2.53-3.4a1.76 1.76 0 0 1 1.77 2c0 1.2-.76 3-1.16 4.66a2 2 0 0 0 2.08 2.53c2.48 0 4.4-2.63 4.4-6.41a5.53 5.53 0 0 0-5.85-5.7a6.06 6.06 0 0 0-6.32 6.08a5.42 5.42 0 0 0 1 3.19a.44.44 0 0 1 .1.4c-.11.44-.35 1.4-.39 1.59s-.21.31-.47.19c-1.75-.82-2.84-3.37-2.84-5.43c0-4.41 3.21-8.47 9.25-8.47c4.85 0 8.63 3.46 8.63 8.09c0 4.82-3 8.7-7.27 8.7a3.76 3.76 0 0 1-3.21-1.6l-.87 3.33a15.55 15.55 0 0 1-1.74 3.67A14.17 14.17 0 0 0 16 30a14 14 0 0 0 0-28"/></svg>
          </a>
        </div>
      </div>
    </div>
  </div>

  <div class="footer-bottom">
    <div class="footer-bottom-inner">
      <div class="footer-legal">
        <a href="/legal/privacy-policy">Privacy</a>
        <a href="/legal/terms-of-use">Terms</a>
        <a href="/legal/lifetime-warranty">Warranty</a>
        <a href="https://azroc.my.site.com/AZRoc/s/contractor-search?licenseId=a0o8y000000OAdvAAG" target="_blank">ROC #341113</a>
      </div>
      <div class="footer-copy">© 2025 Surprise Granite Marble & Quartz</div>
      <div class="footer-payments">
        <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb2ee83fbb125_visa.png" alt="Visa" width="32">
        <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb26f2bfbb121_mastercard.png" alt="Mastercard" width="32">
        <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb280abfbb124_discover.png" alt="Discover" width="32">
        <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb2b84cfbb122_amex.png" alt="Amex" width="32">
      </div>
    </div>
  </div>
</footer>

<style>
/* Simple Footer Styles */
.simple-footer { background: #1a1a2e; color: #fff; }
.footer-cta { background: linear-gradient(135deg, #D4AF37, #b8860b); padding: 48px 24px; text-align: center; }
.footer-cta h2 { color: #1a1a2e; font-size: 28px; margin: 0 0 8px 0; }
.footer-cta p { color: rgba(26,26,46,0.8); font-size: 16px; margin: 0 0 24px 0; }
.footer-cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.footer-btn-primary { background: #1a1a2e; color: #D4AF37; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; transition: all 0.2s; }
.footer-btn-primary:hover { background: #0f0f1a; }
.footer-btn-secondary { background: transparent; border: 2px solid #1a1a2e; color: #1a1a2e; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; transition: all 0.2s; }
.footer-btn-secondary:hover { background: rgba(26,26,46,0.1); }
.footer-main { padding: 48px 24px; max-width: 1100px; margin: 0 auto; }
.footer-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 40px; }
@media (max-width: 800px) { .footer-grid { grid-template-columns: repeat(2, 1fr); gap: 32px; } }
@media (max-width: 500px) { .footer-grid { grid-template-columns: 1fr; } }
.footer-col h4 { color: #D4AF37; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0; }
.footer-col a { display: block; color: rgba(255,255,255,0.8); text-decoration: none; font-size: 14px; padding: 6px 0; transition: color 0.2s; }
.footer-col a:hover { color: #D4AF37; }
.footer-contact { margin-bottom: 16px; }
.footer-contact p { font-size: 13px; color: rgba(255,255,255,0.7); margin: 0 0 12px 0; line-height: 1.5; }
.footer-contact strong { color: rgba(255,255,255,0.9); }
.footer-socials { display: flex; gap: 12px; }
.footer-socials a { color: rgba(255,255,255,0.6); transition: color 0.2s; padding: 0; }
.footer-socials a:hover { color: #D4AF37; }
.footer-bottom { border-top: 1px solid rgba(255,255,255,0.1); padding: 20px 24px; }
.footer-bottom-inner { max-width: 1100px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
.footer-legal { display: flex; gap: 16px; }
.footer-legal a { color: rgba(255,255,255,0.5); text-decoration: none; font-size: 12px; }
.footer-legal a:hover { color: #D4AF37; }
.footer-copy { color: rgba(255,255,255,0.4); font-size: 12px; }
.footer-payments { display: flex; gap: 8px; }
.footer-payments img { height: 20px; width: auto; opacity: 0.7; }
@media (max-width: 700px) { .footer-bottom-inner { flex-direction: column; text-align: center; } }
</style>
'''

# Correct SG Chat Widget from homepage
SG_CHAT_WIDGET = '''
<!-- SG Chat Widget -->
<style>
  #sg-chat-widget {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }
  #sg-chat-button {
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FFB946 0%, #FF9800 100%);
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(255, 152, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }
  #sg-chat-button::before {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at center, rgba(255,255,255,0.3) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  #sg-chat-button:hover::before { opacity: 1; }
  #sg-chat-button:hover {
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 12px 32px rgba(255, 152, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  #sg-chat-button:active { transform: translateY(-1px) scale(0.98); }
  #sg-chat-button svg { width: 32px; height: 32px; fill: #fff; transition: all 0.3s ease; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); }
  #sg-chat-button .sg-icon-chat { display: block; }
  #sg-chat-button .sg-icon-close { display: none; }
  #sg-chat-button.active .sg-icon-chat { display: none; }
  #sg-chat-button.active .sg-icon-close { display: block; }
  .sg-chat-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #ef4444;
    color: white;
    font-size: 12px;
    font-weight: 700;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
  }
  #sg-chat-window {
    position: absolute;
    bottom: 90px;
    right: 0;
    width: 380px;
    height: 550px;
    background: #1a1a1a;
    border-radius: 20px;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    visibility: hidden;
    transform: translateY(20px) scale(0.95);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  #sg-chat-window.active { opacity: 1; visibility: visible; transform: translateY(0) scale(1); }
  .sg-chat-header {
    background: linear-gradient(135deg, #FFB946 0%, #FF9800 100%);
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sg-chat-header-info { display: flex; align-items: center; gap: 12px; }
  .sg-chat-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid rgba(255,255,255,0.3);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .sg-chat-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .sg-chat-header-text h3 { color: white; font-size: 16px; font-weight: 700; margin: 0; }
  .sg-chat-header-text p { color: rgba(255,255,255,0.9); font-size: 13px; margin: 4px 0 0; display: flex; align-items: center; gap: 6px; }
  .sg-status-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .sg-chat-close {
    background: rgba(255,255,255,0.2);
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
  }
  .sg-chat-close:hover { background: rgba(255,255,255,0.3); }
  .sg-chat-close svg { width: 16px; height: 16px; fill: white; }
  .sg-chat-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .sg-chat-body::-webkit-scrollbar { width: 6px; }
  .sg-chat-body::-webkit-scrollbar-track { background: transparent; }
  .sg-chat-body::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  .sg-message { max-width: 85%; padding: 14px 18px; border-radius: 20px; font-size: 14px; line-height: 1.5; animation: messageIn 0.3s ease; }
  @keyframes messageIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .sg-message.bot { background: #2d2d2d; color: #fff; align-self: flex-start; border-bottom-left-radius: 6px; }
  .sg-message.user { background: linear-gradient(135deg, #FFB946 0%, #FF9800 100%); color: #1a1a2e; align-self: flex-end; border-bottom-right-radius: 6px; font-weight: 500; }
  .sg-message-avatar { width: 28px; height: 28px; border-radius: 50%; margin-bottom: 6px; overflow: hidden; }
  .sg-message-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .sg-message-content { word-wrap: break-word; }
  .sg-message-time { font-size: 11px; opacity: 0.6; margin-top: 6px; }
  .sg-typing { display: flex; gap: 4px; padding: 14px 18px; background: #2d2d2d; border-radius: 20px; border-bottom-left-radius: 6px; align-self: flex-start; }
  .sg-typing span { width: 8px; height: 8px; background: #666; border-radius: 50%; animation: typing 1.4s infinite; }
  .sg-typing span:nth-child(2) { animation-delay: 0.2s; }
  .sg-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-8px); } }
  .sg-quick-replies { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; animation: messageIn 0.3s ease; }
  .sg-quick-reply-btn {
    background: transparent;
    border: 1px solid #FFB946;
    color: #FFB946;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .sg-quick-reply-btn:hover { background: #FFB946; color: #1a1a2e; }
  .sg-chat-input-wrapper {
    padding: 16px 20px;
    background: #242424;
    display: flex;
    gap: 12px;
    align-items: center;
    border-top: 1px solid #333;
  }
  .sg-chat-input {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 24px;
    padding: 14px 20px;
    color: white;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }
  .sg-chat-input:focus { border-color: #FFB946; }
  .sg-chat-input::placeholder { color: #666; }
  .sg-send-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FFB946 0%, #FF9800 100%);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .sg-send-btn:hover { transform: scale(1.05); box-shadow: 0 4px 16px rgba(255, 152, 0, 0.4); }
  .sg-send-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .sg-send-btn svg { width: 20px; height: 20px; fill: white; }
  .sg-chat-footer { padding: 12px 20px; background: #1a1a1a; text-align: center; border-top: 1px solid #2d2d2d; }
  .sg-chat-footer a { color: #666; font-size: 12px; text-decoration: none; }
  .sg-chat-footer a:hover { color: #FFB946; }
  @media (max-width: 480px) {
    #sg-chat-widget { bottom: 16px; right: 16px; }
    #sg-chat-button { width: 60px; height: 60px; }
    #sg-chat-button svg { width: 28px; height: 28px; }
    #sg-chat-window { width: calc(100vw - 32px); height: 70vh; right: -8px; bottom: 80px; }
  }
</style>

<div id="sg-chat-widget">
  <button id="sg-chat-button" aria-label="Open chat">
    <svg class="sg-icon sg-icon-chat" viewBox="0 0 512 512"><path d="M256 448c141.4 0 256-93.1 256-208S397.4 32 256 32S0 125.1 0 240c0 45.1 17.7 86.8 47.7 120.9c-1.9 24.5-11.4 46.3-21.4 62.9c-5.5 9.2-11.1 16.6-15.2 21.6c-2.1 2.5-3.7 4.4-4.9 5.7c-.6 .6-1 1.1-1.3 1.4l-.3 .3c-4.4 4.3-5.5 10.9-2.8 16.4c2.7 5.5 8.4 9 14.6 9c23.5 0 45.7-5.5 64.3-12.5c18.4-7 34.4-16.4 46.6-25.1c12.1-8.6 20.4-16.1 24.6-20.3c23.3 10.3 49.3 16.3 77.1 16.8c.9 0 1.8 0 2.7 0c.5 0 1 0 1.5 0zM96 240a32 32 0 1 1 64 0a32 32 0 1 1-64 0zm128 0a32 32 0 1 1 64 0a32 32 0 1 1-64 0zm160-32a32 32 0 1 1 0 64a32 32 0 1 1 0-64z"/></svg>
    <svg class="sg-icon sg-icon-close" viewBox="0 0 384 512"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
    <span class="sg-chat-badge">1</span>
  </button>

  <div id="sg-chat-window">
    <div class="sg-chat-header">
      <div class="sg-chat-header-info">
        <div class="sg-chat-avatar">
          <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/658d12c161cdc3543474cddc_designer-avatar-profile.jpg" alt="Design Assistant" loading="lazy">
        </div>
        <div class="sg-chat-header-text">
          <h3>Surprise Granite</h3>
          <p><span class="sg-status-dot"></span>Design Assistant</p>
        </div>
      </div>
      <button class="sg-chat-close" aria-label="Close chat">
        <svg viewBox="0 0 384 512"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
      </button>
    </div>
    <div class="sg-chat-body" id="sg-chat-body">
      <div class="sg-chat-messages" id="sg-messages"></div>
    </div>
    <div class="sg-chat-input-wrapper">
      <input type="text" class="sg-chat-input" id="sg-chat-input" placeholder="Ask about countertops, design tips..." autocomplete="off" aria-label="Chat message"/>
      <button class="sg-send-btn" id="sg-send-btn" aria-label="Send message">
        <svg viewBox="0 0 512 512"><path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 492.3 160 480V396.4c0-4 1.5-7.8 4.2-10.7L331.8 202.8c5.8-6.3 5.4-16-.9-21.9s-16.6-5.1-22.4 1.2l-185.8 202-47.5-19.8c-10.2-4.2-16.6-14.1-16.2-24.9s7.6-20.2 18-24L483.6 .5c10.1-3.6 21.4-2 30.5 5.1z"/></svg>
      </button>
    </div>
    <div class="sg-chat-footer">
      Powered by <a href="https://www.surprisegranite.com" target="_blank">Surprise Granite</a>
    </div>
  </div>
</div>

<script>
(function() {
  const WEBHOOK_URL = 'https://www.voicenowcrm.com/api/webhook/agent/6913b021776947444de0638e/sales';

  const chatButton = document.getElementById('sg-chat-button');
  const chatWindow = document.getElementById('sg-chat-window');
  const closeButton = document.querySelector('.sg-chat-close');
  const badge = document.querySelector('.sg-chat-badge');
  const messagesContainer = document.getElementById('sg-messages');
  const chatBody = document.getElementById('sg-chat-body');
  const chatInput = document.getElementById('sg-chat-input');
  const sendBtn = document.getElementById('sg-send-btn');

  let isOpen = false;
  let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  function scrollToBottom() {
    setTimeout(() => {
      chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
    }, 50);
  }

  function toggleChat() {
    isOpen = !isOpen;
    chatButton.classList.toggle('active', isOpen);
    chatWindow.classList.toggle('active', isOpen);
    if (isOpen) {
      if (badge) { badge.style.display = 'none'; localStorage.setItem('sg-chat-viewed', 'true'); }
      if (messagesContainer.children.length === 0) { sendMessageToAI('Hello'); }
      chatInput.focus();
    }
  }

  function addMessage(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'sg-message ' + type;
    const avatar = document.createElement('div');
    avatar.className = 'sg-message-avatar';
    if (type === 'bot') {
      const img = document.createElement('img');
      img.src = 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/658d12c161cdc3543474cddc_designer-avatar-profile.jpg';
      img.alt = 'Design Assistant';
      avatar.appendChild(img);
    }
    const content = document.createElement('div');
    content.className = 'sg-message-content';
    content.innerHTML = text.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>').replace(/\\n/g, '<br>');
    const time = document.createElement('div');
    time.className = 'sg-message-time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    content.appendChild(time);
    if (type === 'bot') messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
  }

  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'sg-typing';
    typing.id = 'sg-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesContainer.appendChild(typing);
    scrollToBottom();
  }

  function hideTyping() {
    const typing = document.getElementById('sg-typing');
    if (typing) typing.remove();
  }

  async function sendMessageToAI(message) {
    if (message.trim() !== 'Hello') { addMessage('user', message); }
    showTyping();
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, sessionId: sessionId, source: 'website_chat', page: window.location.pathname })
      });
      hideTyping();
      if (response.ok) {
        const data = await response.json();
        const reply = data.response || data.message || data.text || "Thanks for reaching out! How can I help you with your countertop project?";
        addMessage('bot', reply);
      } else {
        addMessage('bot', "Thanks for your message! Our team will follow up with you shortly. In the meantime, feel free to call us at (602) 833-3189.");
      }
    } catch (error) {
      hideTyping();
      addMessage('bot', "Thanks for reaching out! For immediate assistance, please call us at (602) 833-3189 or visit our showroom.");
    }
  }

  function handleUserMessage(message) {
    if (!message.trim()) return;
    chatInput.value = '';
    sendMessageToAI(message);
  }

  chatButton.addEventListener('click', toggleChat);
  closeButton.addEventListener('click', toggleChat);
  sendBtn.addEventListener('click', () => { handleUserMessage(chatInput.value); });
  chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { handleUserMessage(chatInput.value); } });

  if (localStorage.getItem('sg-chat-viewed') === 'true' && badge) { badge.style.display = 'none'; }
})();
</script>
'''


def update_page(filepath):
    """Update a single page with new footer and chat widget."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content

        # Remove existing Webflow footer (footer5_ classes)
        # Pattern matches from <footer to </footer> or the footer5 section
        footer_patterns = [
            r'<footer class="footer5_component[^>]*>.*?</footer>',
            r'<div class="footer5_[^>]*>.*?</div>\s*</footer>',
        ]

        for pattern in footer_patterns:
            content = re.sub(pattern, '', content, flags=re.DOTALL)

        # Remove any existing chat widget (various patterns)
        chat_patterns = [
            r'<!-- SG Chat Widget -->.*?</script>\s*(?=</body>)',
            r'<style>\s*#sg-chat-widget\s*\{.*?</script>\s*(?=</body>)',
            r'<div id="sg-chat-widget">.*?</script>\s*(?=</body>)',
        ]

        for pattern in chat_patterns:
            content = re.sub(pattern, '', content, flags=re.DOTALL)

        # Find </body> tag and insert new footer and chat widget before it
        body_close = content.rfind('</body>')
        if body_close == -1:
            return False, "No </body> tag found"

        # Insert new footer and chat widget
        new_content = content[:body_close] + NEW_FOOTER + SG_CHAT_WIDGET + '\n' + content[body_close:]

        # Only write if content changed
        if new_content != original_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            return True, "Updated"
        else:
            return False, "No changes needed"

    except Exception as e:
        return False, str(e)


def main():
    base_path = '/Users/homepc/surprise-granite-site'

    # Find all Webflow HTML files (exclude redirects and special files)
    html_files = []

    # Root level Webflow files
    for f in glob.glob(f'{base_path}/*.html'):
        if os.path.getsize(f) > 10000:  # Skip small redirect files
            html_files.append(f)

    # Subdirectory index files (Webflow pages)
    for pattern in ['blog/*/index.html', 'company/*/index.html', 'services/*/index.html',
                    'legal/*/index.html', 'tools/*/index.html', 'materials/*/index.html',
                    'products/*/index.html', 'tile/*/index.html', 'vendors/*/index.html',
                    'financing/*/index.html', 'coverage-plans/*/index.html']:
        html_files.extend(glob.glob(f'{base_path}/{pattern}'))

    print(f"Found {len(html_files)} files to process")

    updated = 0
    skipped = 0
    errors = 0

    for filepath in html_files:
        # Skip redirect files (small files)
        if os.path.getsize(filepath) < 5000:
            skipped += 1
            continue

        success, message = update_page(filepath)
        if success:
            updated += 1
            if updated % 50 == 0:
                print(f"Updated {updated} files...")
        else:
            if "No changes" in message:
                skipped += 1
            else:
                errors += 1
                if errors < 10:
                    print(f"Error: {filepath}: {message}")

    print(f"\nComplete!")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")
    print(f"Errors: {errors}")


if __name__ == '__main__':
    main()
