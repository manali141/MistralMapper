import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createMappingSequence } from '../services/mappingSequence'
import { buildQuickBooksInvoiceRows } from '../services/quickBooksExport'
import './AccountBridgeWizard.css'

const stepsTemplate = [
  { id: 1, label: 'Upload', status: 'idle', message: 'Add your organization and QuickBooks files.' },
  { id: 2, label: 'AI Discovery', status: 'idle', message: 'We will compare both files.' },
  { id: 3, label: 'Verify', status: 'idle', message: 'Confirm or adjust the suggestions.' },
  { id: 4, label: 'Mapping', status: 'idle', message: 'Make sure everything looks right.' },
  { id: 5, label: 'Success', status: 'idle', message: 'Get the file for QuickBooks.' },
]

const icons = {
  bolt: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M3 21h18" /></svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4" /></svg>
  ),
  bot: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8V4M8 4h8M6 8h12a2 2 0 0 1 2 2v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a2 2 0 0 1 2-2ZM9 13h.01M15 13h.01M9 17h6" /></svg>
  ),
  nodes: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h4v4H7zM13 13h4v4h-4zM7 17h2a2 2 0 0 0 2-2v-4M17 7h-2a2 2 0 0 0-2 2v4" /></svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.7 4.6L18 9.3l-4.3 1.7L12 16l-1.7-5L6 9.3l4.3-1.7L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M7 16v-5M12 16V7M17 16v-9M7 11l5-4 5 2" /></svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7v5c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V7l8-4ZM9 12l2 2 4-4" /></svg>
  ),
}

function Brand({ compact = false }) {
  return (
    <button type="button" className="brand" onClick={() => window.dispatchEvent(new CustomEvent('go-home'))}>
      <span className="brand-mark">{icons.building}</span>
      <span className="brand-copy">
        <strong>AccountBridge</strong>
        {!compact && <small>QuickStart AI</small>}
      </span>
    </button>
  )
}

