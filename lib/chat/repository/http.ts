export class ChatRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function ensureJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await parseJsonResponse<{ error?: string }>(response).catch(
      () => ({ error: undefined }),
    );
    throw new ChatRequestError(
      payload.error || `Chat request failed with status ${response.status}`,
      response.status,
    );
  }

  return parseJsonResponse<T>(response);
}
