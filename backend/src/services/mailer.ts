import nodemailer from "nodemailer";

const isDev = Bun.env.NODE_ENV !== "production";

const smtpHost = Bun.env.SMTP_HOST;
const smtpPort = Bun.env.SMTP_PORT;
const smtpFrom = Bun.env.SMTP_FROM;
const smtpUser = Bun.env.SMTP_USER;
const smtpPass = Bun.env.SMTP_PASS;

if (!smtpHost || !smtpPort || !smtpFrom) {
  throw new Error("SMTP_HOST, SMTP_PORT, and SMTP_FROM must be set");
}

if (!isDev && (!smtpUser || !smtpPass)) {
  throw new Error("SMTP_USER and SMTP_PASS must be set in production");
}

const transporter = nodemailer.createTransport(
  isDev
    ? {
        host: smtpHost,
        port: Number(smtpPort),
        secure: false,
      }
    : {
        host: smtpHost,
        port: Number(smtpPort),
        secure: true,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      },
);

export async function sendQREmail(to: string, name: string, qrBase64: string): Promise<void> {
  const qrDataUrl = `data:image/png;base64,${qrBase64}`;

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject: "Your event check-in QR code",
    text: `Hello ${name}, show this QR code at check-in.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; padding: 16px;">
        <h2 style="margin: 0 0 12px;">Hello ${name},</h2>
        <p style="margin: 0 0 16px;">Show this QR code at check-in.</p>
        <img
          src="${qrDataUrl}"
          alt="QR code"
          style="display: block; max-width: 280px; width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 12px;"
        />
      </div>
    `,
  });
}
