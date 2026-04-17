import { createElement, useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

const POLICIES = {
  terms: {
    id: "1cc51ee3-3265-436b-9ff2-5f26e8ec6693",
    title: "Terms of Service",
    label: "Terms",
  },
  privacy: {
    id: "94ee9f08-0272-4579-803a-247e93c259c3",
    title: "Privacy Policy",
    label: "Privacy",
  },
  cookies: {
    id: "de0db1ac-13c9-4199-b715-de5dd253db89",
    title: "Cookie Policy",
    label: "Cookies",
  },
} as const;

type PolicyKey = keyof typeof POLICIES;

export default function LegalPage() {
  const { doc } = useParams<{ doc: PolicyKey }>();
  const policy = doc && doc in POLICIES ? POLICIES[doc] : null;

  useEffect(() => {
    if (!policy) return;
    const existing = document.getElementById("termly-jssdk");
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = "termly-jssdk";
    script.src = "https://app.termly.io/embed-policy.min.js";
    document.body.appendChild(script);

    return () => {
      const s = document.getElementById("termly-jssdk");
      if (s) s.remove();
    };
  }, [policy?.id]);

  if (!policy) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-surface-deep text-content-primary font-body">
      <header className="border-b border-[var(--color-border)] py-5 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center">
            <span className="text-lg font-heading font-bold tracking-tight text-content-heading">
              Chapter<span className="text-brand-primary-main">Ops</span>
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-[13px]">
            {(Object.keys(POLICIES) as PolicyKey[]).map((key) => {
              const active = key === doc;
              return (
                <Link
                  key={key}
                  to={`/legal/${key}`}
                  className={`transition-colors ${
                    active
                      ? "text-content-primary font-medium"
                      : "text-content-muted hover:text-content-primary"
                  }`}
                >
                  {POLICIES[key].label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-14">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-content-muted mb-3">
          Legal
        </p>
        <h1 className="text-3xl md:text-4xl font-heading font-bold tracking-tight text-content-heading mb-10">
          {policy.title}
        </h1>

        {createElement("div", {
          key: policy.id,
          name: "termly-embed",
          "data-id": policy.id,
        })}
      </main>

      <footer className="border-t border-[var(--color-border)] py-8 px-6 mt-16">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-content-muted">
          <span>© {new Date().getFullYear()} Blue Column Systems LLC</span>
          <Link to="/" className="hover:text-content-primary transition-colors">
            Back to ChapterOps
          </Link>
        </div>
      </footer>
    </div>
  );
}
