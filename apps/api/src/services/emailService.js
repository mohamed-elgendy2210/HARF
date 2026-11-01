import nodemailer from 'nodemailer';

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function createEmailService(smtp) {
  if (!smtp) {
    return {
      isConfigured: () => false,
      async sendNotification() {
        throw new Error('SMTP is not configured.');
      },
      async sendVerification() {
        throw new Error('SMTP is not configured.');
      },
      async sendPasswordReset() {
        throw new Error('SMTP is not configured.');
      }
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {})
  });

  return {
    isConfigured: () => true,
    sendNotification({ email, title, message }) {
      const safeTitle = escapeHtml(title);
      const safeMessage = escapeHtml(message);
      return transporter.sendMail({
        from: smtp.from,
        to: email,
        subject: 'Harf notification',
        text: `${title}\n\n${message}`,
        html: `<h1>${safeTitle}</h1><p>${safeMessage}</p>`
      });
    },
    sendVerification({ email, verificationUrl }) {
      const safeUrl = escapeHtml(verificationUrl);
      return transporter.sendMail({
        from: smtp.from,
        to: email,
        subject: 'Verify your Harf account',
        text: `Verify your email address by opening: ${verificationUrl}`,
        html: `<p>Verify your email address to continue using Harf.</p><p><a href="${safeUrl}">Verify email</a></p>`
      });
    },
    sendPasswordReset({ email, resetUrl }) {
      const safeUrl = escapeHtml(resetUrl);
      return transporter.sendMail({
        from: smtp.from,
        to: email,
        subject: 'Reset your Harf password',
        text: `Reset your password by opening: ${resetUrl}`,
        html: `<p>We received a request to reset your Harf password.</p><p><a href="${safeUrl}">Reset password</a></p><p>If you did not request this, ignore this message.</p>`
      });
    }
  };
}
