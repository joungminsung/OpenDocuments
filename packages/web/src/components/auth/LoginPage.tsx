import { useState } from 'react'

interface Props {
  onLogin: (apiKey: string) => void
}

export function LoginPage({ onLogin }: Props) {
  const [key, setKey] = useState('')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm p-6 bg-white dark:bg-gray-900 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold text-center text-primary-600 mb-6">OpenDocuments</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="od_live_..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              onKeyDown={(e) => e.key === 'Enter' && key && onLogin(key)}
            />
          </div>
          <button
            onClick={() => key && onLogin(key)}
            disabled={!key}
            className="w-full py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            Sign In
          </button>
        </div>

        <div className="mt-6 space-y-2">
          <a href="/auth/login/google" className="block w-full py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Continue with Google
          </a>
          <a href="/auth/login/github" className="block w-full py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Continue with GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
