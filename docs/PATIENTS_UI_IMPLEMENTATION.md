# Patients Module UI Implementation Guide

This document provides complete specifications for redesigning all patient-related screens with a consistent, premium visual language.

---

## Core Design Principles

1. **Section Headers Outside Cards** — All section titles ("Patients", "Sessions", "Payments") appear as standalone headers above their content, not inside a card wrapper.

2. **Gray Row Cards for Lists** — Every list item (patients, sessions, payments, documents) is rendered as an independent light gray card (`bg-slate-50`), not rows in a table.

3. **Dropdown Navigation** — Replace horizontal tab navigation with a dropdown selector in the Patient Profile header.

4. **Whitespace as Structure** — Use generous spacing (`gap-6` between sections, `gap-4` between row cards) to create hierarchy.

5. **Semantic Color Only** — Reserve color for status indicators and actions. Content stays neutral.

6. **Consistent Component Language** — Same card radius, shadow, and spacing everywhere. No ad-hoc styling.

---

## Design Tokens (from tailwind.config.js)

### Colors
```
Primary:           #7C72E8
Primary Hover:     #6D63D9
Primary Light:     #F0EEFF

Content Primary:   #2F2F2F
Content Secondary: #64748B
Content Muted:     #94A3B8

Row Card BG:       slate-50 (#F8FAFC)
Card BG:           white (#FFFFFF)
Border:            rgba(47, 47, 47, 0.06)
```

### Typography
```
Page Title:        34px / 700 weight
Section Title:     20px / 700 weight
Card Title:        18px / 500 weight
Body:              15px / 400 weight
Secondary:         14px / 400 weight
Caption:           13px / 400 weight
Label:             13px / 500 weight
```

### Spacing
```
Page Padding:      px-10 py-12 (40px / 48px)
Section Gap:       gap-6 (24px)
Row Card Gap:      gap-3 (12px)
Card Padding:      p-card-padding (22px)
```

### Radius
```
Card:              rounded-card (20px)
Button:            rounded-btn (16px)
Input:             rounded-input (12px)
Row Card:          rounded-2xl (16px)
```

### Shadows
```
Card:              shadow-card (0 4px 20px rgba(47, 47, 47, 0.04))
Card Hover:        shadow-card-hover (0 8px 32px rgba(47, 47, 47, 0.06))
Row Card:          shadow-sm (0 2px 8px rgba(47, 47, 47, 0.03))
```

---

## Shared Layout Pattern

All list screens follow this exact structure:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Section Title           [Search]  [Filter]            + Action Link →  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  bg-slate-50  │  Column 1  │  Column 2  │  Status  │  Actions     │  │  ← Row Card
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Row 2                                                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Row 3                                                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Row Card Styling
```jsx
<div className="bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm hover:shadow-card-hover transition-shadow">
  {/* Grid content */}
</div>
```

### Action Link Styling (like "View all →")
```jsx
<button className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover transition-colors">
  <Plus className="h-4 w-4" />
  Add Patient
</button>
```

---

## Screen Specifications

### 1. Patients List (`PractitionerPatients.jsx`)

**Layout:**
```
Patients                    [Search...]  [Status ▾]      + Add Patient →
─────────────────────────────────────────────────────────────────────────

┌────────────────────────────────────────────────────────────────────────┐
│  Name ↕       │  Age  │  Gender  │  Created ↕  │  Status  │  Intake   │  ← Header row (optional)
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  Gauri        │  30   │  Female  │  Aug 4      │ ✓ Active │ ◷ Progress│  ← Clickable row
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  Ravi         │  45   │  Male    │  Aug 3      │ ✓ Active │ ✓ Done    │
└────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```jsx
{/* Section Header - OUTSIDE any card */}
<div className="flex items-center justify-between">
  <h1 className="text-section-title text-content-primary">Patients</h1>
  
  <div className="flex items-center gap-3">
    {/* Search */}
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
      <input
        type="text"
        placeholder="Search patients..."
        className="input-field pl-9 w-64"
      />
    </div>
    
    {/* Filter Dropdown */}
    <select className="input-field w-36">
      <option>All Status</option>
      <option>Active</option>
      <option>Archived</option>
    </select>
    
    {/* Add Patient Link */}
    <button className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover">
      <Plus className="h-4 w-4" />
      Add Patient
    </button>
  </div>
</div>

