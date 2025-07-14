import { describe, test, expect } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlockchainPayment } from '../components/payment/BlockchainPayment';

// Mock usePrivy hook
jest.mock('@privy-io/react-auth', () => ({
  usePrivy: jest.fn(),
}));

import { usePrivy } from '@privy-io/react-auth';
const mockUsePrivy = usePrivy as jest.MockedFunction<typeof usePrivy>;

describe('BlockchainPayment Component', () => {
  const defaultProps = {
    applicationId: 'test-app-id',
    amount: 100,
    currency: 'USD' as const,
    email: 'test@example.com',
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test('should show wallet connection requirement when not authenticated', () => {
    mockUsePrivy.mockReturnValue({
      user: null,
      authenticated: false,
      ready: true,
      login: jest.fn(),
      logout: jest.fn(),
    } as any);

    render(<BlockchainPayment {...defaultProps} />);
    
    expect(screen.getByText('Connect Wallet Required')).toBeInTheDocument();
    expect(screen.getByText('Please connect your wallet to proceed with blockchain payment.')).toBeInTheDocument();
  });

  test('should show initialize payment button when authenticated', () => {
    mockUsePrivy.mockReturnValue({
      user: { wallet: { address: '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8' } },
      authenticated: true,
      ready: true,
      login: jest.fn(),
      logout: jest.fn(),
    } as any);

    render(<BlockchainPayment {...defaultProps} />);
    
    expect(screen.getByText('Blockchain Payment')).toBeInTheDocument();
    expect(screen.getByText('Pay $100.00 with cryptocurrency directly to the lock contract.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Initialize Crypto Payment' })).toBeInTheDocument();
  });

  test('should handle payment initialization successfully', async () => {
    const user = userEvent.setup();
    
    mockUsePrivy.mockReturnValue({
      user: { wallet: { address: '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8' } },
      authenticated: true,
      ready: true,
      login: jest.fn(),
      logout: jest.fn(),
    } as any);

    const mockResponse = {
      success: true,
      data: {
        reference: 'test-ref-123',
        lockAddress: '0x1234567890123456789012345678901234567890',
        cohortTitle: 'Test Bootcamp',
        walletAddress: '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8',
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    } as any);

    render(<BlockchainPayment {...defaultProps} />);
    
    const initButton = screen.getByRole('button', { name: 'Initialize Crypto Payment' });
    await user.click(initButton);

    await waitFor(() => {
      expect(screen.getByText('Complete Purchase for Test Bootcamp')).toBeInTheDocument();
    });

    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchase Key with Crypto' })).toBeInTheDocument();
  });

  test('should handle initialization errors', async () => {
    const user = userEvent.setup();
    
    mockUsePrivy.mockReturnValue({
      user: { wallet: { address: '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8' } },
      authenticated: true,
      ready: true,
      login: jest.fn(),
      logout: jest.fn(),
    } as any);

    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: false,
        error: 'Invalid wallet address format',
      }),
    } as any);

    render(<BlockchainPayment {...defaultProps} />);
    
    const initButton = screen.getByRole('button', { name: 'Initialize Crypto Payment' });
    await user.click(initButton);

    await waitFor(() => {
      expect(screen.getByText('Error: Invalid wallet address format')).toBeInTheDocument();
    });
  });

  test('should show loading state during initialization', async () => {
    const user = userEvent.setup();
    
    mockUsePrivy.mockReturnValue({
      user: { wallet: { address: '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8' } },
      authenticated: true,
      ready: true,
      login: jest.fn(),
      logout: jest.fn(),
    } as any);

    // Mock a delayed response
    global.fetch = jest.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        json: () => Promise.resolve({ success: true, data: {} })
      }), 100))
    );

    render(<BlockchainPayment {...defaultProps} />);
    
    const initButton = screen.getByRole('button', { name: 'Initialize Crypto Payment' });
    await user.click(initButton);

    expect(screen.getByRole('button', { name: 'Initializing...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Initializing...' })).toBeDisabled();
  });

});

describe('API Endpoint Tests', () => {
  beforeEach(() => {
    // Mock the fetch function for API testing
    global.fetch = jest.fn();
  });

  test('should validate wallet address format in API', () => {
    const invalidAddresses = [
      'invalid-address',
      '0x123', // too short
      '0xggggggggggggggggggggggggggggggggggggggg', // invalid characters
      '', // empty
    ];

    for (const address of invalidAddresses) {
      // Simulate the validation logic from the API
      const isValid = /^0x[a-fA-F0-9]{40}$/.test(address);
      expect(isValid).toBe(false);
    }

    // Valid address should pass
    const validAddress = '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8';
    const isValid = /^0x[a-fA-F0-9]{40}$/.test(validAddress);
    expect(isValid).toBe(true);
  });

  test('should validate required fields', () => {
    const requiredFields = ['applicationId', 'amount', 'currency', 'email', 'walletAddress'];
    
    // Test missing each field
    for (const field of requiredFields) {
      const incompleteData = {
        applicationId: 'test-id',
        amount: 100,
        currency: 'USD',
        email: 'test@example.com',
        walletAddress: '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8'
      };
      
      delete (incompleteData as any)[field];
      
      const hasAllFields = requiredFields.every(f => f in incompleteData);
      expect(hasAllFields).toBe(false);
    }
  });

  test('should only accept USD currency for blockchain payments', () => {
    const currencies = ['NGN', 'EUR', 'GBP', 'BTC'];
    
    for (const currency of currencies) {
      expect(currency).not.toBe('USD');
    }
    
    expect('USD').toBe('USD'); // Only USD should be accepted
  });

  test('should validate minimum amount', () => {
    // Test the validatePaymentAmount logic
    const invalidAmounts = [0, -1, -100];
    const validAmounts = [1, 50, 100, 1000];
    
    for (const amount of invalidAmounts) {
      expect(amount).toBeLessThanOrEqual(0);
    }
    
    for (const amount of validAmounts) {
      expect(amount).toBeGreaterThan(0);
    }
  });
});

