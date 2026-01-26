// @ts-nocheck
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['**/__tests__/**/*.(ts|tsx|js)', '**/*.(test|spec).(ts|tsx|js)'],
  testPathIgnorePatterns: ['<rootDir>/__tests__/helpers/', '/node_modules/', '/.next/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^ethers(/.*)?$': '<rootDir>/__mocks__/ethers.js',
    '^react-markdown$': '<rootDir>/__mocks__/react-markdown.js',
    '^remark-gfm$': '<rootDir>/__mocks__/remark-gfm.js',
    '^rehype-sanitize$': '<rootDir>/__mocks__/rehype-sanitize.js',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'pages/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  testTimeout: 30000,
  // Transform ESM packages used in tests
  transformIgnorePatterns: ['/node_modules/(?!viem|jose|@privy-io/server-auth)'],
  // Enable manual mocks from __mocks__ directory
  moduleDirectories: ['node_modules', '<rootDir>'],
  // Clear mocks between tests for isolation
  clearMocks: true,
  restoreMocks: true,
};

module.exports = createJestConfig(customJestConfig);
