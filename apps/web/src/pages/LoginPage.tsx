import { BarChart3, LayoutGrid, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLogin } from '../auth/useAuth';
import { Logo, LogoMark } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Controls';

export function LoginPage() {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="flex min-h-full">
      <aside className="relative hidden w-[44%] max-w-xl overflow-hidden bg-primary p-10 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-2.5">
          <LogoMark className="size-9 [&>rect]:fill-white/15" />
          <span className="text-lg font-semibold tracking-tight">InsightFlow</span>
        </div>
        <div className="relative mt-auto mb-auto space-y-8">
          <div>
            <h1 className="text-3xl leading-tight font-semibold tracking-tight">
              Sales analytics for Nivora Home
            </h1>
            <p className="mt-3 max-w-sm text-teal-50/80">
              Revenue, orders and customers at a glance — and a dashboard you can shape yourself.
            </p>
          </div>
          <ul className="space-y-4 text-sm text-teal-50/90">
            <Feature icon={<BarChart3 className="size-4" />} text="Live KPIs and charts from every order" />
            <Feature
              icon={<LayoutGrid className="size-4" />}
              text="Build widgets, drag them where you want"
            />
            <Feature icon={<Sparkles className="size-4" />} text="Your dashboard is saved just for you" />
          </ul>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">Log in to your dashboard.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-ink">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@nivora.in"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {login.error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {login.error.message}
              </div>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={login.isPending}
              disabled={!email.trim() || !password}
            >
              Log in
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">{icon}</span>
      {text}
    </li>
  );
}