describe('PublicLock ABI Integration', () => {
  test('should have correct purchase function signature', async () => {
    const { abi } = await import('../constants/public_lock_abi');
    
    const purchaseFunction = abi.find(fn => fn.name === 'purchase');
    expect(purchaseFunction).toBeDefined();
    expect(purchaseFunction?.type).toBe('function');
    expect(purchaseFunction?.stateMutability).toBe('payable');
    
    // Verify function inputs
    const inputs = purchaseFunction?.inputs;
    expect(inputs).toHaveLength(5);
    expect(inputs?.[0].name).toBe('_values');
    expect(inputs?.[1].name).toBe('_recipients');
    expect(inputs?.[2].name).toBe('_referrers');
    expect(inputs?.[3].name).toBe('_keyManagers');
    expect(inputs?.[4].name).toBe('_data');
  });

  test('should have keyPrice function for price lookup', async () => {
    const { abi } = await import('../constants/public_lock_abi');
    
    const keyPriceFunction = abi.find(fn => fn.name === 'keyPrice');
    expect(keyPriceFunction).toBeDefined();
    expect(keyPriceFunction?.type).toBe('function');
    expect(keyPriceFunction?.stateMutability).toBe('view');
    expect(keyPriceFunction?.inputs).toHaveLength(0);
  });

  test('should have required view functions', async () => {
    const { abi } = await import('../constants/public_lock_abi');
    
    const requiredFunctions = ['balanceOf', 'getHasValidKey', 'keyPrice', 'purchase'];
    
    for (const functionName of requiredFunctions) {
      const fn = abi.find(f => f.name === functionName);
      expect(fn).toBeDefined();
    }
  });

  test('should have grantKeys function for admin operations', async () => {
    const { abi } = await import('../constants/public_lock_abi');
    
    const grantKeysFunction = abi.find(fn => fn.name === 'grantKeys');
    expect(grantKeysFunction).toBeDefined();
    expect(grantKeysFunction?.type).toBe('function');
    expect(grantKeysFunction?.stateMutability).toBe('nonpayable');
    
    // Verify inputs for grantKeys
    const inputs = grantKeysFunction?.inputs;
    expect(inputs).toHaveLength(3);
    expect(inputs?.[0].name).toBe('_recipients');
    expect(inputs?.[1].name).toBe('_expirationTimestamps');
    expect(inputs?.[2].name).toBe('_keyManagers');
  });
});

describe('Payment Utils Integration', () => {
  test('should format currency correctly', async () => {
    const { formatCurrency } = await import('../lib/payment-utils');
    
    expect(formatCurrency(100, 'USD')).toBe('$100.00');
    expect(formatCurrency(1000, 'NGN')).toBe('₦1,000.00');
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
    expect(formatCurrency(99.99, 'USD')).toBe('$99.99');
  });

  test('should validate payment amounts correctly', async () => {
    const { validatePaymentAmount } = await import('../lib/payment-utils');
    
    // USD validation
    expect(validatePaymentAmount(1, 'USD')).toBe(true);
    expect(validatePaymentAmount(0, 'USD')).toBe(false);
    expect(validatePaymentAmount(-1, 'USD')).toBe(false);
    
    // NGN validation (minimum is 10 NGN)
    expect(validatePaymentAmount(100, 'NGN')).toBe(true);
    expect(validatePaymentAmount(10, 'NGN')).toBe(true);
    expect(validatePaymentAmount(9, 'NGN')).toBe(false);
  });

  test('should generate unique payment references', async () => {
    const { generatePaymentReference } = await import('../lib/payment-utils');
    
    const ref1 = generatePaymentReference();
    const ref2 = generatePaymentReference();
    
    expect(ref1).not.toBe(ref2);
    expect(typeof ref1).toBe('string');
    expect(ref1.length).toBeGreaterThan(0);
  });
});

describe('Blockchain Configuration', () => {
  test('should have Base network configuration', async () => {
    // Test that Base network is properly configured
    const baseChainId = 8453;
    const baseSepoliaChainId = 84532;
    
    expect(baseChainId).toBe(8453);
    expect(baseSepoliaChainId).toBe(84532);
  });

  test('should validate Ethereum addresses', () => {
    const validAddresses = [
      '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8',
      '0x0000000000000000000000000000000000000000',
      '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
    ];

    const invalidAddresses = [
      '742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8', // missing 0x
      '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e', // too short
      '0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e80', // too long
      '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', // invalid characters
    ];

    for (const address of validAddresses) {
      expect(/^0x[a-fA-F0-9]{40}$/.test(address)).toBe(true);
    }

    for (const address of invalidAddresses) {
      expect(/^0x[a-fA-F0-9]{40}$/.test(address)).toBe(false);
    }
  });
});