import "@testing-library/jest-dom";
import React from "react";

// Add polyfills for TextEncoder/TextDecoder (needed for viem)
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
// @ts-ignore
global.TextDecoder = TextDecoder;

// Mock crypto.getRandomValues (needed for ethers.js)
Object.defineProperty(global, "crypto", {
  value: {
    getRandomValues: function(arr: Uint8Array) {
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
  PrivyProvider: ({ children }: { children: React.ReactNode }) => children,
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

// Mock ESM-only libs that Jest struggles to transform by default
jest.mock('jose', () => {
  class SignJWTMock {
    setProtectedHeader() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    setSubject() { return this; }
    setIssuer() { return this; }
    setAudience() { return this; }
    sign() { return Promise.resolve('test.jwt.token'); }
  }
  return {
    SignJWT: SignJWTMock,
    jwtVerify: jest.fn(async (_token: string) => ({ payload: { sub: 'did:privy:test', roles: ['admin'] } })),
  };
});

jest.mock('@privy-io/server-auth', () => {
  class PrivyClientMock {
    constructor(_appId: string, _secret: string) {}
    async getUser(_userId: string) { return { linkedAccounts: [] }; }
    async verifyAuthToken(_token: string) { return { userId: 'did:privy:test', sessionId: 'sess' }; }
  }
  return { PrivyClient: PrivyClientMock };
});
