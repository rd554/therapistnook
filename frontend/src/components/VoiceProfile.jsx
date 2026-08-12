import { useState, useEffect, useRef } from 'react'
import {
  Mic, MicOff, Loader2, CheckCircle, AlertCircle, Trash2, Upload,
  Volume2, RefreshCw,
} from 'lucide-react'
import { getVoiceProfileStatus, uploadVoiceProfile, deleteVoiceProfile } from '../api/client'

const SAMPLE_TEXT = `Hello, I'm recording my voice profile for the therapy session transcription system. 
This recording helps the system identify my voice during therapy sessions, allowing it to accurately 
distinguish between therapist and patient speech. I'm speaking at my normal pace and volume, 
which I typically use during therapy sessions.`

export default function VoiceProfile() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadStatus()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [])

  const loadStatus = async () => {
    try {
      const data = await getVoiceProfileStatus()
      setStatus(data)
    } catch (err) {
      setError('Failed to load voice profile status')
    } finally {
      setLoading(false)
    }
  }

  const startRecording = async () => {
    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      chunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setRecordedBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingTime(0)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } catch (err) {
      setError('Could not access microphone. Please allow microphone access.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setRecordedBlob(file)
      const url = URL.createObjectURL(file)
      setAudioUrl(url)
      setError('')
    }
  }

  const clearRecording = () => {
    setRecordedBlob(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    setRecordingTime(0)
  }

  const handleUpload = async () => {
    if (!recordedBlob) return
    
    setUploading(true)
    setError('')
    setSuccess('')
    
    try {
      // Convert to a file object with proper name
      const file = new File([recordedBlob], 'voice_profile.webm', { type: recordedBlob.type })
      await uploadVoiceProfile(file)
      setSuccess('Voice profile uploaded successfully!')
      clearRecording()
      await loadStatus()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload voice profile')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete your voice profile?')) return
    
    setDeleting(true)
    setError('')
    setSuccess('')
    
    try {
      await deleteVoiceProfile()
      setSuccess('Voice profile deleted successfully')
      await loadStatus()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete voice profile')
    } finally {
      setDeleting(false)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="card">
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-800">
          <Volume2 className="h-5 w-5 text-gray-400" />
          Voice Profile Status
        </h3>
        
        {status?.has_voice_profile ? (
          <div className="mt-4">
            <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div className="flex-1">
                <p className="font-medium text-green-800">Voice Profile Ready</p>
                <p className="text-sm text-green-600">
                  Duration: {status.audio_duration ? `${Math.round(status.audio_duration)}s` : 'Unknown'}
                  {status.updated_at && (
                    <> • Last updated: {new Date(status.updated_at).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                title="Delete voice profile"
              >
                {deleting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Trash2 className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              Your voice profile will be used for speaker identification in therapy sessions.
              You can re-record your profile anytime.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-amber-50 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">No Voice Profile</p>
                <p className="text-sm text-amber-600">
                  Record your voice to enable speaker identification in therapy sessions.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recording Section */}
      <div className="card">
        <h3 className="mb-4 text-lg font-bold text-gray-800">
          {status?.has_voice_profile ? 'Update Voice Profile' : 'Create Voice Profile'}
        </h3>
        
        {/* Sample Text */}
        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <p className="mb-2 text-sm font-medium text-gray-700">
            Read this text aloud (or speak naturally for about 20 seconds):
          </p>
          <p className="text-sm italic text-gray-600">{SAMPLE_TEXT}</p>
        </div>

        {/* Recording Controls */}
        <div className="mb-6 flex flex-col items-center gap-4">
          {!recordedBlob ? (
            <>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`flex h-20 w-20 items-center justify-center rounded-full transition-all ${
                  isRecording
                    ? 'animate-pulse bg-red-500 hover:bg-red-600'
                    : 'bg-primary-500 hover:bg-primary-600'
                }`}
              >
                {isRecording ? (
                  <MicOff className="h-8 w-8 text-white" />
                ) : (
                  <Mic className="h-8 w-8 text-white" />
                )}
              </button>
              
              {isRecording ? (
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{formatTime(recordingTime)}</p>
                  <p className="text-sm text-gray-500">Recording... Click to stop</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Click to start recording</p>
              )}
            </>
          ) : (
            <>
              <div className="w-full max-w-md">
                <audio src={audioUrl} controls className="w-full" />
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={clearRecording}
                  className="btn-secondary"
                >
                  <RefreshCw className="h-4 w-4" />
                  Re-record
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="btn-primary"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Save Profile
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-sm text-gray-500">or</span>
          </div>
        </div>

        {/* File Upload */}
        <div className="text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isRecording}
            className="btn-secondary"
          >
            <Upload className="h-4 w-4" />
            Upload Audio File
          </button>
          <p className="mt-2 text-xs text-gray-500">
            Supported formats: MP3, WAV, M4A
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}
      
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-700">
          <CheckCircle className="h-5 w-5" />
          {success}
        </div>
      )}
    </div>
  )
}
