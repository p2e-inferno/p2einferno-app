import type { Address } from "viem";
import { LockManagerService } from "@/lib/blockchain/services/lock-manager";

describe("LockManagerService", () => {
  const createStubClient = () => {
    return {
      chain: { id: 84532 },
      readContract: jest.fn((args: any) => {
        switch (args.functionName) {
          case "getHasValidKey":
            return Promise.resolve(true);
          case "tokenOfOwnerByIndex":
            return Promise.resolve(1n);
          case "keyExpirationTimestampFor":
            return Promise.resolve(2n);
          default:
            return Promise.resolve(null);
        }
      }),
    } as any;
  };

  const userAddress = "0x0000000000000000000000000000000000000001" as Address;
  const lockAddress = "0x0000000000000000000000000000000000000002" as Address;

  test("server and browser clients return identical results", async () => {
    const serverClient = createStubClient();
    const browserClient = createStubClient();

    const serverManager = new LockManagerService({
      getPublicClient: () => serverClient,
      getWalletClient: () => null,
    });
    const browserManager = new LockManagerService({
      getPublicClient: () => browserClient,
      getWalletClient: () => null,
    });

    const [serverResult, browserResult] = await Promise.all([
      serverManager.checkUserHasValidKey(userAddress, lockAddress),
      browserManager.checkUserHasValidKey(userAddress, lockAddress),
    ]);

    expect(serverResult).toEqual(browserResult);
    expect(serverClient.readContract).toHaveBeenCalledTimes(3);
    expect(browserClient.readContract).toHaveBeenCalledTimes(3);
  });

  test("disposed manager rejects subsequent calls", async () => {
    const manager = new LockManagerService({
      getPublicClient: () => createStubClient(),
      getWalletClient: () => null,
    });

    manager.dispose();

    await expect(
      manager.checkUserHasValidKey(userAddress, lockAddress),
    ).rejects.toThrow("LockManagerService has been disposed");
  });
});
