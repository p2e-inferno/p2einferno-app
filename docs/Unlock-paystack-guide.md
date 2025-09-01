# Lovable.dev Implementation Guide: Paystack + Unlock Protocol Ticketing System

## Overview
This guide provides step-by-step instructions to implement a ticketing system with Paystack payments and Unlock Protocol NFT key granting using Lovable.dev's AI-driven development platform.

## Prerequisites Setup Prompt

```
I want to build a ticketing app with the following requirements:
1. Users can purchase event tickets using Paystack payments
2. After successful payment, users automatically receive an NFT ticket (Unlock Protocol key)
3. The NFT serves as the actual ticket for event access
4. Admin dashboard to manage events and view ticket sales

Tech requirements:
- Frontend: React with TypeScript
- Backend: Supabase for database
- Payments: Paystack integration
- Blockchain: Unlock Protocol on Base network
- Styling: Tailwind CSS

Please set up the basic project structure with Supabase integration enabled.
```

## Database Schema Setup

```sql
-- Events table
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date TIMESTAMP WITH TIME ZONE NOT NULL,
  venue VARCHAR(255),
  ticket_price DECIMAL(10, 2) NOT NULL,
  max_tickets INTEGER,
  lock_address VARCHAR(42), -- Unlock Protocol lock contract address
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment transactions table
CREATE TABLE payment_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  reference VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(42),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  status VARCHAR(20) DEFAULT 'pending',
  paystack_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tickets table (for tracking NFT ownership)
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  owner_wallet VARCHAR(42) NOT NULL,
  payment_transaction_id UUID REFERENCES payment_transactions(id),
  nft_token_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Policies (adjust based on your auth requirements)
CREATE POLICY "Events are viewable by everyone" ON events FOR SELECT USING (true);
CREATE POLICY "Payment transactions are viewable by owner" ON payment_transactions FOR SELECT USING (true);
CREATE POLICY "Tickets are viewable by owner" ON tickets FOR SELECT USING (true);
```

## Environment Variables Setup

```
Add these environment variables to your Lovable project:

NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key
NEXT_PUBLIC_APP_URL=https://your-app-domain.com
LOCK_MANAGER_PRIVATE_KEY=0x_your_ethereum_private_key
BASE_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_BLOCKCHAIN_NETWORK=base-sepolia
```

## Required NPM Packages

```
Please install these npm packages:
- react-paystack
- viem
- @wagmi/core
- wagmi
- axios
```

## Implementation Steps

### Step 1: Blockchain Configuration

Create `lib/blockchain/config.ts`:

```typescript
import { createPublicClient, createWalletClient, http, Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const getChain = () => {
  const network = process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || 'base-sepolia';
  return network === 'base' ? base : baseSepolia;
};

const getRpcUrl = () => {
  return process.env.BASE_RPC_URL || 'https://sepolia.base.org';
};

export const publicClient = createPublicClient({
  chain: getChain(),
  transport: http(getRpcUrl()),
});

export const createWalletClient = () => {
  const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('LOCK_MANAGER_PRIVATE_KEY not configured');
  }
  
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  return createWalletClient({
    account,
    chain: getChain(),
    transport: http(getRpcUrl()),
  });
};

// Unlock Protocol Lock ABI (simplified)
export const lockABI = [
  {
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'expirationTimestamps', type: 'uint256[]' },
      { name: 'keyManagers', type: 'address[]' }
    ],
    name: 'grantKeys',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
```

### Step 2: Key Granting Service

Create `lib/services/key-granting.ts`:

