// Default onboarding copy shown to clients when a practitioner hasn't written their own yet.
// Used to (a) pre-fill the practitioner's Onboarding settings form so they aren't starting from
// a blank page, and (b) as the public onboarding page's fallback for any practitioner who never
// customizes a given field. Keeping this in one place means the two stay in sync.
export function getOnboardingDefaults(displayName) {
  const name = displayName || 'your therapist'
  return {
    welcome_message:
      `Thank you for choosing to begin your therapy journey with ${name}. This onboarding guide ` +
      `will help you understand what to expect and how to prepare for your first session.\n\n` +
      `Taking the step to seek therapy is a significant decision, and we want to make sure you ` +
      `feel informed and comfortable throughout the process.`,
    what_to_expect:
      `Your first therapy session typically involves getting to know each other and discussing ` +
      `what brings you to therapy. Here's what you can expect:\n` +
      `- A confidential and safe space to share your thoughts\n` +
      `- Discussion of your goals and expectations\n` +
      `- An overview of the therapeutic approach\n` +
      `- Opportunity to ask questions\n` +
      `- Development of a collaborative treatment plan`,
    preparation_guidelines:
      `Here are some tips to help you prepare for your first session:\n` +
      `- Find a quiet, private space where you can speak freely\n` +
      `- Prepare a list of topics you'd like to discuss\n` +
      `- Think about your goals for therapy\n` +
      `- Have any relevant medical history or previous records ready\n` +
      `- Plan to arrive a few minutes early (or log in early for online sessions)`,
    emergency_disclaimer:
      `Therapy is not a crisis service. If you are experiencing a mental health emergency or are ` +
      `in immediate danger, please contact emergency services (call 112 or 100) or go to your ` +
      `nearest emergency room.`,
    faq_content: [
      { question: 'How long is a typical session?', answer: 'Sessions typically last 45-50 minutes.' },
      { question: 'Is therapy confidential?', answer: 'Yes, all sessions are confidential within legal limits.' },
      { question: 'What if I need to cancel?', answer: 'Please provide at least 24 hours notice for cancellations.' },
      { question: 'Can I switch to a different therapist?', answer: "Yes, finding the right fit is important. We can discuss options if needed." },
    ],
  }
}
