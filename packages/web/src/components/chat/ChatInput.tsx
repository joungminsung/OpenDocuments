import { useState, useRef, useEffect } from 'react'
import { Paperclip, Send } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { translate as tr } from '../../lib/i18n'

interface Props {
  onSend: (query: string) => void
  onAttach?: (file: File) => Promise<void>
  disabled?: boolean
  uploading?: boolean
  className?: string
}

export function ChatInput({ onSend, onAttach, disabled, uploading, className = '' }: Props) {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus()
  }, [disabled])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleAttach = async (file: File | undefined) => {
    if (!file || !onAttach || disabled || uploading) return
    try {
      await onAttach(file)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.09)] ${className}`}>
      <div className="flex min-h-[116px] flex-col px-6 py-5">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.placeholder')}
          disabled={disabled}
          rows={1}
          className="min-h-[36px] flex-1 resize-none border-0 bg-transparent p-0 text-[15px] leading-6 text-slate-950 placeholder-slate-400 outline-none disabled:opacity-50"
          style={{ maxHeight: '76px' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = 'auto'
            target.style.height = Math.min(target.scrollHeight, 76) + 'px'
          }}
        />
        <div className="mt-4 flex items-end justify-between">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => void handleAttach(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!onAttach || disabled || uploading}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t('chat.uploadSource')}
              title={uploading ? t('chat.uploadingSource') : t('chat.uploadSource')}
            >
              <Paperclip size={19} strokeWidth={2} />
            </button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-[0_6px_14px_rgba(37,99,235,0.28)] transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('chat.sendQuestion')}
          >
            <Send size={19} strokeWidth={2.1} />
          </button>
        </div>
      </div>
    </div>
  )
}
