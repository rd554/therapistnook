import { Link } from 'react-router-dom'
import {
  Brain, CalendarClock, CreditCard, FileText, BarChart3, Sparkles,
  Check, ArrowRight, ShieldCheck,
} from 'lucide-react'
import LandingWalkthrough from '../components/LandingWalkthrough'

// Three plain-text claims — no marquee, no accent check-circles. Picked the
// three specific to handling clinical data (encryption, access control, data
// isolation) over the more generic hosting/signup ones.
const TRUST_CLAIMS = ['HTTPS Encrypted', 'Role-Based Access', 'Isolated Patient Data']

const FEATURES = [
  {
    icon: Brain,
    title: 'Clinical Assessments',
    text: 'Automated, gender-specific scoring for standardized assessments that delivers accurate results without manual lookups.',
  },
  {
    icon: Sparkles,
    title: 'Clinical Intelligence',
    text: 'AI-assisted case notes that pull together assessment results, documents and session history into one clinical picture.',
  },
  {
    icon: CalendarClock,
    title: 'Scheduling & Calendar Sync',
    text: 'Availability, bookings and reminders in one place, with two-way Google Calendar and Google Meet sync.',
  },
  {
    icon: CreditCard,
    title: 'Patient Payments',
    text: 'Send payment links, track receipts and keep a clear ledger for every patient without the spreadsheets.',
  },
  {
    icon: FileText,
    title: 'Session Notes & Transcripts',
    text: 'Upload or record sessions and get organised, searchable notes and SOAP summaries.',
  },
  {
    icon: BarChart3,
    title: 'Analytics & Reporting',
    text: 'Practice-level insight into revenue, attendance and assessment completion, updated in real time.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border-light bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 max-sm:px-4">
          <Link to="/" className="flex items-center gap-2.5 max-sm:gap-2">
            <img src="/logo.png" alt="Therapistnook" className="h-9 w-9" />
            <span className="text-lg font-bold text-content-primary max-sm:text-base">Therapistnook</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-content-secondary sm:flex">
            <a href="#product" className="transition hover:text-content-primary">Product</a>
            <a href="#features" className="transition hover:text-content-primary">Features</a>
            <a href="#pricing" className="transition hover:text-content-primary">Pricing</a>
          </nav>
          <div className="flex items-center gap-3 max-sm:gap-2">
            <Link
              to="/login"
              className="rounded-btn px-4 py-2 text-sm font-semibold text-content-secondary transition hover:text-content-primary max-sm:px-2.5"
            >
              Log In
            </Link>
            <span className="clinical-ink inline-flex">
              <Link to="/login?mode=signup" className="btn-primary !py-2 !px-5 text-sm max-sm:!px-3.5">
                Sign Up
              </Link>
            </span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Ambient full-width illustration — soft gradient blobs, not a stock image */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary-200 via-lavender-100 to-transparent opacity-70 blur-3xl" />
          <div className="absolute -top-16 -left-24 h-72 w-72 rounded-full bg-primary-300/30 blur-3xl" />
          <div className="absolute top-16 -right-20 h-80 w-80 rounded-full bg-lavender-200/50 blur-3xl" />
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-6 sm:pt-10 md:grid-cols-2 md:gap-10 lg:grid-cols-2 lg:gap-10">
          {/* Copy */}
          <div className="text-center md:text-left lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-badge bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
              Built for licensed psychologists
            </span>
            <h1 className="mx-auto mt-6 max-w-xl text-page-title text-content-primary sm:text-5xl md:mx-0 lg:mx-0">
              Manage your practice and score clinical assessments in one place
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-body text-content-secondary sm:text-lg md:mx-0 lg:mx-0">
              Therapistnook handles patient records, scheduling and payments alongside automated,
              gender-specific clinical assessment scoring so you spend less time on paperwork and
              more time with patients
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:justify-start lg:justify-start">
              <span className="clinical-ink inline-flex">
                <Link to="/login?mode=signup" className="btn-primary text-base">
                  Create your free account
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Link>
              </span>
              <a href="#pricing" className="btn-secondary text-base">
                See pricing
              </a>
            </div>
          </div>

          {/* Illustration */}
          <div className="relative mx-auto w-full max-w-md md:max-w-none lg:max-w-none">
            <img
              src="/hero-illustration.svg"
              alt="Illustration of a practitioner working calmly and in control of their practice"
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      <LandingWalkthrough />

      {/* Trust strip */}
      <div className="clinical-ink border-y border-border-light bg-surface-subtle py-6">
        <div className="trust-row">
          {TRUST_CLAIMS.map((label) => (
            <span key={label} className="trust-item">{label}</span>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" className="border-t border-border-light bg-surface-subtle py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-section-title text-content-primary">Everything a practice needs</h2>
            <p className="mt-3 text-body text-content-secondary">
              One workspace for assessments, patients, scheduling, payments and clinical
              documentation.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card-hover card">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-subtle">
                  <Icon className="h-5 w-5 text-content-primary" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-card-title text-content-primary">{title}</h3>
                <p className="mt-1.5 text-secondary text-content-secondary">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-section-title text-content-primary">Simple, transparent pricing</h2>
            <p className="mt-3 text-body text-content-secondary">
              One subscription for the practice workspace, plus pay-per-use for clinical assessment links.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 sm:max-w-3xl sm:mx-auto">
            {/* EHR Plan */}
            <div className="card border-2 border-primary-200">
              <span className="inline-flex rounded-badge bg-surface-subtle px-3 py-1 text-xs font-semibold text-content-primary">
                Practice Workspace
              </span>
              <div className="mt-4 flex items-end gap-1.5">
                <span className="text-3xl font-bold text-content-primary">₹799</span>
                <span className="pb-1 text-secondary text-content-secondary">/ month</span>
              </div>
              <p className="mt-2 text-secondary text-content-secondary">
                Full EHR access covering patients, scheduling, payments, clinical documentation and
                analytics.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  'Unlimited patient records',
                  'Scheduling & Google Calendar sync',
                  'Payments & receipts',
                  'Clinical Intelligence & session notes',
                  'Practice analytics',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-secondary text-content-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" strokeWidth={2} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Assessment Link Plan */}
            <div className="card">
              <span className="inline-flex rounded-badge bg-surface-subtle px-3 py-1 text-xs font-semibold text-content-primary">
                Clinical Assessment Link
              </span>
              <div className="mt-4 flex items-end gap-1.5">
                <span className="text-3xl font-bold text-content-primary">₹899</span>
                <span className="pb-1 text-secondary text-content-secondary">/ link</span>
              </div>
              <p className="mt-2 text-secondary text-content-secondary">
                Generate a working clinical assessment link for a patient, pay for it inside your
                EHR dashboard when you need one.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  'Full-length standardized clinical inventory',
                  'Automated, gender-specific scoring',
                  'T-scores & clinical subscales',
                  'Shareable link, no separate login for patients',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-secondary text-content-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" strokeWidth={2} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-8 text-center text-caption text-content-muted">
            Payments are processed securely via Razorpay. Test-link generation unlocks inside your
            dashboard once billing is set up on your account.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border-light bg-surface-subtle py-16">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-section-title text-content-primary">Ready to get started?</h2>
          <p className="mt-3 text-body text-content-secondary">
            Create your practitioner account in under a minute.
          </p>
          <span className="clinical-ink inline-flex">
            <Link to="/login?mode=signup" className="btn-primary mt-6 inline-flex text-base">
              Sign Up Free
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </span>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-light py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-caption text-content-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Therapistnook" className="h-5 w-5" />
            <span>Therapistnook</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="transition hover:text-content-secondary">Privacy Policy</Link>
            <Link to="/terms" className="transition hover:text-content-secondary">Terms of Service</Link>
          </div>
          <span>Made with care ❤️. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
