import { useEffect, type ReactNode } from "react";
import { SiteFooter } from "./SiteFooter.js";

export type StaticPageId = "privacy" | "terms" | "contact";

interface StaticPageDefinition {
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
}

const PAGE_DEFINITIONS: Record<StaticPageId, StaticPageDefinition> = {
  privacy: {
    description: "How Forever Professions handles browser preferences and service request data.",
    eyebrow: "Legal & privacy",
    title: "Privacy policy",
  },
  terms: {
    description: "The terms that apply when using the Forever Professions planning tools.",
    eyebrow: "Using the site",
    title: "Terms of use",
  },
  contact: {
    description: "How to report issues, suggest features, and contact the Forever Professions project.",
    eyebrow: "Project support",
    title: "Contact",
  },
};

export function staticPageFromPath(pathname: string): StaticPageId | undefined {
  const normalized = pathname.replace(/\/+$/, "").toLowerCase();
  if (normalized === "/privacy") return "privacy";
  if (normalized === "/terms") return "terms";
  if (normalized === "/contact") return "contact";
  return undefined;
}

function LegalSection({ children, title }: { readonly children: ReactNode; readonly title: string }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <p className="legal-effective-date">Effective October 15, 2026</p>
      <p>
        This policy explains what Forever Professions stores or processes when you use
        the planner. The site is designed to work without an account and to keep
        personalization data in your browser whenever practical.
      </p>

      <LegalSection title="Information stored in your browser">
        <p>
          The site uses browser local storage to remember current and target skill,
          route and shopping preferences, region, market identifier, faction, Legacy
          profession bonus, and Forever Changes filters. Known-recipe selections are
          currently limited to the active browser session.
        </p>
        <p>
          You can remove these preferences with <strong>Reset preferences</strong> in
          the profile menu or by clearing site data in your browser.
        </p>
      </LegalSection>

      <LegalSection title="Information sent when you use the service">
        <p>
          When you request recipe data, prices, routes, or shopping lists, the site
          sends the inputs needed to answer that request. Depending on the feature,
          those inputs can include profession and recipe identifiers, skill range,
          faction, market identifier, selected recipes, and optimization strategy.
        </p>
        <p>
          Hosting and API systems may also process ordinary request information such
          as IP address, browser or user-agent information, requested URL, and request
          time for delivery, reliability, abuse prevention, and troubleshooting.
        </p>
      </LegalSection>

      <LegalSection title="What the site does not currently collect">
        <p>
          Forever Professions does not currently provide user accounts, payment
          processing, newsletters, advertising cookies, or third-party behavioral
          analytics. It does not ask for a character name, Battle.net credentials, or
          other game-account credentials.
        </p>
      </LegalSection>

      <LegalSection title="How information is used and shared">
        <p>
          Request information is used to operate the planner, generate results,
          diagnose failures, protect the service, and improve reliability. Service
          providers may process information only as needed to host and deliver the
          application. Forever Professions does not sell personal information.
        </p>
      </LegalSection>

      <LegalSection title="Retention and security">
        <p>
          Browser preferences remain on your device until you reset them or clear
          browser storage. Application logs, where enabled, are configured for a
          limited operational retention period. No internet service can guarantee
          absolute security, but the project aims to collect only what the planner
          needs and to keep retained operational data limited.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and privacy questions">
        <p>
          You can use the planner without an account and can clear locally saved
          preferences at any time. For questions or requests concerning privacy, use
          the <a href="/contact">contact page</a>. Do not include credentials or other
          sensitive information in a public issue.
        </p>
      </LegalSection>

      <LegalSection title="Children and changes to this policy">
        <p>
          The service is a general-audience planning tool and is not designed to
          knowingly collect personal information from children. This policy may be
          updated as the site adds features or changes providers. Material revisions
          will receive a new effective date on this page.
        </p>
      </LegalSection>
    </>
  );
}

