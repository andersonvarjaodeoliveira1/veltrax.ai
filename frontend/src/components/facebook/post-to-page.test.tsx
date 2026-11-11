import { render, screen } from "@testing-library/react";
import { PostToPage } from "./post-to-page";
import { useSession } from "@/lib/auth-client";

vi.mock("@/lib/auth-client", () => ({ useSession: vi.fn() }));

describe("PostToPage", () => {
  it("is hidden from members while the module is being built", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { id: "u", is_admin: false } } } as never);
    const { container } = render(<PostToPage clipId="c1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows for admins", () => {
    vi.mocked(useSession).mockReturnValue({ data: { user: { id: "a", is_admin: true } } } as never);
    render(<PostToPage clipId="c1" />);
    expect(screen.getByRole("button", { name: /Postar numa página/ })).toBeInTheDocument();
  });
});
