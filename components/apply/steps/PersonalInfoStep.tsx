import React from "react";
import { User, Mail, Phone, XCircle } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

// Define a type for the form data slice this component deals with
interface PersonalInfoFormData {
  user_name: string;
  user_email: string;
  phone_number: string;
}

// Define a type for the field errors slice
interface PersonalInfoFieldErrors {
  user_name?: string;
  user_email?: string;
  phone_number?: string;
}

interface PersonalInfoStepProps {
  formData: PersonalInfoFormData;
  updateFormData: (field: keyof PersonalInfoFormData, value: any) => void;
  fieldErrors: PersonalInfoFieldErrors;
}

// Custom input component that matches the styling of other inputs
const CustomPhoneInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
>((props, ref) => {
  const { hasError, className, ...rest } = props;
  return (
    <input
      ref={ref}
      {...rest}
      className={`w-full pl-20 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent bg-background ${
        hasError
          ? "border-red-300 focus:ring-red-500"
          : "border-faded-grey/20 focus:ring-flame-yellow"
      }`}
    />
  );
});
CustomPhoneInput.displayName = "CustomPhoneInput";

const PersonalInfoStep: React.FC<PersonalInfoStepProps> = ({
  formData,
  updateFormData,
  fieldErrors,
}) => {
  // Handle phone number change to ensure we store "0" for empty values
  const handlePhoneChange = (value: string | undefined) => {
    // If value is undefined, empty, or just a country code (e.g., "+234"), store "0"
    if (!value || value.length <= 4 || value.replace(/\D/g, "").length === 0) {
      updateFormData("phone_number", "0");
    } else {
      updateFormData("phone_number", value);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Personal Information</h2>
        <p className="text-faded-grey">
          Let&apos;s start with your basic details
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="user_name" className="block text-sm font-medium mb-2">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-5 w-5 text-faded-grey" />
            <input
              id="user_name"
              type="text"
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent bg-background ${
                fieldErrors.user_name
                  ? "border-red-300 focus:ring-red-500"
                  : "border-faded-grey/20 focus:ring-flame-yellow"
              }`}
              placeholder="Enter your full name"
              value={formData.user_name}
              onChange={(e) => updateFormData("user_name", e.target.value)}
              aria-describedby={
                fieldErrors.user_name ? "user_name-error" : undefined
              }
            />
          </div>
          {fieldErrors.user_name && (
            <p
              id="user_name-error"
              className="mt-1 text-sm text-red-600 flex items-center gap-1"
            >
              <XCircle className="w-4 h-4" />
              {fieldErrors.user_name}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="user_email"
            className="block text-sm font-medium mb-2"
          >
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-faded-grey" />
            <input
              id="user_email"
              type="email"
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent bg-background ${
                fieldErrors.user_email
                  ? "border-red-300 focus:ring-red-500"
                  : "border-faded-grey/20 focus:ring-flame-yellow"
              }`}
              placeholder="Enter your email address"
              value={formData.user_email}
              onChange={(e) => updateFormData("user_email", e.target.value)}
              aria-describedby={
                fieldErrors.user_email ? "user_email-error" : undefined
              }
            />
          </div>
          {fieldErrors.user_email && (
            <p
              id="user_email-error"
              className="mt-1 text-sm text-red-600 flex items-center gap-1"
            >
              <XCircle className="w-4 h-4" />
              {fieldErrors.user_email}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="phone_number"
            className="block text-sm font-medium mb-2"
          >
            Phone Number <span className="text-faded-grey text-xs">(Optional)</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-3 h-5 w-5 text-faded-grey z-10" />
            <PhoneInput
              id="phone_number"
              international
              defaultCountry="NG"
              placeholder="Enter your phone number"
              value={formData.phone_number === "0" || !formData.phone_number ? undefined : formData.phone_number}
              onChange={handlePhoneChange}
              inputComponent={CustomPhoneInput as any}
              hasError={!!fieldErrors.phone_number}
              aria-describedby={
                fieldErrors.phone_number ? "phone_number-error" : undefined
              }
            />
          </div>
          {fieldErrors.phone_number && (
            <p
              id="phone_number-error"
              className="mt-1 text-sm text-red-600 flex items-center gap-1"
            >
              <XCircle className="w-4 h-4" />
              {fieldErrors.phone_number}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoStep;
