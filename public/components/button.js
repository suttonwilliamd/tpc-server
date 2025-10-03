/**
 * Button Component for v2.9.0
 * Creates a reusable, accessible button with variants, sizes, states, and icon support.
 */
function createButton(options = {}) {
  const { variant = 'primary', size = 'md', text = '', iconPre = '', iconPost = '', disabled = false, loading = false, onClick = () => {} } = options;
  const btn = document.createElement('button');
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? ' button--dark' : '';
  btn.className = `button button--${variant} button--${size}${theme}`;
  btn.setAttribute('role', 'button');

  if (disabled) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }

  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="loading-spinner"></span>${text || ''}`;
  } else {
    btn.innerHTML = `${iconPre ? `<span class="icon-pre">${iconPre}</span>` : ''}${text}${iconPost ? `<span class="icon-post">${iconPost}</span>` : ''}`;
  }

  btn.addEventListener('click', onClick);

  return btn;
}

export { createButton };