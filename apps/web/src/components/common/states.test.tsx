import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Boxes } from "lucide-react";
import { EmptyState, LoadingSkeleton, ErrorState } from "./states";

describe("EmptyState", () => {
  it("renders title and body", () => {
    render(
      <EmptyState icon={Boxes} title="No apps yet">
        Connect a GitHub repo to deploy.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "No apps yet" })).toBeInTheDocument();
    expect(screen.getByText(/Connect a GitHub repo/)).toBeInTheDocument();
  });

  it("renders an action when provided", () => {
    render(
      <EmptyState icon={Boxes} title="No apps yet" action={<button>Create</button>}>
        body
      </EmptyState>,
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});

describe("LoadingSkeleton", () => {
  it("renders the requested number of table rows", () => {
    const { container } = render(<LoadingSkeleton variant="table" rows={3} />);
    expect(container.querySelectorAll("[data-skeleton-row]")).toHaveLength(3);
  });

  it("renders the requested number of card-list cards", () => {
    const { container } = render(<LoadingSkeleton variant="card-list" count={2} />);
    expect(container.querySelectorAll("[data-skeleton-card]")).toHaveLength(2);
  });

  it("renders form fields for the form variant", () => {
    const { container } = render(<LoadingSkeleton variant="form" fields={4} />);
    expect(container.querySelectorAll("[data-skeleton-field]")).toHaveLength(4);
  });
});

describe("ErrorState", () => {
  it("renders title and body", () => {
    render(<ErrorState title="Something went wrong">try again</ErrorState>);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText(/try again/)).toBeInTheDocument();
  });

  it("invokes the retry callback when retry button is clicked", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <ErrorState title="Failed" onRetry={retry}>
        body
      </ErrorState>,
    );
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("does not render a retry button when onRetry is not provided", () => {
    render(<ErrorState title="Failed">body</ErrorState>);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});
