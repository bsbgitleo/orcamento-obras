// src/lib/schemas/auth.ts
import { z } from "zod";
import { optionalText, requiredText } from "@/lib/forms";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export const emailField = z.string().trim().toLowerCase().pipe(z.string().email("E-mail inválido"));
export const passwordField = z.string().min(MIN_PASSWORD_LENGTH, `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Informe a senha"),
});

export const registerSchema = z.object({
  companyName: requiredText("Nome da empresa"),
  companyDocument: optionalText,
  name: requiredText("Seu nome"),
  email: emailField,
  password: passwordField,
  passwordConfirm: z.string(),
}).refine((d) => d.password === d.passwordConfirm, { path: ["passwordConfirm"], message: "As senhas não conferem" });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual"),
  password: passwordField,
  passwordConfirm: z.string(),
}).refine((d) => d.password === d.passwordConfirm, { path: ["passwordConfirm"], message: "As senhas não conferem" });

export const inviteSchema = z.object({
  name: requiredText("Nome"),
  email: emailField,
  role: z.enum(["MANAGER", "ESTIMATOR", "VIEWER"], { message: "Papel inválido" }),
});

export const roleSchema = z.object({ role: z.enum(["MANAGER", "ESTIMATOR", "VIEWER"], { message: "Papel inválido" }) });
