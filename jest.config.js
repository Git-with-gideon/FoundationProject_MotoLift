module.exports = {
  testEnvironment: "node",
  verbose: true,
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/server.js",
    "!src/__mocks__/**",
  ],
  coverageDirectory: "coverage",
  clearMocks: true,
  resetModules: true,
};
