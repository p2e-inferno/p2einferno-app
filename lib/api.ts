import axios from "axios";
import * as jose from "jose";

// Create axios instance with default config
const api = axios.create({
  baseURL: "/api",
  timeout: 30000, // 30 seconds timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log("API Request:", config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error("API Request Error:", error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log("API Response:", response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error(
      "API Response Error:",
      error.response?.status,
      error.response?.data
    );
    return Promise.reject(error);
  }
);

export interface ApplicationData {
  cohort_id: string;
  user_email: string;
  user_name: string;
  phone_number: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  motivation: string;
  goals: string[];
  payment_method?: "crypto" | "fiat";
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Application API methods
export const applicationApi = {
  /**
   * Submit a new application
   */
  async submit(
    applicationData: ApplicationData,
    accessToken?: string
  ): Promise<ApiResponse<{ applicationId: string }>> {
    // Prepare headers only if we have an access token
    const config = accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined;

    const response = await api.post("/applications", applicationData, config);
    return response.data;
  },
};

export default api;

/**
 * Check if the current Privy token is valid and not expired
 * @returns True if a valid token exists, false otherwise
 */
export function hasValidPrivyToken(): boolean {
  try {
    if (typeof window === "undefined") return false;

    const privyAuthState = localStorage.getItem("privy:auth:latest");
    if (!privyAuthState) return false;

    const parsedState = JSON.parse(privyAuthState);
    if (!parsedState?.token) return false;

    // Decode JWT without verification to check expiration
    const token = parsedState.token;
    const payload = jose.decodeJwt(token);
    
    if (!payload.exp) return false;
    
    // Check if token is expired (exp is in seconds, Date.now() is in milliseconds)
    const currentTime = Math.floor(Date.now() / 1000);
    const isExpired = payload.exp < currentTime;
    
    if (isExpired) {
      console.warn("Privy token has expired");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking Privy token:", error);
    return false;
  }
}

/**
 * Server-side verification of Privy JWT tokens using public verification key
 * @param token The JWT token to verify
 * @returns Promise<boolean> True if token is valid and not expired
 */
export async function verifyPrivyTokenServer(token: string): Promise<boolean> {
  try {
    const verificationKey = process.env.NEXT_PRIVY_VERIFICATION_KEY;
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    
    if (!verificationKey || !appId) {
      console.error("Missing Privy verification key or app ID");
      return false;
    }

    // Import the ES256 public key
    const publicKey = await jose.importSPKI(verificationKey, "ES256");
    
    // Verify the JWT with proper issuer and audience checks
    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer: "privy.io",
      audience: appId,
    });

    // Additional expiration check (jose.jwtVerify should handle this, but being explicit)
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error verifying Privy token:", error);
    return false;
  }
}
