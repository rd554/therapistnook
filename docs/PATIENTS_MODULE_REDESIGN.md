# Patients Module Redesign

## Goal

Unify all patient-related screens under a single, coherent visual language that feels premium, minimal, and consistent. Eliminate visual debt, reduce cognitive load for practitioners, and establish reusable patterns that scale across the entire module.

---

## Core Design Principles

1. **One Card Language** — Every content block uses the same card component (`rounded-card`, `shadow-card`, `p-card-padding`). No inline borders, no ad-hoc shadows.

2. **Whitespace as Structure** — Use generous spacing (`gap-6` between cards, `gap-4` within) to create hierarchy without visual clutter.

3. **Semantic Color Only** — Reserve color for status, actions, and feedback. Content stays neutral (`content-primary`, `content-secondary`, `content-muted`).

4. **Consistent Typography Scale** — Page titles: `text-page-title`. Section headers: `text-section-title`. Card headers: `text-card-title`. Body: `text-body`. Captions: `text-caption`.

5. **Unified Empty States** — Every list/table uses the `EmptyState` component with relevant icon, title, description, and optional action.

6. **Form Consistency** — All forms use `FormCard` wrapper with `FormField` components. Labels above inputs, consistent spacing.

7. **Action Hierarchy** — Primary action: `btn-primary`. Secondary: `btn-secondary`. Tertiary: `btn-ghost` or text links.

8. **Status Chips Over Badges** — Use `StatusChip` component for all status indicators (Active, Archived, Completed, Pending, etc.) with consistent color mapping.

---

## Screens Included

| Screen | Route | Current File |
|--------|-------|--------------|
| Patients List | `/patients` | `PractitionerPatients.jsx` |
| Patient Overview | `/patients/:id` | `PatientProfile.jsx` (Overview tab) |
| Edit Patient | `/patients/:id/edit` | `PatientEdit.jsx` |
| Sessions | `/patients/:id` (Sessions tab) | `PatientProfile.jsx` |
| Payments | `/patients/:id` (Payments tab) | `PatientProfile.jsx` |
| Clinical History | `/patients/:id` (Clinical History tab) | `ClinicalHistoryWizard.jsx` |
| Documents & Assessments | `/patients/:id` (Documents tab) | `PatientProfile.jsx` |
| Session Intelligence | `/patients/:id` (Session Intelligence tab) | `PatientProfile.jsx` |
| Clinical Intelligence | `/patients/:id` (Clinical Intelligence tab) | `ClinicalIntelligenceTab.jsx` |

---

## Shared Rules Across All Patient Screens

### Cards

```
All content containers:
- bg-white
- rounded-card (20px)
- shadow-card
- p-card-padding (22px)
- No borders unless semantic (e.g., warning card border-l-4)
```

### Shadows

```
Default card:     shadow-card (0 4px 20px rgba(15, 23, 42, 0.05))
Hover state:      shadow-card-hover (0 6px 16px rgba(15, 23, 42, 0.08))
Elevated modal:   shadow-lg
```

### Spacing

```
Page padding:           px-[40px] py-[48px]
Section gap:            gap-6 (24px)
Card internal gap:      gap-4 (16px)
Form field gap:         gap-4 (16px)
Tab bar padding:        p-2
Tab gap:                gap-1
```

### Typography

| Element | Class | Size | Weight |
|---------|-------|------|--------|
| Page Title | `text-page-title` | 34px | 700 |
| Section Title | `text-section-title` | 20px | 700 |
| Card Title | `text-card-title` | 18px | 500 |
| Body | `text-body` | 15px | 400 |
| Secondary | `text-secondary` | 14px | 400 |
| Caption | `text-caption` | 13px | 400 |
| Label | `label` | 13px | 500 |

### Buttons

```jsx
// Primary action
<button className="btn-primary">
  <Icon className="h-4 w-4" />
  Label
</button>

// Secondary action
<button className="btn-secondary">Label</button>

// Ghost/tertiary
<button className="btn-ghost">Label</button>

// Icon-only
<button className="btn-icon"><Icon /></button>
```

