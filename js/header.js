// Modern Header JavaScript
(function() {
  'use strict';

  // Mobile menu toggle
  window.sgToggleMobileNav = function() {
    const nav = document.getElementById('sgMobileNav');
    if (nav) {
      nav.classList.toggle('open');
      document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
    }
  };

  // Close mobile nav on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const nav = document.getElementById('sgMobileNav');
      if (nav && nav.classList.contains('open')) {
        nav.classList.remove('open');
        document.body.style.overflow = '';
      }
    }
  });

  // Close mobile nav when clicking outside
  document.addEventListener('click', function(e) {
    const nav = document.getElementById('sgMobileNav');
    const btn = document.querySelector('.sg-mobile-btn');
    if (nav && nav.classList.contains('open')) {
      if (!nav.contains(e.target) && !btn.contains(e.target)) {
        nav.classList.remove('open');
        document.body.style.overflow = '';
      }
    }
  });
})();
