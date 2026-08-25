import { Link } from 'react-router-dom'

const CONTACT_EMAIL = 'sonam.theserenecouch@gmail.com'
const LAST_UPDATED = 'August 25, 2026'

function Section({ title, children }) {
  return (
    <div className="mt-8">
      <h2 className="text-card-title text-content-primary">{title}</h2>
      <div className="mt-2 space-y-3 text-secondary text-content-secondary">{children}</div>
    </div>
  )
}

export default function Terms() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-border-light bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Therapistnook" className="h-9 w-9" />
            <span className="text-lg font-bold text-content-primary">Therapistnook</span>
          </Link>
          <Link to="/" className="text-sm font-semibold text-content-secondary transition hover:text-content-primary">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-page-title text-content-primary">Terms of Service</h1>
        <p className="mt-2 text-caption text-content-muted">Last updated: {LAST_UPDATED}</p>
        <p className="mt-6 text-secondary text-content-secondary">
          These Terms of Service ("Terms") govern your use of Therapistnook, a practice management
          and MMPI-2 assessment scoring platform for mental health practitioners. By creating an
          account or using the platform, you agree to these Terms.
        </p>

        <Section title="1. Acceptance of Terms">
          <p>
            By signing up for or using Therapistnook, you agree to be bound by these Terms and our
            Privacy Policy. If you do not agree, please do not use the platform.
          </p>
        </Section>

        <Section title="2. Who Can Use Therapistnook">
          <p>
            Therapistnook is intended for licensed mental health practitioners and qualified
            professionals managing their own practice or working within one. A practice has a
            single admin account; individual practitioners create and manage their own accounts.
            You must provide accurate information when signing up.
          </p>
        </Section>

        <Section title="3. Accounts & Security">
          <p>
            You are responsible for maintaining the confidentiality of your login credentials and
            for all activity under your account. Accounts are for individual use — do not share
            your login with others. Notify us immediately if you suspect unauthorized access.
          </p>
        </Section>

        <Section title="4. Subscription & Fees">
          <p>
            The Practice Workspace subscription is priced at ₹799/month and covers patient records,
            scheduling, payments, clinical documentation, and analytics. MMPI-2 assessment links are
            billed separately at ₹899 per link, generated inside your dashboard once payment is
            processed. Billing is handled via Razorpay. Fees are generally non-refundable except
            where required by law. Pricing may change with reasonable prior notice.
          </p>
        </Section>

        <Section title="5. Acceptable Use">
          <ul className="list-disc space-y-2 pl-5">
            <li>Do not use the platform for any unlawful purpose.</li>
            <li>Do not attempt to gain unauthorized access to accounts, data, or systems.</li>
            <li>Do not reverse-engineer, scrape, or resell the platform or its scoring logic.</li>
            <li>Do not upload or enter data you do not have the right or consent to use.</li>
          </ul>
        </Section>

        <Section title="6. Clinical Responsibility">
          <p>
            Therapistnook is a tool to support your practice. Automated MMPI-2 scoring is a
            screening and reporting aid — it is not a substitute for professional clinical
            judgment. You are solely responsible for interpreting results, diagnosis, treatment
            decisions, and all clinical care provided to your patients.
          </p>
        </Section>

        <Section title="7. Patient Data & Consent">
          <p>
            You are responsible for obtaining any consent required from your patients before
            entering their information, recordings, or documents into the platform, and for
            complying with applicable professional and data-protection obligations regarding that
            data.
          </p>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            Therapistnook and its underlying software, scoring pipeline, and design are our
            property. You retain ownership of the clinical data you enter — we do not claim
            ownership of your patients' information or your notes.
          </p>
        </Section>

        <Section title="9. Third-Party Services">
          <p>
            Certain features rely on third-party services — Google Calendar and Google Meet for
            scheduling sync, and Razorpay for payment processing. Use of those features is also
            subject to the respective third party's own terms.
          </p>
        </Section>

        <Section title="10. Termination">
          <p>
            You may stop using Therapistnook at any time. We may suspend or terminate accounts that
            violate these Terms. Upon termination, we will retain your data for a reasonable period
            to allow export, subject to our Privacy Policy and applicable law.
          </p>
        </Section>

        <Section title="11. Disclaimer of Warranties">
          <p>
            The platform is provided "as is" without warranties of any kind, express or implied,
            including fitness for a particular purpose. We do not guarantee the platform will be
            uninterrupted or error-free.
          </p>
        </Section>

        <Section title="12. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, Therapistnook is not liable for indirect,
            incidental, or consequential damages arising from your use of the platform, including
            clinical decisions made using information generated by the platform.
          </p>
        </Section>

        <Section title="13. Changes to These Terms">
          <p>
            We may update these Terms from time to time. Continued use of the platform after an
            update constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="14. Governing Law">
          <p>
            These Terms are governed by the laws of India, without regard to conflict-of-law
            principles.
          </p>
        </Section>

        <Section title="15. Contact Us">
          <p>
            Questions about these Terms? Email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary-600 hover:text-primary-700">
              {CONTACT_EMAIL}
            </a>.
          </p>
        </Section>
      </main>

      <footer className="border-t border-border-light py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-caption text-content-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Therapistnook" className="h-5 w-5" />
            <span>Therapistnook</span>
          </div>
          <span>© {new Date().getFullYear()} Therapistnook. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
