import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import {
  getTodaySchedule,
  listAppointments,
  getRecentTransactions,
} from '../api/client'
import {
  TodaySchedule,
  RecentPatientsTable,
  TherapistNote,
  PaymentsList,
} from '../components/dashboard'

function toISODate(d) {
  return d.toLocaleDateString('en-CA')
}

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [todaySchedule, setTodaySchedule] = useState(null)
  const [recentAppointments, setRecentAppointments] = useState([])
  const [transactions, setTransactions] = useState([])

  useEffect(() => {
    (async () => {
      try {
        const today = new Date()
        const end = toISODate(today)
        const startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 30)
        const start = toISODate(startDate)

        const [todayData, appts, txs] = await Promise.all([
          getTodaySchedule(end).catch(() => null),
          listAppointments({ startDate: start, endDate: end }).catch(() => []),
          getRecentTransactions(30).catch(() => []),
        ])

        setTodaySchedule(todayData)

        // Recent patients = past/today appointments excluding cancelled, newest first
        const recent = (Array.isArray(appts) ? appts : [])
          .filter((a) => a.status !== 'cancelled')
          .filter((a) => {
            const day = typeof a.date === 'string' ? a.date.slice(0, 10) : toISODate(new Date(a.date))
            return day <= end
          })
          .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
          .slice(0, 12)

        setRecentAppointments(recent)
        setTransactions(Array.isArray(txs) ? txs : [])
      } catch {
        /* handled by interceptor */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={1.8} />
      </div>
    )
  }

  return (
    <div className="dashboard-layout">
      <div className="dashboard-column">
        <TodaySchedule schedule={todaySchedule} />
        <RecentPatientsTable appointments={recentAppointments} />
      </div>

      <div className="dashboard-column">
        <TherapistNote />
        <PaymentsList transactions={transactions} />
      </div>
    </div>
  )
}
