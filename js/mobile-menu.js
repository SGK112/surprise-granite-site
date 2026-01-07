/**
 * Mobile Menu Toggle Function
 * Shared across all pages that use the mobile menu
 */
function toggleMobileMenu() {
  var nav = document.getElementById('mobileNav');
  if (nav) {
    nav.classList.toggle('open');
  }
}

// Also handle escape key to close menu
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var nav = document.getElementById('mobileNav');
    if (nav && nav.classList.contains('open')) {
      nav.classList.remove('open');
    }
  }
});
