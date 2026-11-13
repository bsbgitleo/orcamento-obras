// src/app/clientes/novo/page.tsx
import { ClientForm } from "@/components/client-form";

export default function NewClientPage() {
  return (
    <>
      <h1>Novo cliente</h1>
      <ClientForm client={null} />
    </>
  );
}
