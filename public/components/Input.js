// Input Component
// Initializes inputs based on data-component="input" attributes
// Supports types: text, search
// Features: label, placeholder, error state, validation feedback
// Accessibility: ARIA labels, error announcements

class Input {
  constructor() {
    this.init();
  }

  init() {
    const inputs = document.querySelectorAll('[data-component="input"]');
    inputs.forEach((el) => {
      this.initializeInput(el);
    });
  }

  initializeInput(el) {
    // Ensure it's an input element
    if (el.tagName.toLowerCase() !== 'input') {
      console.warn('Input component only supports input elements');
      return;
    }

    // Add base class
    el.classList.add('input');

    // Type
    const type = el.dataset.type || 'text';
    if (type === 'search') {
      el.classList.add('input-search');
    }
    el.setAttribute('type', type);

    // Placeholder
    if (el.dataset.placeholder) {
      el.setAttribute('placeholder', el.dataset.placeholder);
    }

    // Label
    const labelText = el.dataset.label;
    if (labelText) {
      const label = document.createElement('label');
      label.classList.add('input-label');
      label.textContent = labelText;
      label.setAttribute('for', el.id || `input-${Date.now()}`);
      if (!el.id) {
        el.id = `input-${Date.now()}`;
      }
      label.htmlFor = el.id;

      // Wrap in input-wrapper
      const wrapper = document.createElement('div');
      wrapper.classList.add('input-wrapper');
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(label);
      wrapper.appendChild(el);

      // Error message container
      const errorMsg = document.createElement('div');
      errorMsg.classList.add('input-error-message');
      errorMsg.setAttribute('aria-live', 'polite');
      errorMsg.id = `${el.id}-error`;
      wrapper.appendChild(errorMsg);
      el.setAttribute('aria-describedby', errorMsg.id);
    }

    // Error state
    if (el.dataset.error) {
      this.setError(el, el.dataset.error);
    }

    // Validation
    if (el.dataset.validate) {
      const validateFn = this.getValidationFunction(el.dataset.validate);
      if (validateFn) {
        el.addEventListener('input', (e) => {
          const isValid = validateFn(e.target.value);
          this.setError(el, !isValid ? el.dataset.error || 'Invalid input' : null);
        });
        el.addEventListener('blur', (e) => {
          const isValid = validateFn(e.target.value);
          if (!isValid) {
            this.setError(el, el.dataset.error || 'Invalid input');
          }
        });
      }
    }

    // Disabled
    if (el.dataset.disabled === 'true' || el.disabled) {
      el.disabled = true;
      el.setAttribute('aria-disabled', 'true');
    }

    // Accessibility
    if (!el.getAttribute('aria-label') && labelText) {
      el.setAttribute('aria-label', labelText);
    }

    // Set initial error state
    this.setError(el, el.dataset.error || null);
  }

  setError(input, message) {
    const wrapper = input.closest('.input-wrapper');
    const errorEl = wrapper ? wrapper.querySelector('.input-error-message') : null;

    if (message) {
      input.classList.add('error');
      input.setAttribute('aria-invalid', 'true');
      if (errorEl) {
        errorEl.textContent = message;
      }
    } else {
      input.classList.remove('error');
      input.setAttribute('aria-invalid', 'false');
      if (errorEl) {
        errorEl.textContent = '';
      }
    }
  }

  getValidationFunction(type) {
    const validations = {
      email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      required: (value) => value.trim().length > 0,
      minLength: (value, min = 3) => value.length >= parseInt(min),
      // Add more as needed
    };
    return validations[type] || null;
  }

  // Method to update input state externally
  static update(inputSelector, options = {}) {
    const input = typeof inputSelector === 'string' ? document.querySelector(inputSelector) : inputSelector;
    if (!input) return;

    if (options.value !== undefined) {
      input.value = options.value;
      // Trigger input event for validation
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (options.disabled !== undefined) {
      input.disabled = options.disabled;
      input.setAttribute('aria-disabled', options.disabled.toString());
    }

    if (options.error !== undefined) {
      Input.setError(input, options.error);
    }

    if (options.placeholder !== undefined) {
      input.setAttribute('placeholder', options.placeholder);
    }
  }
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new Input());
} else {
  new Input();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Input;
} else {
  window.InputComponent = Input;
}