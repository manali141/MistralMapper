import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY?.trim()
const emailFrom = process.env.RESET_EMAIL_FROM?.trim() || 'AccountBridge <onboarding@resend.dev>'
const resend = resendApiKey ? new Resend(resendApiKey) : null

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!resend) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[Development password reset] ${to}: ${resetUrl}`)
      return { development: true }
    }
    throw new Error('RESEND_API_KEY is not configured.')
  }

  const safeName = escapeHtml(name || 'there')
  const safeUrl = escapeHtml(resetUrl)
  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to,
    subject: 'Reset your AccountBridge password',
    html: `
      <div style="background:#f3f8f8;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#102139">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7e2e7;border-radius:8px;padding:32px">
          <h1 style="font-size:24px;font-weight:500;margin:0 0 16px">Reset your password</h1>
          <p style="line-height:1.6">Hello ${safeName},</p>
          <p style="line-height:1.6">Use the button below to choose a new AccountBridge password. This link expires in 30 minutes and can only be used once.</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#078d7d;color:#ffffff;text-decoration:none;border-radius:7px;padding:14px 22px">Choose a new password</a>
          </p>
          <p style="line-height:1.6;color:#536779">If you did not request this change, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  })

  if (error) {
    throw new Error(error.message || 'Password reset email could not be sent.')
  }

  return data
}

export async function sendPasswordChangedEmail({ to, name }) {
  if (!resend) return { development: true }

  const safeName = escapeHtml(name || 'there')
  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to,
    subject: 'Your AccountBridge password was changed',
    html: `
      <div style="background:#f3f8f8;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#102139">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7e2e7;border-radius:8px;padding:32px">
          <h1 style="font-size:24px;font-weight:500;margin:0 0 16px">Password changed</h1>
          <p style="line-height:1.6">Hello ${safeName},</p>
          <p style="line-height:1.6">Your AccountBridge password was changed successfully. You can now sign in using your new password.</p>
          <p style="line-height:1.6;color:#536779">If you did not make this change, contact your administrator immediately.</p>
        </div>
      </div>
    `,
  })

  if (error) {
    throw new Error(error.message || 'Password change confirmation could not be sent.')
  }

  return data
}
