import MarketingFooter from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";

export type PolicySection = {
  title: string;
  paragraphs: string[];
  items?: string[];
};

export function PublicPolicyPage({
  eyebrow,
  title,
  description,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: PolicySection[];
}) {
  return (
    <div className="min-h-screen bg-brand text-white">
      <MarketingNavbar />
      <main className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">
          {eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
          {description}
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Dernière mise à jour : 17 septembre 2026
        </p>

        <div className="mt-12 space-y-5">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
            >
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300 sm:text-base">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items && (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-cyan-300/20 bg-white/[0.03] p-6 text-center">
          <p className="text-sm text-slate-300">
            Une question concernant ces informations ?
          </p>
          <a
            href="mailto:contact@sovrack.com"
            className="mt-2 inline-flex font-semibold text-cyan-300 hover:text-cyan-200"
          >
            contact@sovrack.com
          </a>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
