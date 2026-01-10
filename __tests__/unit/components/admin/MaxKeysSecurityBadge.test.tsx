import { render, screen } from "@testing-library/react";
import { MaxKeysSecurityBadge } from "@/components/admin/MaxKeysSecurityBadge";

describe("MaxKeysSecurityBadge", () => {
  describe("visibility conditions", () => {
    it("renders nothing when lockAddress is null", () => {
      const { container } = render(<MaxKeysSecurityBadge lockAddress={null} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when lockAddress is undefined", () => {
      const { container } = render(<MaxKeysSecurityBadge />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when maxKeysSecured is true", () => {
      const { container } = render(
        <MaxKeysSecurityBadge lockAddress="0x123" maxKeysSecured={true} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders badge when maxKeysSecured is false", () => {
      render(
        <MaxKeysSecurityBadge lockAddress="0x123" maxKeysSecured={false} />,
      );
      expect(screen.getByText("Security Risk")).toBeInTheDocument();
    });

    it("renders badge when maxKeysSecured is null", () => {
      render(
        <MaxKeysSecurityBadge lockAddress="0x123" maxKeysSecured={null} />,
      );
      expect(screen.getByText("Security Risk")).toBeInTheDocument();
    });

    it("renders badge when maxKeysSecured is undefined", () => {
      render(<MaxKeysSecurityBadge lockAddress="0x123" />);
      expect(screen.getByText("Security Risk")).toBeInTheDocument();
    });
  });

  describe("tooltip content", () => {
    it("shows reason in title tooltip when provided", () => {
      render(
        <MaxKeysSecurityBadge
          lockAddress="0x123"
          maxKeysSecured={false}
          reason="Config tx reverted"
        />,
      );
      const badge = screen.getByText("Security Risk");
      expect(badge).toHaveAttribute(
        "title",
        "Security Risk: Config tx reverted",
      );
    });

    it("shows default tooltip when reason not provided", () => {
      render(
        <MaxKeysSecurityBadge lockAddress="0x123" maxKeysSecured={false} />,
      );
      const badge = screen.getByText("Security Risk");
      expect(badge).toHaveAttribute(
        "title",
        expect.stringContaining("maxKeysPerAddress not set to 0"),
      );
    });

    it("shows default tooltip when reason is null", () => {
      render(
        <MaxKeysSecurityBadge
          lockAddress="0x123"
          maxKeysSecured={false}
          reason={null}
        />,
      );
      const badge = screen.getByText("Security Risk");
      expect(badge).toHaveAttribute(
        "title",
        expect.stringContaining("maxKeysPerAddress not set to 0"),
      );
    });
  });

  describe("styling", () => {
    it("applies custom className when provided", () => {
      const { container } = render(
        <MaxKeysSecurityBadge
          lockAddress="0x123"
          maxKeysSecured={false}
          className="custom-class"
        />,
      );
      const badge = container.querySelector(".custom-class");
      expect(badge).toBeInTheDocument();
    });
  });
});
