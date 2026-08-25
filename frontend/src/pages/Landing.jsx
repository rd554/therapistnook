import { Link } from 'react-router-dom'
import {
  Brain, CalendarClock, CreditCard, FileText, BarChart3, Sparkles,
  Check, ArrowRight, ShieldCheck, Users,
} from 'lucide-react'

const TRUST_BADGES = [
  'HTTPS Encrypted',
  'Role-Based Access',
  'Isolated Patient Data',
  'Secure Cloud Hosting',
  'Email Verified Signups',
]
// Repeated enough times so one lap is always wider than the viewport —
// otherwise the loop shows a blank gap before it wraps back around.
const TRUST_BADGES_LAP = Array(4).fill(TRUST_BADGES).flat()

const SIDEBAR_ICONS = [Users, CalendarClock, FileText, Sparkles, BarChart3]
const MOCKUP_STATS = [
  { label: 'Patients', value: '128' },
  { label: 'Sessions this week', value: '12' },
  { label: 'Assessments scored', value: '34' },
]
const MOCKUP_CHART_BARS = [40, 65, 30, 80, 55, 90, 45]
const MOCKUP_ACTIVITY = [
  { dot: 'bg-primary-500', label: 'Assessment completed' },
  { dot: 'bg-received', label: 'Clinical summary generated' },
  { dot: 'bg-overdue', label: 'Session scheduled' },
]

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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Therapistnook" className="h-9 w-9" />
            <span className="text-lg font-bold text-content-primary">Therapistnook</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-content-secondary sm:flex">
            <a href="#product" className="transition hover:text-content-primary">Product</a>
            <a href="#features" className="transition hover:text-content-primary">Features</a>
            <a href="#pricing" className="transition hover:text-content-primary">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-btn px-4 py-2 text-sm font-semibold text-content-secondary transition hover:text-content-primary"
            >
              Log In
            </Link>
            <Link to="/login?mode=signup" className="btn-primary !py-2 !px-5 text-sm">
              Sign Up
            </Link>
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

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 sm:pt-24 lg:grid-cols-2 lg:gap-10">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-badge bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
              Built for licensed practitioners
            </span>
            <h1 className="mx-auto mt-6 max-w-xl text-page-title text-content-primary sm:text-5xl lg:mx-0">
              Manage your practice and score clinical assessments in one place
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-body text-content-secondary sm:text-lg lg:mx-0">
              Therapistnook handles patient records, scheduling and payments alongside automated,
              gender-specific clinical assessment scoring so you spend less time on paperwork and
              more time with patients
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link to="/login?mode=signup" className="btn-primary text-base">
                Create your free account
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
              <a href="#pricing" className="btn-secondary text-base">
                See pricing
              </a>
            </div>
          </div>

          {/* Illustration */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <img
              src="/hero-illustration.svg"
              alt="Illustration of a practitioner working calmly and in control of their practice"
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* Product preview */}
      <section id="product" className="border-t border-border-light bg-surface-subtle py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="relative mx-auto max-w-4xl">
            <div className="absolute -left-3 -top-4 z-10 hidden -rotate-3 items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-xs font-semibold text-content-secondary shadow-md sm:flex">
              <CalendarClock className="h-3.5 w-3.5 text-primary-600" strokeWidth={2} />
              Synced with Google Calendar
            </div>
            {/* Clinical Intelligence preview card */}
            <div className="absolute -right-4 -top-6 z-10 hidden w-36 rotate-3 flex-col gap-1.5 rounded-xl border border-border-light bg-white p-2.5 shadow-lg sm:flex">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                Clinical Intelligence
              </div>
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-slate-100" />
                <div className="h-1.5 w-4/5 rounded-full bg-slate-100" />
              </div>
            </div>

            {/* Session notes preview card */}
            <div className="absolute -right-8 top-1/2 z-10 hidden w-36 -translate-y-1/2 rotate-2 flex-col gap-1.5 rounded-xl border border-border-light bg-white p-2.5 shadow-lg sm:flex">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                <FileText className="h-3.5 w-3.5" strokeWidth={2} />
                Session Notes
              </div>
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-slate-100" />
                <div className="h-1.5 w-4/5 rounded-full bg-slate-100" />
              </div>
            </div>

            {/* Assessment scoring preview card */}
            <div className="absolute -bottom-6 -left-4 z-10 hidden w-36 -rotate-3 flex-col gap-1.5 rounded-xl border border-border-light bg-white p-2.5 shadow-lg sm:flex">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                <Brain className="h-3.5 w-3.5" strokeWidth={2} />
                Assessment Result
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-2/3 rounded-full bg-primary-500" />
              </div>
              <p className="text-caption text-content-muted">Scored in seconds</p>
            </div>
            <div className="absolute -bottom-4 -right-3 z-10 hidden rotate-3 items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-xs font-semibold text-content-secondary shadow-md sm:flex">
              <ShieldCheck className="h-3.5 w-3.5 text-success-text" strokeWidth={2} />
              Secure patient records
            </div>

            <div className="overflow-hidden rounded-2xl border border-border-light bg-white shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-border-light bg-surface-subtle px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
              </div>

              <div className="flex text-left">
                <div className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-border-light bg-surface-subtle py-4 sm:flex">
                  {SIDEBAR_ICONS.map((Icon, i) => (
                    <div
                      key={i}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 0 ? 'bg-primary-100' : ''}`}
                    >
                      <Icon className={`h-4 w-4 ${i === 0 ? 'text-primary-600' : 'text-content-muted'}`} strokeWidth={1.75} />
                    </div>
                  ))}
                </div>

                <div className="flex-1 p-5 sm:p-6">
                  <div className="grid grid-cols-3 gap-3">
                    {MOCKUP_STATS.map((s) => (
                      <div key={s.label} className="rounded-xl border border-border-light bg-surface-subtle p-3">
                        <p className="text-lg font-bold text-content-primary">{s.value}</p>
                        <p className="mt-0.5 text-caption text-content-muted">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex h-20 items-end gap-2 rounded-xl border border-border-light bg-surface-subtle p-3">
                    {MOCKUP_CHART_BARS.map((h, i) => (
                      <div key={i} className="flex-1 rounded-t bg-primary-300" style={{ height: `${h}%` }} />
                    ))}
                  </div>

                  <div className="mt-5 space-y-2">
                    {MOCKUP_ACTIVITY.map((row) => (
                      <div key={row.label} className="flex items-center gap-2.5 rounded-lg border border-border-light px-3 py-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} />
                        <span className="text-secondary text-content-secondary">{row.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip — continuous scrolling marquee */}
      <div className="overflow-hidden border-y border-border-light bg-surface-subtle py-4">
        <div className="flex w-max animate-marquee gap-10">
          {[...TRUST_BADGES_LAP, ...TRUST_BADGES_LAP].map((label, i) => (
            <span
              key={i}
              className="flex shrink-0 items-center gap-2 text-sm font-bold text-content-secondary"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-600">
                <Check className="h-3 w-3 text-white" strokeWidth={3} />
              </span>
              {label}
            </span>
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
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
                  <Icon className="h-5 w-5 text-primary-600" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-card-title text-primary-700">{title}</h3>
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
              <span className="inline-flex rounded-badge bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
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
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" strokeWidth={2} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Assessment Link Plan */}
            <div className="card">
              <span className="inline-flex rounded-badge bg-lavender-100 px-3 py-1 text-xs font-semibold text-primary-700">
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
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" strokeWidth={2} />
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
          <Link to="/login?mode=signup" className="btn-primary mt-6 inline-flex text-base">
            Sign Up Free
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
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
          <span>© {new Date().getFullYear()} Therapistnook. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