### Status Chips

```jsx
<StatusChip status="active" />      // Green: bg-success-bg text-success-text
<StatusChip status="archived" />    // Gray: bg-slate-100 text-slate-600
<StatusChip status="completed" />   // Green: bg-success-bg text-success-text
<StatusChip status="in_progress" /> // Amber: bg-warning-bg text-warning-text
<StatusChip status="pending" />     // Amber: bg-warning-bg text-warning-text
<StatusChip status="not_started" /> // Gray: bg-slate-100 text-slate-500
<StatusChip status="scheduled" />   // Blue: bg-info-bg text-info-text
<StatusChip status="cancelled" />   // Red: bg-error-bg text-error-text
```

### Empty States

```jsx
<EmptyState
  icon="users"           // Predefined icon key
  title="No patients yet"
  description="Add your first patient to get started."
  action={handleAdd}
  actionLabel="Add Patient"
/>
```

### Forms

```jsx
<FormCard title="Patient Information">
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <FormField label="Full Name" required>
      <input className="input-field" ... />
    </FormField>
    <FormField label="Date of Birth" required>
      <input type="date" className="input-field" ... />
    </FormField>
  </div>
</FormCard>
```

---

## Screen-by-Screen Changes

### Patients List

**Current Issues:**
- Table embedded in card without proper header structure
- Add Patient form expands inline (jarring)
- Filter/search bar inconsistent styling
- Status chips use inline classes instead of component

**Changes:**

1. **Page Header** — Extract to `SectionHeader` component:
   ```jsx
   <SectionHeader
     icon={Users}
     title="Patients"
     subtitle="Manage your patient records"
     action={<button className="btn-primary">Add Patient</button>}
   />
   ```

2. **Add Patient** — Move to modal (`ScheduleModal` pattern) instead of inline expand.

3. **Filter Bar** — Consolidate into single card with:
   - Search input (left)
   - Status filter dropdown (right)
   - Sort controls inside table header

4. **Table** — Replace custom table with:
   - Remove outer card (table container is its own card)
   - Use `.table-header` and `.table-cell` classes
   - Use `StatusChip` for Active/Archived
   - Use `IntakeStatusChip` for Done/In Progress/Not Started
   - Action buttons: `btn-icon` for View/Edit/Archive

5. **Empty State** — Use `<NoPatients onAdd={...} />` preset.

---

### Patient Overview

**Current Issues:**
- Clinical History CTA card has different padding
- Quick Contact cards use inconsistent border patterns
- Info grid uses `text-xs font-medium text-gray-500` labels (should be `label`)
- Recent Activity empty state is custom (should use EmptyState)

**Changes:**

1. **Patient Info Card** — Standardize:
   ```jsx
   <Card>
     <CardHeader icon={User} title="Patient Information" />
     <InfoGrid>
       <InfoItem label="Full Name" value={patient.full_name} />
       <InfoItem label="Age" value={`${patient.age} years`} />
       ...
     </InfoGrid>
   </Card>
   ```

2. **Clinical History CTA** — Use `InfoCard` with semantic background:
   ```jsx
   <InfoCard 
     variant="highlight"
     icon={FileText}
     title="Complete Clinical History"
     description="Start the client intake form"
     action={<button className="btn-primary">Start Intake</button>}
   />
   ```

3. **Quick Contact** — Use `LinkCard` component:
   ```jsx
   <LinkCard icon={Phone} title={patient.phone} href={`tel:${patient.phone}`} />
   <LinkCard icon={Mail} title={patient.email} href={`mailto:${patient.email}`} />
   ```

4. **Recent Activity** — Use `EmptyState` with `icon="inbox"`.

---

### Edit Patient

**Current Issues:**
- Form wrapped in generic card (no header)
- Error alert uses inline classes
- Button row styling inconsistent

**Changes:**

