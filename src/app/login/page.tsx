import { LoginForm } from "../../features/auth/login-form";

type SearchParams = { returnTo?: string; error?: string; email?: string };

function safeReturnTo(value?: string) {
  const v = (value ?? "").trim();
  if (!v) return "/";
  if (!v.startsWith("/")) return "/";
  return v;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const returnTo = safeReturnTo(sp.returnTo);
  const initialError = sp.error ? decodeURIComponent(sp.error) : "";
  const defaultEmail = sp.email ? decodeURIComponent(sp.email) : "";

  return (
    <div className="mx-auto w-full max-w-xl">
      <LoginForm
        returnTo={returnTo}
        initialError={initialError || undefined}
        defaultEmail={defaultEmail || undefined}
      />
    </div>
  );
}
