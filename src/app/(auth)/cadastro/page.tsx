// src/app/(auth)/cadastro/page.tsx
import Link from "next/link";
import { RegisterForm } from "@/components/auth-forms";

export default function RegisterPage() {
  return (
    <>
      <h1>Cadastrar empresa</h1>
      <p className="muted">Você será o gestor da empresa e poderá convidar outros usuários.</p>
      <RegisterForm />
      <p className="muted" style={{ marginTop: 16 }}>Já tem conta? <Link href="/login">Entrar</Link>.</p>
    </>
  );
}
