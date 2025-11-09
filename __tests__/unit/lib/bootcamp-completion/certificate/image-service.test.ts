import {
  CertificateImageService,
  isValidCertificateUrl,
} from "@/lib/bootcamp-completion/certificate/image-service";
import { createAdminClient } from "@/lib/supabase/server";

// Mock Supabase server
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

// Mock logger
jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe("CertificateImageService", () => {
  const MOCK_SUPABASE_URL = "https://test.supabase.co";
  const VALID_IMAGE_URL = `${MOCK_SUPABASE_URL}/storage/v1/object/public/certificates/test-cert.png`;
  const ENROLLMENT_ID = "enrollment-123";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = MOCK_SUPABASE_URL;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  describe("isValidCertificateUrl", () => {
    test("returns true for valid Supabase Storage URL", () => {
      expect(isValidCertificateUrl(VALID_IMAGE_URL)).toBe(true);
    });

    test("returns false for HTTP (non-HTTPS) URL", () => {
      const httpUrl = `http://test.supabase.co/storage/v1/object/public/certificates/test.png`;
      expect(isValidCertificateUrl(httpUrl)).toBe(false);
    });

    test("returns false for URL from different domain", () => {
      const externalUrl =
        "https://evil.com/storage/v1/object/public/certificates/test.png";
      expect(isValidCertificateUrl(externalUrl)).toBe(false);
    });

    test("returns false for URL from wrong bucket", () => {
      const wrongBucket = `${MOCK_SUPABASE_URL}/storage/v1/object/public/wrong-bucket/test.png`;
      expect(isValidCertificateUrl(wrongBucket)).toBe(false);
    });

    test("returns false for data URI", () => {
      const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
      expect(isValidCertificateUrl(dataUri)).toBe(false);
    });

    test("returns false when NEXT_PUBLIC_SUPABASE_URL is not configured", () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      expect(isValidCertificateUrl(VALID_IMAGE_URL)).toBe(false);
    });

    test("returns false for malformed URL", () => {
      expect(isValidCertificateUrl("not-a-url")).toBe(false);
    });
  });

  describe("storeCertificateImage", () => {
    test("stores valid certificate image URL successfully", async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          update: mockUpdate,
        }),
      });

      const result = await CertificateImageService.storeCertificateImage(
        ENROLLMENT_ID,
        VALID_IMAGE_URL,
      );

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        certificate_image_url: VALID_IMAGE_URL,
      });
    });

    test("rejects invalid URL", async () => {
      const invalidUrl = "https://evil.com/fake.png";

      const result = await CertificateImageService.storeCertificateImage(
        ENROLLMENT_ID,
        invalidUrl,
      );

      expect(result).toBe(false);
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    test("returns false when database update fails", async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: { message: "Database error" },
        }),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          update: mockUpdate,
        }),
      });

      const result = await CertificateImageService.storeCertificateImage(
        ENROLLMENT_ID,
        VALID_IMAGE_URL,
      );

      expect(result).toBe(false);
    });

    test("handles database exceptions gracefully", async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockRejectedValue(new Error("Connection failed")),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          update: mockUpdate,
        }),
      });

      const result = await CertificateImageService.storeCertificateImage(
        ENROLLMENT_ID,
        VALID_IMAGE_URL,
      );

      expect(result).toBe(false);
    });
  });

  describe("getCertificateImage", () => {
    test("retrieves valid certificate image URL", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { certificate_image_url: VALID_IMAGE_URL },
            error: null,
          }),
        }),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
        }),
      });

      const result =
        await CertificateImageService.getCertificateImage(ENROLLMENT_ID);

      expect(result).toBe(VALID_IMAGE_URL);
      expect(mockSelect).toHaveBeenCalledWith("certificate_image_url");
    });

    test("returns null when no certificate image exists", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { certificate_image_url: null },
            error: null,
          }),
        }),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
        }),
      });

      const result =
        await CertificateImageService.getCertificateImage(ENROLLMENT_ID);

      expect(result).toBe(null);
    });

    test("returns null when database query fails", async () => {
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

      const result =
        await CertificateImageService.getCertificateImage(ENROLLMENT_ID);

      expect(result).toBe(null);
    });

    test("returns null when stored URL is invalid", async () => {
      const invalidUrl = "https://evil.com/fake.png";

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { certificate_image_url: invalidUrl },
            error: null,
          }),
        }),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
        }),
      });

      const result =
        await CertificateImageService.getCertificateImage(ENROLLMENT_ID);

      expect(result).toBe(null);
    });

    test("handles database exceptions gracefully", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockRejectedValue(new Error("Connection failed")),
        }),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
        }),
      });

      const result =
        await CertificateImageService.getCertificateImage(ENROLLMENT_ID);

      expect(result).toBe(null);
    });
  });

  describe("hasCertificateImage", () => {
    test("returns true when valid certificate image exists", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { certificate_image_url: VALID_IMAGE_URL },
            error: null,
          }),
        }),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
        }),
      });

      const result =
        await CertificateImageService.hasCertificateImage(ENROLLMENT_ID);

      expect(result).toBe(true);
    });

    test("returns false when no certificate image exists", async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { certificate_image_url: null },
            error: null,
          }),
        }),
      });

      (createAdminClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
        }),
      });

      const result =
        await CertificateImageService.hasCertificateImage(ENROLLMENT_ID);

      expect(result).toBe(false);
    });

    test("returns false when database query fails", async () => {
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

      const result =
        await CertificateImageService.hasCertificateImage(ENROLLMENT_ID);

      expect(result).toBe(false);
    });
  });
});
