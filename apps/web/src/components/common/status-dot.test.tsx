import { render } from "@testing-library/react";
import { StatusDot } from "./status-dot";

describe("StatusDot", () => {
  it("renders a green dot for 'running' status", () => {
    const { container } = render(<StatusDot status="running" />);
    const dot = container.querySelector("[data-status='running']");
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-emerald-500");
  });

  it("renders an amber dot with pulse for 'deploying' status", () => {
    const { container } = render(<StatusDot status="deploying" />);
    const dot = container.querySelector("[data-status='deploying']");
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-amber-500");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("renders a red dot for 'failed' status", () => {
    const { container } = render(<StatusDot status="failed" />);
    const dot = container.querySelector("[data-status='failed']");
    expect(dot).toHaveClass("bg-red-500");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("renders a gray dot for 'stopped' status", () => {
    const { container } = render(<StatusDot status="stopped" />);
    expect(container.querySelector("[data-status='stopped']")).toHaveClass("bg-muted-foreground/40");
  });

  it("applies animate-pulse when status is 'queued'", () => {
    const { container } = render(<StatusDot status="queued" />);
    expect(container.querySelector("[data-status='queued']")).toHaveClass("animate-pulse");
  });

  it("renders a green dot for 'succeeded' status", () => {
    const { container } = render(<StatusDot status="succeeded" />);
    const dot = container.querySelector("[data-status='succeeded']");
    expect(dot).toHaveClass("bg-emerald-500");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("renders role=img with aria-label when label is provided", () => {
    const { getByRole } = render(<StatusDot status="running" label="Running" />);
    const dot = getByRole("img", { name: "Running" });
    expect(dot).toBeInTheDocument();
  });

  it("has no role when label is omitted", () => {
    const { container } = render(<StatusDot status="running" />);
    const dot = container.querySelector("[data-status='running']");
    expect(dot).not.toHaveAttribute("role");
  });
});
