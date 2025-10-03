/**
 * Input Components for v2.9.0
 * Reusable input, textarea, and search input creators.
 * Supports labels, validation with error messages, required fields, patterns,
 * onChange handlers, and clear button for search inputs.
 * Uses design system classes and ARIA for accessibility.
 */

function createInput(options = {}) {
  const { type = 'text', placeholder = '', value = '', label = '', required = false, pattern = '', onChange = () => {}, validate = null } = options;
  const container = document.createElement('div');
  container.className = 'input-group';

  const id = `input-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (label) {
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.className = 'input-label';
    lbl.textContent = `${label}${required ? ' *' : ''}`;
    container.appendChild(lbl);
  }

  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.placeholder = placeholder;
  input.value = value;
  input.required = required;
  if (pattern) input.pattern = pattern;
  input.className = `input ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'input--dark' : ''}`;
  input.setAttribute('aria-describedby', `${id}-error`);

  const errorSpan = document.createElement('span');
  errorSpan.id = `${id}-error`;
  errorSpan.className = 'input-error';
  errorSpan.style.display = 'none';

  container.appendChild(input);
  container.appendChild(errorSpan);

  const handleInput = (e) => {
    const val = e.target.value;
    onChange(val);
    if (validate) {
      const errorMsg = validate(val);
      if (errorMsg) {
        input.setAttribute('aria-invalid', 'true');
        errorSpan.textContent = errorMsg;
        errorSpan.style.display = 'block';
      } else {
        input.removeAttribute('aria-invalid');
        errorSpan.style.display = 'none';
      }
    } else {
      input.removeAttribute('aria-invalid');
      errorSpan.style.display = 'none';
    }
  };

  input.addEventListener('input', handleInput);

  // Initial validation
  if (value && validate) {
    handleInput({ target: { value } });
  }

  return container;
}

function createTextarea(options = {}) {
  const { rows = 3, placeholder = '', value = '', label = '', required = false, onChange = () => {}, validate = null } = options;
  const container = document.createElement('div');
  container.className = 'input-group';

  const id = `textarea-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (label) {
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.className = 'input-label';
    lbl.textContent = `${label}${required ? ' *' : ''}`;
    container.appendChild(lbl);
  }

  const textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.rows = rows;
  textarea.placeholder = placeholder;
  textarea.value = value;
  textarea.required = required;
  textarea.className = `input textarea ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'input--dark' : ''}`;
  textarea.setAttribute('aria-describedby', `${id}-error`);

  const errorSpan = document.createElement('span');
  errorSpan.id = `${id}-error`;
  errorSpan.className = 'input-error';
  errorSpan.style.display = 'none';

  container.appendChild(textarea);
  container.appendChild(errorSpan);

  const handleInput = (e) => {
    const val = e.target.value;
    onChange(val);
    if (validate) {
      const errorMsg = validate(val);
      if (errorMsg) {
        textarea.setAttribute('aria-invalid', 'true');
        errorSpan.textContent = errorMsg;
        errorSpan.style.display = 'block';
      } else {
        textarea.removeAttribute('aria-invalid');
        errorSpan.style.display = 'none';
      }
    } else {
      textarea.removeAttribute('aria-invalid');
      errorSpan.style.display = 'none';
    }
  };

  textarea.addEventListener('input', handleInput);

  // Initial validation
  if (value && validate) {
    handleInput({ target: { value } });
  }

  return container;
}

function createSearchInput(options = {}) {
  const { placeholder = 'Search...', value = '', label = '', onChange = () => {}, onClear = () => {}, validate = null, withClear = true } = options;
  const container = document.createElement('div');
  container.className = 'input-group search-input-group';

  const id = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (label) {
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.className = 'input-label';
    lbl.textContent = `${label}${ ' *'}`;
    container.appendChild(lbl);
  }

  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'input-wrapper';

  const input = document.createElement('input');
  input.type = 'search';
  input.id = id;
  input.placeholder = placeholder;
  input.value = value;
  input.className = `input search-input ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'input--dark' : ''}`;
  input.setAttribute('aria-describedby', `${id}-error`);

  inputWrapper.appendChild(input);

  if (withClear) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'input-clear';
    clearBtn.innerHTML = '×';
    clearBtn.style.display = value ? 'block' : 'none';
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      input.value = '';
      input.focus();
      onClear();
      onChange('');
      clearBtn.style.display = 'none';
      input.removeAttribute('aria-invalid');
      const errorSpan = container.querySelector('.input-error');
      if (errorSpan) errorSpan.style.display = 'none';
    });
    inputWrapper.appendChild(clearBtn);
  }

  const errorSpan = document.createElement('span');
  errorSpan.id = `${id}-error`;
  errorSpan.className = 'input-error';
  errorSpan.style.display = 'none';

  container.appendChild(inputWrapper);
  container.appendChild(errorSpan);

  const handleInput = (e) => {
    const val = e.target.value;
    onChange(val);
    if (withClear) {
      const clearBtn = inputWrapper.querySelector('.input-clear');
      clearBtn.style.display = val ? 'block' : 'none';
    }
    if (validate) {
      const errorMsg = validate(val);
      if (errorMsg) {
        input.setAttribute('aria-invalid', 'true');
        errorSpan.textContent = errorMsg;
        errorSpan.style.display = 'block';
      } else {
        input.removeAttribute('aria-invalid');
        errorSpan.style.display = 'none';
      }
    } else {
      input.removeAttribute('aria-invalid');
      errorSpan.style.display = 'none';
    }
  };

  input.addEventListener('input', handleInput);

  // Initial validation
  if (value && validate) {
    handleInput({ target: { value } });
  }

  return container;
}

module.exports = { createInput, createTextarea, createSearchInput };