{/* Patient Rows - each is independent card */}
<div className="mt-6 space-y-3">
  {patients.map(patient => (
    <div
      key={patient.id}
      onClick={() => navigate(`/patients/${patient.id}`)}
      className="bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm hover:shadow-card-hover cursor-pointer transition-all grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-4"
    >
      <span className="font-medium text-content-primary hover:text-primary">{patient.full_name}</span>
      <span className="text-secondary">{patient.age}</span>
      <span className="text-secondary">{patient.gender}</span>
      <span className="text-secondary">{formatDate(patient.created_at)}</span>
      <StatusChip status={patient.status} />
      <IntakeStatusChip status={patient.intake_status} />
    </div>
  ))}
</div>
```

---

### 2. Patient Profile Header (`PatientProfile.jsx`)

**Layout:**
```
← Gauri                      [Overview ▾]                    Edit Profile
  30 years old • Female
────────────────────────────────────────────────────────────────────────
```

**Implementation:**
```jsx
{/* Header: Back + Name | Dropdown | Edit Profile */}
<div className="flex items-center justify-between">
  {/* Left: Back + Name */}
  <div className="flex items-center gap-4">
    <button onClick={() => navigate('/patients')} className="btn-icon">
      <ArrowLeft className="h-5 w-5" />
    </button>
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-page-title text-content-primary">{patient.full_name}</h1>
        {patient.status === 'archived' && <StatusChip status="archived" />}
      </div>
      <p className="text-secondary mt-1">{patient.age} years old • {patient.gender}</p>
    </div>
  </div>
  
  {/* Center: Section Dropdown */}
  <SectionDropdown
    value={activeSection}
    onChange={setActiveSection}
    options={[
      { value: 'overview', label: 'Overview' },
      { value: 'sessions', label: 'Sessions' },
      { value: 'payments', label: 'Payments' },
      { value: 'clinical-history', label: 'Clinical History', badge: chStatus },
      { value: 'documents', label: 'Documents & Assessments' },
      { value: 'session-intelligence', label: 'Session Intelligence' },
      { value: 'clinical-intelligence', label: 'Clinical Intelligence' },
    ]}
  />
  
  {/* Right: Edit Profile */}
  <Link to={`/patients/${patientId}/edit`} className="btn-secondary">
    <Edit className="h-4 w-4" />
    Edit Profile
  </Link>
</div>
```

**SectionDropdown Component:**
```jsx
function SectionDropdown({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input-field min-w-[200px] h-11 font-medium text-content-primary"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label} {opt.badge ? `(${opt.badge})` : ''}
        </option>
      ))}
    </select>
  )
}
```

---

### 3. Patient Overview Tab

**Layout:**
```
┌────────────────────────────────────────────────────────────────────────┐
│   Patient Information                                                  │
│   ───────────────────────                                              │
│                                                                        │
│   Full Name      Gauri              Date of Birth    Jan 15, 1996      │
│   Age            30 years           Phone            +91 98765 43210   │
│   Gender         Female             Email            gauri@example.com │
│   Address        Mumbai, India                                         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Full-width Patient Information card (NO sidebar)
- NO Quick Contact section
- NO Recent Activity section
- NO "Continue Clinical History" CTA card

**Implementation:**
```jsx
function OverviewTab({ patient }) {
  return (
    <div className="card">
      <h3 className="text-card-title text-content-primary mb-4">Patient Information</h3>
      <div className="grid grid-cols-2 gap-4">
        <InfoItem label="Full Name" value={patient.full_name} />
        <InfoItem label="Date of Birth" value={formatDate(patient.date_of_birth)} />
        <InfoItem label="Age" value={`${patient.age} years`} />
        <InfoItem label="Phone" value={patient.phone || 'Not provided'} />
        <InfoItem label="Gender" value={patient.gender} />
        <InfoItem label="Email" value={patient.email || 'Not provided'} />
        <InfoItem label="Address" value={patient.address || 'Not provided'} className="col-span-2" />
      </div>
    </div>
  )
}
```

---

### 4. Sessions Tab

