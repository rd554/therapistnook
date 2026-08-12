import { useState, useEffect } from 'react'
import {
  Clock, Calendar, Save, Loader2, Plus, Trash2, AlertCircle, Check,
} from 'lucide-react'
import {
  getAvailability, updateAvailability, listUnavailableDates,
  addUnavailableDate, removeUnavailableDate,
} from '../api/client'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

const TIME_OPTIONS = []
for (let h = 6; h <= 22; h++) {
  for (let m = 0; m < 60; m += 30) {
    const hour = h.toString().padStart(2, '0')
    const min = m.toString().padStart(2, '0')
    TIME_OPTIONS.push(`${hour}:${min}`)
  }
}

const DURATION_OPTIONS = [30, 45, 50, 60, 90, 120]
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30]

const TIMEZONE_OPTIONS = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
]

export default function AvailabilitySettings() {
  const [availability, setAvailability] = useState(null)
  const [unavailableDates, setUnavailableDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showAddDate, setShowAddDate] = useState(false)
  const [newDate, setNewDate] = useState({ date: '', reason: '' })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [availData, datesData] = await Promise.all([
        getAvailability(),
        listUnavailableDates(),
      ])
      setAvailability(availData)
      setUnavailableDates(datesData)
    } catch (err) {
      setError('Failed to load availability settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateAvailability({
        working_days: availability.working_days,
        work_start_time: availability.work_start_time,
        work_end_time: availability.work_end_time,
        break_start_time: availability.break_start_time,
        break_end_time: availability.break_end_time,
        default_session_duration: availability.default_session_duration,
        buffer_minutes: availability.buffer_minutes,
        timezone: availability.timezone,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (dayValue) => {
    const days = availability.working_days || []
    if (days.includes(dayValue)) {
      setAvailability(a => ({ ...a, working_days: days.filter(d => d !== dayValue) }))
    } else {
      setAvailability(a => ({ ...a, working_days: [...days, dayValue].sort() }))
    }
  }

  const handleAddUnavailableDate = async () => {
    if (!newDate.date) return
    try {
      await addUnavailableDate({
        date: newDate.date,
        reason: newDate.reason || null,
      })
      setNewDate({ date: '', reason: '' })
      setShowAddDate(false)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add unavailable date')
    }
  }

  const handleRemoveUnavailableDate = async (dateId) => {
    try {
      await removeUnavailableDate(dateId)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove date')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!availability) {
    return (
      <div className="text-center py-12 text-gray-500">
        Failed to load availability settings
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="h-4 w-4 shrink-0" />
          Settings saved successfully
        </div>
      )}

      {/* Working Days */}
      <div className="card">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Calendar className="h-4 w-4 text-gray-400" />
          Working Days
        </h3>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map((day) => {
            const isActive = (availability.working_days || []).includes(day.value)
            return (
              <button
                key={day.value}
                onClick={() => toggleDay(day.value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-700 border-2 border-primary-300'
                    : 'bg-gray-100 text-gray-500 border-2 border-transparent hover:bg-gray-200'
                }`}
              >
                {day.short}
              </button>
            )
          })}
        </div>
      </div>

      {/* Working Hours */}
      <div className="card">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Clock className="h-4 w-4 text-gray-400" />
          Working Hours
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600">Start Time</label>
            <select
              className="input-field"
              value={availability.work_start_time}
              onChange={(e) => setAvailability(a => ({ ...a, work_start_time: e.target.value }))}
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">End Time</label>
            <select
              className="input-field"
              value={availability.work_end_time}
              onChange={(e) => setAvailability(a => ({ ...a, work_end_time: e.target.value }))}
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Break Time */}
      <div className="card">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">Break Time</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600">Break Start</label>
            <select
              className="input-field"
              value={availability.break_start_time || ''}
              onChange={(e) => setAvailability(a => ({ ...a, break_start_time: e.target.value || null }))}
            >
              <option value="">No break</option>
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Break End</label>
            <select
              className="input-field"
              value={availability.break_end_time || ''}
              onChange={(e) => setAvailability(a => ({ ...a, break_end_time: e.target.value || null }))}
            >
              <option value="">No break</option>
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Session Settings */}
      <div className="card">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">Session Settings</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">Default Duration</label>
            <select
              className="input-field"
              value={availability.default_session_duration}
              onChange={(e) => setAvailability(a => ({ ...a, default_session_duration: parseInt(e.target.value) }))}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} minutes</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Buffer Between Sessions</label>
            <select
              className="input-field"
              value={availability.buffer_minutes}
              onChange={(e) => setAvailability(a => ({ ...a, buffer_minutes: parseInt(e.target.value) }))}
            >
              {BUFFER_OPTIONS.map((b) => (
                <option key={b} value={b}>{b} minutes</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Timezone</label>
            <select
              className="input-field"
              value={availability.timezone}
              onChange={(e) => setAvailability(a => ({ ...a, timezone: e.target.value }))}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Unavailable Dates */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Unavailable Dates</h3>
          <button
            onClick={() => setShowAddDate(true)}
            className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <Plus className="h-4 w-4" />
            Add Date
          </button>
        </div>

        {showAddDate && (
          <div className="mb-4 flex items-end gap-3 rounded-lg bg-gray-50 p-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-600">Date</label>
              <input
                type="date"
                className="input-field"
                value={newDate.date}
                onChange={(e) => setNewDate(d => ({ ...d, date: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-600">Reason (optional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g., Holiday, Leave"
                value={newDate.reason}
                onChange={(e) => setNewDate(d => ({ ...d, reason: e.target.value }))}
              />
            </div>
            <button onClick={handleAddUnavailableDate} className="btn-primary">
              Add
            </button>
            <button onClick={() => setShowAddDate(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        )}

        {unavailableDates.length === 0 ? (
          <p className="text-sm text-gray-500">No unavailable dates set</p>
        ) : (
          <div className="space-y-2">
            {unavailableDates.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-2"
              >
                <div>
                  <span className="font-medium text-gray-900">
                    {new Date(d.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {d.reason && (
                    <span className="ml-2 text-sm text-gray-500">— {d.reason}</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveUnavailableDate(d.id)}
                  className="text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button onClick={handleSave} className="btn-primary" disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            <><Save className="h-4 w-4" /> Save Settings</>
          )}
        </button>
      </div>
    </div>
  )
}
