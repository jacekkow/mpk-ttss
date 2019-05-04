var seleniumServer = require('selenium-server');
var chromedriver = require('chromedriver');
var geckodriver = require('geckodriver');

module.exports = {
  src_folders: ['tests'],
  selenium: {
    start_process: true,
    server_path: seleniumServer.path,
    port: 4444,
    cli_args: {
      'webdriver.chrome.driver': chromedriver.path,
      'webdriver.gecko.driver': geckodriver.path,
    },
  },
  test_settings: {
    'chrome': {
      desiredCapabilities: {
        browserName: 'chrome',
      },
    },
    'chrome-headless': {
      desiredCapabilities: {
        browserName: 'chrome',
        chromeOptions: {
          args: [
            '--headless',
            '--no-sandbox',
            '--disable-gpu',
          ],
        },
      },
    },
    'firefox': {
      desiredCapabilities: {
        browserName: 'firefox',
      },
    },
    'firefox-headless': {
      desiredCapabilities: {
        browserName: 'firefox',
        'moz:firefoxOptions': {
          args: [
            '--headless',
          ],
        },
      },
    },
  },
};