1. **Form Card** — Use `FormCard` component:
   ```jsx
   <FormCard 
     title="Edit Patient"
     subtitle="Update patient information"
     onBack={() => navigate(-1)}
   >
     {/* form fields */}
     <FormActions>
       <button className="btn-primary">Save Changes</button>
       <button className="btn-secondary">Cancel</button>
     </FormActions>
   </FormCard>
   ```

2. **Error Display** — Use `<Alert variant="error">{error}</Alert>`.

3. **Form Grid** — Standardize to `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`.

---

### Sessions

**Current Issues:**
- Stats cards use custom `!p-4` override
- Filter tabs use inline styling
- Session list items have mixed button styles
- Empty state is custom div

**Changes:**

1. **Stats Row** — Use `MetricCard` (mini variant):
   ```jsx
   <div className="grid gap-4 sm:grid-cols-3">
     <MetricCard label="Upcoming" value={upcoming} semantic="info" />
     <MetricCard label="Completed" value={completed} semantic="success" />
     <MetricCard label="Total" value={total} semantic="default" />
   </div>
   ```

2. **Filter Tabs** — Extract to `FilterTabs` component:
   ```jsx
   <FilterTabs
     value={filter}
     onChange={setFilter}
     options={[
       { value: 'all', label: 'All Sessions' },
       { value: 'upcoming', label: 'Upcoming' },
       { value: 'past', label: 'Past' },
     ]}
   />
   ```

3. **Session List** — Use `SessionRow` component with:
   - Date chip (left)
   - Session info (center)
   - Status + View button (right)

4. **Empty State** — Use `<NoAppointments onSchedule={...} />`.

---

### Payments

**Current Issues:**
- Stats cards same as Sessions (inconsistent)
- Table uses custom `<table>` without component
- Empty state is custom

**Changes:**

1. **Stats Row** — Same `MetricCard` pattern:
   ```jsx
   <MetricCard label="Total Paid" value={formatCurrency(paid)} semantic="success" />
   <MetricCard label="Pending" value={formatCurrency(pending)} semantic="warning" />
   <MetricCard label="Transactions" value={count} semantic="default" />
   ```

2. **Payments Table** — Use `DataTable` component:
   ```jsx
   <DataTable
     columns={['Date', 'Session', 'Amount', 'Status', 'Paid On', 'Receipt']}
     data={payments}
     renderRow={(payment) => <PaymentRow {...payment} />}
     emptyState={<NoPayments />}
   />
   ```

3. **Status Cells** — Use `StatusChip` for paid/pending/failed.

---

### Clinical History

**One Reusable Pattern for Every Subsection:**

```jsx
<ClinicalSection
  step={currentStep}
  title={STEPS[currentStep - 1].title}
  icon={STEPS[currentStep - 1].icon}
  description="Optional helper text for this section"
>
  {/* Section-specific form fields */}
  <div className="space-y-4">
    <FormField label="Field Name" hint="Helper text">
      <input className="input-field" />
    </FormField>
    <FormField label="Textarea Field">
      <textarea className="input-field min-h-[80px]" />
    </FormField>
  </div>
</ClinicalSection>
```

**Changes:**

1. **Progress Header** — Extract to `WizardProgress` component:
   ```jsx
   <WizardProgress
     steps={STEPS}
     currentStep={currentStep}
     onStepClick={goToStep}
     status={status}
     lastSaved={lastSaved}
     saving={saving}
   />
   ```

2. **Step Content** — Each step uses `ClinicalSection` wrapper for visual consistency.

3. **Navigation Footer** — Extract to `WizardNav`:
   ```jsx
   <WizardNav
     currentStep={currentStep}
     totalSteps={11}
     onPrev={handlePrev}
     onNext={handleNext}
     onSaveDraft={handleSaveDraft}
     onComplete={handleComplete}
     saving={saving}
   />
   ```

4. **Family History Pattern** — Use `CollapsibleFieldset` for relationship groups.

5. **Substance Use Pattern** — Use `ConditionalFieldGroup` that shows/hides based on selection.

6. **Risk Assessment Pattern** — Use `RiskAssessmentField` with severity indicator.

---

### Documents & Assessments

**Current Issues:**
- Header card uses manual div layout
- Upload panel appears inline
- Document list uses external component without styling context

