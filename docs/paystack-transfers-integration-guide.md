# Paystack Transfers Integration Guide

**A Comprehensive Guide for Implementing User Withdrawals with Paystack**

---

## Executive Summary

This document provides a **complete implementation guide** for integrating Paystack Transfers API to enable user withdrawals in your application. The guide covers creating transfer recipients, initiating transfers, handling statuses, and implementing webhooks for real-time updates.

**Key Benefits:**

- ✅ **Direct Bank Transfers**: Send funds directly to users' bank accounts
- ✅ **Real-time Status Updates**: Webhook notifications for transfer statuses
- ✅ **Secure**: OTP confirmation support for added security
- ✅ **Multi-currency Support**: Works with NGN and other supported currencies
- ✅ **Production Ready**: Comprehensive error handling and status management

---

## Core Concepts

### Transfer Flow Overview

```
┌─────────────┐
│    User     │
│ (Recipient) │
└──────┬──────┘
       │
       │ 1. User provides bank details
       ▼
┌─────────────────────────────────┐
│    Your Application             │
│  ┌─────────────────────────────┐│
│  │  Create Transfer Recipient   ││
│  │  POST /transferrecipient     ││
│  └─────────────────────────────┘│
└──────┬──────────────────────────┘
       │ Returns recipient_code
       ▼
┌─────────────────────────────────┐
│    Your Application             │
│  ┌─────────────────────────────┐│
│  │  Initiate Transfer           ││
│  │  POST /transfer              ││
│  └─────────────────────────────┘│
└──────┬──────────────────────────┘
       │ Transfer initiated
       ▼
┌─────────────────────────────────┐
│    Paystack                     │
│  ┌─────────────────────────────┐│
│  │   Process Transfer           ││
│  └─────────────────────────────┘│
└──────┬──────────────────────────┘
       │ Webhook notification
       ▼
┌─────────────────────────────────┐
│    Your Application             │
│  ┌─────────────────────────────┐│
│  │  POST /api/paystack/webhook  ││
│  │  (Status Update)             ││
│  └─────────────────────────────┘│
└──────┬──────────────────────────┘
       │ Update user account
       ▼
┌─────────────────────────────────┐
│    User Account Updated         │
└─────────────────────────────────┘
```

---

## Prerequisites

1. **Paystack Account**: Active Paystack account with transfers enabled
2. **API Keys**: Secret key from Paystack Dashboard (Settings → API Keys & Webhooks)
3. **Sufficient Balance**: Ensure your Paystack balance can cover transfers and fees
4. **Bank Account Details**: Collect recipient bank account information

---

## Step 1: Create Transfer Recipient

Before initiating a transfer, you must create a recipient object for each user. This involves collecting their bank account details and creating a recipient via the Paystack API.

### API Endpoint

```
POST https://api.paystack.co/transferrecipient
```

### Request Headers

```typescript
{
  "Authorization": "Bearer YOUR_SECRET_KEY",
  "Content-Type": "application/json"
}
```

### Request Body

```typescript
{
  "type": "nuban",              // For Nigerian bank accounts
  "name": "John Doe",           // Recipient's full name
  "account_number": "0123456789", // Bank account number
  "bank_code": "058",           // Bank code (see bank codes list)
  "currency": "NGN"             // Currency code
}
```

### Response

```typescript
{
  "status": true,
  "message": "Recipient created",
  "data": {
    "active": true,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "currency": "NGN",
    "domain": "test",
    "id": 123456,
    "integration": 123456,
    "name": "John Doe",
    "recipient_code": "RCP_xxxxxxxxxxxxx", // Use this for transfers
    "type": "nuban",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "is_deleted": false,
    "details": {
      "account_number": "0123456789",
      "account_name": "John Doe",
      "bank_code": "058",
      "bank_name": "Guaranty Trust Bank"
    }
  }
}
```

### Implementation Example

```typescript
// lib/paystack/transfers.ts

interface CreateRecipientParams {
  type: "nuban";
  name: string;
  account_number: string;
  bank_code: string;
  currency?: string;
}

interface RecipientResponse {
  status: boolean;
  message: string;
  data: {
    recipient_code: string;
    name: string;
    details: {
      account_number: string;
      account_name: string;
      bank_code: string;
      bank_name: string;
    };
  };
}

export async function createTransferRecipient(
  params: CreateRecipientParams
): Promise<RecipientResponse> {
  const response = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: params.type,
      name: params.name,
      account_number: params.account_number,
      bank_code: params.bank_code,
      currency: params.currency || "NGN",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create transfer recipient");
  }

  return response.json();
}
```

