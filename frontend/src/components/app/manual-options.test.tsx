import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ManualOptions, variationHint, type ManualValues } from "./manual-options";

const values: ManualValues = { copyMode: "same", variationMode: "roulette", keepPerson: true, presenter: "", count: 3, scenes: 4, language: "pt", keyword: "" };
const langs = [{ value: "pt", text: "Português" }, { value: "en", text: "Inglês" }];

describe("ManualOptions", () => {
  it("hides the panel in auto mode and switches to manual", () => {
    const onMode = vi.fn();
    render(<ManualOptions mode="auto" onMode={onMode} values={values} onChange={() => undefined} languages={langs} />);
    expect(screen.queryByTestId("manual-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Manual/ }));
    expect(onMode).toHaveBeenCalledWith("manual");
  });
  it("reports manual choices", () => {
    const onChange = vi.fn();
    render(<ManualOptions mode="manual" onMode={() => undefined} values={values} onChange={onChange} languages={langs} />);
    fireEvent.click(screen.getByRole("button", { name: "Gesto" }));
    fireEvent.click(screen.getByRole("button", { name: "Trocar a pessoa" }));
    fireEvent.click(screen.getByRole("button", { name: "10" }));
    fireEvent.click(screen.getByRole("button", { name: "2 cenas" }));
    fireEvent.change(screen.getByLabelText(/Palavra da CTA/), { target: { value: "quero" } });
    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "en" } });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([{ variationMode: "gesture" }, { keepPerson: false }, { count: 10 }, { scenes: 2 }, { keyword: "QUERO" }, { language: "en" }]);
  });
  it("builds a hint only when a mode is set", () => {
    expect(variationHint()).toBe("");
    expect(variationHint("text")).toContain("gancho");
  });
  it("lets the member forget what was remembered", () => {
    const onForget = vi.fn();
    render(<ManualOptions mode="auto" onMode={() => undefined} values={values} onChange={() => undefined} languages={langs} onForget={onForget} />);
    fireEvent.click(screen.getByRole("button", { name: "Esquecer minhas escolhas" }));
    expect(onForget).toHaveBeenCalled();
    expect(screen.getByText(/esqueci as suas escolhas/)).toBeTruthy();
  });
});
