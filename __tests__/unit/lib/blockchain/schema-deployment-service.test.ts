import {
  deploySchema,
  getSchemaFromTransaction,
  verifySchemaOnChain,
} from "@/lib/blockchain/services/schema-deployment-service";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { SCHEMA_REGISTRY_REGISTERED_EVENT_ABI } from "@/lib/attestation/core/config";

const registryAddress = "0x4200000000000000000000000000000000000020";

describe("schema-deployment-service", () => {
  it("does not re-broadcast when receipt wait fails after tx hash", async () => {
    const walletClient = {
      account: { address: "0x1111111111111111111111111111111111111111" },
      chain: { id: 84532 },
      writeContract: jest.fn().mockResolvedValue("0xabc"),
    } as any;

    const publicClient = {
      waitForTransactionReceipt: jest
        .fn()
        .mockRejectedValue(new Error("timeout")),
    } as any;

    const result = await deploySchema(
      walletClient,
      publicClient,
      { schemaRegistryAddress: registryAddress },
      { schemaDefinition: "string foo", revocable: true },
      1,
      0,
    );

    expect(result.success).toBe(false);
    expect(result.transactionHash).toBe("0xabc");
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
  });

  it("extracts schema uid from registered event", async () => {
    const uid =
      "0x0000000000000000000000000000000000000000000000000000000000000042";
    const topics = encodeEventTopics({
      abi: SCHEMA_REGISTRY_REGISTERED_EVENT_ABI,
      eventName: "Registered",
      args: {
        uid,
        registerer: "0x1111111111111111111111111111111111111111",
      },
    });

    const data = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "uid", type: "bytes32" },
            { name: "resolver", type: "address" },
            { name: "revocable", type: "bool" },
            { name: "schema", type: "string" },
          ],
        },
      ] as const,
      [
        {
          uid,
          resolver: "0x0000000000000000000000000000000000000000",
          revocable: false,
          schema: "string foo",
        },
      ],
    );

    const walletClient = {
      account: { address: "0x1111111111111111111111111111111111111111" },
      chain: { id: 84532 },
      writeContract: jest.fn().mockResolvedValue("0xdef"),
    } as any;

    const publicClient = {
      waitForTransactionReceipt: jest.fn().mockResolvedValue({
        status: "success",
        logs: [
          {
            address: registryAddress,
            data,
            topics,
          },
        ],
      }),
    } as any;

    const result = await deploySchema(
      walletClient,
      publicClient,
      { schemaRegistryAddress: registryAddress },
      { schemaDefinition: "string foo", revocable: false },
      0,
      0,
    );

    expect(result.success).toBe(true);
    expect(result.schemaUid).toBe(uid);
  });

  it("returns exists when getSchema succeeds", async () => {
    const publicClient = {
      readContract: jest.fn().mockResolvedValue({
        schema: "string foo",
        revocable: true,
      }),
    } as any;

    const result = await verifySchemaOnChain(
      publicClient,
      { schemaRegistryAddress: registryAddress },
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );

    expect(result.exists).toBe(true);
    expect(result.schemaDefinition).toBe("string foo");
    expect(result.revocable).toBe(true);
  });

  it("rejects transaction if not sent to schema registry", async () => {
    const publicClient = {
      getTransactionReceipt: jest.fn().mockResolvedValue({
        status: "success",
        to: "0x1111111111111111111111111111111111111111",
        logs: [],
      }),
    } as any;

    const result = await getSchemaFromTransaction(
      publicClient,
      { schemaRegistryAddress: registryAddress },
      "0x00000000000000000000000000000000000000000000000000000000000000ff",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("schema registry");
  });
});