function HomePage({ currentUser, onNavigate, onStartSetup, onSignOut }) {
  return (
    <div className="site-page">
      <header className="site-header">
        <Brand />
        <nav>
          {currentUser ? (
            <>
              <span className="signed-in-name">{currentUser.fullName}</span>
              <button type="button" className="link-button" onClick={onSignOut}>Sign Out</button>
              <button type="button" className="dark-button" onClick={onStartSetup}>Open Setup</button>
            </>
          ) : (
            <>
              <button type="button" className="link-button" onClick={() => onNavigate('login')}>Sign In</button>
              <button type="button" className="dark-button" onClick={() => onNavigate('register')}>Get Started</button>
            </>
          )}
        </nav>
      </header>
      <main>
        <section className="hero-section">
          <h1>Set Up QuickBooks in Under 10 Minutes</h1>
          <p>Guided onboarding that turns organization files into a reviewed QuickBooks setup file, without requiring accounting expertise.</p>
          <button type="button" className="dark-button hero-cta" onClick={onStartSetup}>
            Start Free Setup {icons.arrow}
          </button>
        </section>
        <section className="how-section">
          <h2>How It Works</h2>
          <div className="process-grid">
            {[
              [icons.upload, '1. Upload Data', 'Import your historical invoice and membership transaction data from WildApricot'],
              [icons.bot, '2. AI Analysis', 'Our AI analyzes your data and identifies accounting modules and patterns'],
              [icons.download, '3. Review & Verify', 'Review AI suggestions and adjust mappings in an intuitive dashboard'],
              [icons.check, '4. Deploy to QuickBooks', 'Automatically implement the structure in QuickBooks Online'],
            ].map(([icon, title, body]) => (
              <article key={title} className="process-item">
                <span>{icon}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="audience-section">
          <div>
            <h2>Perfect for Small Organizations</h2>
            <ul className="audience-list">
              <li><span>{icons.check}</span> Small businesses without dedicated accountants</li>
              <li><span>{icons.check}</span> Nonprofit organizations and volunteer treasurers</li>
              <li><span>{icons.check}</span> Membership-based organizations</li>
              <li><span>{icons.check}</span> Anyone who needs QuickBooks setup quickly</li>
            </ul>
          </div>
          <div className="comparison-card">
            <h3>Setup Time Comparison</h3>
            <div className="bar-row"><span>Traditional Setup</span><strong>40+ hours</strong></div>
            <div className="bar danger"><span /></div>
            <div className="bar-row"><span>With AccountBridge AI</span><strong>&lt;10 min</strong></div>
            <div className="bar success"><span /></div>
          </div>
        </section>
        <section className="cta-band">
          <h2>Ready to Get Started?</h2>
          <p>Join organizations that have simplified their accounting setup.</p>
          <button type="button" onClick={onStartSetup}>Start Your Free Setup</button>
        </section>
      </main>
      <footer>© 2026 AccountBridge QuickStart AI. Built for faster accounting onboarding.</footer>
    </div>
  )
}

function AuthPage({ mode, onNavigate, onAuthenticate }) {
  const isRegister = mode === 'register'
  const [form, setForm] = useState({
    organizationName: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false,
    rememberMe: false,
  })
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (event) => {
    const { name, type, checked, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setFormError('')
    setIsSubmitting(true)

    try {
      await onAuthenticate(mode, form)
    } catch (error) {
      setFormError(error.message || 'We could not access your account. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand compact />
        <button type="button" className="back-home" onClick={() => onNavigate('home')}>{icons.back} Back to Home</button>
      </header>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <h1>{isRegister ? 'Create Your Account' : 'Welcome Back'}</h1>
          <p>{isRegister ? 'Start streamlining your QuickBooks setup today' : 'Sign in to your AccountBridge account'}</p>
          {isRegister && (
            <TextInput
              label="Organization Name"
              name="organizationName"
              value={form.organizationName}
              onChange={updateField}
              placeholder="Your Organization"
              autoComplete="organization"
              minLength={2}
              maxLength={120}
              required
            />
          )}
          {isRegister && (
            <TextInput
              label="Full Name"
              name="fullName"
              value={form.fullName}
              onChange={updateField}
              placeholder="John Smith"
              autoComplete="name"
              minLength={2}
              maxLength={120}
              required
            />
          )}
          <TextInput
            label="Email Address"
            name="email"
            value={form.email}
            onChange={updateField}
            placeholder="you@organization.org"
            type="email"
            autoComplete="email"
            maxLength={320}
            required
          />
          <TextInput
            label="Password"
            name="password"
            value={form.password}
            onChange={updateField}
            placeholder={isRegister ? 'Create a strong password' : 'Enter your password'}
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={isRegister ? 8 : undefined}
            maxLength={128}
            required
          />
          {isRegister && (
            <TextInput
              label="Confirm Password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={updateField}
              placeholder="Re-enter your password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          )}
          <div className="form-row">
            <label className="check-row">
              <input
                type="checkbox"
                name={isRegister ? 'acceptedTerms' : 'rememberMe'}
                checked={isRegister ? form.acceptedTerms : form.rememberMe}
                onChange={updateField}
                required={isRegister}
              />
              <span>{isRegister ? 'I agree to the Terms of Service and Privacy Policy' : 'Remember me'}</span>
            </label>
            {!isRegister && (
              <button type="button" className="text-action" onClick={() => onNavigate('forgot-password')}>
                Forgot password?
              </button>
            )}
          </div>
          {formError && <div className="auth-error" role="alert">{formError}</div>}
          <button type="submit" className="primary-wide" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
          <p className="auth-switch">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button type="button" onClick={() => onNavigate(isRegister ? 'login' : 'register')}>
              {isRegister ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </form>
      </main>
    </div>
  )
}

function ForgotPasswordPage({ onNavigate }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setFormError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'We could not send the reset email. Please try again.')
      }
      setMessage(payload.message)
    } catch (error) {
      setFormError(error.message || 'We could not send the reset email. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand compact />
        <button type="button" className="back-home" onClick={() => onNavigate('home')}>{icons.back} Back to Home</button>
      </header>
      <main className="auth-main">
        <form className="auth-card auth-card-compact" onSubmit={submit}>
          <h1>{message ? 'Check Your Email' : 'Reset Your Password'}</h1>
          <p>
            {message
              ? message
              : 'Enter the email linked to your AccountBridge account.'}
          </p>
          {!message && (
            <TextInput
              label="Email Address"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@organization.org"
              type="email"
              autoComplete="email"
              maxLength={320}
              required
            />
          )}
          {formError && <div className="auth-error" role="alert">{formError}</div>}
          {!message && (
            <button type="submit" className="primary-wide" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Reset Link'}
            </button>
          )}
          <button type="button" className="auth-secondary" onClick={() => onNavigate('login')}>
            {icons.back} Back to Sign In
          </button>
        </form>
      </main>
    </div>
  )
}

function ResetPasswordPage({ token, onComplete, onNavigate }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setFormError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'We could not change your password. Please request a new link.')
      }
      setMessage(payload.message)
    } catch (error) {
      setFormError(error.message || 'We could not change your password. Please request a new link.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand compact />
        <button type="button" className="back-home" onClick={() => onNavigate('home')}>{icons.back} Back to Home</button>
      </header>
      <main className="auth-main">
        <form className="auth-card auth-card-compact" onSubmit={submit}>
          <h1>{message ? 'Password Changed' : 'Choose a New Password'}</h1>
          <p>{message || 'Create a new password for your AccountBridge account.'}</p>
          {!message && (
            <>
              <TextInput
                label="New Password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter a new password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
              <TextInput
                label="Confirm New Password"
                name="confirmPassword"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your new password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </>
          )}
          {formError && <div className="auth-error" role="alert">{formError}</div>}
          {!message ? (
            <button type="submit" className="primary-wide" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Change Password'}
            </button>
          ) : (
            <button type="button" className="primary-wide" onClick={onComplete}>
              Continue to Sign In
            </button>
          )}
          {!message && (
            <button type="button" className="auth-secondary" onClick={() => onNavigate('forgot-password')}>
              Request a New Link
            </button>
          )}
        </form>
      </main>
    </div>
  )
}

function TextInput({ label, ...props }) {
  return (
    <label className="field-label">
      {label}
      <input {...props} />
    </label>
  )
}

function AccountBridgeWizard() {
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('resetToken') || '')
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).has('resetToken') ? 'reset-password' : 'home')
  const [currentUser, setCurrentUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [sourceMode, setSourceMode] = useState('file')
  const [targetMode, setTargetMode] = useState('file')
  const [sourceFile, setSourceFile] = useState(null)
  const [targetFile, setTargetFile] = useState(null)
  const [sourceEndpoint, setSourceEndpoint] = useState('')
  const [targetEndpoint, setTargetEndpoint] = useState('')
  const [steps, setSteps] = useState(stepsTemplate)
  const [wizardStep, setWizardStep] = useState(1)
  const [processingStartedAt, setProcessingStartedAt] = useState(null)
  const [qbDataForConfirmation, setQbDataForConfirmation] = useState(null)
  const [editableRows, setEditableRows] = useState([])
  const [error, setError] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [confirmationResolver, setConfirmationResolver] = useState(null)
  const [customProducts, setCustomProducts] = useState([])
  const [customClasses, setCustomClasses] = useState([])
  const [persistedResponse, setPersistedResponse] = useState(null)
  const [sourceDataForExport, setSourceDataForExport] = useState(null)
  const [downloadFormat, setDownloadFormat] = useState('json')
  const sourceInputRef = useRef(null)
  const targetInputRef = useRef(null)

  useEffect(() => {
    const goHome = () => setPage('home')
    window.addEventListener('go-home', goHome)
    return () => window.removeEventListener('go-home', goHome)
  }, [])

  const startSetupFromHome = () => {
    setPage(currentUser ? 'wizard' : 'login')
  }

  const authenticateAndOpenWizard = async (mode, form) => {
    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload.error || 'We could not access your account. Please try again.')
    }

    setCurrentUser(payload.user)
    setPage('wizard')
  }

  const signOut = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    setCurrentUser(null)
    setPage('home')
  }

  const completePasswordReset = () => {
    window.history.replaceState({}, '', window.location.pathname)
    setResetToken('')
    setPage('login')
  }

  useEffect(() => {
    let isMounted = true

    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        return response.ok ? payload.user ?? null : null
      })
      .then((user) => {
        if (isMounted) setCurrentUser(user)
      })
      .catch(() => {
        if (isMounted) setCurrentUser(null)
      })
      .finally(() => {
        if (isMounted) setAuthChecked(true)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    fetch('/dev-api/test-accounts')
      .then((response) => (response.ok ? response.json() : { accounts: [] }))
      .then((payload) => {
        if (!isMounted) return
        const accountList = Array.isArray(payload?.accounts) ? payload.accounts : []
        setAccounts(accountList)
        const firstAccount = accountList[0]
        if (firstAccount) {
          setSelectedAccountId(String(firstAccount.accountId))
          if (firstAccount.sourceEndpoint) {
            setSourceMode('endpoint')
            setSourceEndpoint(firstAccount.sourceEndpoint)
          }
          if (firstAccount.targetEndpoint) {
            setTargetMode('endpoint')
            setTargetEndpoint(firstAccount.targetEndpoint)
          }
        }
      })
      .catch(() => setAccounts([]))

    return () => {
      isMounted = false
    }
  }, [])

  const applyAccount = (accountId) => {
    setSelectedAccountId(accountId)
    const account = accounts.find((item) => String(item.accountId) === String(accountId))
    if (account?.sourceEndpoint) {
      setSourceMode('endpoint')
      setSourceFile(null)
      setSourceEndpoint(account.sourceEndpoint)
    }
    if (account?.targetEndpoint) {
      setTargetMode('endpoint')
      setTargetFile(null)
      setTargetEndpoint(account.targetEndpoint)
    }
  }

  const updateStep = (stepId, status, message) => {
    setSteps((current) => current.map((step) => (step.id === stepId ? { ...step, status, message } : step)))
    if (stepId <= 2 && (status === 'running' || status === 'completed')) {
      setWizardStep(2)
    }
  }

  const resetRunState = () => {
    setSteps(stepsTemplate)
    setWizardStep(2)
    setProcessingStartedAt(Date.now())
    setQbDataForConfirmation(null)
    setEditableRows([])
    setCustomProducts([])
    setCustomClasses([])
    setConfirmationResolver(null)
    setPersistedResponse(null)
    setSourceDataForExport(null)
    setError('')
  }

  const restartProcess = () => {
    setSteps(stepsTemplate)
    setWizardStep(1)
    setProcessingStartedAt(null)
    setQbDataForConfirmation(null)
    setEditableRows([])
    setConfirmationResolver(null)
    setPersistedResponse(null)
    setSourceDataForExport(null)
    setIsRunning(false)
    setError('')
  }

  const startSetup = async () => {
    setIsRunning(true)
    resetRunState()
    const startedAt = Date.now()

    try {
      const mappingSequence = createMappingSequence({
        onPromptGenerated: () => {},
        confirmMapping: async (mappingResult, qbData, sourceData) => {
          const qbProducts = getQuickBooksProducts(qbData)
          const qbClasses = getQuickBooksClasses(qbData)
          const rawRows = extractMappingRows(mappingResult)
          const remainingLoaderTime = Math.max(0, 25000 - (Date.now() - startedAt))

          if (remainingLoaderTime > 0) {
            await delay(remainingLoaderTime)
          }

          setQbDataForConfirmation(qbData)
          setSourceDataForExport(sourceData)
          setEditableRows(rawRows.map((row) => ({
            waFieldName: row.WAFieldName ?? '',
            ...resolveQuickBooksProductSelection(
              qbProducts,
              row.QBProduct ?? row.accountName ?? row.Account ?? '',
              row.QBProductId ?? row.accountId ?? '',
            ),
            ...resolveQuickBooksClassSelection(
              qbClasses,
              row.QBClassification ?? row.QBClass ?? row.classification ?? row.Classification ?? '',
            ),
          })))
          setWizardStep(3)
          return new Promise((resolve) => setConfirmationResolver(() => resolve))
        },
      })

      const result = await mappingSequence.invoke({
        accountId: selectedAccountId ? Number(selectedAccountId) : null,
        sourceInput: sourceMode === 'file' ? { mode: 'file', file: sourceFile } : { mode: 'endpoint', endpoint: sourceEndpoint },
        targetInput: targetMode === 'file' ? { mode: 'file', file: targetFile } : { mode: 'endpoint', endpoint: targetEndpoint },
        mappingEntityName: 'membership level',
        isAccountant: false,
        mistralModel: 'mistral-large-latest',
        mongoEndpoint: '/api/mappings',
        mongoApiKey: import.meta.env.VITE_MONGO_API_KEY ?? '',
        onStep: updateStep,
      })

      setPersistedResponse(result.persisted ?? { ok: true })
      setWizardStep(4)
    } catch (sequenceError) {
      setError(sequenceError.message || 'Something went wrong. Please try again.')
    } finally {
      setIsRunning(false)
    }
  }

  const resolveUserConfirmation = (approved) => {
    if (!confirmationResolver) return
    const resolver = confirmationResolver
    setConfirmationResolver(null)
    resolver(approved ? editableRows : null)
    if (approved) setWizardStep(4)
  }

  const downloadRows = useMemo(
    () => buildQuickBooksInvoiceRows(sourceDataForExport, editableRows),
    [editableRows, sourceDataForExport],
  )

  const downloadConfiguredFile = () => {
    const fileBase = `accountbridge-quickbooks-setup-${selectedAccountId || 'file'}`
    if (downloadFormat === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(downloadRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'QuickBooks Setup')
      XLSX.writeFile(workbook, `${fileBase}.xlsx`)
      return
    }

    const content = downloadFormat === 'csv'
      ? toCsv(downloadRows)
      : JSON.stringify(downloadRows, null, 2)
    const blob = new Blob([content], { type: downloadFormat === 'csv' ? 'text/csv' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileBase}.${downloadFormat}`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (page === 'home') {
    return (
      <HomePage
        currentUser={currentUser}
        onNavigate={setPage}
        onStartSetup={startSetupFromHome}
        onSignOut={signOut}
      />
    )
  }
  if (page === 'login' || page === 'register') {
    return <AuthPage key={page} mode={page} onNavigate={setPage} onAuthenticate={authenticateAndOpenWizard} />
  }
  if (page === 'forgot-password') {
    return <ForgotPasswordPage onNavigate={setPage} />
  }
  if (page === 'reset-password') {
    return (
      <ResetPasswordPage
        token={resetToken}
        onComplete={completePasswordReset}
        onNavigate={setPage}
      />
    )
  }
  if (authChecked && !currentUser) {
    return <AuthPage mode="login" onNavigate={setPage} onAuthenticate={authenticateAndOpenWizard} />
  }

  const qbProducts = [...getQuickBooksProducts(qbDataForConfirmation), ...customProducts]
  const qbClasses = [...getQuickBooksClasses(qbDataForConfirmation), ...customClasses]

  return (
    <div className="wizard-page">
      <header className="wizard-header">
        <Brand />
        <div className="wizard-account">
          {currentUser && <span>{currentUser.fullName}</span>}
          <button type="button" className="link-button" onClick={signOut}>Sign Out</button>
          <button type="button" className="back-home" onClick={() => setPage('home')}>{icons.back} Back to Home</button>
        </div>
      </header>
      <main className="wizard-shell">
        <section className="wizard-title">
          <h1>AccountBridge QuickStart AI</h1>
          <p>Turn your organization data into a QuickBooks-ready file in minutes.</p>
        </section>

        <ProgressNav steps={steps} currentStep={wizardStep} />

        <section className="wizard-card">
          {wizardStep === 1 && (
            <UploadStep
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              applyAccount={applyAccount}
              sourceMode={sourceMode}
              setSourceMode={setSourceMode}
              targetMode={targetMode}
              setTargetMode={setTargetMode}
              sourceFile={sourceFile}
              setSourceFile={setSourceFile}
              targetFile={targetFile}
              setTargetFile={setTargetFile}
              sourceEndpoint={sourceEndpoint}
              setSourceEndpoint={setSourceEndpoint}
              targetEndpoint={targetEndpoint}
              setTargetEndpoint={setTargetEndpoint}
              startSetup={startSetup}
              isRunning={isRunning}
              sourceInputRef={sourceInputRef}
              targetInputRef={targetInputRef}
            />
          )}
          {wizardStep === 2 && <ProcessingStep steps={steps} startedAt={processingStartedAt} />}
          {wizardStep === 3 && (
            <ReviewStep
              rows={editableRows}
              setRows={setEditableRows}
              qbProducts={qbProducts}
              qbClasses={qbClasses}
              addCustomProduct={(rowIndex) => addCustomProduct(rowIndex, setCustomProducts, setEditableRows)}
              addCustomClass={(rowIndex) => addCustomClass(rowIndex, setCustomClasses, setEditableRows)}
              confirm={() => resolveUserConfirmation(true)}
              cancel={() => resolveUserConfirmation(false)}
            />
          )}
          {wizardStep === 4 && (
            <SummaryStep
              rows={downloadRows}
              isSaving={isRunning && !persistedResponse}
              onNext={() => setWizardStep(5)}
            />
          )}
          {wizardStep === 5 && (
            <DownloadStep
              rows={downloadRows}
              downloadFormat={downloadFormat}
              setDownloadFormat={setDownloadFormat}
              downloadConfiguredFile={downloadConfiguredFile}
              reset={() => {
                resetRunState()
                setWizardStep(1)
              }}
            />
          )}
        </section>
        {error && (
          <div className="friendly-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={restartProcess}>Process File Again</button>
          </div>
        )}
      </main>
    </div>
  )
}

function ProgressNav({ steps, currentStep }) {
  return (
    <ol className="progress-nav">
      {steps.map((step) => {
        const isDone = step.id < currentStep || (step.status === 'completed' && step.id === currentStep && currentStep >= 3)
        return (
          <li key={step.id} className={step.id === currentStep ? 'active' : isDone ? 'done' : ''}>
            <span>{isDone ? icons.check : step.id}</span>
            <p>{step.label}</p>
          </li>
        )
      })}
    </ol>
  )
}

function UploadStep(props) {
  return (
    <div className="upload-step">
      <div className="step-copy">
        <h2>Upload Your Files</h2>
        <p>Use JSON, CSV, or Excel files. You can also use the sample account data if it is available.</p>
      </div>
      <div className="setup-grid">
        <label className="field-label">
          Customer
          <select value={props.selectedAccountId} onChange={(event) => props.applyAccount(event.target.value)}>
            {props.accounts.length === 0 ? <option value="">No sample accounts found</option> : props.accounts.map((account) => (
              <option key={account.accountId} value={String(account.accountId)}>{account.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="file-grid">
        <FilePicker
          title="Organization data"
          mode={props.sourceMode}
          setMode={props.setSourceMode}
          file={props.sourceFile}
          setFile={props.setSourceFile}
          endpoint={props.sourceEndpoint}
          setEndpoint={props.setSourceEndpoint}
          inputRef={props.sourceInputRef}
          placeholder="https://example.com/organization-data.json"
        />
        <FilePicker
          title="QuickBooks data"
          mode={props.targetMode}
          setMode={props.setTargetMode}
          file={props.targetFile}
          setFile={props.setTargetFile}
          endpoint={props.targetEndpoint}
          setEndpoint={props.setTargetEndpoint}
          inputRef={props.targetInputRef}
          placeholder="https://example.com/quickbooks-data.json"
        />
      </div>
      <div className="wizard-actions">
        <button type="button" className="primary-action" onClick={props.startSetup} disabled={props.isRunning}>
          {props.isRunning ? 'Preparing...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function FilePicker({ title, mode, setMode, file, setFile, endpoint, setEndpoint, inputRef, placeholder }) {
  return (
    <article className="file-panel">
      <div className="panel-top">
        <h3>{title}</h3>
        <select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="file">Upload file</option>
          <option value="endpoint">Use link</option>
        </select>
      </div>
      {mode === 'file' ? (
        <button type="button" className="drop-zone" onClick={() => inputRef.current?.click()}>
          {icons.upload}
          <strong>{file ? file.name : 'Drop your file here or click to browse'}</strong>
          <span>Supports JSON, CSV, XLS, and XLSX files</span>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.csv,.xls,.xlsx,application/json,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </button>
      ) : (
        <label className="field-label">
          File link
          <input type="url" value={endpoint} placeholder={placeholder} onChange={(event) => setEndpoint(event.target.value)} />
        </label>
      )}
    </article>
  )
}

function ProcessingStep({ steps, startedAt }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!startedAt) {
      return undefined
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.min(25, Math.floor((Date.now() - startedAt) / 1000)))
    }

    updateElapsed()
    const intervalId = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(intervalId)
  }, [startedAt])

  const progress = Math.min(100, Math.round((elapsedSeconds / 25) * 100))
  const remaining = Math.max(0, 25 - elapsedSeconds)

  return (
    <div className="processing-step">
      <div className="ai-loader">
        <span>{icons.bot}</span>
        <i />
      </div>
      <h2>Creating Suggestions</h2>
      <p>AI is reviewing your data, comparing patterns, and preparing editable matches.</p>
      <div className="loader-card">
        <div>
          <strong>Analysis progress</strong>
          <span>{progress}%</span>
        </div>
        <b><i style={{ width: `${Math.max(8, progress)}%` }} /></b>
        <small>{remaining > 0 ? `About ${remaining}s remaining` : 'Finishing suggestions...'}</small>
      </div>
      <ul>
        {steps.slice(0, 3).map((step) => (
          <li key={step.id} className={step.status}>{step.message}</li>
        ))}
      </ul>
    </div>
  )
}

function ReviewStep({ rows, setRows, qbProducts, qbClasses, addCustomProduct, addCustomClass, confirm, cancel }) {
  return (
    <div className="review-step">
      <div className="step-copy">
        <h2>Review Suggested Matches</h2>
        <p>Confirm each row or make quick adjustments before creating your file.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Organization Item</th>
              <th>QuickBooks Item</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="3" className="empty-row">No suggestions were found.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`${row.waFieldName}-${index}`}>
                <td>{row.waFieldName || 'Unnamed item'}</td>
                <td>
                  <SelectWithAdd
                    value={row.qbProductId || row.qbProductName}
                    options={qbProducts.map((product) => ({
                      value: getProductOptionValue(product),
                      label: getProductOptionLabel(product),
                    }))}
                    fallback={row.qbProductName}
                    onAdd={() => addCustomProduct(index)}
                    onChange={(value) => {
                      const selected = qbProducts.find((product) => getProductOptionValue(product) === value)
                      const classSelection = resolveQuickBooksClassSelection(qbClasses, getProductClassificationValue(selected))
                      setRows((currentRows) => currentRows.map((currentRow, rowIndex) => rowIndex === index ? {
                        ...currentRow,
                        qbProductId: value,
                        qbProductName: getProductOptionName(selected) || '',
                        qbClassId: classSelection.qbClassId,
                        qbClassName: classSelection.qbClassName,
                      } : currentRow))
                    }}
                  />
                </td>
                <td>
                  <SelectWithAdd
                    value={row.qbClassId || row.qbClassName}
                    options={qbClasses.map((item) => ({ value: getClassOptionValue(item), label: getClassOptionName(item) }))}
                    fallback={row.qbClassName}
                    onAdd={() => addCustomClass(index)}
                    onChange={(value) => {
                      const selected = qbClasses.find((item) => getClassOptionValue(item) === value)
                      setRows((currentRows) => currentRows.map((currentRow, rowIndex) => rowIndex === index ? {
                        ...currentRow,
                        qbClassId: value,
                        qbClassName: selected?.Name ?? value,
                      } : currentRow))
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="wizard-actions split">
        <button type="button" className="secondary-action" onClick={cancel}>Cancel</button>
        <button type="button" className="primary-action" onClick={confirm}>Confirm Matches</button>
      </div>
    </div>
  )
}

function SelectWithAdd({ value, options, fallback, onChange, onAdd }) {
  const hasFallback = fallback && !options.some((option) => normalizeLookup(option.value) === normalizeLookup(fallback) || normalizeLookup(option.label) === normalizeLookup(fallback))
  return (
    <div className="select-add">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose one</option>
        {hasFallback && <option value={fallback}>{fallback}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button type="button" onClick={onAdd} aria-label="Add custom option">+</button>
    </div>
  )
}

function SummaryStep({ rows, isSaving, onNext }) {
  return (
    <div className="summary-step">
      <span className="success-ring">{icons.check}</span>
      <h2>Your File Is Almost Ready</h2>
      <p>Review the configured data below, then continue to download your file.</p>
      <div className="table-wrap summary">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Invoice</th>
              <th>Product / Service</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.InvoiceNumber}-${row.Description}-${index}`}>
                <td>{row.Customer}</td>
                <td>{row.InvoiceNumber}</td>
                <td>{row.ProductService}</td>
                <td>{row.Description}</td>
                <td>{row.Quantity}</td>
                <td>{row.Amount}</td>
                <td>{row.Status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="wizard-actions summary-actions">
        <p className="muted">{isSaving ? 'Saving your approved setup...' : 'Your approved setup is ready for download.'}</p>
        <button type="button" className="primary-action" onClick={onNext} disabled={isSaving}>
          Next {icons.arrow}
        </button>
      </div>
    </div>
  )
}

function DownloadStep({ rows, downloadFormat, setDownloadFormat, downloadConfiguredFile, reset }) {
  return (
    <div className="download-step">
      <span className="success-ring">{icons.check}</span>
      <h2>Setup Complete!</h2>
      <p>Your QuickBooks setup file is ready. Download it, then upload it to QuickBooks Online.</p>
      <div className="download-controls">
        <label className="field-label">
          File format
          <select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value)}>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
          </select>
        </label>
        <button type="button" className="primary-action download-button" onClick={downloadConfiguredFile} disabled={rows.length === 0}>
          {icons.download} Download File
        </button>
      </div>
      <div className="next-steps">
        <h3>Next Steps</h3>
        <ol>
          <li>Download the setup file using the button above.</li>
          <li>Log in to your QuickBooks Online account.</li>
          <li>Open the import area in your settings.</li>
          <li>Upload the downloaded file.</li>
          <li>Review and confirm the import in QuickBooks.</li>
        </ol>
      </div>
      <button type="button" className="secondary-action restart" onClick={reset}>{icons.refresh} Process Another File</button>
    </div>
  )
}

