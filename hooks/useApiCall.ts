import { useState, useCallback } from "react";
import toast from "react-hot-toast";

interface UseApiCallOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
}

interface ApiCallState {
  isLoading: boolean;
  error: string | null;
  data: any;
}

export const useApiCall = (options: UseApiCallOptions = {}) => {
  const {
    onSuccess,
    onError,
    showSuccessToast = true,
    showErrorToast = true,
    successMessage = "Operation completed successfully",
  } = options;

  const [state, setState] = useState<ApiCallState>({
    isLoading: false,
    error: null,
    data: null,
  });

  const execute = useCallback(
    async (apiCall: () => Promise<any>) => {
      setState({ isLoading: true, error: null, data: null });

      try {
        const response = await apiCall();

        setState({
          isLoading: false,
          error: null,
          data: response.data,
        });

        if (showSuccessToast) {
          toast.success(response.message || successMessage);
        }

        if (onSuccess) {
          onSuccess(response.data);
        }

        return response;
      } catch (error: any) {
        const errorMessage =
          error.response?.data?.error ||
          error.message ||
          "An unexpected error occurred";

        setState({
          isLoading: false,
          error: errorMessage,
          data: null,
        });

        if (showErrorToast) {
          toast.error(errorMessage);
        }

        if (onError) {
          onError(errorMessage);
        }

        throw error;
      }
    },
    [onSuccess, onError, showSuccessToast, showErrorToast, successMessage],
  );

  return {
    ...state,
    execute,
  };
};
