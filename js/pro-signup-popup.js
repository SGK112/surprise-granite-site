/**
 * Pro Signup Popup - Minimal Design
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'sg_pro_popup';
  const DELAY = 8000;
  const COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days

  function shouldShow() {
    if (window.location.pathname.includes('/account')) return false;
    const last = localStorage.getItem(STORAGE_KEY);
    return !last || (Date.now() - parseInt(last, 10)) > COOLDOWN;
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    const el = document.getElementById('sgProPopup');
    if (el) {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }
  }

  function create() {
    const el = document.createElement('div');
    el.id = 'sgProPopup';
    el.innerHTML = `
      <div class="sg-popup-card">
        <button class="sg-popup-x" aria-label="Close">&times;</button>
        <span class="sg-popup-tag">Pro Account</span>
        <h2>Join as a Pro</h2>
        <p>List remnants, connect with homeowners, get featured in our directory.</p>
        <a href="/account?signup=pro" class="sg-popup-btn">Get Started Free</a>
        <button class="sg-popup-skip">Not now</button>
      </div>
    `;

    // Styles
    const css = document.createElement('style');
    css.textContent = `
      #sgProPopup {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        transition: opacity 0.3s;
      }
      #sgProPopup.show { opacity: 1; }
      .sg-popup-card {
        background: #fff;
        border-radius: 16px;
        padding: 32px;
        max-width: 340px;
        width: 100%;
        text-align: center;
        position: relative;
        transform: translateY(20px);
        transition: transform 0.3s;
        box-shadow: 0 20px 40px rgba(0,0,0,0.2);
      }
      #sgProPopup.show .sg-popup-card { transform: translateY(0); }
      .sg-popup-x {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 32px;
        height: 32px;
        background: #f0f0f0;
        border: none;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        line-height: 1;
      }
      .sg-popup-x:hover { background: #e0e0e0; }
      .sg-popup-tag {
        display: inline-block;
        background: #f9cb00;
        color: #1a2b3c;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 16px;
      }
      .sg-popup-card h2 {
        font-size: 24px;
        font-weight: 700;
        color: #1a2b3c;
        margin: 0 0 8px;
      }
      .sg-popup-card p {
        font-size: 14px;
        color: #666;
        margin: 0 0 24px;
        line-height: 1.5;
      }
      .sg-popup-btn {
        display: block;
        background: #1a2b3c;
        color: #fff;
        padding: 14px 24px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        font-size: 15px;
        margin-bottom: 12px;
        transition: background 0.2s;
      }
      .sg-popup-btn:hover { background: #2d4a5e; }
      .sg-popup-skip {
        background: none;
        border: none;
        color: #999;
        font-size: 13px;
        cursor: pointer;
        padding: 8px;
      }
      .sg-popup-skip:hover { color: #666; }
    `;
    document.head.appendChild(css);
    document.body.appendChild(el);

    // Events
    el.querySelector('.sg-popup-x').onclick = dismiss;
    el.querySelector('.sg-popup-skip').onclick = dismiss;
    el.onclick = e => { if (e.target === el) dismiss(); };

    setTimeout(() => el.classList.add('show'), 10);
  }

  if (shouldShow()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(create, DELAY));
    } else {
      setTimeout(create, DELAY);
    }
  }
})();
