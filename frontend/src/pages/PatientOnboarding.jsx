import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  User, ChevronRight, ChevronDown, ClipboardList, Phone,
  AlertTriangle, CheckCircle, Heart, BookOpen, HelpCircle,
  ArrowRight, ArrowLeft, X, Loader2
} from 'lucide-react'
import { getPublicOnboarding, submitPublicIntake } from '../api/client'
import { getOnboardingDefaults } from '../constants/onboardingDefaults'
import { COUNTRY_CODES } from '../constants/countryCodes'

const EMPTY_INTAKE_FORM = { full_name: '', age: '', gender: '', country_code: '+91', phone: '', chief_complaint: '' }

export default function PatientOnboarding() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedFaq, setExpandedFaq] = useState(null)
  const [activeSection, setActiveSection] = useState('welcome')
  const [showIntakeForm, setShowIntakeForm] = useState(false)
  const [intakeForm, setIntakeForm] = useState(EMPTY_INTAKE_FORM)
  const [submittingIntake, setSubmittingIntake] = useState(false)
  const [intakeError, setIntakeError] = useState('')
  const [intakeSubmitted, setIntakeSubmitted] = useState(false)

  const closeIntakeForm = () => {
    setShowIntakeForm(false)
    setIntakeForm(EMPTY_INTAKE_FORM)
    setIntakeError('')
    setIntakeSubmitted(false)
  }

  const handleIntakeSubmit = async (e) => {
    e.preventDefault()
    setIntakeError('')
    setSubmittingIntake(true)
    try {
      await submitPublicIntake(slug, {
        full_name: intakeForm.full_name,
        age: parseInt(intakeForm.age, 10),
        gender: intakeForm.gender,
        phone: `${intakeForm.country_code} ${intakeForm.phone}`.trim(),
        chief_complaint: intakeForm.chief_complaint,
      })
      setIntakeSubmitted(true)
    } catch (err) {
      setIntakeError(err.response?.data?.detail || 'Failed to submit intake form. Please try again.')
    } finally {
      setSubmittingIntake(false)
    }
  }

  useEffect(() => {
    loadOnboarding()
  }, [slug])

  async function loadOnboarding() {
    try {
      setLoading(true)
      setError(null)
      
      const profileData = await getPublicOnboarding(slug)
      setProfile(profileData)
    } catch (err) {
      console.error('Failed to load onboarding:', err)
      if (err.response?.status === 404) {
        setError('Profile not found')
      } else {
        setError('Failed to load onboarding information')
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-800 mb-2">Onboarding Unavailable</h2>
          <p className="text-slate-500 mb-4">The onboarding page you're looking for doesn't exist.</p>
          <Link to="/" className="text-primary-600 hover:underline">
            Go to homepage
          </Link>
        </div>
      </div>
    )
  }

  if (!profile) return null

  const defaults = getOnboardingDefaults(profile.display_name)
  const faqs = profile.faq_content?.length > 0 ? profile.faq_content : defaults.faq_content

  const sections = [
    { id: 'welcome', label: 'Welcome', icon: Heart },
    { id: 'expect', label: 'What to Expect', icon: BookOpen },
    { id: 'prepare', label: 'Preparation', icon: ClipboardList },
    { id: 'faq', label: 'FAQ', icon: HelpCircle },
    { id: 'emergency', label: 'Emergency Info', icon: AlertTriangle },
    { id: 'next', label: 'Next Steps', icon: ArrowRight },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to={`/p/${slug}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {profile.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt={profile.display_name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <User className="w-5 h-5 text-primary-600" />
              </div>
            )}
            <div>
              <p className="font-semibold text-slate-800">
                {profile.title && `${profile.title} `}{profile.display_name}
              </p>
              <p className="text-xs text-slate-500">Patient Onboarding</p>
            </div>
          </Link>
          <Link
            to={`/p/${slug}`}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Profile
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation — collapses into a horizontal tab strip below lg */}
          <nav className="lg:hidden bg-white rounded-xl shadow-sm overflow-x-auto">
            <div className="flex border-b">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeSection === section.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <section.icon className="w-4 h-4" />
                  {section.label}
                </button>
              ))}
            </div>
          </nav>

          <aside className="hidden lg:block lg:w-64 flex-shrink-0">
            <nav className="bg-white rounded-xl shadow-sm p-4 sticky top-24">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Onboarding Guide
              </p>
              <ul className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeSection === section.id
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <section.icon className="w-4 h-4" />
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            <div className="bg-white rounded-xl shadow-sm p-6 lg:p-8">
              {/* Welcome Section */}
              {activeSection === 'welcome' && (
                <div>
                  <h1 className="text-2xl font-bold text-slate-800 mb-4">
                    Welcome to Your Therapy Journey
                  </h1>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-slate-600 whitespace-pre-wrap">
                      {profile.welcome_message || defaults.welcome_message}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveSection('expect')}
                    className="mt-6 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Continue to What to Expect
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* What to Expect Section */}
              {activeSection === 'expect' && (
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-4">What to Expect</h2>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-slate-600 whitespace-pre-wrap">
                      {profile.what_to_expect || defaults.what_to_expect}
                    </p>
                  </div>
                  {profile.how_therapy_works && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      <h3 className="font-semibold text-blue-800 mb-2">How Therapy Works</h3>
                      <p className="text-blue-700 whitespace-pre-wrap">{profile.how_therapy_works}</p>
                    </div>
                  )}
                  <button
                    onClick={() => setActiveSection('prepare')}
                    className="mt-6 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Continue to Preparation
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Preparation Section */}
              {activeSection === 'prepare' && (
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-4">
                    Preparing for Your First Session
                  </h2>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-slate-600 whitespace-pre-wrap">
                      {profile.preparation_guidelines || defaults.preparation_guidelines}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveSection('faq')}
                    className="mt-6 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Continue to FAQ
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* FAQ Section */}
              {activeSection === 'faq' && (
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-4">
                    Frequently Asked Questions
                  </h2>
                  <div className="space-y-3">
                    {faqs.map((faq, index) => (
                      <div key={index} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                        >
                          <span className="font-medium text-slate-800">{faq.question}</span>
                          <ChevronDown
                            className={`w-5 h-5 text-slate-400 transition-transform ${
                              expandedFaq === index ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedFaq === index && (
                          <div className="px-4 pb-4 text-slate-600 border-t bg-slate-50">
                            <p className="pt-4 whitespace-pre-wrap">{faq.answer}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setActiveSection('emergency')}
                    className="mt-6 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Continue to Emergency Info
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Emergency Section */}
              {activeSection === 'emergency' && (
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-4">
                    Emergency Information
                  </h2>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-red-800">Important Disclaimer</h3>
                        <p className="text-red-700 mt-1 whitespace-pre-wrap">
                          {profile.emergency_disclaimer || defaults.emergency_disclaimer}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="prose prose-slate max-w-none">
                    <h3>Crisis Resources</h3>
                    <ul>
                      <li>Emergency Services: <strong>112</strong> or <strong>100</strong></li>
                      <li>iCall (TISS): <strong>9152987821</strong></li>
                      <li>Vandrevala Foundation: <strong>1860-2662-345</strong></li>
                      <li>NIMHANS Helpline: <strong>080-46110007</strong></li>
                    </ul>
                  </div>
                  <button
                    onClick={() => setActiveSection('next')}
                    className="mt-6 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Continue to Next Steps
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Next Steps Section */}
              {activeSection === 'next' && (
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-4">Next Steps</h2>
                  <p className="text-slate-600 mb-6">
                    You're ready to begin! Here's what to do next:
                  </p>

                  {profile.consent_info && (
                    <div className="bg-slate-50 border rounded-lg p-4 mb-6">
                      <h3 className="font-semibold text-slate-800 mb-2">Consent Information</h3>
                      <p className="text-slate-600 whitespace-pre-wrap">{profile.consent_info}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Intake Button */}
                    <div className="border rounded-lg p-6 hover:border-primary-300 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <ClipboardList className="w-6 h-6 text-primary-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-800 mb-1">
                            Complete Patient Intake
                          </h3>
                          <p className="text-slate-500 text-sm mb-4">
                            Fill out your personal and clinical history to help your therapist
                            understand your background.
                          </p>
                          <button
                            onClick={() => setShowIntakeForm(true)}
                            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
                          >
                            Start Intake
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-800">
                          You've completed the onboarding guide!
                        </p>
                        <p className="text-sm text-green-700">
                          Feel free to return to this page anytime to review the information.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Start Intake Modal */}
      {showIntakeForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full my-8">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Start Intake</h2>
              <button
                onClick={closeIntakeForm}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {intakeSubmitted ? (
              <div className="p-6 text-center">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <p className="font-medium text-slate-800 mb-1">Thank you, {intakeForm.full_name}!</p>
                <p className="text-slate-500 text-sm mb-6">
                  Your details have been shared with your therapist. They'll review your submission
                  and reach out to confirm your introductory call.
                </p>
                <button
                  onClick={closeIntakeForm}
                  className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleIntakeSubmit} className="p-6 space-y-4">
                <p className="text-slate-500 text-sm">
                  Share a few details so your therapist can understand your core concern before your
                  first introductory call.
                </p>

                {intakeError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                    {intakeError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={intakeForm.full_name}
                    onChange={(e) => setIntakeForm(p => ({ ...p, full_name: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Age</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={120}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={intakeForm.age}
                      onChange={(e) => setIntakeForm(p => ({ ...p, age: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Gender</label>
                    <select
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={intakeForm.gender}
                      onChange={(e) => setIntakeForm(p => ({ ...p, gender: e.target.value }))}
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone Number</label>
                  <div className="flex gap-2">
                    <select
                      required
                      className="w-32 shrink-0 border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={intakeForm.country_code}
                      onChange={(e) => setIntakeForm(p => ({ ...p, country_code: e.target.value }))}
                    >
                      {COUNTRY_CODES.map(c => (
                        <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      required
                      maxLength={15}
                      placeholder="e.g. 98765 43210"
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={intakeForm.phone}
                      onChange={(e) => setIntakeForm(p => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    What brings you here? (Chief Complaint)
                  </label>
                  <textarea
                    required
                    maxLength={2000}
                    rows={4}
                    placeholder="Briefly describe what you'd like support with..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={intakeForm.chief_complaint}
                    onChange={(e) => setIntakeForm(p => ({ ...p, chief_complaint: e.target.value }))}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingIntake}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingIntake ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                    </>
                  ) : (
                    <>
                      Submit Intake <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
