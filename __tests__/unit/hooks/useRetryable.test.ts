import { renderHook, act } from "@testing-library/react";
import { useRetryable } from "@/hooks/useRetryable";

describe("useRetryable", () => {
  test("run sets loading and data on success", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useRetryable<string>({ fn }));

    expect(result.current.loading).toBe(false);
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("ok");
  });

  test("run sets error on failure", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useRetryable<string>({ fn }));

    await act(async () => {
      await expect(result.current.run()).rejects.toThrow("boom");
    });
    expect(result.current.error).toBe("boom");
  });

  test("retry runs and completes without throwing", async () => {
    const fn = jest
      .fn()
      .mockImplementation(
        () => new Promise((res) => setTimeout(() => res("ok"), 10)),
      );
    const { result } = renderHook(() => useRetryable<string>({ fn }));
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.isRetrying).toBe(false);
  });
});
