const { createButton } = require('./public/components/button.js');
const { createCard } = require('./public/components/card.js');
const { createBadge } = require('./public/components/badge.js');
const { createInput, createTextarea, createSearchInput } = require('./public/components/input.js');
const { createLoading } = require('./public/components/loading.js');

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('v2.9 Components', () => {
  describe('Button', () => {
    test('renders with variant and size', () => {
      const btn = createButton({ variant: 'primary', size: 'lg', text: 'Click' });
      expect(btn.classList.contains('button--primary')).toBe(true);
      expect(btn.classList.contains('button--lg')).toBe(true);
      expect(btn.textContent).toBe('Click');
    });

    test('handles click event', () => {
      const mockOnClick = jest.fn();
      const btn = createButton({ onClick: mockOnClick, text: 'Click' });
      btn.click();
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    test('disabled state', () => {
      const btn = createButton({ disabled: true, text: 'Disabled' });
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
    });

    test('loading state', () => {
      const btn = createButton({ loading: true, text: 'Loading...' });
      expect(btn.innerHTML).toContain('loading-spinner');
      expect(btn.disabled).toBe(true);
    });

    test('icon support', () => {
      const btn = createButton({ iconPre: '★', text: 'Star' });
      expect(btn.innerHTML).toContain('★');
    });

    test('dark theme classes', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      const btn = createButton({ variant: 'primary', text: 'Dark' });
      expect(btn.classList.contains('button--dark')).toBe(true);
    });
  });

  describe('Card', () => {
    test('renders with header, body, and footer', () => {
      const card = createCard({
        header: '<h3>Header</h3>',
        body: '<p>Body content</p>',
        footer: '<button>Footer</button>'
      });
      expect(card.querySelector('header')).toBeTruthy();
      expect(card.querySelector('section')).toBeTruthy();
      expect(card.querySelector('footer')).toBeTruthy();
      expect(card.querySelector('header h3').textContent).toBe('Header');
      expect(card.querySelector('section p').textContent).toBe('Body content');
      expect(card.querySelector('footer button').textContent).toBe('Footer');
    });

    test('handles hover event', () => {
      const mockOnHover = jest.fn();
      const card = createCard({ onHover: mockOnHover });
      card.dispatchEvent(new MouseEvent('mouseenter'));
      expect(mockOnHover).toHaveBeenCalledTimes(1);
    });

    test('dark theme classes', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      const card = createCard({ header: '<h3>Dark Card</h3>' });
      expect(card.classList.contains('card--dark')).toBe(true);
    });
  });

  describe('Badge', () => {
    test('renders with status class', () => {
      const badge = createBadge({ text: 'Proposed', status: 'proposed' });
      expect(badge.classList.contains('badge--proposed')).toBe(true);
      expect(badge.textContent).toBe('Proposed');
    });

    test('handles remove click', () => {
      const mockOnRemove = jest.fn();
      const badge = createBadge({ text: 'Remove Me', status: 'info', removable: true, onRemove: mockOnRemove });
      const removeBtn = badge.querySelector('.badge__remove');
      removeBtn.click();
      expect(mockOnRemove).toHaveBeenCalledTimes(1);
    });

    test('pill variant', () => {
      const badge = createBadge({ text: 'Pill', variant: 'pill' });
      expect(badge.classList.contains('badge--pill')).toBe(true);
    });

    test('dark theme classes', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      const badge = createBadge({ text: 'Dark Badge' });
      expect(badge.classList.contains('badge--dark')).toBe(true);
    });
  });

  describe('Input', () => {
    test('renders with value and type', () => {
      const container = createInput({ type: 'text', value: 'Test Value', placeholder: 'Enter text' });
      const input = container.querySelector('input');
      expect(input.value).toBe('Test Value');
      expect(input.placeholder).toBe('Enter text');
      expect(input.type).toBe('text');
    });

    test('handles value change event', () => {
      const mockOnChange = jest.fn();
      const container = createInput({ onChange: mockOnChange });
      const input = container.querySelector('input');
      input.value = 'New Value';
      input.dispatchEvent(new Event('input'));
      expect(mockOnChange).toHaveBeenCalledWith('New Value');
    });

    test('validation error state', () => {
      const container = createInput({
        validate: (val) => val.length < 5 ? 'Too short' : null,
        value: 'abc'
      });
      const input = container.querySelector('input');
      const errorSpan = container.querySelector('.input-error');
      expect(input.classList.contains('input--error')).toBe(false); // Initial validation
      input.value = 'ab';
      input.dispatchEvent(new Event('input'));
      expect(errorSpan.style.display).toBe('block');
      expect(errorSpan.textContent).toBe('Too short');
    });

    test('clear functionality', () => {
      const mockOnClear = jest.fn();
      const container = createSearchInput({ value: 'Clear Me', onClear: mockOnClear });
      const input = container.querySelector('input');
      const clearBtn = container.querySelector('.input-clear');
      clearBtn.click();
      expect(input.value).toBe('');
      expect(mockOnClear).toHaveBeenCalled();
    });

    test('dark theme classes', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      const container = createInput();
      const input = container.querySelector('input');
      expect(input.classList.contains('input--dark')).toBe(true);
    });
  });

  describe('Loading', () => {
    test('renders spinner type', () => {
      const loading = createLoading({ type: 'spinner', size: 'md' });
      expect(loading.classList.contains('loading--spinner')).toBe(true);
      expect(loading.classList.contains('loading--md')).toBe(true);
      expect(loading.innerHTML).toContain('<div class="spinner"></div>');
    });

    test('renders skeleton type', () => {
      const loading = createLoading({ type: 'skeleton' });
      expect(loading.classList.contains('loading--skeleton')).toBe(true);
      expect(loading.innerHTML).toContain('skeleton-line');
    });

    test('renders overlay type', () => {
      const loading = createLoading({ type: 'overlay', message: 'Loading...' });
      expect(loading.classList.contains('loading--overlay')).toBe(true);
      expect(loading.innerHTML).toContain('overlay-spinner');
      expect(loading.innerHTML).toContain('Loading...');
      expect(loading.style.position).toBe('fixed');
    });

    test('dark theme classes', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      const loading = createLoading();
      expect(loading.classList.contains('loading--dark')).toBe(true);
    });
  });

  describe('Integration', () => {
    test('renders plan card with badges', () => {
      const badge = createBadge({ text: 'proposed', status: 'proposed' });
      const button = createButton({ text: 'View' });
      const card = createCard({
        header: `<h3>Plan</h3>${badge.outerHTML}`,
        body: '<p>Description</p>',
        footer: button.outerHTML
      });
      expect(card.querySelector('.badge--proposed')).toBeTruthy();
      expect(card.querySelector('button')).toBeTruthy();
    });

    test('dark theme in integration', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      const badge = createBadge({ text: 'dark', status: 'info' });
      const card = createCard({ header: badge.outerHTML });
      expect(card.classList.contains('card--dark')).toBe(true);
      expect(badge.classList.contains('badge--dark')).toBe(true);
    });
  });
});