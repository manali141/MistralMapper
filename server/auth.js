import argon2 from 'argon2'
import { createHash, randomBytes } from 'node:crypto'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { sendPasswordChangedEmail, sendPasswordResetEmail } from './email.js'

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  },
})

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many password reset requests. Please wait a few minutes and try again.',
  },
})

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const resetTokenPattern = /^[a-f0-9]{64}$/
const resetRequestMessage = 'If an account uses that email, a password reset link is on its way.'

function cleanText(value) {
  return String(value ?? '').trim()
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase()
}

function validateRegistration(body) {
  const organizationName = cleanText(body.organizationName)
  const fullName = cleanText(body.fullName)
  const email = normalizeEmail(body.email)
  const password = String(body.password ?? '')
  const confirmPassword = String(body.confirmPassword ?? '')

  if (organizationName.length < 2 || organizationName.length > 120) {
    return { error: 'Enter an organization name between 2 and 120 characters.' }
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return { error: 'Enter your full name between 2 and 120 characters.' }
  }
  if (!emailPattern.test(email) || email.length > 320) {
    return { error: 'Enter a valid email address.' }
  }
  if (password.length < 8 || password.length > 128) {
    return { error: 'Create a password between 8 and 128 characters.' }
  }
  if (password !== confirmPassword) {
    return { error: 'The passwords do not match.' }
  }
  if (body.acceptedTerms !== true) {
    return { error: 'Please agree to the Terms of Service and Privacy Policy.' }
  }

  return {
    values: {
      organizationName,
      fullName,
      email,
      password,
    },
  }
}

function validateLogin(body) {
  const email = normalizeEmail(body.email)
  const password = String(body.password ?? '')

  if (!emailPattern.test(email) || !password) {
    return { error: 'Email or password is incorrect.' }
  }

  return { values: { email, password } }
}

function validateNewPassword(body) {
  const token = cleanText(body.token).toLowerCase()
  const password = String(body.password ?? '')
  const confirmPassword = String(body.confirmPassword ?? '')

  if (!resetTokenPattern.test(token)) {
    return { error: 'This password reset link is invalid or has expired.' }
  }
  if (password.length < 8 || password.length > 128) {
    return { error: 'Create a password between 8 and 128 characters.' }
  }
  if (password !== confirmPassword) {
    return { error: 'The passwords do not match.' }
  }

  return { values: { token, password } }
}

function hashResetToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function passwordHashOptions() {
  return {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function publicUser(row) {
  return {
    id: String(row.id),
    fullName: row.full_name,
    email: row.email,
    organization: {
      id: String(row.organization_id),
      name: row.organization_name,
    },
  }
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()))
  })
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()))
  })
}

async function establishSession(req, userId, rememberMe = false) {
  await regenerateSession(req)
  req.session.userId = String(userId)
  req.session.cookie.maxAge = rememberMe
    ? 30 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000
  await saveSession(req)
}

