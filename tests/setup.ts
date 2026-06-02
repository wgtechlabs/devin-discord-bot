/**
 * Test setup file loaded before all test suites.
 *
 * Sets minimal environment variables required by the config
 * loader so tests can import modules without triggering
 * process.exit from missing env validation.
 */

process.env.DISCORD_BOT_TOKEN = "test-token";
process.env.DISCORD_CLIENT_ID = "test-client-id";
process.env.DEVIN_API_KEY = "apk_test-key";
process.env.LOG_LEVEL = "error";
