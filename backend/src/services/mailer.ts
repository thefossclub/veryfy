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
      <div style="font-family: Arial, sans-serif; color: #1f2937; padding: 16px; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Hello ${name},</h2>
        <p style="margin: 0 0 16px;">Show this QR code at check-in.</p>

        <img
          src="${qrDataUrl}"
          alt="QR code"
          style="display: block; max-width: 280px; width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 20px;"
        />

        <h2 style="margin-bottom: 8px;">Event Instructions</h2>

        <ul style="padding-left: 18px; margin-top: 8px;">
          <li style="margin-bottom: 10px;">
            <strong>Delhi Technical Campus Students:</strong> Please arrive at the auditorium between 
            <strong>12:30 PM – 1:00 PM</strong>. Show your QR code at the event gate 
            for check-in. You may have your lunch between 12:00 PM - 1:00 PM it inside the auditorium.
          </li>

          <li style="margin-bottom: 10px;">
            <strong>Participants from outside Delhi Technical Campus:</strong> Please arrive between 
            <strong>12:00 PM – 1:00 PM</strong>. Make sure to be on time and enter 
            through <strong>Gate No. 2</strong>. Show your QR code 
            for verification at the gate.
          </li>
        </ul>

        <p style="margin-top: 16px;">
          Please keep this QR code accessible on your phone
        </p>

        <p style="margin-top: 20px;">
          Looking forward to seeing you at the event!
        </p>

        <p style="margin-top: 24px;">
            Cheers,<br>
            <a href="https://thefossclub.org" style="color:#2563eb; text-decoration:none;">The FOSS Club</a><br>
            Delhi Technical Campus
        </p>
      </div>
    `,
  });
}
