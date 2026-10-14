import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Ingresar</h1>
        <p className="mt-1 text-sm text-slate-600">Usá el usuario y la contraseña que te dio el administrador. Si sos administrador, ingresá con tu email.</p>
        <LoginForm />
      </div>
    </main>
  );
}