function collectRecordsByKey(source, keyMatcher) {
  const records = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    Object.entries(node).forEach(([key, value]) => {
      if (Array.isArray(value) && keyMatcher(key)) {
        value.forEach((item) => item && typeof item === 'object' && records.push(item))
      }
      walk(value)
    })
  }
  walk(source)
  return Array.from(new Map(records.map((record) => [`${record.Id ?? record.id ?? ''}::${record.Name ?? record.name ?? ''}`, record])).values())
}

const getQuickBooksClasses = (source) => collectRecordsByKey(source, (key) => ['class', 'classes'].includes(key.trim().toLowerCase()))
const getQuickBooksProducts = (source) => collectRecordsByKey(source, (key) => ['item', 'items'].includes(key.trim().toLowerCase()))
const normalizeLookup = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

function extractMappingRows(mappingResult) {
  const candidates = [
    mappingResult?.parsed,
    mappingResult?.parsed?.mappings,
    mappingResult?.parsed?.mapping,
    mappingResult?.payload?.mappings,
    mappingResult?.payload?.mapping,
    mappingResult?.payload?.data?.mappings,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  return []
}

const getClassOptionValue = (item) => String(item?.Id ?? item?.id ?? item?.Name ?? item?.name ?? '')
const getClassOptionName = (item) => String(item?.Name ?? item?.name ?? '')
const getProductOptionValue = (item) => String(item?.Id ?? item?.id ?? item?.Name ?? item?.name ?? '')
const getProductOptionName = (item) => String(item?.Name ?? item?.name ?? '')
const getProductOptionLabel = (item) => {
  const name = getProductOptionName(item)
  const id = String(item?.Id ?? item?.id ?? '').trim()
  return id ? `${name} (${id})` : name
}
const getProductClassificationValue = (item) => item?.Classification ?? item?.classification ?? item?.Class?.Name ?? item?.Class?.name ?? item?.ClassRef?.name ?? ''

function resolveQuickBooksClassSelection(qbClasses, classValue) {
  const normalizedClassValue = normalizeLookup(classValue)
  const matchedClass = qbClasses.find((item) => [item.Id, item.id, item.Name, item.name].some((value) => normalizeLookup(value) === normalizedClassValue))
  return matchedClass
    ? { qbClassId: getClassOptionValue(matchedClass), qbClassName: getClassOptionName(matchedClass) || String(classValue) }
    : { qbClassId: '', qbClassName: String(classValue ?? '') }
}

function resolveQuickBooksProductSelection(qbProducts, productValue, productIdValue) {
  const normalizedProductValue = String(productValue ?? '').trim().toLowerCase()
  const normalizedProductIdValue = String(productIdValue ?? '').trim().toLowerCase()
  const matchedProduct = qbProducts.find((item) => {
    const productId = String(item.Id ?? item.id ?? '').trim().toLowerCase()
    const productName = String(item.Name ?? item.name ?? '').trim().toLowerCase()
    return productId === normalizedProductIdValue || productId === normalizedProductValue || productName === normalizedProductValue
  })
  return matchedProduct
    ? { qbProductId: String(matchedProduct.Id ?? matchedProduct.id ?? ''), qbProductName: String(matchedProduct.Name ?? matchedProduct.name ?? productValue) }
    : {
        qbProductId: String(productIdValue ?? productValue ?? ''),
        qbProductName: String(productValue ?? ''),
      }
}

function addCustomProduct(rowIndex, setCustomProducts, setEditableRows) {
  const name = window.prompt('Enter a custom QuickBooks item name')
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return
  const id = `custom-product-${Date.now()}`
  setCustomProducts((current) => [...current, { Id: id, Name: trimmed, Classification: '' }])
  setEditableRows((rows) => rows.map((row, index) => index === rowIndex ? { ...row, qbProductId: id, qbProductName: trimmed } : row))
}

function addCustomClass(rowIndex, setCustomClasses, setEditableRows) {
  const name = window.prompt('Enter a custom category name')
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return
  const id = `custom-class-${Date.now()}`
  setCustomClasses((current) => [...current, { Id: id, Name: trimmed, Active: true }])
  setEditableRows((rows) => rows.map((row, index) => index === rowIndex ? { ...row, qbClassId: id, qbClassName: trimmed } : row))
}

function toCsv(rows) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n')
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

export default AccountBridgeWizard
