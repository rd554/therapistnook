import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  User, MapPin, Mail, Phone, Instagram, Award, BookOpen, Languages,
  Clock, Star, ChevronRight, FileText, Calendar, Stethoscope,
  GraduationCap, BadgeCheck, Heart, ArrowRight, ExternalLink, X
} from 'lucide-react'
import {
  getPublicProfile, getPublicResources, getPublicTestimonials, getPublicAvailability
} from '../api/client'
import PublicBooking from '../components/PublicBooking'

const THERAPY_APPROACH_LABELS = {
  cognitive_behavioral: 'Cognitive Behavioral Therapy (CBT)',
  psychodynamic: 'Psychodynamic Therapy',
  humanistic: 'Humanistic Therapy',
  integrative: 'Integrative Therapy',
  mindfulness_based: 'Mindfulness-Based Therapy',
  dialectical_behavior: 'Dialectical Behavior Therapy (DBT)',
  solution_focused: 'Solution-Focused Therapy',
  narrative: 'Narrative Therapy',
  family_systems: 'Family Systems Therapy',
  trauma_informed: 'Trauma-Informed Therapy',
  acceptance_commitment: 'Acceptance and Commitment Therapy (ACT)',
  interpersonal: 'Interpersonal Therapy',
  gestalt: 'Gestalt Therapy',
  emdr: 'EMDR',
  art_therapy: 'Art Therapy',
  play_therapy: 'Play Therapy',
  other: 'Other',
}

const SPECIALIZATION_LABELS = {
  anxiety: 'Anxiety',
  depression: 'Depression',
  trauma_ptsd: 'Trauma & PTSD',
  relationship_issues: 'Relationship Issues',
  grief_loss: 'Grief & Loss',
  stress_management: 'Stress Management',
  self_esteem: 'Self-Esteem',
  anger_management: 'Anger Management',
  ocd: 'OCD',
  addiction: 'Addiction',
  eating_disorders: 'Eating Disorders',
  bipolar_disorder: 'Bipolar Disorder',
  personality_disorders: 'Personality Disorders',
  schizophrenia: 'Schizophrenia',
  child_adolescent: 'Child & Adolescent',
  couples_therapy: 'Couples Therapy',
  family_therapy: 'Family Therapy',
  lgbtq: 'LGBTQ+',
  life_transitions: 'Life Transitions',
  career_counseling: 'Career Counseling',
  chronic_illness: 'Chronic Illness',
  sleep_disorders: 'Sleep Disorders',
  other: 'Other',
}

const RESOURCE_TYPE_LABELS = {
  consent_form: 'Consent Form',
  therapy_guidelines: 'Therapy Guidelines',
  cancellation_policy: 'Cancellation Policy',
  privacy_policy: 'Privacy Policy',
  faq: 'FAQ',
  emergency_info: 'Emergency Information',
  welcome_packet: 'Welcome Packet',
  intake_instructions: 'Intake Instructions',
  other: 'Other',
}

