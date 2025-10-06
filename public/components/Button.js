// Button Component
// Initializes buttons based on data-component="button" attributes
// Supports variants: primary, secondary, danger, ghost
// Sizes: sm, md, lg (default md)
// States: disabled, loading

class Button {
  constructor() {
    this.init();
  }

  init() {
    const buttons = document.querySelectorAll('[data-component="button"]');
    buttons.forEach((el) => {
      this.initializeButton(el);
    });
  }

  initializeButton(el) {
    // Ensure it's a button or div acting as button
    if (el.tagName.toLowerCase() !== 'button' && el.tagName.toLowerCase() !== 'div') {
      console.warn('Invalid element');
      return;
    }

    // Add base class
    el.classList.add('btn');

    // Variant
    const variant = el.dataset.variant || 'primary';
    el.classList.add(`btn-${variant}`);

    // Size
    const size = el.dataset.size || 'md';
    el.classList.add(`btn-${size}`);

    // Disabled state
    if (el.dataset.disabled === 'true' || el.disabled) {
      el.classList.add('disabled');
      el.setAttribute('aria-disabled', 'true');
      el.disabled = true;
    }

    // Loading state
    if (el.dataset.loading === 'true') {
      el.classList.add('loading');
      el.setAttribute('aria-busy', 'true');
      el.disabled = true;
    }

    // Event listeners for states
    el.addEventListener('click', (e) => {
      if (el.classList.contains('disabled') || el.dataset.disabled === 'true') {
        e.preventDefault();
        return;
      }

      // Handle loading if needed
      if (el.dataset.loadingOnClick === 'true') {
        this.setLoading(el, true);
      }
    });

    // Focus for accessibility
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', el.tagName.toLowerCase() === 'div' ? 'button' : 'button');
    if (!el.getAttribute('aria-label') && el.textContent.trim()) {
      el.setAttribute('aria-label', el.textContent.trim());
    }

    // Keyboard accessibility
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  }

  static setLoading(button, loading) {
    if (loading) {
      button.dataset.loading = 'true';
      button.classList.add('loading');
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;
    } else {
      button.dataset.loading = 'false';
      button.classList.remove('loading');
      button.setAttribute('aria-busy', 'false');
      button.disabled = false;
    }
  }

  // Method to update button state externally
  static update(buttonSelector, options = {}) {
    const button = typeof buttonSelector === 'string' ? document.querySelector(buttonSelector) : buttonSelector;
    if (!button) return;

    // Initialize base if not present
    if (!button.classList.contains('btn')) {
      button.classList.add('btn');
      button.setAttribute('tabindex', '0');
      button.setAttribute('role', button.tagName.toLowerCase() === 'div' ? 'button' : 'button');
    }

    if (options.variant) {
      button.dataset.variant = options.variant;
      // Remove old variant classes
      ['primary', 'secondary', 'danger', 'ghost'].forEach(v => button.classList.remove(`btn-${v}`));
      button.classList.add(`btn-${options.variant}`);
    }

    if (options.size) {
      button.dataset.size = options.size;
      // Remove old size classes
      ['sm', 'md', 'lg'].forEach(s => button.classList.remove(`btn-${s}`));
      button.classList.add(`btn-${options.size}`);
    }

    if (options.disabled !== undefined) {
      button.dataset.disabled = options.disabled.toString();
      if (options.disabled) {
        button.classList.add('disabled');
        button.setAttribute('aria-disabled', 'true');
        button.disabled = true;
      } else {
        button.classList.remove('disabled');
        button.setAttribute('aria-disabled', 'false');
        button.disabled = false;
      }
    }

    if (options.loading !== undefined) {
      Button.setLoading(button, options.loading);
    }
  }
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new Button());
} else {
  new Button();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Button;
} else {
  window.ButtonComponent = Button;
}