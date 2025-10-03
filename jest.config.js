module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/e2e/'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
};