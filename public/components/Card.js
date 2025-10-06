// Card Component
// Initializes cards based on data-component="card" attributes
// Structure: header (title/status), body (description), footer (tags/actions)
// Features: hover effects, themeable, accessibility (role, aria-label)
// Supports plans/thoughts display

class Card {
  constructor() {
    this.init();
  }

  init() {
    const cards = document.querySelectorAll('[data-component="card"]');
    cards.forEach((el) => {
      this.initializeCard(el);
    });

    // Re-init after dynamic content (e.g., after rendering lists)
    document.addEventListener('cards:render', () => {
      this.init();
    });
  }

  initializeCard(el) {
    // Ensure it's a div or section
    if (!['div', 'section'].includes(el.tagName.toLowerCase())) {
      console.warn('Card component only supports div or section elements');
      return;
    }

    // Add base class
    el.classList.add('card');
    el.setAttribute('role', 'article');
    el.setAttribute('tabindex', '0');

    // Type for specific styling (plan/thought)
    const type = el.dataset.type || 'default';
    if (type === 'plan') {
      el.classList.add('plan-card');
    } else if (type === 'thought') {
      el.classList.add('thought-card');
    }

    // Header
    let header = el.querySelector('.card-header');
    if (!header) {
      header = document.createElement('div');
      header.classList.add('card-header');
      el.prepend(header);
    }

    // Title in header
    let title = header.querySelector('h3');
    if (!title && el.dataset.title) {
      title = document.createElement('h3');
      title.textContent = el.dataset.title;
      header.appendChild(title);
    }

    // Status in header
    if (el.dataset.status) {
      let status = header.querySelector('.status');
      if (!status) {
        status = document.createElement('span');
        status.classList.add('status');
        header.appendChild(status);
      }
      status.textContent = el.dataset.status;
    }

    // Body
    let body = el.querySelector('.card-body');
    if (!body) {
      body = document.createElement('div');
      body.classList.add('card-body');
      el.appendChild(body);
    }

    // Description in body
    if (el.dataset.description) {
      let desc = body.querySelector('p');
      if (!desc) {
        desc = document.createElement('p');
        body.appendChild(desc);
      }
      desc.textContent = el.dataset.description;
    }

    // Footer
    let footer = el.querySelector('.card-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.classList.add('card-footer');
      el.appendChild(footer);
    }

    // Tags in footer
    if (el.dataset.tags) {
      const tags = el.dataset.tags.split(',').map(tag => tag.trim());
      tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.classList.add('tag');
        tagEl.innerHTML = `<span class="tag-text">${tag}</span>`;
        footer.appendChild(tagEl);
      });
    }

    // Actions in footer (e.g., buttons)
    if (el.dataset.actions) {
      const actions = el.dataset.actions.split(',').map(action => action.trim());
      actions.forEach(action => {
        const btn = document.createElement('div');
        btn.setAttribute('data-component', 'button');
        btn.setAttribute('data-variant', 'ghost');
        btn.textContent = action;
        footer.appendChild(btn);
      });
    }

    // Hover effect already in CSS, but add JS for accessibility
    el.addEventListener('mouseenter', () => {
      el.setAttribute('aria-expanded', 'false'); // Could expand if needed
    });

    el.addEventListener('focus', () => {
      el.classList.add('focused');
    });

    el.addEventListener('blur', () => {
      el.classList.remove('focused');
    });

    // Keyboard navigation
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // Trigger click or detail view
        el.click();
      }
    });

    // Accessibility: aria-label if no title
    if (!el.getAttribute('aria-label') && title) {
      el.setAttribute('aria-label', title.textContent);
    }
  }

  // Method to update card content externally
  static update(cardSelector, options = {}) {
    const card = typeof cardSelector === 'string' ? document.querySelector(cardSelector) : cardSelector;
    if (!card) return;

    if (options.title !== undefined) {
      let title = card.querySelector('.card-header h3');
      if (!title) {
        title = document.createElement('h3');
        card.querySelector('.card-header').appendChild(title);
      }
      title.textContent = options.title;
    }

    if (options.status !== undefined) {
      let status = card.querySelector('.status');
      if (!status) {
        status = document.createElement('span');
        status.classList.add('status');
        card.querySelector('.card-header').appendChild(status);
      }
      status.textContent = options.status;
    }

    if (options.description !== undefined) {
      let desc = card.querySelector('.card-body p');
      if (!desc) {
        desc = document.createElement('p');
        card.querySelector('.card-body').appendChild(desc);
      }
      desc.textContent = options.description;
    }

    if (options.tags !== undefined) {
      const footer = card.querySelector('.card-footer');
      // Clear existing tags
      const existingTags = footer.querySelectorAll('.tag');
      existingTags.forEach(tag => tag.remove());
      // Add new tags
      options.tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.classList.add('tag');
        tagEl.innerHTML = `<span class="tag-text">${tag}</span>`;
        footer.appendChild(tagEl);
      });
    }
  }
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new Card());
} else {
  new Card();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Card;
} else {
  window.CardComponent = Card;
}