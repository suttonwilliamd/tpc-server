/**
 * Badge/Pill Component for v2.9.0 Component Library Basics
 * Reusable for status labels (proposed, in_progress, completed, needs_review) or tags.
 * Options:
 * - text: string (required)
 * - status: 'default' | 'proposed' | 'in_progress' | 'completed' | 'needs_review' (default: 'default')
 * - removable: boolean (default: false)
 * - onRemove: function (optional callback for remove action)
 */

function createBadge(options = {}) {
  const { text, status = 'default', variant = 'default', removable = false, onRemove = () => {} } = options;
  const badge = document.createElement('span');
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? ' badge--dark' : '';
  badge.className = `badge badge--${status} badge--${variant}${theme}`;
  badge.setAttribute('role', 'badge');
  badge.textContent = text;
  if (removable) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'badge__remove';
    removeBtn.setAttribute('aria-label', `Remove ${text}`);
    removeBtn.textContent = '×';
    badge.appendChild(removeBtn);
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });
  }
  return badge;
}

module.exports = { createBadge };