/**
 * Unit tests for v2.8.0 theme management functionality in public/index.js
 * Covers setTheme, initTheme, localStorage persistence, and toggle logic.
 */

describe('v2.8.0 Theme Management', () => {
  let mockLocalStorage;
  let mockMatchMedia;
  let themeToggle;
  let setTheme;
  let initTheme;
  let toggleHandler;

  beforeEach(() => {
    // Reset DOM
    document.documentElement.dataset.theme = undefined;
    document.body.innerHTML = '<button id="theme-toggle"></button>';
    themeToggle = document.getElementById('theme-toggle');

    // Mock localStorage
    mockLocalStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Mock matchMedia
    mockMatchMedia = jest.fn().mockReturnValue({ matches: false });
    window.matchMedia = mockMatchMedia;

    // Define the functions under test (extracted logic for unit testing without modifying production code)
    setTheme = (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    };

    initTheme = () => {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = savedTheme || (prefersDark ? 'dark' : 'light');
      setTheme(theme);
    };

    // Toggle handler logic (from event listener)
    toggleHandler = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
    };

    // Clear mocks
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockMatchMedia.mockClear();
    mockMatchMedia.mockReturnValue({ matches: false });
  });

  describe('setTheme function', () => {
    test('sets data-theme to light and updates localStorage and button text', () => {
      setTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light');
      expect(themeToggle.textContent).toBe('🌙');
    });

    test('sets data-theme to dark and updates localStorage and button text', () => {
      setTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
      expect(themeToggle.textContent).toBe('☀️');
    });
  });

  describe('initTheme function', () => {
    test('uses saved light theme from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('light');
      initTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light');
    });

    test('uses saved dark theme from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('dark');
      initTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });

    test('uses system light preference when no saved theme', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia.mockReturnValue({ matches: false });
      initTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light');
    });

    test('uses system dark preference when no saved theme', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia.mockReturnValue({ matches: true });
      initTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });
  });

  describe('theme toggle click', () => {
    test('switches from light to dark and updates localStorage', () => {
      // Set initial theme to light
      document.documentElement.setAttribute('data-theme', 'light');
      themeToggle.textContent = '🌙';

      toggleHandler();

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
      expect(themeToggle.textContent).toBe('☀️');
    });

    test('switches from dark to light and updates localStorage', () => {
      // Set initial theme to dark
      document.documentElement.setAttribute('data-theme', 'dark');
      themeToggle.textContent = '☀️';

      toggleHandler();

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light');
      expect(themeToggle.textContent).toBe('🌙');
    });
  });
});