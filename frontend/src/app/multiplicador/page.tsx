import { redirect } from "next/navigation";

// O Multiplicador saiu do menu: a Automação faz esse trabalho.
export default function MultiplicadorRedirect() {
  redirect("/automacao");
}