function TermsOfUse() {
  return (
    <>
      <p className="legal-effective-date">Effective October 15, 2026</p>
      <p>
        By using Forever Professions, you agree to these terms. If you do not agree,
        do not use the site.
      </p>

      <LegalSection title="What the service provides">
        <p>
          Forever Professions is an informational planning tool. It estimates
          profession routes, skill-up chances, material requirements, recipe changes,
          and market costs from available game and community data.
        </p>
      </LegalSection>

      <LegalSection title="Unofficial project">
        <p>
          This project is not affiliated with, sponsored by, or endorsed by Blizzard
          Entertainment. World of Warcraft, Blizzard Entertainment, and related game
          names, marks, and assets are the property of their respective owners.
        </p>
      </LegalSection>

      <LegalSection title="Estimates and data limitations">
        <p>
          Recipe data, availability, prices, probabilities, and route recommendations
          can be incomplete, provisional, delayed, or incorrect. Game updates and
          market conditions can change results without notice. Verify important
          decisions in game before spending gold, materials, or significant time.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>interfere with the site, its infrastructure, or another person's use;</li>
          <li>attempt to bypass security or access controls;</li>
          <li>use automated traffic in a way that degrades the service;</li>
          <li>submit unlawful, abusive, or intentionally misleading material; or</li>
          <li>use the service in violation of applicable law or game rules.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Availability and external services">
        <p>
          The site may change, suspend, or remove features at any time. Some results
          depend on external data, hosting, or linked websites that the project does
          not control. Links do not imply endorsement of their content or practices.
        </p>
      </LegalSection>

      <LegalSection title="No warranties">
        <p>
          The service is provided “as is” and “as available,” without warranties of
          accuracy, availability, fitness for a particular purpose, or
          non-infringement to the extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the extent permitted by law, the project maintainers are not liable for
          indirect, incidental, special, consequential, or punitive losses arising
          from use of the service, including lost game currency, materials, progress,
          or data.
        </p>
      </LegalSection>

      <LegalSection title="Changes and questions">
        <p>
          These terms may be updated as the service changes. Continued use after an
          updated effective date means you accept the revised terms. Questions can be
          submitted through the <a href="/contact">contact page</a>.
        </p>
      </LegalSection>
    </>
  );
}

function ContactPage() {
  return (
    <>
      <p>
        Forever Professions is maintained through its public GitHub repository. Use
        the issue tracker for bugs, data corrections, feature requests, and general
        project questions.
      </p>

      <div className="contact-actions">
        <a
          className="contact-primary"
          href="https://github.com/crazyskateface/wow-forever-professions/issues/new"
          rel="noreferrer"
          target="_blank"
        >
          Open a GitHub issue
        </a>
        <a
          href="https://github.com/crazyskateface/wow-forever-professions/issues"
          rel="noreferrer"
          target="_blank"
        >
          View existing issues
        </a>
      </div>

      <LegalSection title="Before reporting a bug">
        <p>
          Include the recipe or item name, the page you were using, what you expected,
          and what happened instead. Screenshots and reproducible steps are helpful.
          Never include Battle.net credentials or other sensitive information.
        </p>
      </LegalSection>

      <LegalSection title="Data corrections">
        <p>
          Include the profession, recipe spell ID or item ID, Forever build, the field
          that appears wrong, and a source that supports the correction. Route
          disagreement alone is useful evidence to investigate, but it is not enough
          to overwrite canonical recipe data.
        </p>
      </LegalSection>

      <LegalSection title="Privacy inquiries">
        <p>
          The project does not currently publish a private support email. You may open
          a public issue with a general description of the concern, but do not post IP
          addresses, credentials, or other sensitive personal information. This page
          will be updated if a private support channel is added.
        </p>
      </LegalSection>
    </>
  );
}

export function StaticPage({ page }: { readonly page: StaticPageId }) {
  const definition = PAGE_DEFINITIONS[page];

  useEffect(() => {
    document.title = `${definition.title} · Forever Professions`;
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      definition.description,
    );
  }, [definition.description, definition.title]);

  return (
    <div className="static-shell">
      <header className="static-topbar">
        <a className="brand" href="/" aria-label="Forever Professions home">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>forever<span>.professions</span></span>
        </a>
        <a className="back-to-planner" href="/">Back to planner</a>
      </header>
      <main className="legal-main">
        <header className="legal-hero">
          <span className="section-kicker">{definition.eyebrow}</span>
          <h1>{definition.title}</h1>
          <p>{definition.description}</p>
        </header>
        <article className="legal-copy">
          {page === "privacy" ? <PrivacyPolicy /> : null}
          {page === "terms" ? <TermsOfUse /> : null}
          {page === "contact" ? <ContactPage /> : null}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
