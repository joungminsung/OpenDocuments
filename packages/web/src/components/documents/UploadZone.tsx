import { useState, useRef } from 'react'
import { uploadDocument } from '../../lib/api'
import { useAppStore } from '../../stores/appStore'
import { translate as tr } from '../../lib/i18n'

interface Props {
  onUploaded: () => void
}

export function UploadZone({ onUploaded }: Props) {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setMessage('')

    let success = 0
    let failed = 0

    for (const file of Array.from(files)) {
      try {
        await uploadDocument(file)
        success++
      } catch {
        failed++
      }
    }

    setUploading(false)
    setMessage(
      failed > 0
        ? t('upload.result', { success, failed })
        : t('upload.success', { success, plural: success > 1 ? 's' : '' })
    )
    onUploaded()
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
        dragging
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
          : 'border-gray-300 dark:border-gray-700 hover:border-primary-400'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      {uploading ? (
        <p className="text-sm text-primary-500">{t('upload.uploading')}</p>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {t('upload.drop')} <span className="text-primary-500 font-medium">{t('upload.browse')}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">{t('upload.supports')}</p>
        </>
      )}
      {message && <p className="text-xs text-green-500 mt-2">{message}</p>}
    </div>
  )
}