function formatCurrency(amount, currency = 'INR') {
  if (!amount) return null
  const value = amount / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export default function PublicProfile() {
  const { slug } = useParams()
  const [profile, setProfile] = useState(null)
  const [resources, setResources] = useState([])
  const [testimonials, setTestimonials] = useState([])
  const [availability, setAvailability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('about')
  const [showBookingModal, setShowBookingModal] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [slug])

  async function loadProfile() {
    try {
      setLoading(true)
      setError(null)
      
      const [profileData, resourcesData, testimonialsData, availabilityData] = await Promise.all([
        getPublicProfile(slug),
        getPublicResources(slug).catch(() => []),
        getPublicTestimonials(slug).catch(() => []),
        getPublicAvailability(slug, 7).catch(() => null),
      ])
      
      setProfile(profileData)
      setResources(resourcesData)
      setTestimonials(testimonialsData)
      setAvailability(availabilityData)
    } catch (err) {
      console.error('Failed to load profile:', err)
      if (err.response?.status === 404) {
        setError('Profile not found')
      } else {
        setError('Failed to load profile')
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading profile...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-800 mb-2">Profile Not Found</h2>
          <p className="text-slate-500">The profile you're looking for doesn't exist or isn't public.</p>
        </div>
      </div>
    )
  }

  if (!profile) return null

  const availableDays = availability?.days?.filter(d => d.is_available) || []

  // Only surface tabs/sections the practitioner has actually filled in
  const hasAbout = !!(
    profile.bio || profile.specializations?.length || profile.therapy_approaches?.length ||
    profile.areas_of_expertise?.length || profile.public_email || profile.public_phone ||
    profile.clinic_address || profile.instagram_handle
  )
  const hasQualifications = !!(
    profile.qualifications?.length || profile.certifications?.length ||
    profile.license_number || profile.professional_memberships?.length
  )
  const hasResources = resources.length > 0
  const hasTestimonials = testimonials.length > 0
  // Accept either a bare handle or a pasted profile URL
  const instagramHandle = profile.instagram_handle
    ?.trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/$/, '')

  const tabs = [
    hasAbout && { id: 'about', label: 'About', icon: User },
    hasQualifications && { id: 'qualifications', label: 'Qualifications', icon: GraduationCap },
    hasResources && { id: 'resources', label: 'Resources', icon: FileText },
    { id: 'availability', label: 'Availability', icon: Calendar },
    hasTestimonials && { id: 'testimonials', label: 'Testimonials', icon: Star },
  ].filter(Boolean)

  // Fall back to the first tab that actually exists if the remembered tab was hidden
  const currentTab = tabs.some(t => t.id === activeTab) ? activeTab : tabs[0]?.id

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Cover Image */}
      <div className="relative h-48 md:h-64 bg-gradient-to-r from-primary-600 to-primary-700">
        {profile.cover_image_url && (
          <img
            src={profile.cover_image_url}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-16 relative z-10 pb-12">
        {/* Profile Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            {/* Profile Photo */}
            <div className="flex-shrink-0">
              {profile.profile_photo_url ? (
                <img
                  src={profile.profile_photo_url}
                  alt={profile.display_name}
                  className="w-28 h-28 md:w-32 md:h-32 rounded-xl object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-xl bg-primary-100 border-4 border-white shadow-lg flex items-center justify-center">
                  <User className="w-12 h-12 text-primary-400" />
                </div>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
                {profile.title && `${profile.title} `}{profile.display_name}
              </h1>
              {profile.tagline && (
                <p className="text-slate-500 mt-1">{profile.tagline}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-500">
                {profile.years_of_experience && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {profile.years_of_experience}+ years experience
                  </span>
                )}
                {profile.languages?.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Languages className="w-4 h-4" />
                    {profile.languages.map(l => l.language).join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Fee & CTA */}
            <div className="text-right mt-4 md:mt-0">
              {profile.consultation_fee && (
                <div className="mb-3">
                  <span className="text-sm text-slate-500">Consultation Fee</span>
                  <p className="text-2xl font-bold text-primary-600">
                    {formatCurrency(profile.consultation_fee, profile.consultation_fee_currency)}
                  </p>
                  {profile.fee_notes && (
                    <p className="text-xs text-slate-400">{profile.fee_notes}</p>
                  )}
                </div>
              )}
              <Link
                to={`/p/${slug}/onboarding`}
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-lg mb-6">
          <div className="flex border-b overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  currentTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* About Tab */}
            {currentTab === 'about' && (
              <div className="space-y-6">
                {profile.bio && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">About Me</h3>
                    <p className="text-slate-600 whitespace-pre-wrap">{profile.bio}</p>
                  </div>
                )}

                {profile.specializations?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">Specializations</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.specializations.map((spec, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm"
                        >
                          {SPECIALIZATION_LABELS[spec] || spec}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {profile.therapy_approaches?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">Therapy Approaches</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.therapy_approaches.map((approach, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-sm"
                        >
                          {THERAPY_APPROACH_LABELS[approach] || approach}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {profile.areas_of_expertise?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">Areas of Expertise</h3>
                    <ul className="grid md:grid-cols-2 gap-2">
                      {profile.areas_of_expertise.map((area, i) => (
                        <li key={i} className="flex items-center gap-2 text-slate-600">
                          <BadgeCheck className="w-4 h-4 text-primary-500" />
                          {area}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Contact Information */}
                {(profile.public_email || profile.public_phone || profile.clinic_address || profile.instagram_handle) && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">Contact</h3>
                    <div className="space-y-2">
                      {profile.public_email && (
                        <a
                          href={`mailto:${profile.public_email}`}
                          className="flex items-center gap-2 text-slate-600 hover:text-primary-600"
                        >
                          <Mail className="w-4 h-4" />
                          {profile.public_email}
                        </a>
                      )}
                      {profile.public_phone && (
                        <a
                          href={`tel:${profile.public_phone}`}
                          className="flex items-center gap-2 text-slate-600 hover:text-primary-600"
                        >
                          <Phone className="w-4 h-4" />
                          {profile.public_phone}
                        </a>
                      )}
                      {profile.clinic_address && (
                        <div className="flex items-start gap-2 text-slate-600">
                          <MapPin className="w-4 h-4 mt-1" />
                          <span className="whitespace-pre-wrap">{profile.clinic_address}</span>
                        </div>
                      )}
                      {profile.instagram_handle && (
                        <a
                          href={`https://instagram.com/${instagramHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-slate-600 hover:text-primary-600"
                        >
                          <Instagram className="w-4 h-4" />
                          @{instagramHandle}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Qualifications Tab */}
            {currentTab === 'qualifications' && (
              <div className="space-y-6">
                {profile.qualifications?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">Education</h3>
                    <div className="space-y-3">
                      {profile.qualifications.map((qual, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                          <GraduationCap className="w-5 h-5 text-primary-500 mt-0.5" />
                          <div>
                            <p className="font-medium text-slate-800">{qual.degree}</p>
                            <p className="text-sm text-slate-500">
                              {qual.institution}
                              {qual.year && ` • ${qual.year}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {profile.certifications?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">Certifications</h3>
                    <div className="space-y-3">
                      {profile.certifications.map((cert, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                          <Award className="w-5 h-5 text-amber-500 mt-0.5" />
                          <div>
                            <p className="font-medium text-slate-800">{cert.name}</p>
                            <p className="text-sm text-slate-500">
                              {cert.issuer}
                              {cert.year && ` • ${cert.year}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {profile.license_number && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">License</h3>
                    <p className="text-slate-600">{profile.license_number}</p>
                  </div>
                )}

                {profile.professional_memberships?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">Professional Memberships</h3>
                    <div className="space-y-2">
                      {profile.professional_memberships.map((mem, i) => (
                        <div key={i} className="flex items-center gap-2 text-slate-600">
                          <BadgeCheck className="w-4 h-4 text-primary-500" />
                          {mem.organization}
                          {mem.membership_id && ` (${mem.membership_id})`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Resources Tab */}
            {currentTab === 'resources' && (
              <div>
                {resources.length > 0 ? (
                  <div className="space-y-3">
                    {resources.map((resource) => (
                      <div
                        key={resource.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-primary-500" />
                          <div>
                            <p className="font-medium text-slate-800">{resource.title}</p>
                            <p className="text-sm text-slate-500">
                              {RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type}
                            </p>
                          </div>
                        </div>
                        {resource.file_url ? (
                          <a
                            href={resource.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1"
                          >
                            Download
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : resource.content ? (
                          <button className="text-primary-600 hover:text-primary-700 font-medium text-sm">
                            View
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">No resources available.</p>
                )}
              </div>
            )}

            {/* Availability Tab */}
            {currentTab === 'availability' && (
              <div>
                {availableDays.length > 0 ? (
                  <div>
                    <p className="text-slate-600 mb-4">
                      Available slots for the next 7 days.
                    </p>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {availableDays.slice(0, 6).map((day) => (
                        <div key={day.date} className="border rounded-lg p-4">
                          <p className="font-medium text-slate-800 mb-2">
                            {new Date(day.date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {day.slots.slice(0, 4).map((slot, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm"
                              >
                                {new Date(slot.start).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </span>
                            ))}
                            {day.slots.length > 4 && (
                              <span className="px-2 py-1 text-slate-500 text-sm">
                                +{day.slots.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-6 text-center">
                      <button
                        onClick={() => setShowBookingModal(true)}
                        className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                      >
                        <Calendar className="w-5 h-5" />
                        Book an Introductory Call
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">
                    No availability information at this time.
                  </p>
                )}
              </div>
            )}

            {/* Testimonials Tab */}
            {currentTab === 'testimonials' && (
              <div className="space-y-4">
                {testimonials.map((testimonial) => (
                  <div key={testimonial.id} className="border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-primary-600 font-medium">
                          {testimonial.display_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-800">
                            {testimonial.display_name}
                          </span>
                          {testimonial.rating && (
                            <div className="flex items-center gap-0.5">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-4 h-4 ${
                                    i < testimonial.rating
                                      ? 'text-amber-400 fill-amber-400'
                                      : 'text-slate-200'
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-slate-600">{testimonial.feedback}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Onboarding CTA */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl shadow-lg p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold mb-1">Ready to Begin Your Journey?</h3>
              <p className="text-primary-100">
                Learn about the therapy process and prepare for your first session.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowBookingModal(true)}
                className="inline-flex items-center gap-2 bg-white text-primary-600 px-6 py-3 rounded-lg font-medium hover:bg-primary-50 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                Book an Introductory Call
              </button>
              <Link
                to={`/p/${slug}/onboarding`}
                className="inline-flex items-center gap-2 border border-white/30 text-white px-6 py-3 rounded-lg font-medium hover:bg-white/10 transition-colors"
              >
                Learn More
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto my-8">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Book an Introductory Call</h2>
              <button
                onClick={() => setShowBookingModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <PublicBooking
                slug={slug}
                practitionerName={profile.display_name || profile.slug}
                onClose={() => setShowBookingModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
