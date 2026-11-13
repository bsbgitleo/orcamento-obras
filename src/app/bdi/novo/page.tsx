// src/app/bdi/novo/page.tsx
import { BdiForm } from "@/components/bdi-form";

export default function NewBdiPage() {
  return (
    <>
      <h1>Novo BDI</h1>
      <BdiForm bdi={null} />
    </>
  );
}
