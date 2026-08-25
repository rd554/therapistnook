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

export default function Privacy() {
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
        <h1 className="text-page-title text-content-primary">Privacy Policy</h1>
        <p className="mt-2 text-caption text-content-muted">Last updated: {LAST_UPDATED}</p>
        <p className="mt-6 text-secondary text-content-secondary">
          Therapistnook ("we", "us", "our") provides a practice management platform for licensed
          mental health practitioners, including patient records, scheduling, payments, clinical
          documentation, and automated MMPI-2 assessment scoring. This policy explains what
          information we collect, how we use it, and the choices you have.
        </p>

        <Section title="1. Information We Collect">
          <p><span className="font-semibold text-content-primary">Practitioner account information</span> — name, email address, and password (stored as a secure hash, never in plain text), plus any profile details you add (clinic name, signature/stamp images, branding).</p>
          <p><span className="font-semibold text-content-primary">Patient information entered by practitioners</span> — name, date of birth, gender, contact details, clinical history, MMPI-2 assessment answers and results, session notes, recordings and transcripts, and payment/billing records. This is entered and controlled by the practitioner using the platform, not collected by us directly from patients (except where a patient fills in an assessment or intake form via a link the practitioner shares).</p>
          <p><span className="font-semibold text-content-primary">Google account information</span> — if you sign in with Google, we receive your name, email address and profile picture from Google. If you connect Google Calendar or Google Meet, we access calendar event and meeting-link data needed to sync your appointments — only with your explicit permission, and only for your own calendar.</p>
          <p><span className="font-semibold text-content-primary">Usage data</span> — basic technical logs (IP address, browser/device type, timestamps) used for security, troubleshooting, and improving the platform.</p>
        </Section>

        <Section title="2. How We Use Information">
          <ul className="list-disc space-y-2 pl-5">
            <li>To provide and operate the practice management and MMPI-2 scoring service.</li>
            <li>To authenticate accounts and keep the platform secure.</li>
            <li>To send transactional emails — email verification, appointment reminders, notifications you've enabled.</li>
            <li>To process subscription and per-link payments (via Razorpay, once billing is enabled on your account).</li>
            <li>To troubleshoot issues and improve the product.</li>
          </ul>
        </Section>

        <Section title="3. Patient Data & Practitioner Responsibility">
          <p>
            Patient data on Therapistnook is entered and controlled by the practitioner treating
            that patient. In data-protection terms, the practitioner is the data controller and
            Therapistnook acts as a data processor / technology provider. Practitioners are
            responsible for obtaining any consent required from their patients before entering
            their information into the platform.
          </p>
        </Section>

        <Section title="4. Data Sharing">
          <p>We do not sell personal data. We share information only with:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Service providers necessary to run the platform (hosting, database, email delivery).</li>
            <li>Third-party integrations you explicitly enable (Google Calendar/Meet, Razorpay for payments).</li>
            <li>Authorities, where required by law.</li>
          </ul>
        </Section>

        <Section title="5. Data Security">
          <p>
            Data is transmitted over encrypted connections (HTTPS) and passwords are stored using
            secure hashing. We restrict access to patient data to the practitioner who owns it (and
            the practice's admin account). No method of transmission or storage is 100% secure, but
            we work to protect your data using industry-standard practices.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain account and patient data for as long as the account is active. If you close
            your account, we will delete or anonymize your data within a reasonable period, except
            where retention is required by law or for legitimate business/legal purposes.
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p>
            Practitioners can request access to, export of, or deletion of their account data by
            contacting us at {CONTACT_EMAIL}. If you are a patient and want to exercise rights over
            your own data, please contact the practitioner who created your record — they control
            that data on the platform.
          </p>
        </Section>

        <Section title="8. Cookies & Analytics">
          <p>
            We use essential cookies/local storage to keep you logged in and remember basic
            preferences. We do not use third-party advertising trackers.
          </p>
        </Section>

        <Section title="9. Children's Data">
          <p>
            Therapistnook is a tool for licensed practitioners and is not directed at children.
            Where a patient's data includes a minor, that data is entered and managed by the
            treating practitioner under their own professional and legal obligations.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this policy from time to time. Material changes will be reflected on this
            page with an updated "Last updated" date.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            Questions about this policy? Email us at{' '}
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
