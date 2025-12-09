/**
 * Environment Configuration
 * Manages different API environments (dev, staging, production)
 */

/**
 * Available environment configurations
 */
export const ENVIRONMENTS = {
  development: {
    name: "development",
    apiBaseURL: process.env.DEV_API_URL || "https://dev.api.byzantine.fi",
    displayName: "Development",
    isProduction: false,
  },
  production: {
    name: "production",
    apiBaseURL: process.env.PROD_API_URL || "https://api.byzantine.fi",
    displayName: "Production",
    isProduction: true,
  },
};

/**
 * Get the current environment name from TEST_ENV
 * Defaults to 'development'
 */
export function getEnvironmentName() {
  const envName = process.env.TEST_ENV || "development";

  // Validate environment name
  if (!ENVIRONMENTS[envName]) {
    console.warn(
      `Unknown environment "${envName}", falling back to development`
    );
    return "development";
  }

  return envName;
}

/**
 * Get the current environment configuration
 * @returns {object} Environment configuration
 */
export function getEnvironment() {
  const envName = getEnvironmentName();
  return ENVIRONMENTS[envName];
}

/**
 * Check if we're running in production
 * @returns {boolean}
 */
export function isProduction() {
  return getEnvironment().isProduction;
}

/**
 * Check if we're running in CI environment
 * @returns {boolean}
 */
export function isCI() {
  return process.env.CI === "true" || process.env.CI === "1";
}

/**
 * Get environment-specific API base URL
 * Returns the URL from ENVIRONMENTS object (which already checks .env)
 * @returns {string}
 */
export function getEnvironmentBaseURL() {
  return getEnvironment().apiBaseURL;
}