**Layout:**
```
Sessions                                            + Schedule Session →
─────────────────────────────────────────────────────────────────────────

┌───────────────────────┬───────────────────────┬────────────────────────┐
│  Upcoming: 2          │  Completed: 5         │  Total: 7              │
└───────────────────────┴───────────────────────┴────────────────────────┘

[All]  [Upcoming]  [Past]                        ← Filter chips

┌────────────────────────────────────────────────────────────────────────┐
│  Aug 5   │  Therapy Session  │  3:30 PM  │  ◷ Scheduled  │  View →    │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  Aug 4   │  Follow-up        │  2:00 PM  │  ✓ Completed  │  View →    │
└────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```jsx
function PatientSessionsTab({ patientId, patient }) {
  const [filter, setFilter] = useState('all')
  
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-section-title text-content-primary">Sessions</h2>
        <button className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover">
          <Plus className="h-4 w-4" />
          Schedule Session
        </button>
      </div>
      
      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Upcoming" value={upcoming} semantic="info" variant="mini" />
        <MetricCard label="Completed" value={completed} semantic="success" variant="mini" />
        <MetricCard label="Total" value={total} semantic="default" variant="mini" />
      </div>
      
      {/* Filter Chips */}
      <FilterTabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All Sessions' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
      />
      
      {/* Session Rows */}
      <div className="space-y-3">
        {sessions.map(session => (
          <div
            key={session.id}
            className="bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm hover:shadow-card-hover transition-all grid grid-cols-[1fr_2fr_1fr_1fr_auto] items-center gap-4"
          >
            <span className="font-medium text-content-primary">{formatDate(session.date)}</span>
            <span className="text-secondary">{session.title || 'Therapy Session'}</span>
            <span className="text-secondary">{formatTime(session.time)}</span>
            <SessionStatusChip status={session.status} />
            <button className="text-sm text-primary hover:text-primary-hover font-medium">
              View →
            </button>
          </div>
        ))}
      </div>
      
      {/* Empty State */}
      {sessions.length === 0 && <NoSessions onSchedule={handleSchedule} />}
    </div>
  )
}
```

---

### 5. Payments Tab

**Layout:**
```
Payments                                                   View All →
─────────────────────────────────────────────────────────────────────────

┌───────────────────────┬───────────────────────┬────────────────────────┐
│  Total Paid: ₹45,000  │  Pending: ₹5,000      │  Transactions: 12      │
└───────────────────────┴───────────────────────┴────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  Aug 4   │  Therapy Session  │  ₹3,000  │  ✓ Paid    │  Receipt →     │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  Aug 2   │  Initial Consult  │  ₹2,500  │  ◷ Pending │  Pay Now →     │
└────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```jsx
function PatientPaymentsTab({ patientId }) {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-section-title text-content-primary">Payments</h2>
        <button className="text-sm font-medium text-primary hover:text-primary-hover">
          View All →
        </button>
      </div>
      
      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Total Paid" value={formatCurrency(totals.paid)} semantic="success" variant="mini" />
        <MetricCard label="Pending" value={formatCurrency(totals.pending)} semantic="warning" variant="mini" />
        <MetricCard label="Transactions" value={totals.count} semantic="default" variant="mini" />
      </div>
      
      {/* Payment Rows */}
      <div className="space-y-3">
        {payments.map(payment => (
          <div
            key={payment.id}
            className="bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm grid grid-cols-[1fr_2fr_1fr_1fr_auto] items-center gap-4"
          >
            <span className="text-secondary">{formatDate(payment.date)}</span>
            <span className="text-content-primary">{payment.description}</span>
            <span className="font-medium text-content-primary">{formatCurrency(payment.amount)}</span>
            <PaymentStatusChip status={payment.status} />
            <button className="text-sm text-primary hover:text-primary-hover font-medium">
              {payment.status === 'paid' ? 'Receipt →' : 'Pay Now →'}
            </button>
          </div>
        ))}
      </div>
      
      {/* Empty State */}
      {payments.length === 0 && <NoPayments />}
    </div>
  )
}
```

---

### 6. Documents & Assessments Tab

**Layout:**
```
Documents & Assessments                          + Upload Document →
─────────────────────────────────────────────────────────────────────────

┌────────────────────────────────────────────────────────────────────────┐
│  📄  │  Clinical Report.pdf    │  Report    │  Aug 3  │  Preview →    │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  📋  │  MMPI-2 Assessment       │  Assessment │  Aug 1  │  View →      │
└────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```jsx
function DocumentsTab({ patientId }) {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-section-title text-content-primary">Documents & Assessments</h2>
        <button className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover">
          <Plus className="h-4 w-4" />
          Upload Document
        </button>
      </div>
      
      {/* Document Rows */}
      <div className="space-y-3">
        {documents.map(doc => (
          <div
            key={doc.id}
            className="bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm grid grid-cols-[auto_2fr_1fr_1fr_auto] items-center gap-4"
          >
            <FileIcon type={doc.type} className="h-5 w-5 text-content-muted" />
            <span className="font-medium text-content-primary">{doc.name}</span>
            <span className="text-secondary capitalize">{doc.category}</span>
            <span className="text-secondary">{formatDate(doc.uploaded_at)}</span>
            <button className="text-sm text-primary hover:text-primary-hover font-medium">
              Preview →
            </button>
          </div>
        ))}
      </div>
      
      {/* Empty State */}
      {documents.length === 0 && <NoDocuments onUpload={handleUpload} />}
    </div>
  )
}
```

---

### 7. Session Intelligence Tab

**Layout:**
```
Session Intelligence                              + Upload Recording →
─────────────────────────────────────────────────────────────────────────

