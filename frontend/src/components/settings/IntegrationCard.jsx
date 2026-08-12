import { Check, X, Loader2 } from 'lucide-react'

export default function IntegrationCard({
  name,
  description,
  icon: Icon,
  connected,
  onConnect,
  onDisconnect,
  onTest,
  loading = false,
  testStatus,
  lastSyncAt,
  syncError,
  actions,
  disabled = false,
  comingSoon = false,
}) {
  return (
    <div 
      className={`list-item ${comingSoon ? 'opacity-60' : ''}`}
      style={{
        height: 'auto',
        minHeight: 72,
        padding: '20px',
        background: connected ? 'rgba(220, 252, 231, 0.3)' : 'white',
        borderColor: connected ? 'rgba(21, 128, 61, 0.2)' : '#F1F5F9',
      }}
    >
      <div className="flex items-start gap-4 w-full">
        <div 
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            background: connected ? 'var(--color-success-bg)' : '#EEF2FF',
            borderRadius: 12,
          }}
        >
          {Icon && (
            <Icon 
              className="w-5 h-5" 
              strokeWidth={1.5}
              style={{ color: connected ? 'var(--color-success-text)' : 'var(--color-primary)' }}
            />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="card-header-title" style={{ fontSize: 16 }}>{name}</h3>
            {connected && (
              <span className="badge-success">
                <Check className="h-3 w-3 mr-1" strokeWidth={2} />
                Connected
              </span>
            )}
            {comingSoon && (
              <span className="badge-neutral">
                Coming Soon
              </span>
            )}
          </div>
          <p className="mt-1" style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{description}</p>
          
          {syncError && (
            <div className="mt-3 alert-error py-2 px-3" style={{ display: 'inline-flex' }}>
              <X className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
              <span style={{ fontSize: 13 }}>{syncError}</span>
            </div>
          )}
          
          {lastSyncAt && !syncError && (
            <p className="mt-3" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Last synced: {new Date(lastSyncAt).toLocaleString()}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
          ) : comingSoon ? null : connected ? (
            <>
              {onTest && (
                <button
                  onClick={onTest}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', minHeight: 36, fontSize: 13 }}
                  disabled={disabled}
                >
                  Test
                </button>
              )}
              {onDisconnect && (
                <button
                  onClick={onDisconnect}
                  className="card-header-action"
                  style={{ color: 'var(--color-error-text)' }}
                  disabled={disabled}
                >
                  Disconnect
                </button>
              )}
              {actions}
            </>
          ) : (
            <button
              onClick={onConnect}
              className="btn-primary"
              style={{ padding: '8px 16px', minHeight: 36, fontSize: 13 }}
              disabled={disabled}
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
