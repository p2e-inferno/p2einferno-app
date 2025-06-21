-- Create payment_transactions table for tracking Paystack payments
CREATE TABLE public.payment_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Application reference
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  
  -- Payment details
  paystack_reference VARCHAR(255) NOT NULL UNIQUE,
  paystack_access_code VARCHAR(255),
  
  -- Amount and currency
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('NGN', 'USD')),
  amount_in_kobo BIGINT NOT NULL, -- Amount in smallest currency unit
  
  -- Payment status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'success', 'failed', 'abandoned')),
  
  -- Paystack response data
  paystack_status VARCHAR(50),
  paystack_gateway_response TEXT,
  authorization_code VARCHAR(255),
  customer_code VARCHAR(255),
  
  -- Payment method details
  payment_method VARCHAR(50),
  channel VARCHAR(50),
  card_type VARCHAR(50),
  bank VARCHAR(255),
  
  -- Fees and charges
  fees DECIMAL(10,2),
  
  -- Metadata
  metadata JSONB,
  
  -- Timestamps
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_payment_transactions_application_id ON public.payment_transactions(application_id);
CREATE INDEX idx_payment_transactions_paystack_reference ON public.payment_transactions(paystack_reference);
CREATE INDEX idx_payment_transactions_status ON public.payment_transactions(status);
CREATE INDEX idx_payment_transactions_created_at ON public.payment_transactions(created_at);

-- Create updated_at trigger
CREATE TRIGGER update_payment_transactions_updated_at 
  BEFORE UPDATE ON public.payment_transactions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view their own payment transactions through their applications
CREATE POLICY "Users can view their own payment transactions" 
  ON public.payment_transactions FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.applications 
      WHERE applications.id = payment_transactions.application_id 
      AND (applications.user_email = auth.email() OR auth.uid()::text = applications.user_email)
    )
  );

-- Service role can manage all payment transactions (for API operations)
CREATE POLICY "Service role can manage payment transactions" 
  ON public.payment_transactions FOR ALL 
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

-- Add payment_transaction_id to applications table for quick reference
ALTER TABLE public.applications 
ADD COLUMN current_payment_transaction_id UUID REFERENCES public.payment_transactions(id);

-- Create index for the new foreign key
CREATE INDEX idx_applications_current_payment_transaction_id 
  ON public.applications(current_payment_transaction_id);