⚠️ Voice Profile not set up. Go to Settings to enable speaker identification.

┌────────────────────────────────────────────────────────────────────────┐
│  🎙️  │  Session Aug 4  │  45 min  │  ✓ Transcribed  │  View →        │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  🎙️  │  Session Aug 2  │  30 min  │  ◷ Processing   │  ─             │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 8. Clinical Intelligence Tab

**Layout:**
```
Clinical Intelligence
─────────────────────────────────────────────────────────────────────────

┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Symptoms │ Diagnoses│ Triggers │ Coping   │ Goals    │ Risk     │
│    5     │    2     │    8     │    6     │    3     │   Low    │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

▼ Symptoms (5)
┌────────────────────────────────────────────────────────────────────────┐
│  Anxiety          │  Moderate  │  Active  │  High confidence          │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│  Sleep Issues     │  Mild      │  Active  │  Medium confidence        │
└────────────────────────────────────────────────────────────────────────┘

▼ Diagnoses (2)
...
```

---

### 9. Clinical History Wizard (`ClinicalHistoryWizard.jsx`)

**Current:** Horizontal tabs showing all 11 sections (overflows, hard to navigate)

**New Layout:**
```
Clinical History                    [Basic Information ▾]           Save Draft
─────────────────────────────────────────────────────────────────────────────────

Progress: ████████░░░░░░░░░░░░░░ Step 2 of 11                    ◷ Saved 2 min ago

┌────────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│   Presenting Complaint                                                         │
│   ────────────────────                                                         │
│                                                                                │
│   [Form fields for current section...]                                         │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘

                                              ← Previous    Next →    Complete
```

**Dropdown Options (all 11 sections):**
```jsx
const CLINICAL_HISTORY_SECTIONS = [
  { value: 1, label: 'Basic Information', icon: User },
  { value: 2, label: 'Presenting Complaint', icon: FileText },
  { value: 3, label: 'History of Present Illness', icon: Clock },
  { value: 4, label: 'Medical History', icon: Heart },
  { value: 5, label: 'Family History', icon: Users },
  { value: 6, label: 'Personal History', icon: User },
  { value: 7, label: 'Relationship History', icon: Heart },
  { value: 8, label: 'Occupational History', icon: Briefcase },
  { value: 9, label: 'Substance Use', icon: AlertCircle },
  { value: 10, label: 'Mental Status Exam', icon: Brain },
  { value: 11, label: 'Risk Assessment', icon: AlertTriangle },
]
```

**Implementation:**
```jsx
function ClinicalHistoryWizard({ patientId, patient, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1)
  
  return (
    <div className="space-y-6">
      {/* Header: Title | Dropdown | Save Draft */}
      <div className="flex items-center justify-between">
        <h2 className="text-section-title text-content-primary">Clinical History</h2>
        
        {/* Section Dropdown - scrollable, max-width limited */}
        <SectionDropdown
          value={currentStep}
          onChange={(val) => setCurrentStep(Number(val))}
          options={CLINICAL_HISTORY_SECTIONS.map(s => ({
            value: s.value,
            label: s.label,
            badge: getStepStatus(s.value) // ✓ or empty
          }))}
          className="max-w-[220px]"
        />
        
        <button className="btn-secondary" onClick={handleSaveDraft}>
          Save Draft
        </button>
      </div>
      
      {/* Progress Bar */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <div className="h-2 w-48 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all"
              style={{ width: `${(currentStep / 11) * 100}%` }}
            />
          </div>
          <span className="text-secondary">Step {currentStep} of 11</span>
        </div>
        <span className="text-content-muted">
          {saving ? 'Saving...' : lastSaved ? `Saved ${formatRelative(lastSaved)}` : ''}
        </span>
      </div>
      
      {/* Section Content Card */}
      <div className="card">
        <h3 className="text-card-title text-content-primary mb-6">
          {CLINICAL_HISTORY_SECTIONS[currentStep - 1].label}
        </h3>
        
        {/* Render current step form */}
        {renderStepContent(currentStep)}
      </div>
      
      {/* Navigation Footer */}
      <div className="flex items-center justify-end gap-3">
        {currentStep > 1 && (
          <button className="btn-secondary" onClick={() => setCurrentStep(s => s - 1)}>
            ← Previous
          </button>
        )}
        {currentStep < 11 ? (
          <button className="btn-primary" onClick={() => setCurrentStep(s => s + 1)}>
            Next →
          </button>
        ) : (
          <button className="btn-primary" onClick={handleComplete}>
            Complete
          </button>
        )}
      </div>
    </div>
  )
}
```

