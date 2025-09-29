import axios from "axios";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:client");

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
    log.debug("API Request", {
      method: config.method?.toUpperCase(),
      url: config.url,
    });
    return config;
  },
  (error) => {
    log.error("API Request Error", { error });
    return Promise.reject(error);
  },
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    log.debug("API Response", {
      status: response.status,
      url: response.config.url,
    });
    return response;
  },
  (error) => {
    log.error("API Response Error", {
      status: error.response?.status,
      data: error.response?.data,
    });
    return Promise.reject(error);
  },
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
    accessToken?: string,
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
