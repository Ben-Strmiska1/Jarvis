const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  use: {
    baseURL: "http://localhost:8000",
    ...devices["Desktop Chrome"],
    serviceWorkers: "block",
  },
  webServer: {
    command: "python3 -m http.server 8000",
    url: "http://localhost:8000",
    reuseExistingServer: !process.env.CI,
  },
});
