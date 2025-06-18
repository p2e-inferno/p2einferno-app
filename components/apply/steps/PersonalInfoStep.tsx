import React from "react";
import { User, Mail, Phone, XCircle } from "lucide-react"; // Assuming XCircle is for errors

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

const PersonalInfoStep: React.FC<PersonalInfoStepProps> = ({
  formData,
  updateFormData,
  fieldErrors,
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Personal Information</h2>
        <p className="text-faded-grey">
          Let's start with your basic details
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
              aria-describedby={fieldErrors.user_name ? "user_name-error" : undefined}
            />
          </div>
          {fieldErrors.user_name && (
            <p id="user_name-error" className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <XCircle className="w-4 h-4" />
              {fieldErrors.user_name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="user_email" className="block text-sm font-medium mb-2">
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
              aria-describedby={fieldErrors.user_email ? "user_email-error" : undefined}
            />
          </div>
          {fieldErrors.user_email && (
            <p id="user_email-error" className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <XCircle className="w-4 h-4" />
              {fieldErrors.user_email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="phone_number" className="block text-sm font-medium mb-2">
            Phone Number
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-3 h-5 w-5 text-faded-grey" />
            <input
              id="phone_number"
              type="tel"
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent bg-background ${
                fieldErrors.phone_number
                  ? "border-red-300 focus:ring-red-500"
                  : "border-faded-grey/20 focus:ring-flame-yellow"
              }`}
              placeholder="Enter your phone number"
              value={formData.phone_number}
              onChange={(e) => updateFormData("phone_number", e.target.value)}
              aria-describedby={fieldErrors.phone_number ? "phone_number-error" : undefined}
            />
          </div>
          {fieldErrors.phone_number && (
            <p id="phone_number-error" className="mt-1 text-sm text-red-600 flex items-center gap-1">
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