```typescript
import { Address, formatEther } from 'viem';
import { publicClient, createWalletClient, lockABI } from '../blockchain/config';

interface GrantKeyParams {
  recipientAddress: string;
  lockAddress: string;
  expirationDuration?: bigint;
}

export class KeyGrantingService {
  private walletClient = createWalletClient();

  async grantKey({ 
    recipientAddress, 
    lockAddress, 
    expirationDuration = BigInt(365 * 24 * 60 * 60) // 1 year default
  }: GrantKeyParams) {
    try {
      const expirationTimestamp = BigInt(Math.floor(Date.now() / 1000)) + expirationDuration;
      
      // Simulate transaction first
      const { request } = await publicClient.simulateContract({
        address: lockAddress as Address,
        abi: lockABI,
        functionName: 'grantKeys',
        args: [
          [recipientAddress as Address],
          [expirationTimestamp],
          [recipientAddress as Address] // User as their own key manager
        ],
        account: this.walletClient.account,
      });

      // Execute transaction
      const hash = await this.walletClient.writeContract(request);
      
      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      return {
        success: true,
        transactionHash: hash,
        receipt
      };
    } catch (error) {
      console.error('Key granting failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getManagerBalance(): Promise<string> {
    try {
      const balance = await publicClient.getBalance({
        address: this.walletClient.account.address,
      });
      return formatEther(balance);
    } catch (error) {
      return '0';
    }
  }
}

export const keyGrantingService = new KeyGrantingService();
```

### Step 3: Payment Initialization API

Create `pages/api/payment/initialize.ts`:

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { eventId, email, walletAddress } = req.body;

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Generate unique reference
    const reference = `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create payment transaction record
    const { error: txError } = await supabase
      .from('payment_transactions')
      .insert({
        event_id: eventId,
        reference,
        email,
        wallet_address: walletAddress,
        amount: event.ticket_price,
        currency: 'NGN'
      });

    if (txError) {
      return res.status(500).json({ error: 'Failed to create transaction record' });
    }

    // Initialize Paystack payment
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(event.ticket_price * 100), // Convert to kobo
        currency: 'NGN',
        reference,
        metadata: { eventId, walletAddress },
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`,
      }),
    });

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      return res.status(500).json({ error: 'Failed to initialize payment' });
    }

    res.status(200).json({
      success: true,
      data: {
        reference,
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
      }
    });

  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Step 4: Payment Verification & Key Granting API

