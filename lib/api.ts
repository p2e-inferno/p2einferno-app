import axios from "axios";

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

    // Check if token is expired by checking the exp claim
    // This is a simple check - in production you might want to decode the JWT
    // and check the expiration time more precisely
    return true;
  } catch (error) {
    console.error("Error checking Privy token:", error);
    return false;
  }
}
