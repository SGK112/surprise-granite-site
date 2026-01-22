/**
 * Social Share Functionality for Blog Posts
 * Automatically attaches share handlers to Webflow-styled social links
 */
(function() {
  'use strict';

  // Get current page info
  const pageUrl = encodeURIComponent(window.location.href);
  const pageTitle = encodeURIComponent(document.title);
  const pageDescription = encodeURIComponent(
    document.querySelector('meta[name="description"]')?.content ||
    document.querySelector('.text-rich-text p')?.textContent?.slice(0, 150) ||
    ''
  );

  // Social share URLs
  const shareUrls = {
    // Copy link (first icon with chain/link SVG)
    copyLink: function() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        showShareToast('Link copied to clipboard!');
      }).catch(() => {
        // Fallback for older browsers
        const input = document.createElement('input');
        input.value = window.location.href;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showShareToast('Link copied to clipboard!');
      });
    },
    // LinkedIn
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}`,
    // Twitter/X
    twitter: `https://twitter.com/intent/tweet?url=${pageUrl}&text=${pageTitle}`,
    // Facebook
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${pageTitle}`
  };

  // Toast notification for copy link
  function showShareToast(message) {
    let toast = document.getElementById('share-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'share-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a2e;
        color: #fbbf24;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
    }, 2500);
  }

  // Attach handlers to social links
  function initSocialShare() {
    const socialLinks = document.querySelectorAll('.blog-post-header3_social-link');

    socialLinks.forEach((link, index) => {
      // Prevent default navigation
      link.addEventListener('click', function(e) {
        e.preventDefault();

        // Determine which platform based on index (order in Webflow template)
        // 0 = Copy Link, 1 = LinkedIn, 2 = Twitter, 3 = Facebook
        switch(index % 4) {
          case 0:
            shareUrls.copyLink();
            break;
          case 1:
            window.open(shareUrls.linkedin, '_blank', 'width=600,height=400');
            break;
          case 2:
            window.open(shareUrls.twitter, '_blank', 'width=600,height=400');
            break;
          case 3:
            window.open(shareUrls.facebook, '_blank', 'width=600,height=400');
            break;
        }
      });

      // Add title attribute for accessibility
      const titles = ['Copy Link', 'Share on LinkedIn', 'Share on Twitter', 'Share on Facebook'];
      link.setAttribute('title', titles[index % 4]);
      link.setAttribute('aria-label', titles[index % 4]);
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocialShare);
  } else {
    initSocialShare();
  }
})();
