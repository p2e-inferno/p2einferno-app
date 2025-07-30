import "@testing-library/jest-dom";

// Add polyfills for TextEncoder/TextDecoder (needed for viem)
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock crypto.getRandomValues (needed for ethers.js)
Object.defineProperty(global, "crypto", {
  value: {
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock Next.js router
jest.mock("next/router", () => ({
  useRouter() {
    return {
      route: "/",
      pathname: "/",
      query: {},
      asPath: "/",
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
    };
  },
}));

// Mock Privy
jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    user: null,
    authenticated: false,
    ready: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  useWallets: () => ({ wallets: [] }),
  PrivyProvider: ({ children }) => children,
}));

// Mock window.ethereum for crypto tests
Object.defineProperty(window, "ethereum", {
  writable: true,
  value: {
    request: jest.fn(),
    isMetaMask: true,
  },
});

// Mock fetch globally
global.fetch = jest.fn();

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
