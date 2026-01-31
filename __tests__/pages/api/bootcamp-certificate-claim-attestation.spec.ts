import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __CERT_CLAIM_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __CERT_CLAIM_EAS_ENABLED__: boolean | undefined;
}

global.__CERT_CLAIM_AUTH_SCENARIO__ = "ok";
global.__CERT_CLAIM_EAS_ENABLED__ = true;

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__CERT_CLAIM_AUTH_SCENARIO__ === "unauthorized") return null;
    return { id: "privy-user-1" };
  }),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: jest.fn(() => Boolean(global.__CERT_CLAIM_EAS_ENABLED__)),
}));

jest.mock("@/lib/attestation/api/helpers", () => ({
  handleGaslessAttestation: jest.fn(async () => ({ success: true })),
}));

jest.mock("@/lib/bootcamp-completion/certificate/service", () => ({
  CertificateService: jest.fn().mockImplementation(() => ({
    claimCertificate: jest.fn(async () => ({
      success: true,
      txHash:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      attestationPending: true,
    })),
  })),
}));

jest.mock("@/lib/services/user-key-service", () => ({
  checkUserKeyOwnership: jest.fn(async () => ({
    hasValidKey: true,
    checkedAddresses: ["0x00000000000000000000000000000000000000bb"],
    errors: [],
    keyInfo: {
      tokenId: 777n,
      owner: "0x00000000000000000000000000000000000000bb",
      expirationTimestamp: 0n,
      isValid: true,
    },
  })),
}));

jest.mock("@/lib/blockchain/config/clients/public-client", () => ({
  createPublicClientUnified: jest.fn(() => ({}) as any),
}));

jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => {
    return {
      from: (table: string) => {
        switch (table) {
          case "user_profiles":
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "profile-1" },
                    error: null,
                  }),
                }),
              }),
            } as any;
          case "bootcamp_enrollments":
            return {
              select: () => ({
                eq: function (this: any, field: string, value: any) {
                  this._filters = this._filters || {};
                  this._filters[field] = value;
                  return this;
                },
                maybeSingle: async function (this: any) {
                  const txHash =
                    "0x1111111111111111111111111111111111111111111111111111111111111111";

                  // Refresh query path uses `.eq("id", ...)`
                  if (this?._filters?.id) {
                    return {
                      data: {
                        certificate_issued: true,
                        certificate_tx_hash: txHash,
                        certificate_attestation_uid: null,
                        completion_date: "2026-01-31T12:00:00.000Z",
                      },
                      error: null,
                    };
                  }

                  // Initial enrollment query path uses `.eq("cohort_id", ...).eq("user_profile_id", ...)`
                  return {
                    data: {
                      id: "enroll-1",
                      enrollment_status: "completed",
                      certificate_issued: true,
                      completion_date: "2026-01-31T12:00:00.000Z",
                      certificate_tx_hash: txHash,
                      certificate_attestation_uid: null,
                      user_profile_id: "profile-1",
                      user_profiles: {
                        id: "profile-1",
                        wallet_address:
                          "0x00000000000000000000000000000000000000bb",
                        privy_user_id: "privy-user-1",
                      },
                      cohorts: {
                        id: "cohort-1",
                        name: "Cohort 1",
                        lock_address:
                          "0x00000000000000000000000000000000000000cc",
                        bootcamp_program_id: "bootcamp-1",
                        bootcamp_programs: {
                          id: "bootcamp-1",
                          name: "Bootcamp 1",
                          lock_address:
                            "0x00000000000000000000000000000000000000aa",
                        },
                      },
                    },
                    error: null,
                  };
                },
              }),
            } as any;
          case "cohort_milestones":
            return {
              select: () => ({
                eq: async () => ({
                  data: [],
                  error: null,
                }),
              }),
            } as any;
          default:
            throw new Error(`Unhandled table: ${table}`);
        }
      },
    };
  });

  return { createAdminClient };
});

import handler from "@/pages/api/bootcamp/certificate/claim";

async function runApi(params: {
  method?: string;
  body?: any;
}): Promise<{ statusCode: number; json: any }> {
  const { req, res } = createMocks({
    method: (params.method ?? "POST") as any,
    headers: { "Content-Type": "application/json" },
    body: params.body ?? {},
  });

  await handler(req as any, res as any);

  const statusCode = res._getStatusCode();
  const body = res._getData();
  const json = typeof body === "string" ? JSON.parse(body) : body;

  return { statusCode, json };
}

describe("POST /api/bootcamp/certificate/claim (attestation payload)", () => {
  beforeEach(() => {
    process.env.BOOTCAMP_CERTIFICATES_ENABLED = "true";
    process.env.CLAIM_RATE_LIMIT_PER_USER = "0";
    process.env.CLAIM_RATE_LIMIT_GLOBAL_HOURLY = "0";
    global.__CERT_CLAIM_AUTH_SCENARIO__ = "ok";
    global.__CERT_CLAIM_EAS_ENABLED__ = true;
  });

  it("returns 401 when Privy user is missing", async () => {
    global.__CERT_CLAIM_AUTH_SCENARIO__ = "unauthorized";
    const { statusCode } = await runApi({ body: { cohortId: "cohort-1" } });
    expect(statusCode).toBe(401);
  });

  it("returns v2 schemaData matching the DB schema definition", async () => {
    const { statusCode, json } = await runApi({
      body: { cohortId: "cohort-1" },
    });
    expect(statusCode).toBe(200);

    expect(json.attestationRequired).toBe(true);
    expect(json.attestationPayload.schemaKey).toBe("bootcamp_completion");

    const schemaData = json.attestationPayload.schemaData as Array<{
      name: string;
      type: string;
      value: string;
    }>;

    const schemaString = schemaData.map((f) => `${f.type} ${f.name}`).join(",");

    expect(schemaString).toBe(
      [
        "string cohortId",
        "string cohortName",
        "string bootcampId",
        "string bootcampTitle",
        "address userAddress",
        "address cohortLockAddress",
        "address certificateLockAddress",
        "uint256 certificateTokenId",
        "bytes32 certificateTxHash",
        "uint256 completionDate",
        "uint256 totalXpEarned",
      ].join(","),
    );

    const tokenIdField = schemaData.find(
      (f) => f.name === "certificateTokenId",
    );
    expect(tokenIdField).toMatchObject({ type: "uint256", value: "777" });

    const txHashField = schemaData.find((f) => f.name === "certificateTxHash");
    expect(txHashField).toMatchObject({
      type: "bytes32",
      value:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    });
  });
});
