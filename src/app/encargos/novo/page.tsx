// src/app/encargos/novo/page.tsx
import { SocialChargesForm } from "@/components/social-charges-form";

export default function NewSocialChargesPage() {
  return (
    <>
      <h1>Nova tabela de encargos sociais</h1>
      <SocialChargesForm item={null} />
    </>
  );
}
