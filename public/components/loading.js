/**
 * Loading Component for v2.9.0 Component Library Basics
 * Reusable for spinner, skeleton, overlay types.
 * Supports size variants (sm, md, lg), message for overlay, theme compatibility.
 */
function createLoading(options = {}) {
  const { type = 'spinner', message = '', size = 'md', onComplete = () => {} } = options;
  const loader = document.createElement('div');
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? ' loading--dark' : '';
  loader.className = `loading loading--${type} loading--${size}${theme}`;

  if (type === 'spinner') {
    loader.innerHTML = `<div class="spinner"></div>`;
  } else if (type === 'dots') {
    loader.innerHTML = `<span class="dots">...</span>`;
  } else if (type === 'skeleton') {
    loader.innerHTML = `<div class="skeleton-line"></div><div class="skeleton-line"></div>`; // Example for 2 lines; customizable
  } else if (type === 'overlay') {
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.innerHTML = `<div class="overlay-spinner"><div class="spinner"></div>${message ? `<p class="loading-message">${message}</p>` : ''}</div>`;
    loader.style.position = 'fixed';
    loader.style.inset = '0';
    loader.style.zIndex = '9999';
  }

  if (onComplete) {
    // Assume timeout or event to call onComplete, but keep simple
  }

  return loader;
}

module.exports = { createLoading };