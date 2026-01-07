import handler from "@/pages/api/payment/webhook";
import { createHmac } from "crypto";

jest.mock("micro", () => ({
  buffer: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  sendEmail: jest.fn(() => Promise.resolve({ ok: true, messageId: "msg-1" })),
  getPaymentSuccessEmail: jest.fn(() => ({
    subject: "Payment Confirmed",
    text: "ok",
    html: "<p>ok</p>",
  })),
  getPaymentEmailContext: jest.fn(() =>
    Promise.resolve({ email: "user@example.com", cohortName: "Bootcamp" }),
  ),
  sendEmailWithDedup: jest.fn(() =>
    Promise.resolve({ sent: true, skipped: false }),
  ),
}));

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.order = jest.fn(() => builder);
    builder.limit = jest.fn(() => builder);
    builder.single = jest.fn(() =>
      Promise.resolve({ data: { id: "tx1", status: "pending" }, error: null }),
    );
    builder.update = jest.fn(() => builder);

    return {
      from: jest.fn(() => builder),
      rpc: jest.fn(() =>
        Promise.resolve({ data: [{ success: true, message: "ok" }], error: null }),
      ),
    };
  }),
}));

describe("payment webhook email trigger", () => {
  const { buffer } = require("micro");

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = "test-secret";
  });

  it("sends payment email on charge.success", async () => {
    const applicationId = "11111111-1111-1111-1111-111111111111";
    const paystackEvent = {
      event: "charge.success",
      data: {
        reference: "ref_123",
        amount: 50000,
        metadata: {
          referrer: `https://app.p2einferno.com/payment/${applicationId}`,
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(paystackEvent));
    buffer.mockResolvedValue(rawBody);

    const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
      .update(rawBody)
      .digest("hex");

    const req: any = {
      method: "POST",
      headers: { "x-paystack-signature": signature },
    };
    const res: any = {
      status: jest.fn(() => res),
      json: jest.fn(() => res),
      setHeader: jest.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { sendEmailWithDedup } = require("@/lib/email");
    expect(sendEmailWithDedup).toHaveBeenCalled();
  });
});