export function createAuthRouter(pool) {
  router.post('/register', authLimiter, async (req, res) => {
    const validation = validateRegistration(req.body || {})
    if (validation.error) {
      return res.status(400).json({ error: validation.error })
    }

    const { organizationName, fullName, email, password } = validation.values
    let client

    try {
      const passwordHash = await argon2.hash(password, passwordHashOptions())

      client = await pool.connect()
      await client.query('begin')

      const organizationResult = await client.query(
        'insert into organizations (name) values ($1) returning id',
        [organizationName],
      )
      const organizationId = organizationResult.rows[0].id
      const userResult = await client.query(
        `insert into users (organization_id, full_name, email, password_hash)
         values ($1, $2, $3, $4)
         returning id, organization_id, full_name, email`,
        [organizationId, fullName, email, passwordHash],
      )

      await client.query('commit')

      const user = {
        ...userResult.rows[0],
        organization_name: organizationName,
      }
      await establishSession(req, user.id)

      return res.status(201).json({ user: publicUser(user) })
    } catch (error) {
      if (client) {
        await client.query('rollback').catch(() => {})
      }
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'An account with this email already exists. Please sign in instead.',
        })
      }

      console.error('Registration failed:', error)
      return res.status(500).json({
        error: 'We could not create your account. Please try again.',
      })
    } finally {
      client?.release()
    }
  })

  router.post('/login', authLimiter, async (req, res) => {
    const validation = validateLogin(req.body || {})
    if (validation.error) {
      return res.status(401).json({ error: validation.error })
    }

    const { email, password } = validation.values

    try {
      const result = await pool.query(
        `select
           users.id,
           users.organization_id,
           users.full_name,
           users.email,
           users.password_hash,
           organizations.name as organization_name
         from users
         join organizations on organizations.id = users.organization_id
         where lower(users.email) = $1 and users.is_active = true
         limit 1`,
        [email],
      )
      const user = result.rows[0]
      const passwordMatches = user
        ? await argon2.verify(user.password_hash, password)
        : false

      if (!user || !passwordMatches) {
        return res.status(401).json({ error: 'Email or password is incorrect.' })
      }

      await establishSession(req, user.id, req.body.rememberMe === true)
      return res.status(200).json({ user: publicUser(user) })
    } catch (error) {
      console.error('Login failed:', error)
      return res.status(500).json({
        error: 'We could not sign you in. Please try again.',
      })
    }
  })

  router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
    const startedAt = Date.now()
    const email = normalizeEmail(req.body?.email)
    const appUrl = String(process.env.APP_URL || process.env.ALLOWED_ORIGIN || 'http://localhost:5173')
      .replace(/\/+$/, '')

    try {
      if (emailPattern.test(email) && email.length <= 320) {
        const userResult = await pool.query(
          `select id, full_name, email
           from users
           where lower(email) = $1 and is_active = true
           limit 1`,
          [email],
        )
        const user = userResult.rows[0]

        if (user) {
          const token = randomBytes(32).toString('hex')
          const tokenHash = hashResetToken(token)

          await pool.query(
            `with invalidated as (
               update password_reset_tokens
               set used_at = now()
               where user_id = $1 and used_at is null
             )
             insert into password_reset_tokens (user_id, token_hash, expires_at)
             values ($1, $2, now() + interval '30 minutes')`,
            [user.id, tokenHash],
          )

          await sendPasswordResetEmail({
            to: user.email,
            name: user.full_name,
            resetUrl: `${appUrl}/?resetToken=${encodeURIComponent(token)}`,
          })
        }
      }
    } catch (error) {
      console.error('Password reset request failed:', error)
    }

    const remainingDelay = Math.max(0, 600 - (Date.now() - startedAt))
    if (remainingDelay > 0) await wait(remainingDelay)
    return res.status(200).json({ message: resetRequestMessage })
  })

  router.post('/reset-password', passwordResetLimiter, async (req, res) => {
    const validation = validateNewPassword(req.body || {})
    if (validation.error) {
      return res.status(400).json({ error: validation.error })
    }

    const { token, password } = validation.values
    const tokenHash = hashResetToken(token)
    let client

    try {
      const passwordHash = await argon2.hash(password, passwordHashOptions())
      client = await pool.connect()
      await client.query('begin')

      const tokenResult = await client.query(
        `select
           password_reset_tokens.id,
           password_reset_tokens.user_id,
           users.email,
           users.full_name
         from password_reset_tokens
         join users on users.id = password_reset_tokens.user_id
         where password_reset_tokens.token_hash = $1
           and password_reset_tokens.used_at is null
           and password_reset_tokens.expires_at > now()
           and users.is_active = true
         for update`,
        [tokenHash],
      )
      const resetRecord = tokenResult.rows[0]

      if (!resetRecord) {
        await client.query('rollback')
        return res.status(400).json({
          error: 'This password reset link is invalid or has expired.',
        })
      }

      await client.query(
        `update users
         set password_hash = $1, updated_at = now()
         where id = $2`,
        [passwordHash, resetRecord.user_id],
      )
      await client.query(
        `update password_reset_tokens
         set used_at = now()
         where user_id = $1 and used_at is null`,
        [resetRecord.user_id],
      )
      await client.query(
        `delete from user_sessions
         where sess::jsonb ->> 'userId' = $1`,
        [String(resetRecord.user_id)],
      )
      await client.query('commit')

      sendPasswordChangedEmail({
        to: resetRecord.email,
        name: resetRecord.full_name,
      }).catch((error) => console.error('Password change email failed:', error))

      return res.status(200).json({
        message: 'Your password has been changed. You can now sign in.',
      })
    } catch (error) {
      if (client) {
        await client.query('rollback').catch(() => {})
      }
      console.error('Password reset failed:', error)
      return res.status(500).json({
        error: 'We could not change your password. Please request a new reset link.',
      })
    } finally {
      client?.release()
    }
  })

  router.get('/me', async (req, res) => {
    if (!req.session.userId) {
      return res.status(200).json({ user: null })
    }

    try {
      const result = await pool.query(
        `select
           users.id,
           users.organization_id,
           users.full_name,
           users.email,
           organizations.name as organization_name
         from users
         join organizations on organizations.id = users.organization_id
         where users.id = $1 and users.is_active = true
         limit 1`,
        [req.session.userId],
      )
      const user = result.rows[0]

      if (!user) {
        req.session.destroy(() => {})
        return res.status(200).json({ user: null })
      }

      return res.status(200).json({ user: publicUser(user) })
    } catch (error) {
      console.error('Session lookup failed:', error)
      return res.status(500).json({
        error: 'We could not check your account. Please refresh the page.',
      })
    }
  })

  router.post('/logout', (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        return res.status(500).json({
          error: 'We could not sign you out. Please try again.',
        })
      }

      res.clearCookie('accountbridge.sid', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
      return res.status(204).end()
    })
  })

  return router
}
