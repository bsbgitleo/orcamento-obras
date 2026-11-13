// src/app/(auth)/login/page.tsx
import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";

export default function LoginPage() {
  return (
    <>
      <h1>Entrar</h1>
      <LoginForm />
      <p className="muted" style={{ marginTop: 16 }}>Ainda não tem conta? <Link href="/cadastro">Cadastre sua empresa</Link>.</p>
    </>
  );
}
