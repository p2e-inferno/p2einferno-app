/**
 * Interface for application data used in payment processing
 */
export interface Application {
  id: string;
  cohort_id: string;
  user_email: string;
  user_name: string;
  phone_number: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  motivation: string;
  goals: string[];
  payment_status: "pending" | "completed" | "failed";
  application_status: "draft" | "submitted" | "accepted" | "rejected";
  total_amount: number;
  currency: "USD" | "NGN";
  payment_method: "fiat" | "crypto";
  created_at: string;
  updated_at: string;
}

/**
 * Interface for payment methods
 */
export interface PaymentMethod {
  id: "fiat" | "crypto";
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * Interface for currency options
 */
export interface CurrencyOption {
  code: "USD" | "NGN";
  name: string;
  symbol: string;
  enabled: boolean;
}

/**
 * Props for PaymentForm component
 */
export interface PaymentFormProps {
  applicationId: string;
  application: Application;
  onPaymentComplete?: () => void;
}

/**
 * Props for CurrencySelector component
 */
export interface CurrencySelectorProps {
  selectedCurrency: "USD" | "NGN";
  onCurrencyChange: (currency: "USD" | "NGN") => void;
  usdAmount: number;
  ngnAmount: number;
}

/**
 * Props for PaymentMethodSelector component
 */
export interface PaymentMethodSelectorProps {
  selectedMethod: "fiat" | "crypto";
  onMethodChange: (method: "fiat" | "crypto") => void;
}

/**
 * Props for OrderSummary component
 */
export interface OrderSummaryProps {
  totalAmount: number;
  currency: "USD" | "NGN";
  discountAmount?: number;
  discountCode?: string;
}

/**
 * Props for DiscountCodeInput component
 */
export interface DiscountCodeInputProps {
  discountCode: string;
  onDiscountCodeChange: (code: string) => void;
  onApplyDiscount: () => void;
  isApplying?: boolean;
}
