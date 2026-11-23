import { RegisteredUsers } from "@/components/admin/registered-users";

// Aba Cadastros: todas as contas com nome, e-mail, CPF, telefone, dia e hora do cadastro e o que já conectaram.
export default function AdminCadastrosPage() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-8">
      <div data-no-translate>
        <h1 className="text-2xl font-medium tracking-tight">Cadastros</h1>
        <p className="mt-1 text-sm text-muted-foreground">Quem criou conta, quando, com quais dados e o que já conectou. Horários de Brasília.</p>
      </div>
      <RegisteredUsers />
    </main>
  );
}
