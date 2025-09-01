// Path: supabase/functions/verify-blockchain-payment/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6.11.1';

// Helper function to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Define RPC URLs for supported networks
const RPC_URLS: Record<number, string> = {
  8453: Deno.env.get('BASE_MAINNET_RPC_URL')!,
  84532: Deno.env.get('BASE_SEPOLIA_RPC_URL')!,
};

Deno.serve(async (req) => {
  const { transactionHash, applicationId, paymentReference } = await req.json();

  if (!transactionHash || !applicationId || !paymentReference) {
    return new Response(JSON.stringify({ error: 'Missing transactionHash, applicationId, or paymentReference' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Get the chainId from the payment transaction record
  const { data: txRecord, error: txError } = await supabaseAdmin
    .from('payment_transactions')
    .select('network_chain_id')
    .eq('payment_reference', paymentReference)
    .single();

  if (txError || !txRecord || !txRecord.network_chain_id) {
    console.error('Edge Function Error: Could not find transaction or chainId for reference:', paymentReference);
    return new Response(JSON.stringify({ error: 'Transaction record not found or missing chainId' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const chainId = txRecord.network_chain_id;
  const rpcUrl = RPC_URLS[chainId];

  if (!rpcUrl) {
    console.error('Edge Function Error: Unsupported chainId:', chainId);
    return new Response(JSON.stringify({ error: `Unsupported chainId: ${chainId}` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // 2. Poll for transaction receipt on the correct network
  let receipt = null;
  for (let i = 0; i < 12; i++) { // Poll for up to 60 seconds (12 * 5s)
    try {
      receipt = await provider.getTransactionReceipt(transactionHash);
      if (receipt) break;
    } catch (e) {
      console.warn(`Attempt ${i + 1}: Error fetching receipt for tx ${transactionHash} on chain ${chainId}`, e.message);
    }
    await sleep(5000);
  }

  if (!receipt || receipt.status !== 1) {
    // If transaction failed, update the record accordingly
    await supabaseAdmin
      .from('payment_transactions')
      .update({ status: 'failed', metadata: { error: 'Transaction failed on-chain or not found after polling.' } })
      .eq('payment_reference', paymentReference);
    
    return new Response(JSON.stringify({ error: 'Transaction verification failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  
  // 3. Extract key token ID from Transfer event logs
  let keyTokenId: string | null = null;
  const transferEventTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  for (const log of receipt.logs) {
    if (log.topics[0] === transferEventTopic && log.topics.length >= 4) {
      keyTokenId = BigInt(log.topics[3]!).toString();
      break;
    }
  }

  // 4. Call the atomic database function with verified on-chain data
  const { error: rpcError } = await supabaseAdmin.rpc('handle_successful_payment', {
    p_application_id: applicationId,
    p_payment_reference: paymentReference,
    p_payment_method: 'blockchain',
    p_transaction_details: {
        transaction_hash: transactionHash,
        key_token_id: keyTokenId,
        network_chain_id: chainId,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.gasPrice.toString(), // Use gasPrice as fallback
        status: 'success'
    }
  });

  if (rpcError) {
    console.error(`Edge Function: Failed to process successful payment for application ${applicationId}`, rpcError);
    // Log the failure but don't error out the function itself.
    // The payment is valid on-chain; this indicates a DB/logic issue needing admin review.
    await supabaseAdmin.from('payment_transactions').update({
        metadata: {
            reconciliation_needed: true,
            rpc_error: rpcError.message
        }
    }).eq('payment_reference', paymentReference);
  }

  return new Response(JSON.stringify({ success: true, message: "Verification successful." }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});