import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PolicyNotice } from "./policy-notice";
import { checkPolicy } from "@/lib/shopee-policy";

describe("PolicyNotice", () => {
  it("não mostra nada sem risco", () => {
    const { container } = render(<PolicyNotice hits={[]} confirmed={false} onConfirm={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("mostra o risco e pede confirmação", async () => {
    const onConfirm = vi.fn();
    render(<PolicyNotice hits={checkPolicy("Chá que cura a diabetes")} confirmed={false} onConfirm={onConfirm} />);
    expect(screen.getByTestId("policy-notice")).toHaveTextContent("Promessa milagrosa de saúde");
    expect(screen.getByTestId("policy-notice")).toHaveTextContent("suspender a sua conta");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });
});
