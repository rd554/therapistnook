import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  Users,
  IndianRupee,
  ClipboardList,
  UserCog,
  Loader2,
  RefreshCw,
  TrendingUp,
  CheckCircle,
  Clock,
  UserPlus,
  UserCheck,
  UserMinus,
  AlertCircle,
  Target,
} from 'lucide-react'
import {
  getAnalyticsOverview,
  getPatientAnalytics,
  getRevenueAnalytics,
  getAssessmentAnalytics,
  getPractitionerAnalytics,
  getAnalyticsExportUrl,
} from '../api/client'
import { KPICard, DateFilter, BarChart, LineChart, PieChart, ExportButton } from '../components/analytics'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatCurrency(amount, showSymbol = true) {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100)
  return showSymbol ? `₹${formatted}` : formatted
}

function formatShortCurrency(amount) {
  const value = amount / 100
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
  return `₹${value.toFixed(0)}`
}

export default function Analytics() {
  const [activeTab, setActiveTab] = useState('overview')
  const [period, setPeriod] = useState('this_month')
  const [startDate, setStartDate] = useState(null)
  const [endDate, setEndDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  
  const [overview, setOverview] = useState(null)
  const [patients, setPatients] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [assessments, setAssessments] = useState(null)
  const [practitioners, setPractitioners] = useState(null)

  const isAdmin = localStorage.getItem('mmpi_role') === 'owner'

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'revenue', label: 'Revenue', icon: IndianRupee },
    { id: 'assessments', label: 'Assessments', icon: ClipboardList },
    ...(isAdmin ? [{ id: 'practitioners', label: 'Practitioners', icon: UserCog }] : []),
  ]

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab !== 'overview') {
      loadTabData(activeTab)
    }
  }, [activeTab, period, startDate, endDate])

  const loadData = async () => {
    setLoading(true)
    try {
      const overviewData = await getAnalyticsOverview()
      setOverview(overviewData)
    } catch (err) {
      console.error('Failed to load analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadTabData = async (tab) => {
    setRefreshing(true)
    const params = { period, startDate, endDate }
    
    try {
      switch (tab) {
        case 'patients':
          setPatients(await getPatientAnalytics({ ...params, period: period === 'today' ? 'this_month' : period }))
          break
        case 'revenue':
          setRevenue(await getRevenueAnalytics({ ...params, period: period === 'today' ? 'this_month' : period }))
          break
        case 'assessments':
          setAssessments(await getAssessmentAnalytics({ ...params, period: period === 'today' ? 'this_month' : period }))
          break
        case 'practitioners':
          if (isAdmin) {
            setPractitioners(await getPractitionerAnalytics(params))
          }
          break
      }
    } catch (err) {
      console.error(`Failed to load ${tab} data:`, err)
    } finally {
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    if (activeTab === 'overview') {
      loadData()
    } else {
      loadTabData(activeTab)
    }
  }

  const handleExport = (format) => {
    const reportType = activeTab === 'overview' ? 'overview' : activeTab
    const url = getAnalyticsExportUrl(reportType, { period, startDate, endDate, format })
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Practice Analytics</h1>
          <p className="text-sm text-gray-500">Insights and metrics for your practice</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <ExportButton onExport={handleExport} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Date Filter (except overview) */}
      {activeTab !== 'overview' && (
        <DateFilter
          period={period}
          onPeriodChange={setPeriod}
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={(start, end) => {
            setStartDate(start)
            setEndDate(end)
          }}
        />
      )}

      {/* Tab Content */}
      {refreshing && activeTab !== 'overview' ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {activeTab === 'overview' && overview && <OverviewTab data={overview} />}
          {activeTab === 'patients' && patients && <PatientsTab data={patients} />}
          {activeTab === 'revenue' && revenue && <RevenueTab data={revenue} />}
          {activeTab === 'assessments' && assessments && <AssessmentsTab data={assessments} />}
          {activeTab === 'practitioners' && practitioners && <PractitionersTab data={practitioners} />}
        </>
      )}
    </div>
  )
}