**Changes:**

1. **Section Header** — Use `SectionHeader`:
   ```jsx
   <SectionHeader
     icon={FolderOpen}
     title="Documents & Assessments"
     subtitle="Clinical documents, reports, and psychological assessments"
     action={<button className="btn-primary" onClick={() => setShowUpload(true)}>Upload Document</button>}
   />
   ```

2. **Upload Panel** — Move to modal or slide-over panel.

3. **Document List** — Use `DocumentCard` component:
   ```jsx
   <DocumentCard
     icon={fileTypeIcon}
     title={doc.name}
     meta={`${doc.type} • ${formatDate(doc.uploaded_at)}`}
     onPreview={() => handlePreview(doc)}
     onDelete={() => handleDelete(doc)}
   />
   ```

4. **Empty State** — Use `<NoDocuments onUpload={...} />`.

---

### Session Intelligence

**Current Issues:**
- Voice Profile warning uses custom card styling
- Session list external component
- Upload panel inline

**Changes:**

1. **Warning Banner** — Use `Alert` component:
   ```jsx
   <Alert variant="warning" icon={Mic}>
     <AlertTitle>Voice Profile Not Set Up</AlertTitle>
     <AlertDescription>Set up your voice profile in Settings to enable speaker identification.</AlertDescription>
     <AlertAction onClick={() => navigate('/settings')}>Go to Settings</AlertAction>
   </Alert>
   ```

2. **Section Header** — Same `SectionHeader` pattern.

3. **Session List** — Use `IntelligenceSessionCard`:
   ```jsx
   <IntelligenceSessionCard
     session={session}
     onViewTranscript={() => handleView(session, 'transcript')}
     onViewAnalysis={() => handleView(session, 'analysis')}
   />
   ```

---

### Clinical Intelligence

**Current Issues:**
- Stats bar uses custom `StatCard` function
- Collapsible sections use custom implementation
- Pending updates card has manual styling
- Cards within cards (double nesting)

**Changes:**

1. **Stats Grid** — Use `MetricCard` grid:
   ```jsx
   <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
     <MetricCard icon={Heart} label="Active Symptoms" value={stats.active_symptoms} semantic="error" variant="mini" />
     <MetricCard icon={FileText} label="Diagnoses" value={stats.current_diagnoses} semantic="info" variant="mini" />
     ...
   </div>
   ```

2. **Pending Updates** — Use `PendingReviewBanner`:
   ```jsx
   <PendingReviewBanner
     count={pendingUpdates.length}
     onApproveAll={handleBulkApprove}
     onRejectAll={handleBulkReject}
   >
     {pendingUpdates.map(update => (
       <PendingUpdateCard key={update.id} update={update} ... />
     ))}
   </PendingReviewBanner>
   ```

3. **Collapsible Sections** — Use `CollapsibleCard`:
   ```jsx
   <CollapsibleCard
     icon={Heart}
     title="Symptoms"
     count={symptoms.length}
     defaultExpanded={true}
   >
     {symptoms.map(s => <SymptomCard key={s.id} symptom={s} />)}
   </CollapsibleCard>
   ```

4. **Inner Cards** — Replace nested cards with `InfoRow` or `ListItem`:
   ```jsx
   <ListItem
     title={symptom.name}
     status={symptom.current_status}
     severity={symptom.severity}
     confidence={symptom.confidence}
     meta={`First mentioned: ${formatDate(symptom.first_mention)}`}
   />
   ```

---

## Reusable Components

### PatientCard

Display patient summary in lists/grids.

```jsx
<PatientCard
  patient={patient}
  onClick={() => navigate(`/patients/${patient.id}`)}
  showIntakeStatus
  showActions
/>
```

### SectionHeader

Page/section header with icon, title, subtitle, and action.

```jsx
<SectionHeader
  icon={Users}
  title="Patients"
  subtitle="Manage your patient records"
  action={<button className="btn-primary">Add Patient</button>}
  backButton // Optional
/>
```

### MetricCard