### Nigerian Bank Codes

Common bank codes for Nigerian banks:

- `058` - Guaranty Trust Bank (GTB)
- `011` - First Bank of Nigeria
- `014` - Access Bank
- `023` - Citibank Nigeria
- `050` - Ecobank Nigeria
- `070` - Fidelity Bank
- `214` - First City Monument Bank (FCMB)
- `030` - Heritage Bank
- `301` - Jaiz Bank
- `082` - Keystone Bank
- `526` - Parallex Bank
- `076` - Polaris Bank
- `101` - Providus Bank
- `221` - Stanbic IBTC Bank
- `068` - Standard Chartered Bank
- `232` - Sterling Bank
- `100` - Suntrust Bank
- `032` - Union Bank of Nigeria
- `033` - United Bank For Africa (UBA)
- `215` - Unity Bank
- `035` - Wema Bank
- `057` - Zenith Bank

**Note**: For a complete list, use the [List Banks endpoint](https://paystack.com/docs/api/miscellaneous/#list-banks).

---

## Step 2: Initiate Transfer

Once you have a `recipient_code`, you can initiate a transfer to send funds to the user's account.

### API Endpoint

```
POST https://api.paystack.co/transfer
```

### Request Headers

```typescript
{
  "Authorization": "Bearer YOUR_SECRET_KEY",
  "Content-Type": "application/json"
}
```

### Request Body

```typescript
{
  "source": "balance",                    // Source of funds
  "amount": 50000,                        // Amount in kobo (500.00 NGN)
  "recipient": "RCP_xxxxxxxxxxxxx",       // Recipient code from Step 1
  "reason": "Withdrawal for user payment", // Transfer description
  "reference": "unique-transfer-ref-123"  // Unique reference (optional but recommended)
}
```

### Response

```typescript
{
  "status": true,
  "message": "Transfer requires OTP validation", // If OTP is enabled
  "data": {
    "integration": 123456,
    "domain": "test",
    "amount": 50000,
    "currency": "NGN",
    "source": "balance",
    "reason": "Withdrawal for user payment",
    "recipient": {
      "domain": "test",
      "type": "nuban",
      "currency": "NGN",
      "name": "John Doe",
      "details": {
        "account_number": "0123456789",
        "account_name": "John Doe",
        "bank_code": "058",
        "bank_name": "Guaranty Trust Bank"
      },
      "description": null,
      "metadata": null,
      "recipient_code": "RCP_xxxxxxxxxxxxx",
      "active": true,
      "id": 123456,
      "integration": 123456,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "status": "otp", // Status: pending, otp, processing, success, failed, reversed
    "transfer_code": "TRF_xxxxxxxxxxxxx",
    "id": 123456,
    "createdAt": "2024-01-15T10:35:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

### Transfer Statuses

- `pending`: Transfer is queued for processing
- `otp`: Transfer requires OTP confirmation
- `processing`: Transfer is being processed
- `success`: Transfer completed successfully
- `failed`: Transfer failed (check failure reason)
- `reversed`: Transfer was reversed back to your balance

### Implementation Example

```typescript
// lib/paystack/transfers.ts

interface InitiateTransferParams {
  source: "balance";
  amount: number; // Amount in kobo (smallest currency unit)
  recipient: string; // recipient_code
  reason: string;
  reference?: string;
}

interface TransferResponse {
  status: boolean;
  message: string;
  data: {
    transfer_code: string;
    status:
      | "pending"
      | "otp"
      | "processing"
      | "success"
      | "failed"
      | "reversed";
    amount: number;
    currency: string;
    recipient: {
      recipient_code: string;
      name: string;
      details: {
        account_number: string;
        bank_name: string;
      };
    };
    createdAt: string;
    updatedAt: string;
  };
}

export async function initiateTransfer(
  params: InitiateTransferParams
): Promise<TransferResponse> {
  // Generate unique reference if not provided
  const reference =
    params.reference ||
    `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const response = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: params.source,
      amount: params.amount,
      recipient: params.recipient,
      reason: params.reason,
      reference: reference,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to initiate transfer");
  }

  return response.json();
}
```

### ⚠️ Important: OTP and Automated Transfers

**Critical Understanding**: If OTP confirmation is enabled on your Paystack account, **you cannot fully automate transfers**. Here's why:

- When OTP is enabled, Paystack sends an OTP to **your registered email/phone** (the account owner, not the end user)
- You must **manually enter this OTP** to finalize each transfer
- This means every user withdrawal would require manual intervention from you

**For Automated/Programmatic Withdrawals**: You should **disable OTP confirmation** to enable fully automated transfers.

#### Option 1: Disable OTP via Dashboard (Recommended)

1. Log in to Paystack Dashboard
2. Go to **Settings** → **Preferences**
3. In the **Transfer** section, **uncheck** "Confirm transfers before sending"
4. OTP will be disabled for all future transfers

#### Option 2: Disable OTP via API

```typescript
// lib/paystack/transfers.ts

// Step 1: Request OTP disable
export async function disableOtp(): Promise<{
  status: boolean;
  message: string;
}> {
  const response = await fetch("https://api.paystack.co/transfer/disable_otp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to disable OTP");
  }

  return response.json();
  // Paystack will send an OTP to your registered phone to confirm this action
}

// Step 2: Finalize OTP disable with the OTP you received
export async function finalizeDisableOtp(
  otp: string
): Promise<{ status: boolean; message: string }> {
  const response = await fetch(
    "https://api.paystack.co/transfer/finalize_disable_otp",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ otp }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to finalize OTP disable");
  }

  return response.json();
}
```

#### Handling OTP Confirmation (If OTP is Enabled)

**Note**: Only use this if you have OTP enabled and need manual confirmation. For automated withdrawals, disable OTP instead.

```typescript
// lib/paystack/transfers.ts

interface FinalizeTransferParams {
  transfer_code: string;
  otp: string; // OTP sent to YOUR email/phone (account owner), not the user
}

export async function finalizeTransfer(
  params: FinalizeTransferParams
): Promise<TransferResponse> {
  const response = await fetch(
    "https://api.paystack.co/transfer/finalize_transfer",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transfer_code: params.transfer_code,
        otp: params.otp,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to finalize transfer");
  }

  return response.json();
}
```

#### Security Considerations When Disabling OTP

When you disable OTP for automated transfers, implement these security measures:

1. **Server-Side Validation**: Validate all withdrawal requests on your backend
2. **Rate Limiting**: Limit withdrawal frequency per user
3. **Amount Limits**: Set maximum withdrawal amounts
4. **Audit Logging**: Log all transfer attempts and completions
5. **Webhook Verification**: Always verify webhook signatures
6. **Balance Checks**: Verify sufficient balance before initiating transfers
7. **User Authentication**: Ensure only authenticated users can request withdrawals

---

## Step 3: Verify Transfer Status

You can verify the status of a transfer using the transfer code or reference.

### API Endpoint

```
GET https://api.paystack.co/transfer/{transfer_code}
```

### Implementation Example

```typescript
// lib/paystack/transfers.ts

export async function verifyTransfer(
  transferCode: string
): Promise<TransferResponse> {
  const response = await fetch(
    `https://api.paystack.co/transfer/${transferCode}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to verify transfer");
  }

  return response.json();
}
```

---

## Step 4: Implement Webhooks

Webhooks provide real-time notifications about transfer status changes. This is the recommended way to handle transfer updates.

### Webhook Events

Paystack sends the following webhook events for transfers:

- `transfer.success`: Transfer completed successfully
- `transfer.failed`: Transfer failed
- `transfer.reversed`: Transfer was reversed

### Webhook Payload Structure

```typescript
{
  "event": "transfer.success",
  "data": {
    "domain": "test",
    "amount": 50000,
    "currency": "NGN",
    "reference": "unique-transfer-ref-123",
    "source": "balance",
    "source_details": null,
    "reason": "Withdrawal for user payment",
    "status": "success",
    "failures": null,
    "transfer_code": "TRF_xxxxxxxxxxxxx",
    "titration": null,
    "titan_code": null,
    "transaction": {
      "id": 123456,
      "domain": "test",
      "status": "success",
      "reference": "unique-transfer-ref-123",
      "amount": 50000,
      "message": null,
      "gateway_response": "Successful",
      "paid_at": "2024-01-15T10:40:00.000Z",
      "created_at": "2024-01-15T10:35:00.000Z",
      "channel": "transfer",
      "currency": "NGN",
      "ip_address": null,
      "metadata": null,
      "log": null,
      "fees": null,
      "fees_split": null,
      "authorization": {},
      "customer": {},
      "plan": {},
      "split": {},
      "order_id": null,
      "paidAt": "2024-01-15T10:40:00.000Z",
      "createdAt": "2024-01-15T10:35:00.000Z",
      "requested_amount": 50000,
      "pos_transaction_data": null,
      "source": null,
      "fees_breakdown": null
    },
    "recipient": {
      "domain": "test",
      "type": "nuban",
      "currency": "NGN",
      "name": "John Doe",
      "details": {
        "account_number": "0123456789",
        "account_name": "John Doe",
        "bank_code": "058",
        "bank_name": "Guaranty Trust Bank"
      },
      "description": null,
      "metadata": null,
      "recipient_code": "RCP_xxxxxxxxxxxxx",
      "active": true,
      "id": 123456,
      "integration": 123456,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "session": {
      "provider": null,
      "id": null
    },
    "created_at": "2024-01-15T10:35:00.000Z",
    "updated_at": "2024-01-15T10:40:00.000Z"
  }
}
```

### Webhook Verification

Always verify webhook signatures to ensure requests are from Paystack:

```typescript
// lib/paystack/webhooks.ts

import crypto from "crypto";

export function verifyPaystackWebhook(
  payload: string,
  signature: string
): boolean {
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(payload)
    .digest("hex");

  return hash === signature;
}
```

### Webhook Endpoint Implementation

```typescript
// pages/api/paystack/webhook.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { verifyPaystackWebhook } from "@/lib/paystack/webhooks";

interface TransferWebhookData {
  event: "transfer.success" | "transfer.failed" | "transfer.reversed";
  data: {
    transfer_code: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    recipient: {
      recipient_code: string;
      name: string;
      details: {
        account_number: string;
        bank_name: string;
      };
    };
    transaction?: {
      id: number;
      status: string;
      reference: string;
    };
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify webhook signature
    const signature = req.headers["x-paystack-signature"] as string;
    const payload = JSON.stringify(req.body);

    if (!verifyPaystackWebhook(payload, signature)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event: TransferWebhookData = req.body;

    // Handle different transfer events
    switch (event.event) {
      case "transfer.success":
        await handleTransferSuccess(event.data);
        break;

      case "transfer.failed":
        await handleTransferFailed(event.data);
        break;

      case "transfer.reversed":
        await handleTransferReversed(event.data);
        break;

      default:
        console.log("Unhandled event:", event.event);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

async function handleTransferSuccess(data: TransferWebhookData["data"]) {
  // Update user account balance
  // Mark withdrawal as successful
  // Send notification to user
  console.log("Transfer successful:", {
    transferCode: data.transfer_code,
    reference: data.reference,
    amount: data.amount,
    recipient: data.recipient.name,
  });
}

async function handleTransferFailed(data: TransferWebhookData["data"]) {
  // Revert user account balance
  // Mark withdrawal as failed
  // Send notification to user
  // Log failure reason
  console.log("Transfer failed:", {
    transferCode: data.transfer_code,
    reference: data.reference,
    amount: data.amount,
  });
}

async function handleTransferReversed(data: TransferWebhookData["data"]) {
  // Revert user account balance
  // Mark withdrawal as reversed
  // Send notification to user
  console.log("Transfer reversed:", {
    transferCode: data.transfer_code,
    reference: data.reference,
    amount: data.amount,
  });
}
```

### Configure Webhook URL

1. Go to Paystack Dashboard → Settings → API Keys & Webhooks
2. Add your webhook URL: `https://yourdomain.com/api/paystack/webhook`
3. Select events: `transfer.success`, `transfer.failed`, `transfer.reversed`
4. Save and test the webhook

---

## Step 5: Check Balance

Before initiating transfers, check your Paystack balance to ensure sufficient funds.

### API Endpoint

```
GET https://api.paystack.co/balance
```

### Implementation Example

```typescript
// lib/paystack/transfers.ts

interface BalanceResponse {
  status: boolean;
  message: string;
  data: {
    currency: string;
    balance: number; // Balance in kobo
  };
}

export async function getBalance(): Promise<BalanceResponse> {
  const response = await fetch("https://api.paystack.co/balance", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to get balance");
  }

  return response.json();
}
```

---

## Complete Implementation Example

Here's a complete example of a withdrawal API endpoint:

```typescript
// pages/api/paystack/withdraw.ts

import type { NextApiRequest, NextApiResponse } from "next";
import {
  createTransferRecipient,
  initiateTransfer,
  getBalance,
} from "@/lib/paystack/transfers";

interface WithdrawRequest {
  userId: string;
  amount: number; // Amount in NGN (not kobo)
  bankDetails: {
    account_number: string;
    bank_code: string;
    account_name: string;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, amount, bankDetails }: WithdrawRequest = req.body;

    // Validate input
    if (!userId || !amount || !bankDetails) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (amount < 100) {
      return res.status(400).json({ error: "Minimum withdrawal is 1.00 NGN" });
    }

    // Check balance
    const balanceData = await getBalance();
    const balanceInNaira = balanceData.data.balance / 100;
    const amountInKobo = amount * 100;

    if (balanceInNaira < amount) {
      return res.status(400).json({
        error: "Insufficient balance",
        available: balanceInNaira,
      });
    }

    // Check if recipient already exists (store recipient_code in database)
    // For this example, we'll create a new recipient each time
    // In production, you should store and reuse recipient codes

    // Create transfer recipient
    const recipientData = await createTransferRecipient({
      type: "nuban",
      name: bankDetails.account_name,
      account_number: bankDetails.account_number,
      bank_code: bankDetails.bank_code,
      currency: "NGN",
    });

    if (!recipientData.status || !recipientData.data) {
      return res.status(500).json({
        error: "Failed to create recipient",
        details: recipientData.message,
      });
    }

    const recipientCode = recipientData.data.recipient_code;

    // Initiate transfer
    const transferData = await initiateTransfer({
      source: "balance",
      amount: amountInKobo,
      recipient: recipientCode,
      reason: `Withdrawal for user ${userId}`,
      reference: `withdraw_${userId}_${Date.now()}`,
    });

    if (!transferData.status || !transferData.data) {
      return res.status(500).json({
        error: "Failed to initiate transfer",
        details: transferData.message,
      });
    }

    // Store transfer details in database
    // await saveWithdrawal({
    //   userId,
    //   transferCode: transferData.data.transfer_code,
    //   amount,
    //   status: transferData.data.status,
    //   recipientCode,
    // });

    // Note: For automated withdrawals, OTP should be disabled in Paystack Dashboard
    // If OTP is still enabled, the transfer will have status "otp" and require
    // manual intervention to finalize (not suitable for automated withdrawals)
    if (transferData.data.status === "otp") {
      // This should not happen if OTP is properly disabled
      // Consider this an error state for automated withdrawals
      console.error(
        "Transfer requires OTP - OTP should be disabled for automation"
      );
      return res.status(500).json({
        error: "Transfer requires manual OTP confirmation",
        message:
          "OTP must be disabled in Paystack Dashboard for automated withdrawals",
        transferCode: transferData.data.transfer_code,
      });
    }

    return res.json({
      success: true,
      transfer: {
        transferCode: transferData.data.transfer_code,
        status: transferData.data.status,
        amount: amount,
        recipient: recipientData.data.name,
      },
    });
  } catch (error: any) {
    console.error("Withdrawal error:", error);
    return res.status(500).json({
      error: "Withdrawal failed",
      message: error.message,
    });
  }
}
```

---

## Security Best Practices

### 1. **Environment Variables**

Never expose your secret key in client-side code:

```typescript
// ✅ Good - Server-side only
const secretKey = process.env.PAYSTACK_SECRET_KEY;

// ❌ Bad - Never do this
const secretKey = "sk_test_xxxxx";
```

### 2. **Webhook Verification**

Always verify webhook signatures:

```typescript
const signature = req.headers["x-paystack-signature"];
if (!verifyPaystackWebhook(payload, signature)) {
  return res.status(401).json({ error: "Invalid signature" });
}
```

### 3. **OTP Confirmation Decision**

**For Automated Withdrawals**: Disable OTP confirmation to enable programmatic transfers:

- Settings → Preferences → Transfer section
- **Uncheck** "Confirm transfers before sending"

**Why?** When OTP is enabled, Paystack sends an OTP to **your** email/phone (account owner), requiring manual entry for each transfer. This prevents full automation.

**Security Alternative**: Since you're disabling OTP, implement these additional security measures:

- Server-side validation of all withdrawal requests
- Rate limiting per user
- Amount limits and daily withdrawal caps
- Comprehensive audit logging
- Multi-factor authentication for admin actions
- Webhook verification (always required)

### 4. **Idempotency**

Use unique references for each transfer to prevent duplicates:

```typescript
const reference = `withdraw_${userId}_${Date.now()}_${Math.random()
  .toString(36)
  .substr(2, 9)}`;
```

### 5. **Error Handling**

Implement comprehensive error handling:

```typescript
try {
  const result = await initiateTransfer(params);
} catch (error: any) {
  // Log error
  // Notify user
  // Handle specific error types
  if (error.message.includes("Insufficient balance")) {
    // Handle insufficient balance
  }
}
```

---

## Testing

### Test Mode

Paystack provides test mode for development:

1. Use test secret key: `sk_test_xxxxx`
2. Test transfers won't actually send money
3. Use test bank accounts for recipients

### Test Bank Accounts

For testing transfers in test mode, use these test account numbers:

- Account: `0000000000` (any 10-digit number)
- Bank: Any bank code
- Name: Any name

### Test Transfer Flow

1. Create test recipient
2. Initiate test transfer
3. Verify webhook receives test events
4. Check transfer status

---

## Common Issues and Solutions

### Issue: "Insufficient balance"

**Solution**: Check your Paystack balance before initiating transfers.

```typescript
const balance = await getBalance();
if (balance.data.balance < amountInKobo) {
  // Handle insufficient balance
}
```

### Issue: "Invalid bank code"

**Solution**: Use valid bank codes. Fetch list of banks:

```typescript
const response = await fetch("https://api.paystack.co/bank", {
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  },
});
```

### Issue: "Transfer requires OTP"

**For Automated Withdrawals**: Disable OTP in Paystack Dashboard instead of implementing OTP finalization:

1. Go to Settings → Preferences → Transfer section
2. Uncheck "Confirm transfers before sending"

**Why?** OTP is sent to **your** email/phone (account owner), not the end user. This requires manual intervention for every transfer, which defeats automation.

**If You Must Use OTP** (not recommended for automation):

- OTP is sent to the account owner's registered email/phone
- You must manually retrieve and enter the OTP
- Use `finalizeTransfer()` with the OTP you received
- This is only suitable for manual, low-volume transfers

### Issue: "Webhook not receiving events"

**Solution**:

1. Verify webhook URL is accessible
2. Check webhook configuration in dashboard
3. Ensure webhook signature verification is correct
4. Test webhook endpoint manually

---

## Additional Resources

- [Paystack Transfers Documentation](https://paystack.com/docs/transfers/managing-transfers/)
- [Transfer Recipients Guide](https://paystack.com/docs/transfers/transfer-recipients/)
- [Single Transfers Guide](https://paystack.com/docs/transfers/single-transfers/)
- [Webhooks Documentation](https://paystack.com/docs/payments/webhooks/)
- [API Reference](https://paystack.com/docs/api/transfer/)

---

## Summary

This guide covers the complete implementation of Paystack transfers for user withdrawals:

1. ✅ **Create Transfer Recipients**: Collect bank details and create recipient objects
2. ✅ **Initiate Transfers**: Send funds to users' bank accounts
3. ✅ **Handle Statuses**: Process transfer status updates via webhooks
4. ✅ **Security**: Implement webhook verification and proper security measures
5. ✅ **Error Handling**: Comprehensive error handling and status management

**Important**: For automated/programmatic withdrawals, **disable OTP confirmation** in Paystack Dashboard. OTP requires manual entry from the account owner and prevents full automation.

Follow this guide to implement secure, reliable user withdrawals in your application using Paystack.