**Dropdown Styling (scrollable, limited width):**
```jsx
<select
  className="input-field max-w-[220px] h-11 pr-10 font-medium text-content-primary appearance-none cursor-pointer truncate"
>
  {/* Options are naturally scrollable in native select */}
</select>
```

**Key Points:**
- Replace horizontal tabs with dropdown selector
- Dropdown shows current section with checkmark status for completed sections
- Native `<select>` element handles scrolling automatically
- Max-width `220px` prevents horizontal overflow
- Progress bar shows overall completion
- Section title displayed inside the form card

---

## New Components to Create

### 1. SectionDropdown (`frontend/src/components/ui/SectionDropdown.jsx`)

```jsx
import { ChevronDown } from 'lucide-react'

export function SectionDropdown({ value, onChange, options, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field min-w-[200px] h-11 pr-10 font-medium text-content-primary appearance-none cursor-pointer"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}{opt.badge ? ` (${opt.badge})` : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted pointer-events-none" />
    </div>
  )
}
```

### 2. PatientRowCard (reusable list row)

```jsx
export function RowCard({ children, onClick, className = '' }) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm 
        hover:shadow-card-hover transition-all
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
```

---

## Implementation Rules

1. **Don't touch backend** — This is frontend-only. No API changes.

2. **Don't change existing API contracts** — Component props should remain backward-compatible.

3. **Section headers are always outside cards** — Never wrap section titles in a card.

4. **Use gray row cards for all lists** — `bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm`

5. **Dropdown replaces tabs** — Use `SectionDropdown` in `PatientProfile.jsx` header instead of `TabNav`.

6. **Patient header layout** — `Name | [Dropdown] | Edit Profile` in a single row.

7. **Clinical History uses dropdown** — Replace horizontal tabs with scrollable dropdown (`max-w-[220px]`).

8. **No sidebar in Overview** — Remove Quick Contact and Recent Activity entirely.

9. **No CTA cards** — Remove "Continue Clinical History" InfoCard.

10. **Action links style** — `text-sm font-medium text-primary hover:text-primary-hover` with optional `Plus` icon.

11. **Test empty states** — Every list must have appropriate `EmptyState` component.

12. **Mobile responsive** — Use responsive grid classes (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `components/ui/SectionDropdown.jsx` | Create | Dropdown navigation component |
| `components/ui/RowCard.jsx` | Create | Reusable gray row card |
| `components/ui/index.js` | Update | Export new components |
| `pages/PractitionerPatients.jsx` | Refactor | Section header outside, gray row cards |
| `pages/PatientProfile.jsx` | Refactor | Dropdown nav, all tabs refactored |
| `components/ClinicalHistoryWizard.jsx` | Refactor | Replace horizontal tabs with dropdown selector |

---

## Implementation Order

1. **Create SectionDropdown component**
2. **Refactor PractitionerPatients.jsx** — Section header + gray row cards
3. **Refactor PatientProfile.jsx header** — Replace TabNav with SectionDropdown
4. **Refactor OverviewTab** — Remove CTA, Quick Contact, Recent Activity; full-width Patient Info
5. **Refactor SessionsTab** — Section header + stats + gray row cards
6. **Refactor PaymentsTab** — Section header + stats + gray row cards  
7. **Refactor DocumentsTab** — Section header + gray row cards
8. **Refactor SessionIntelligenceTab** — Section header + gray row cards
9. **Review ClinicalIntelligenceTab** — Apply consistent section headers
10. **Refactor ClinicalHistoryWizard.jsx** — Replace horizontal tabs with dropdown, add progress bar

---

## Quick Reference: Tailwind Classes

```css
/* Section Header */
.section-header: flex items-center justify-between

/* Section Title */
.section-title: text-section-title text-content-primary

/* Row Card */
.row-card: bg-slate-50 rounded-2xl px-4 py-3.5 shadow-sm hover:shadow-card-hover transition-all

/* Action Link */
.action-link: inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover

/* Stats Strip */
.stats-strip: grid grid-cols-3 gap-4

/* List Container */
.list-container: space-y-3
```
