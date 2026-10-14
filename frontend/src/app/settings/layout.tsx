import { redirect } from "next/navigation";

// Área bloqueada nesta instalação (conta única): Settings e Agents & API.
export default function SettingsLayout() {
  redirect("/");
}
