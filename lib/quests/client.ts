interface PostOptions {
  payload?: Record<string, any>;
  walletAddress?: string;
}

async function postQuestApi<T>(
  url: string,
  { payload, walletAddress }: PostOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (walletAddress) {
    headers["X-Active-Wallet"] = walletAddress;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload ?? {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Quest request failed");
  }

  return data as T;
}

export function startQuestRequest<T = any>(
  questId: string,
  walletAddress?: string,
) {
  return postQuestApi<T>(`/api/quests/${questId}/start`, { walletAddress });
}

export function completeQuestTaskRequest<T = any>(params: {
  questId: string;
  taskId: string;
  verificationData?: any;
  inputData?: any;
  walletAddress?: string;
}) {
  const { walletAddress, ...payload } = params;
  return postQuestApi<T>("/api/quests/complete-task", {
    payload,
    walletAddress,
  });
}

export function completeQuestRequest<T = any>(
  questId: string,
  options?: { attestationSignature?: any; walletAddress?: string },
) {
  return postQuestApi<T>("/api/quests/complete-quest", {
    payload: {
      questId,
      attestationSignature: options?.attestationSignature ?? null,
    },
    walletAddress: options?.walletAddress,
  });
}

export function claimActivationRewardRequest<T = any>(
  questId: string,
  options?: { attestationSignature?: any; walletAddress?: string },
) {
  return postQuestApi<T>("/api/quests/get-trial", {
    payload: {
      questId,
      attestationSignature: options?.attestationSignature ?? null,
    },
    walletAddress: options?.walletAddress,
  });
}

export function claimTaskRewardRequest<T = any>(
  completionId: string,
  options?: { attestationSignature?: any; walletAddress?: string },
) {
  return postQuestApi<T>("/api/quests/claim-task-reward", {
    payload: {
      completionId,
      attestationSignature: options?.attestationSignature ?? null,
    },
    walletAddress: options?.walletAddress,
  });
}
