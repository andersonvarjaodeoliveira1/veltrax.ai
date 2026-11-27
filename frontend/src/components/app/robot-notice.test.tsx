import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ROBOT_NOTICE, RobotNotice } from "./robot-notice";

afterEach(cleanup);

it("mostra o aviso de proteção contra robôs, sem botão de fechar", () => {
  render(<RobotNotice />);
  const notice = screen.getByTestId("robot-notice");
  expect(notice.textContent).toBe(ROBOT_NOTICE);
  expect(notice.textContent).toMatch(/proteção contra robôs/);
  expect(notice.textContent).toMatch(/a conta é bloqueada/);
  expect(screen.queryByRole("button")).toBeNull();
});
