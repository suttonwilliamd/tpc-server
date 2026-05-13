module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/e2e/', '/node_modules/'],
  testMatch: ['**/tests/test_*.js'],
};