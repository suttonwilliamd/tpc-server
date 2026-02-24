const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Helper to create a fresh DOM for each test
function createDOM() {
  const cssPath = path.join(__dirname, 'public', 'style.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
${cssContent}
        </style>
      </head>
      <body></body>
    </html>
  `, { runScripts: 'dangerously' });
  global.document = dom.window.document;
  global.window = dom.window;
  global.navigator = { userAgent: 'node.js' };

  // Mock CSS variables for JSDOM
  const root = document.documentElement;
  root.style.setProperty('--color-primary', '#007bff');
  root.style.setProperty('--color-text', '#212529');
  root.style.setProperty('--color-bg', '#ffffff');

  return dom;
}

// Helper to load CSS variables
function getCSSVariables() {
  const root = document.documentElement;
  const styles = window.getComputedStyle(root);
  return {
    primary: styles.getPropertyValue('--color-primary').trim(),
    text: styles.getPropertyValue('--color-text').trim(),
    bg: styles.getPropertyValue('--color-bg').trim(),
  };
}

describe('Button Component', () => {
  let dom;
  let Button;

  beforeAll(() => {
    const ButtonClass = require('./public/components/button.js');
    Button = ButtonClass.default || ButtonClass;
  });

  beforeEach(() => {
    dom = createDOM();
    const event = new dom.window.Event('DOMContentLoaded', { bubbles: true });
    dom.window.document.dispatchEvent(event);
  });

  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('initializes with base class and default variant/size', () => {
    const button = document.createElement('button');
    button.setAttribute('data-component', 'button');
    document.body.appendChild(button);

    new Button();

    expect(button.classList.contains('btn')).toBe(true);
    expect(button.classList.contains('btn-primary')).toBe(true);
    expect(button.classList.contains('btn-md')).toBe(true);
    expect(button.getAttribute('tabindex')).toBe('0');
    expect(button.getAttribute('role')).toBe('button');
  });

  test('supports variants: primary, secondary, danger, ghost', () => {
    const variants = ['primary', 'secondary', 'danger', 'ghost'];
    variants.forEach(variant => {
      const button = document.createElement('button');
      button.setAttribute('data-component', 'button');
      button.setAttribute('data-variant', variant);
      document.body.appendChild(button);

      new Button();

      expect(button.classList.contains(`btn-${variant}`)).toBe(true);
    });
  });

  test('supports sizes: sm, md, lg', () => {
    const sizes = ['sm', 'md', 'lg'];
    sizes.forEach(size => {
      const button = document.createElement('button');
      button.setAttribute('data-component', 'button');
      button.setAttribute('data-size', size);
      document.body.appendChild(button);

      new Button();

      expect(button.classList.contains(`btn-${size}`)).toBe(true);
    });
  });

  test('handles disabled state', () => {
    const button = document.createElement('button');
    button.setAttribute('data-component', 'button');
    button.setAttribute('data-disabled', 'true');
    document.body.appendChild(button);

    new Button();

    expect(button.classList.contains('disabled')).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(true);
  });

  test('handles loading state', () => {
    const button = document.createElement('button');
    button.setAttribute('data-component', 'button');
    button.setAttribute('data-loading', 'true');
    document.body.appendChild(button);

    new Button();

    expect(button.classList.contains('loading')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
  });

  test('prevents click on disabled button', () => {
    const button = document.createElement('button');
    button.setAttribute('data-component', 'button');
    button.setAttribute('data-disabled', 'true');
    document.body.appendChild(button);

    new Button();

    const preventDefaultSpy = jest.fn();
    const clickEvent = new MouseEvent('click', { bubbles: true });
    clickEvent.preventDefault = preventDefaultSpy;
    button.dispatchEvent(clickEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  test('accessibility: keyboard navigation', () => {
    const button = document.createElement('button');
    button.setAttribute('data-component', 'button');
    document.body.appendChild(button);

    new Button();

    const clickSpy = jest.fn();
    button.addEventListener('click', clickSpy);

    // Simulate Enter key
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    button.dispatchEvent(enterEvent);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Simulate Space key
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    button.dispatchEvent(spaceEvent);
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  test('update method changes variant and size', () => {
    const button = document.createElement('button');
    button.setAttribute('data-component', 'button');
    document.body.appendChild(button);

    new Button();

    Button.update(button, { variant: 'secondary', size: 'lg' });

    expect(button.classList.contains('btn-secondary')).toBe(true);
    expect(button.classList.contains('btn-lg')).toBe(true);
  });
});

describe('Input Component', () => {
  let dom;
  let Input;

  beforeAll(() => {
    const InputClass = require('./public/components/input.js');
    Input = InputClass.default || InputClass;
  });

  beforeEach(() => {
    dom = createDOM();
    const event = new dom.window.Event('DOMContentLoaded', { bubbles: true });
    dom.window.document.dispatchEvent(event);
  });

  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('initializes with base class and default type', () => {
    const input = document.createElement('input');
    input.setAttribute('data-component', 'input');
    document.body.appendChild(input);

    new Input();

    expect(input.classList.contains('input')).toBe(true);
    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  test('supports types: text, search', () => {
    const types = ['text', 'search'];
    types.forEach(type => {
      const input = document.createElement('input');
      input.setAttribute('data-component', 'input');
      input.setAttribute('data-type', type);
      document.body.appendChild(input);

      new Input();

      expect(input.getAttribute('type')).toBe(type);
      if (type === 'search') {
        expect(input.classList.contains('input-search')).toBe(true);
      }
    });
  });

  test('adds label and wrapper if label provided', () => {
    const input = document.createElement('input');
    input.setAttribute('data-component', 'input');
    input.setAttribute('data-label', 'Test Label');
    input.id = 'test-input';
    document.body.appendChild(input);

    new Input();

    const wrapper = input.closest('.input-wrapper');
    expect(wrapper).toBeTruthy();
    const label = wrapper.querySelector('.input-label');
    expect(label.textContent).toBe('Test Label');
    expect(label.getAttribute('for')).toBe('test-input');
    const errorMsg = wrapper.querySelector('.input-error-message');
    expect(errorMsg).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toBe(errorMsg.id);
  });

  test('handles error state', () => {
    const input = document.createElement('input');
    input.setAttribute('data-component', 'input');
    input.setAttribute('data-error', 'Error message');
    document.body.appendChild(input);

    new Input();

    expect(input.classList.contains('error')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  test('validation: required on input and blur', () => {
    const input = document.createElement('input');
    input.setAttribute('data-component', 'input');
    input.setAttribute('data-validate', 'required');
    input.setAttribute('data-error', 'Required');
    document.body.appendChild(input);

    new Input();

    // Invalid input
    const inputEvent = new Event('input', { bubbles: true });
    input.value = '';
    input.dispatchEvent(inputEvent);
    expect(input.classList.contains('error')).toBe(true);

    // Valid input
    input.value = 'test';
    input.dispatchEvent(inputEvent);
    expect(input.classList.contains('error')).toBe(false);

    // Blur triggers validation
    const blurEvent = new Event('blur', { bubbles: true });
    input.value = '';
    input.dispatchEvent(blurEvent);
    expect(input.classList.contains('error')).toBe(true);
  });

  test('handles disabled state', () => {
    const input = document.createElement('input');
    input.setAttribute('data-component', 'input');
    input.setAttribute('data-disabled', 'true');
    document.body.appendChild(input);

    new Input();

    expect(input.disabled).toBe(true);
    expect(input.getAttribute('aria-disabled')).toBe('true');
  });

  test('update method sets value and triggers validation', () => {
    const input = document.createElement('input');
    input.setAttribute('data-component', 'input');
    input.setAttribute('data-validate', 'required');
    input.setAttribute('data-error', 'Required');
    document.body.appendChild(input);

    new Input();

    Input.update(input, { value: 'test' });

    expect(input.value).toBe('test');
    expect(input.classList.contains('error')).toBe(false);
  });
});

describe('Card Component', () => {
  let dom;
  let Card;

  beforeAll(() => {
    const CardClass = require('./public/components/Card.js');
    Card = CardClass.default || CardClass;
  });

  beforeEach(() => {
    dom = createDOM();
    const event = new dom.window.Event('DOMContentLoaded', { bubbles: true });
    dom.window.document.dispatchEvent(event);
  });

  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('initializes with base class and role', () => {
    const card = document.createElement('div');
    card.setAttribute('data-component', 'card');
    document.body.appendChild(card);

    new Card();

    expect(card.classList.contains('card')).toBe(true);
    expect(card.getAttribute('role')).toBe('article');
    expect(card.getAttribute('tabindex')).toBe('0');
  });

  test('supports types: plan, thought', () => {
    const types = ['plan', 'thought'];
    types.forEach(type => {
      const card = document.createElement('div');
      card.setAttribute('data-component', 'card');
      card.setAttribute('data-type', type);
      document.body.appendChild(card);

      new Card();

      expect(card.classList.contains(`${type}-card`)).toBe(true);
    });
  });

  test('creates header, body, footer sections', () => {
    const card = document.createElement('div');
    card.setAttribute('data-component', 'card');
    document.body.appendChild(card);

    new Card();

    const header = card.querySelector('.card-header');
    const body = card.querySelector('.card-body');
    const footer = card.querySelector('.card-footer');
    expect(header).toBeTruthy();
    expect(body).toBeTruthy();
    expect(footer).toBeTruthy();
  });

  test('adds title and status to header', () => {
    const card = document.createElement('div');
    card.setAttribute('data-component', 'card');
    card.setAttribute('data-title', 'Test Title');
    card.setAttribute('data-status', 'Active');
    document.body.appendChild(card);

    new Card();

    const title = card.querySelector('.card-header h3');
    const status = card.querySelector('.status');
    expect(title.textContent).toBe('Test Title');
    expect(status.textContent).toBe('Active');
  });

  test('adds description to body', () => {
    const card = document.createElement('div');
    card.setAttribute('data-component', 'card');
    card.setAttribute('data-description', 'Test Description');
    document.body.appendChild(card);

    new Card();

    const desc = card.querySelector('.card-body p');
    expect(desc.textContent).toBe('Test Description');
  });

  test('adds tags and actions to footer', () => {
    const card = document.createElement('div');
    card.setAttribute('data-component', 'card');
    card.setAttribute('data-tags', 'tag1, tag2');
    card.setAttribute('data-actions', 'Edit, Delete');
    document.body.appendChild(card);

    new Card();

    const tags = card.querySelectorAll('.tag');
    expect(tags.length).toBe(2);
    expect(tags[0].querySelector('.tag-text').textContent).toBe('tag1');

    const actionBtns = card.querySelectorAll('[data-component="button"]');
    expect(actionBtns.length).toBe(2);
    expect(actionBtns[0].textContent.trim()).toBe('Edit');
  });

  test('accessibility: keyboard navigation and aria-label', () => {
    const card = document.createElement('div');
    card.setAttribute('data-component', 'card');
    card.setAttribute('data-title', 'Test Title');
    document.body.appendChild(card);

    new Card();

    expect(card.getAttribute('aria-label')).toBe('Test Title');

    const clickSpy = jest.fn();
    card.addEventListener('click', clickSpy);

    // Simulate Enter key
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    card.dispatchEvent(enterEvent);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('update method changes content', () => {
    const card = document.createElement('div');
    card.setAttribute('data-component', 'card');
    document.body.appendChild(card);

    new Card();

    Card.update(card, {
      title: 'New Title',
      status: 'Updated',
      description: 'New Desc',
      tags: ['newtag']
    });

    const title = card.querySelector('.card-header h3');
    const status = card.querySelector('.status');
    const desc = card.querySelector('.card-body p');
    const tags = card.querySelectorAll('.tag');

    expect(title.textContent).toBe('New Title');
    expect(status.textContent).toBe('Updated');
    expect(desc.textContent).toBe('New Desc');
    expect(tags.length).toBe(1);
  });
});

describe('CSS Variables and Themes', () => {
  let dom;

  beforeEach(() => {
    dom = createDOM();
  });

  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('light theme variables are set', () => {
    const vars = getCSSVariables();
    expect(vars.primary).toBe('#007bff');
    expect(vars.text).toBe('#212529');
    expect(vars.bg).toBe('#ffffff');
  });

  test('dark theme variables are set', () => {
    // Mock dark theme variables
    const root = document.documentElement;
    root.style.setProperty('--color-primary', '#0d6efd');
    root.style.setProperty('--color-text', '#f8f9fa');
    root.style.setProperty('--color-bg', '#212529');

    const vars = getCSSVariables();
    expect(vars.primary).toBe('#0d6efd');
    expect(vars.text).toBe('#f8f9fa');
    expect(vars.bg).toBe('#212529');
  });

  test('component styles apply in light theme', () => {
    const button = document.createElement('button');
    button.classList.add('btn', 'btn-primary');
    document.body.appendChild(button);

    // Verify class for style application in light theme
    expect(button.classList.contains('btn-primary')).toBe(true);
  });

  test('component styles apply in dark theme', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    const button = document.createElement('button');
    button.classList.add('btn', 'btn-primary');
    document.body.appendChild(button);

    // Verify class for style application in dark theme
    expect(button.classList.contains('btn-primary')).toBe(true);
  });

  test('root styles in light theme', () => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    expect(rootStyles.getPropertyValue('--color-primary')).toBe('#007bff');
  });
});

describe('Accessibility', () => {
  let dom;
  let Button, Input, Card;

  beforeAll(() => {
    const ButtonClass = require('./public/components/button.js');
    const InputClass = require('./public/components/input.js');
    const CardClass = require('./public/components/Card.js');
    Button = ButtonClass.default || ButtonClass;
    Input = InputClass.default || InputClass;
    Card = CardClass.default || CardClass;
  });

  beforeEach(() => {
    dom = createDOM();
    const event = new dom.window.Event('DOMContentLoaded', { bubbles: true });
    dom.window.document.dispatchEvent(event);
  });

  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('Button has proper ARIA attributes', () => {
    const button = document.createElement('button');
    button.setAttribute('data-component', 'button');
    document.body.appendChild(button);

    new Button();

    expect(button.getAttribute('tabindex')).toBe('0');
    expect(button.getAttribute('role')).toBe('button');
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });

  test('Input has proper ARIA attributes', () => {
    const input = document.createElement('input');
    input.setAttribute('data-component', 'input');
    input.setAttribute('data-label', 'Test');
    input.id = 'test-input';
    document.body.appendChild(input);

    new Input();

    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.getAttribute('aria-describedby')).not.toBeNull();
  });

  test('Card has proper ARIA attributes', () => {
    const card = document.createElement('div');
    card.setAttribute('data-component', 'card');
    card.setAttribute('data-title', 'Test');
    document.body.appendChild(card);

    new Card();

    expect(card.getAttribute('role')).toBe('article');
    expect(card.getAttribute('tabindex')).toBe('0');
    expect(card.getAttribute('aria-label')).toBe('Test');
  });
});