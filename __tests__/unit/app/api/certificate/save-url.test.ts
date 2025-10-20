import * as privy from "@/lib/auth/privy";
import * as imageService from "@/lib/bootcamp-completion/certificate/image-service";
import { createAdminClient } from "@/lib/supabase/server";

// Mock next/server before importing the route handler
jest.mock("next/server", () => {
  return {
    NextResponse: class {
      static json(body: any, init: any = {}) {
        return {
          status: init.status || 200,
          json: async () => body,
        };
      }
    },
  };
});

// Mock dependencies
jest.mock("@/lib/auth/privy");
jest.mock("@/lib/bootcamp-completion/certificate/image-service");
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

const { POST } = require("@/app/api/certificate/save-url/route");

describe("POST /api/certificate/save-url", () => {
  const MOCK_SUPABASE_URL = "https://test.supabase.co";
  const VALID_IMAGE_URL = `${MOCK_SUPABASE_URL}/storage/v1/object/public/certificates/test-cert.png`;
  const ENROLLMENT_ID = "enrollment-123";
  const USER_PROFILE_ID = "profile-456";
  const PRIVY_USER_ID = "did:privy:xyz";

  const makeRequest = (body: any = {}) => {
    return {
      json: async () => body,
    } as any;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = MOCK_SUPABASE_URL;

    // Mock Privy auth
    (privy.getPrivyUserFromNextRequest as jest.Mock).mockResolvedValue({
      id: PRIVY_USER_ID,
    });

    // Mock image service URL validation
    (imageService.isValidCertificateUrl as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  test("saves certificate URL successfully", async () => {
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });

    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: USER_PROFILE_ID },
          error: null,
        }),
      }),
    });

    const mockFrom = jest.fn((table: string) => {
      if (table === "user_profiles") {
        return { select: mockSelect };
      }
      if (table === "bootcamp_enrollments") {
        // First call: verify enrollment ownership
        const selectMock = jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: ENROLLMENT_ID, user_profile_id: USER_PROFILE_ID },
                error: null,
              }),
            }),
          }),
        });
        // Second call: update certificate URL
        selectMock.mockReturnValueOnce({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: ENROLLMENT_ID, user_profile_id: USER_PROFILE_ID },
                error: null,
              }),
            }),
          }),
        });
        return {
          select: selectMock,
          update: mockUpdate,
        };
      }
      return { select: jest.fn() };
    });

    (createAdminClient as jest.Mock).mockReturnValue({
      from: mockFrom,
    });

    const req = makeRequest({
      enrollmentId: ENROLLMENT_ID,
      imageUrl: VALID_IMAGE_URL,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({
      certificate_image_url: VALID_IMAGE_URL,
    });
  });

  test("returns 401 if user is not authenticated", async () => {
    (privy.getPrivyUserFromNextRequest as jest.Mock).mockResolvedValue(null);

    const req = makeRequest({
      enrollmentId: ENROLLMENT_ID,
      imageUrl: VALID_IMAGE_URL,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("returns 400 if missing required fields", async () => {
    const req = makeRequest({
      enrollmentId: ENROLLMENT_ID,
      // imageUrl is missing
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Missing");
  });

  test("returns 400 if URL is invalid", async () => {
    (imageService.isValidCertificateUrl as jest.Mock).mockReturnValue(false);

    const req = makeRequest({
      enrollmentId: ENROLLMENT_ID,
      imageUrl: "https://evil.com/fake.png",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Invalid URL");
  });

  test("returns 404 if user profile not found", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Not found" },
        }),
      }),
    });

    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: mockSelect,
      }),
    });

    const req = makeRequest({
      enrollmentId: ENROLLMENT_ID,
      imageUrl: VALID_IMAGE_URL,
    });

    const res = await POST(req);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Profile not found");
  });

  test("returns 404 if enrollment not found or access denied", async () => {
    const mockProfileSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: USER_PROFILE_ID },
          error: null,
        }),
      }),
    });

    const mockEnrollmentSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: "Not found" },
          }),
        }),
      }),
    });

    const mockFrom = jest.fn((table: string) => {
      if (table === "user_profiles") {
        return { select: mockProfileSelect };
      }
      if (table === "bootcamp_enrollments") {
        return { select: mockEnrollmentSelect };
      }
      return { select: jest.fn() };
    });

    (createAdminClient as jest.Mock).mockReturnValue({
      from: mockFrom,
    });

    const req = makeRequest({
      enrollmentId: ENROLLMENT_ID,
      imageUrl: VALID_IMAGE_URL,
    });

    const res = await POST(req);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toContain("Enrollment not found");
  });

  test("returns 500 if database update fails", async () => {
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        error: { message: "Database error" },
      }),
    });

    const mockProfileSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: USER_PROFILE_ID },
          error: null,
        }),
      }),
    });

    const mockEnrollmentSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: ENROLLMENT_ID, user_profile_id: USER_PROFILE_ID },
            error: null,
          }),
        }),
      }),
    });

    const mockFrom = jest.fn((table: string) => {
      if (table === "user_profiles") {
        return { select: mockProfileSelect };
      }
      if (table === "bootcamp_enrollments") {
        return {
          select: mockEnrollmentSelect,
          update: mockUpdate,
        };
      }
      return { select: jest.fn() };
    });

    (createAdminClient as jest.Mock).mockReturnValue({
      from: mockFrom,
    });

    const req = makeRequest({
      enrollmentId: ENROLLMENT_ID,
      imageUrl: VALID_IMAGE_URL,
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toContain("Failed to save");
  });

  test("handles unexpected errors gracefully", async () => {
    (privy.getPrivyUserFromNextRequest as jest.Mock).mockRejectedValue(
      new Error("Unexpected error"),
    );

    const req = makeRequest({
      enrollmentId: ENROLLMENT_ID,
      imageUrl: VALID_IMAGE_URL,
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toBe("Internal server error");
  });
});
