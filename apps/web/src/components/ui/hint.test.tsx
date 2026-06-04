import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Hint, HintTrigger, HintContent } from "./hint";

describe("Hint", () => {
  it("opens content on trigger click and shows it on screen", async () => {
    const user = userEvent.setup();
    render(
      <Hint>
        <HintTrigger>open</HintTrigger>
        <HintContent>hello world</HintContent>
      </Hint>,
    );

    expect(screen.queryByText("hello world")).not.toBeInTheDocument();
    await user.click(screen.getByText("open"));
    expect(await screen.findByText("hello world")).toBeInTheDocument();
  });

  it("forwards className to the popup", async () => {
    const user = userEvent.setup();
    render(
      <Hint>
        <HintTrigger>open</HintTrigger>
        <HintContent className="custom-popup">body</HintContent>
      </Hint>,
    );
    await user.click(screen.getByText("open"));
    const popup = await screen.findByText("body");
    expect(popup).toHaveClass("custom-popup");
  });
});