KPI/stat display (replaces custom stat cards).

```jsx
<MetricCard
  icon={CreditCard}
  label="Total Paid"
  value="₹45,000"
  change="+12% from last month"
  changeType="positive"
  semantic="success" // success | warning | error | info | default
  variant="default" // default | mini | analytics
/>
```

### EmptyState

Consistent empty state display.

```jsx
<EmptyState
  icon="users"
  title="No patients yet"
  description="Add your first patient to get started."
  action={handleAdd}
  actionLabel="Add Patient"
/>
```

### StatusChip

Status indicator with consistent colors.

```jsx
<StatusChip status="active" />
<StatusChip status="completed" />
<StatusChip status="pending" />
<StatusChip status="cancelled" />
```

### InfoCard

Highlighted info/CTA block.

```jsx
<InfoCard
  variant="highlight" // highlight | warning | info
  icon={FileText}
  title="Complete Clinical History"
  description="Start the client intake form"
  action={<button className="btn-primary">Start Intake</button>}
/>
```

### FormCard

Form wrapper with title and actions.

```jsx
<FormCard title="Edit Patient" onBack={handleBack}>
  {/* FormField components */}
  <FormActions>
    <button className="btn-primary">Save</button>
    <button className="btn-secondary">Cancel</button>
  </FormActions>
</FormCard>
```

### CollapsibleCard

Expandable section card.

```jsx
<CollapsibleCard
  icon={Heart}
  title="Symptoms"
  count={5}
  defaultExpanded={true}
  headerClass="bg-red-50" // Optional semantic background
>
  {children}
</CollapsibleCard>
```

---

## Cursor Rules

1. **Don't touch backend** — This is a frontend-only redesign. No API changes.

2. **Don't change APIs** — Component interfaces should remain backward-compatible where possible.

3. **Reuse components** — Always check if a component exists before creating new one. Use `Card`, `EmptyState`, `Button`, `Input`, `Alert`, `Badge` from `ui/`.

4. **Keep one visual language** — Every card, button, input, and spacing should match the design system. No custom shadows, borders, or colors.

5. **Extract, don't duplicate** — If you find yourself copying styling, extract it into a component or utility class.

6. **Test empty states** — Every list/table must have an empty state using the `EmptyState` component.

7. **Mobile-first** — All grids should be responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

8. **Accessibility** — Buttons have labels, inputs have associated labels, color is not the only differentiator.

---

## Implementation Order

1. **Phase 1: Core Components**
   - Create/update `StatusChip`, `MetricCard`, `SectionHeader`, `FormCard`
   - Update `EmptyState` presets

2. **Phase 2: Patients List**
   - Migrate to new component structure
   - Add Patient modal

3. **Phase 3: Patient Overview**
   - Standardize info cards
   - Implement Quick Contact pattern

4. **Phase 4: Forms**
   - Edit Patient with FormCard
   - Clinical History wizard refactor

5. **Phase 5: Data Screens**
   - Sessions tab
   - Payments tab
   - Documents tab

6. **Phase 6: Intelligence**
   - Session Intelligence
   - Clinical Intelligence with CollapsibleCard

---

## File Changes Summary

| File | Action |
|------|--------|
| `components/ui/StatusChip.jsx` | Create |
| `components/ui/MetricCard.jsx` | Create |
| `components/ui/SectionHeader.jsx` | Create |
| `components/ui/FormCard.jsx` | Create |
| `components/ui/CollapsibleCard.jsx` | Create |
| `components/ui/InfoCard.jsx` | Create |
| `components/ui/FilterTabs.jsx` | Create |
| `components/ui/EmptyState.jsx` | Update (add presets) |
| `components/ui/Card.jsx` | Update (add CollapsibleCard export) |
| `pages/PractitionerPatients.jsx` | Refactor |
| `pages/PatientProfile.jsx` | Refactor |
| `pages/PatientEdit.jsx` | Refactor |
| `components/ClinicalHistoryWizard.jsx` | Refactor |
| `components/ClinicalIntelligenceTab.jsx` | Refactor |
