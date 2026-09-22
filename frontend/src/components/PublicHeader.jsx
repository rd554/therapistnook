// Deliberately separate from the authenticated app's Header/Sidebar chrome —
// the patient-facing test flow shows no practitioner identity (see Bug 2:
// the practitioner's ref link carries no patient identity at all, so the
// only name this header can ever show is the patient's own, once a session
// exists).
export default function PublicHeader({ patientName }) {
  return (
    <header className="public-header">
      <div className="public-header-left">
        <span className="public-mark" aria-hidden="true">TN</span>
        <div className="public-header-title">
          <span className="t-h4">MMPI-2 Personality Assessment</span>
        </div>
      </div>
      {patientName && <span className="public-header-name">{patientName}</span>}
    </header>
  )
}