function OverviewTab({ data }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        title="Total Patients"
        value={data.total_patients}
        subtitle={`${data.active_patients} active`}
        icon={Users}
        color="primary"
      />
      <KPICard
        title="New This Month"
        value={data.new_patients_this_month}
        subtitle={`${data.returning_patients} returning`}
        icon={UserPlus}
        color="green"
      />
      <KPICard
        title="Sessions Completed"
        value={data.sessions_completed}
        subtitle={`${data.upcoming_appointments} upcoming`}
        icon={CheckCircle}
        color="blue"
      />
      <KPICard
        title="Pending Payments"
        value={data.pending_payments}
        icon={AlertCircle}
        color="amber"
      />
    </div>
  )
}

function PatientsTab({ data }) {
  const chartData = data.new_patients_by_month.map((m) => ({
    label: `${MONTH_NAMES[m.month - 1]} ${m.year.toString().slice(-2)}`,
    value: m.count,
  }))

  const pieData = [
    { label: 'Active', value: data.active_patients },
    { label: 'Inactive', value: data.inactive_patients },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Active Patients"
          value={data.active_patients}
          icon={UserCheck}
          color="green"
        />
        <KPICard
          title="Inactive Patients"
          value={data.inactive_patients}
          icon={UserMinus}
          color="gray"
        />
        <KPICard
          title="Avg Sessions/Patient"
          value={data.avg_sessions_per_patient}
          icon={Target}
          color="blue"
        />
        <KPICard
          title="Retention Rate"
          value={`${data.retention_rate}%`}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">New Patients by Month</h3>
          <BarChart
            data={chartData}
            xKey="label"
            yKey="value"
            height={250}
            color="#F3FAF5"
            borderColor="#A8C7A1"
          />
        </div>
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Patient Status Distribution</h3>
          <div className="flex justify-center py-4">
            <PieChart
              data={pieData}
              labelKey="label"
              valueKey="value"
              size={180}
              colors={['#F3F0FE', '#FEF8E8']}
              strokeColors={['#7C72E8', '#E8C66A']}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function RevenueTab({ data }) {
  const monthlyData = data.revenue_by_month.map((m) => ({
    label: `${MONTH_NAMES[m.month - 1]}`,
    value: m.amount,
  }))

  const methodData = Object.entries(data.revenue_by_method).map(([method, stats]) => ({
    label: method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: stats.amount,
  })).filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          title="Monthly Revenue"
          value={formatCurrency(data.monthly_revenue)}
          icon={IndianRupee}
          color="green"
        />
        <KPICard
          title="Yearly Revenue"
          value={formatCurrency(data.yearly_revenue)}
          icon={TrendingUp}
          color="blue"
        />
        <KPICard
          title="Outstanding"
          value={formatCurrency(data.outstanding_payments)}
          icon={AlertCircle}
          color="amber"
        />
      </div>

      {/* Revenue details - using universal summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KPICard
          title="Total Revenue"
          value={formatCurrency(data.total_revenue)}
          subtitle="For selected period"
          icon={IndianRupee}
          color="green"
        />
        <KPICard
          title="Avg Session Fee"
          value={formatCurrency(data.avg_session_fee)}
          subtitle="Per session"
          icon={Target}
          color="blue"
        />
        <KPICard
          title="Total Refunds"
          value={formatCurrency(data.total_refunds)}
          subtitle="Refunded amount"
          icon={AlertCircle}
          color="amber"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Revenue by Month</h3>
          <BarChart
            data={monthlyData}
            xKey="label"
            yKey="value"
            height={250}
            color="#10b981"
            formatValue={formatShortCurrency}
          />
        </div>
        {methodData.length > 0 && (
          <div className="card">
            <h3 className="mb-4 text-sm font-semibold text-gray-800">Revenue by Payment Method</h3>
            <div className="flex justify-center py-4">
              <PieChart
                data={methodData}
                labelKey="label"
                valueKey="value"
                size={180}
                formatValue={formatShortCurrency}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AssessmentsTab({ data }) {
  const typeData = Object.entries(data.assessments_by_type).map(([type, stats]) => ({
    label: type.toUpperCase(),
    total: stats.total,
    completed: stats.completed,
  }))

  const trendData = data.assessment_trend.map((t) => ({
    label: `${MONTH_NAMES[t.month - 1]}`,
    value: t.total,
    completed: t.completed,
  }))

  const statusData = [
    { label: 'Completed', value: data.total_completed },
    { label: 'Pending', value: data.pending },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Sent"
          value={data.total_sent}
          icon={ClipboardList}
          color="primary"
        />
        <KPICard
          title="Completed"
          value={data.total_completed}
          icon={CheckCircle}
          color="green"
        />
        <KPICard
          title="Pending"
          value={data.pending}
          icon={Clock}
          color="amber"
        />
        <KPICard
          title="Completion Rate"
          value={`${data.completion_rate}%`}
          icon={Target}
          color="blue"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Assessments by Type</h3>
          <div className="space-y-3">
            {typeData.map((item) => (
              <div key={item.label} className="flex items-center gap-4">
                <div className="w-20 text-sm font-medium text-gray-700">{item.label}</div>
                <div className="flex-1">
                  <div className="flex h-6 overflow-hidden rounded-full border" style={{ borderColor: '#A8C7A1' }}>
                    <div
                      className="transition-all"
                      style={{ width: `${item.total > 0 ? (item.completed / item.total) * 100 : 0}%`, backgroundColor: '#F3FAF5' }}
                    />
                    <div
                      className="bg-amber-300"
                      style={{ width: `${item.total > 0 ? ((item.total - item.completed) / item.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="w-24 text-right text-sm text-gray-600">
                  {item.completed}/{item.total}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Completion Status</h3>
          <div className="flex justify-center py-4">
            <PieChart
              data={statusData}
              labelKey="label"
              valueKey="value"
              size={180}
              colors={['#F5F3FE', '#FEF8E8']}
              strokeColors={['#7C72E8', '#E8C66A']}
            />
          </div>
        </div>
      </div>

      {/* Trend */}
      {trendData.length > 1 && (
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Assessment Trend</h3>
          <LineChart
            data={trendData}
            xKey="label"
            yKey="value"
            height={200}
            color="#8b5cf6"
          />
        </div>
      )}
    </div>
  )
}

function PractitionersTab({ data }) {
  if (!data?.practitioners?.length) {
    return (
      <div className="card py-12 text-center">
        <UserCog className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-500">No practitioner data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
              <th className="pb-3 pr-4">Practitioner</th>
              <th className="pb-3 pr-4 text-right">Patients</th>
              <th className="pb-3 pr-4 text-right">Appointments</th>
              <th className="pb-3 pr-4 text-right">Completed</th>
              <th className="pb-3 pr-4 text-right">Revenue</th>
              <th className="pb-3 pr-4 text-right">Attendance</th>
              <th className="pb-3 text-right">Cancellation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.practitioners.map((prac) => (
              <tr key={prac.practitioner_id} className="text-sm">
                <td className="py-3 pr-4">
                  <div>
                    <p className="font-medium text-gray-900">{prac.name}</p>
                    <p className="text-xs text-gray-500">{prac.email}</p>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right text-gray-700">{prac.patients_managed}</td>
                <td className="py-3 pr-4 text-right text-gray-700">{prac.appointments_total}</td>
                <td className="py-3 pr-4 text-right text-gray-700">{prac.appointments_completed}</td>
                <td className="py-3 pr-4 text-right font-medium text-green-600">
                  {formatCurrency(prac.revenue)}
                </td>
                <td className="py-3 pr-4 text-right">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    prac.attendance_rate >= 80 ? 'bg-green-100 text-green-700' :
                    prac.attendance_rate >= 60 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {prac.attendance_rate}%
                  </span>
                </td>
                <td className="py-3 text-right">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    prac.cancellation_rate <= 10 ? 'bg-green-100 text-green-700' :
                    prac.cancellation_rate <= 20 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {prac.cancellation_rate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparison Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Revenue by Practitioner</h3>
          <BarChart
            data={data.practitioners.map(p => ({ label: p.name.split(' ')[0], value: p.revenue }))}
            xKey="label"
            yKey="value"
            height={200}
            color="#F3FAF5"
            borderColor="#A8C7A1"
            formatValue={formatShortCurrency}
          />
        </div>
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Appointments by Practitioner</h3>
          <BarChart
            data={data.practitioners.map(p => ({ label: p.name.split(' ')[0], value: p.appointments_completed }))}
            xKey="label"
            yKey="value"
            height={200}
            color="#EBE8FD"
            borderColor="#7C72E8"
          />
        </div>
      </div>
    </div>
  )
}