Create `pages/api/payment/verify/[reference].ts`:

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { keyGrantingService } from '../../../../lib/services/key-granting';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { reference } = req.query;
    const { wallet } = req.query;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    // Get transaction record
    const { data: transaction, error: txError } = await supabase
      .from('payment_transactions')
      .select('*, events(*)')
      .eq('reference', reference)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Verify payment with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const paymentData = await paystackResponse.json();

    if (!paymentData.status) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Update transaction status
    const { error: updateError } = await supabase
      .from('payment_transactions')
      .update({
        status: paymentData.data.status,
        paystack_data: paymentData.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('Failed to update transaction:', updateError);
    }

    // Grant NFT key if payment successful and wallet provided
    if (paymentData.data.status === 'success' && wallet && transaction.events.lock_address) {
      const keyResult = await keyGrantingService.grantKey({
        recipientAddress: wallet as string,
        lockAddress: transaction.events.lock_address,
      });

      if (keyResult.success) {
        // Create ticket record
        await supabase
          .from('tickets')
          .insert({
            event_id: transaction.event_id,
            owner_wallet: wallet as string,
            payment_transaction_id: transaction.id,
            status: 'active',
          });

        console.log(`Successfully granted ticket NFT to ${wallet}`);
      } else {
        console.error('Failed to grant key:', keyResult.error);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        status: paymentData.data.status,
        reference: paymentData.data.reference,
        amount: paymentData.data.amount / 100,
        keyGranted: !!wallet && paymentData.data.status === 'success',
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Step 5: Frontend Payment Component

Create `components/PaystackPayment.tsx`:

```typescript
import React, { useState } from 'react';
import { PaystackButton } from 'react-paystack';
import { useRouter } from 'next/router';

interface PaystackPaymentProps {
  event: {
    id: string;
    title: string;
    ticket_price: number;
  };
  userEmail: string;
  walletAddress?: string;
}

export default function PaystackPayment({ event, userEmail, walletAddress }: PaystackPaymentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [reference, setReference] = useState<string>('');
  const router = useRouter();

  const initializePayment = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/payment/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId: event.id,
          email: userEmail,
          walletAddress,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setReference(data.data.reference);
        return data.data.access_code;
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Payment initialization failed:', error);
      alert('Failed to initialize payment');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = async (reference: any) => {
    try {
      const queryParams = walletAddress 
        ? `?wallet=${encodeURIComponent(walletAddress)}`
        : '';
      
      const response = await fetch(`/api/payment/verify/${reference.reference}${queryParams}`);
      const data = await response.json();
      
      if (data.success) {
        alert(`Payment successful! ${data.data.keyGranted ? 'Your NFT ticket has been sent to your wallet.' : ''}`);
        router.push('/tickets');
      } else {
        alert('Payment verification failed');
      }
    } catch (error) {
      console.error('Payment verification failed:', error);
      alert('Payment verification failed');
    }
  };

  const handleClose = () => {
    console.log('Payment modal closed');
  };

  const componentProps = {
    email: userEmail,
    amount: Math.round(event.ticket_price * 100), // Convert to kobo
    currency: 'NGN',
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
    text: isLoading ? 'Processing...' : `Buy Ticket - ₦${event.ticket_price}`,
    onSuccess: handleSuccess,
    onClose: handleClose,
    reference: reference || `ticket_${Date.now()}`,
  };

  return (
    <div className="w-full">
      {!walletAddress && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800">
            Connect your wallet to receive an NFT ticket automatically after payment.
          </p>
        </div>
      )}
      
      <PaystackButton 
        {...componentProps}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
        disabled={isLoading}
        onLoad={initializePayment}
      />
    </div>
  );
}
```

### Step 6: Event Listing Page

Create `pages/events/[id].tsx`:

```typescript
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import PaystackPayment from '../../components/PaystackPayment';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function EventDetails() {
  const router = useRouter();
  const { id } = router.query;
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

  useEffect(() => {
    if (id) {
      fetchEvent();
    }
  }, [id]);

  const fetchEvent = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setEvent(data);
    } catch (error) {
      console.error('Error fetching event:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!event) return <div className="p-8">Event not found</div>;

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">{event.title}</h1>
      <p className="text-gray-600 mb-4">{event.description}</p>
      <div className="mb-6">
        <p><strong>Date:</strong> {new Date(event.event_date).toLocaleDateString()}</p>
        <p><strong>Venue:</strong> {event.venue}</p>
        <p><strong>Price:</strong> ₦{event.ticket_price}</p>
      </div>

      <div className="mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Email Address</label>
          <input
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            placeholder="Enter your email"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">
            Wallet Address (Optional - for NFT ticket)
          </label>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            placeholder="0x..."
          />
        </div>
      </div>

      {userEmail && (
        <PaystackPayment
          event={event}
          userEmail={userEmail}
          walletAddress={walletAddress || undefined}
        />
      )}
    </div>
  );
}
```

## Deployment Instructions

1. **Environment Setup**: Ensure all environment variables are configured in Lovable
2. **Database Migration**: Run the SQL schema in your Supabase project
3. **Unlock Protocol Setup**: Deploy lock contracts for each event or use existing ones
4. **Fund Lock Manager**: Add ETH to your lock manager wallet for gas fees
5. **Test on Sepolia**: Use Base Sepolia testnet for initial testing

## Key Points for Lovable AI

1. **Install packages first**: Always install required npm packages before implementing
2. **Environment variables**: Ensure all environment variables are properly set
3. **Error handling**: Include comprehensive error handling in all API routes
4. **Type safety**: Use TypeScript interfaces for all data structures
5. **Security**: Never expose private keys or secret keys in frontend code
6. **Testing**: Test payment flow thoroughly before production deployment

This implementation provides a complete ticketing system where users pay with Paystack and automatically receive NFT tickets via Unlock Protocol, with the platform covering all gas fees.