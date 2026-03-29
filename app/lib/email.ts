import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASSWORD,
  },
})

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: `"StreamArc" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: "Your StreamArc verification code",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">Verify your email</h2>
        <p style="color: #555;">Enter this code to complete your StreamArc signup:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111; padding: 24px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${code}
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">
          This code expires in 10 minutes. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  })
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
