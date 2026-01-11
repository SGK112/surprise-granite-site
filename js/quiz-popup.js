/**
 * SURPRISE GRANITE - QUIZ POPUP
 * Auto-triggers on page load to personalize user experience
 * Stores dismissal in localStorage to not annoy returning visitors
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'sg_quiz_dismissed';
  const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Check if quiz was recently dismissed
  function wasRecentlyDismissed() {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) return false;

    const dismissedTime = parseInt(dismissed, 10);
    return (Date.now() - dismissedTime) < DISMISS_DURATION;
  }

  // Mark quiz as dismissed
  function dismissQuiz() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  }

  // Create and show the popup
  function showQuizPopup() {
    // Don't show if already dismissed or on quiz page
    if (wasRecentlyDismissed()) return;
    if (window.location.pathname.includes('/quiz')) return;

    const popup = document.createElement('div');
    popup.id = 'sgQuizPopup';
    popup.innerHTML = `
      <div class="qp-overlay" onclick="window.closeQuizPopup()"></div>
      <div class="qp-card">
        <button class="qp-close" onclick="window.closeQuizPopup()" aria-label="Close" type="button"></button>

        <div class="qp-header">
          <div class="qp-icon-wrap">
            <svg class="qp-logo" viewBox="0 0 390 402">
              <g transform="translate(0.269 0.052)">
                <path d="M194.6,32.106l166.79,96.3V373.463H27.807V128.406l166.79-96.3M194.6,0,0,112.353V401.271H389.213V112.353L194.6,0Z"/>
                <path d="M257.77,133.82,87.52,34.06,61.3,51.7l168.663,98.173V374.579H257.77Z" transform="translate(48.039 26.692)"/>
                <path d="M212.1,353.7H184.292V177.137L13.15,78.323,41.207,60.7,212.1,161.085Z" transform="translate(10.305 47.568)"/>
                <path d="M129.182,173.571,12.53,106.22v32.106l88.862,51.3V318.03h27.789Z" transform="translate(9.819 83.241)"/>
              </g>
            </svg>
          </div>
          <span class="qp-label">Style Quiz</span>
        </div>

        <h2 class="qp-title">Find Your Perfect Match</h2>
        <p class="qp-desc">Answer a few quick questions and we'll personalize your experience.</p>

        <div class="qp-buttons">
          <a href="/quiz/" class="qp-btn qp-btn-primary" onclick="localStorage.setItem('sg_quiz_start', 'homeowner')">
            <div class="qp-btn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div class="qp-btn-content">
              <span class="qp-btn-title">Homeowner</span>
              <span class="qp-btn-sub">Planning a remodel</span>
            </div>
          </a>

          <a href="/quiz/" class="qp-btn qp-btn-secondary" onclick="localStorage.setItem('sg_quiz_start', 'pro')">
            <div class="qp-btn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <div class="qp-btn-content">
              <span class="qp-btn-title">Trade Professional</span>
              <span class="qp-btn-sub">Contractor or designer</span>
            </div>
          </a>
        </div>

        <button class="qp-skip" onclick="window.closeQuizPopup()" type="button">
          Maybe later
        </button>
      </div>
    `;

    // Add styles
    const styles = document.createElement('style');
    styles.id = 'sgQuizPopupStyles';
    styles.textContent = `
      #sgQuizPopup {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        animation: qpFadeIn 0.3s ease-out;
      }

      @keyframes qpFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .qp-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        cursor: pointer;
      }

      .qp-card {
        position: relative;
        width: 100%;
        max-width: 380px;
        background: #fff;
        border-radius: 16px;
        padding: 32px 24px 24px;
        box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.25);
        animation: qpSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes qpSlideUp {
        from {
          opacity: 0;
          transform: translateY(24px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* Close Button - CSS X */
      .qp-close {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 32px;
        height: 32px;
        border: none;
        background: #f1f5f9;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s, transform 0.15s;
        z-index: 10;
      }

      .qp-close:hover {
        background: #e2e8f0;
        transform: scale(1.05);
      }

      .qp-close:active {
        transform: scale(0.95);
      }

      .qp-close::before,
      .qp-close::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 14px;
        height: 2px;
        background: #64748b;
        border-radius: 1px;
      }

      .qp-close::before {
        transform: translate(-50%, -50%) rotate(45deg);
      }

      .qp-close::after {
        transform: translate(-50%, -50%) rotate(-45deg);
      }

      .qp-close:hover::before,
      .qp-close:hover::after {
        background: #334155;
      }

      /* Header */
      .qp-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 20px;
      }

      .qp-icon-wrap {
        width: 56px;
        height: 56px;
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
      }

      .qp-logo {
        width: 32px;
        height: 32px;
        fill: #b45309;
      }

      .qp-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #b45309;
        background: #fef3c7;
        padding: 4px 10px;
        border-radius: 4px;
      }

      /* Content */
      .qp-title {
        font-size: 22px;
        font-weight: 700;
        color: #0f172a;
        text-align: center;
        margin: 0 0 8px;
        line-height: 1.3;
      }

      .qp-desc {
        font-size: 14px;
        color: #64748b;
        text-align: center;
        margin: 0 0 24px;
        line-height: 1.5;
      }

      /* Buttons */
      .qp-buttons {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 16px;
      }

      .qp-btn {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        border-radius: 12px;
        text-decoration: none;
        transition: all 0.2s ease;
      }

      .qp-btn-primary {
        background: linear-gradient(135deg, #f9cb00 0%, #eab308 100%);
        box-shadow: 0 4px 12px rgba(234, 179, 8, 0.3);
      }

      .qp-btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(234, 179, 8, 0.4);
      }

      .qp-btn-secondary {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
      }

      .qp-btn-secondary:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
      }

      .qp-btn-icon {
        width: 44px;
        height: 44px;
        min-width: 44px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .qp-btn-primary .qp-btn-icon {
        background: rgba(255, 255, 255, 0.25);
      }

      .qp-btn-secondary .qp-btn-icon {
        background: #fff;
        border: 1px solid #e2e8f0;
      }

      .qp-btn-icon svg {
        width: 22px;
        height: 22px;
      }

      .qp-btn-primary .qp-btn-icon svg {
        stroke: #78350f;
      }

      .qp-btn-secondary .qp-btn-icon svg {
        stroke: #b45309;
      }

      .qp-btn-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .qp-btn-title {
        font-size: 15px;
        font-weight: 600;
        color: #0f172a;
      }

      .qp-btn-primary .qp-btn-title {
        color: #422006;
      }

      .qp-btn-sub {
        font-size: 12px;
        color: #64748b;
      }

      .qp-btn-primary .qp-btn-sub {
        color: #78350f;
        opacity: 0.8;
      }

      /* Skip */
      .qp-skip {
        display: block;
        width: 100%;
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 13px;
        font-weight: 500;
        padding: 8px;
        cursor: pointer;
        transition: color 0.15s;
      }

      .qp-skip:hover {
        color: #64748b;
      }

      /* Mobile */
      @media (max-width: 480px) {
        .qp-card {
          padding: 28px 20px 20px;
        }

        .qp-icon-wrap {
          width: 48px;
          height: 48px;
        }

        .qp-logo {
          width: 28px;
          height: 28px;
        }

        .qp-title {
          font-size: 20px;
        }

        .qp-btn {
          padding: 12px 14px;
        }

        .qp-btn-icon {
          width: 40px;
          height: 40px;
          min-width: 40px;
        }

        .qp-btn-icon svg {
          width: 20px;
          height: 20px;
        }
      }

      /* Closing */
      #sgQuizPopup.closing {
        animation: qpFadeOut 0.25s ease-out forwards;
      }

      #sgQuizPopup.closing .qp-card {
        animation: qpSlideDown 0.25s ease-out forwards;
      }

      @keyframes qpFadeOut {
        to { opacity: 0; }
      }

      @keyframes qpSlideDown {
        to {
          opacity: 0;
          transform: translateY(16px) scale(0.96);
        }
      }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(popup);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  // Close popup function
  window.closeQuizPopup = function() {
    const popup = document.getElementById('sgQuizPopup');
    if (popup) {
      popup.classList.add('closing');
      dismissQuiz();
      document.body.style.overflow = '';

      setTimeout(() => {
        popup.remove();
        const styles = document.getElementById('sgQuizPopupStyles');
        if (styles) styles.remove();
      }, 250);
    }
  };

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeQuizPopup();
    }
  });

  // Auto-show popup after page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(showQuizPopup, 1000);
    });
  } else {
    setTimeout(showQuizPopup, 1000);
  }

})();
