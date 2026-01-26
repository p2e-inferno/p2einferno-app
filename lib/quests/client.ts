interface PostOptions {
  payload?: Record<string, any>;
}

async function postQuestApi<T>(
  url: string,
  { payload }: PostOptions = {},
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Quest request failed");
  }

  return data as T;
}

export function startQuestRequest<T = any>(questId: string) {
  return postQuestApi<T>(`/api/quests/${questId}/start`);
}

export function completeQuestTaskRequest<T = any>(params: {
  questId: string;
  taskId: string;
  verificationData?: any;
  inputData?: any;
}) {
  return postQuestApi<T>("/api/quests/complete-task", {
    payload: params,
  });
}

export function completeQuestRequest<T = any>(
  questId: string,
  options?: { attestationSignature?: any },
) {
  return postQuestApi<T>("/api/quests/complete-quest", {
    payload: {
      questId,
      attestationSignature: options?.attestationSignature ?? null,
    },
  });
}

export function claimActivationRewardRequest<T = any>(
  questId: string,
  options?: { attestationSignature?: any },
) {
  return postQuestApi<T>("/api/quests/get-trial", {
    payload: {
      questId,
      attestationSignature: options?.attestationSignature ?? null,
    },
  });
}

export function claimTaskRewardRequest<T = any>(
  completionId: string,
  options?: { attestationSignature?: any },
) {
  return postQuestApi<T>("/api/quests/claim-task-reward", {
    payload: {
      completionId,
      attestationSignature: options?.attestationSignature ?? null,
    },
  });
}
