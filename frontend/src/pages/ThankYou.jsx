import { CheckCircle2, Clock } from 'lucide-react'

export default function ThankYou() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="card mx-auto max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Thank You!</h1>
        <p className="mt-3 text-lg text-gray-600">
          Your assessment has been submitted successfully.
        </p>
        <div className="mt-6 rounded-xl bg-blue-50 p-5 text-left">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
            <div className="text-sm text-gray-700">
              <p className="font-semibold text-gray-800">What happens next?</p>
              <p className="mt-1">
                Your clinician will review the results and discuss them with you during
                your next session. The analysis typically takes a short time to process.
              </p>
            </div>
          </div>
        </div>
        <p className="mt-6 text-xs text-gray-400">
          You may now close this window.
        </p>
      </div>
    </div>
  )
}
