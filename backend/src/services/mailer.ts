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
  const cid = "qrcode@veryfy";

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject: "QR code for FOSS Hack 2026",
    text: `Hi ${name},

Please show this QR code at the time of verification at the registration desk.

Reach the Campus between 9 PM to 11 PM. In case you get late, give a call:

Avneesh Kumar - +91 74283 98599
Tanmay Maheshwari - +91 93544 24599

Please ensure you bring:
- Your tech gear (laptop, charger, etc.)
- Valid masked government ID
- Signed undertaking

Cheers,
The FOSS Club
Delhi Technical Campus`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; padding: 16px; line-height: 1.6;">
        
        <h2 style="margin-bottom: 12px;">Hi ${name},</h2>

        <p>Please show this QR code at the time of <strong>verification at the registration desk</strong>.</p>

        <img
          src="cid:${cid}"
          alt="QR code"
          style="display: block; max-width: 280px; width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 12px; margin: 20px 0;"
        />

        <p>
          Reach the campus between <strong>9 PM to 11 PM</strong>. In case you get late, 
          give a call on either of these numbers:
        </p>

        <p style="margin-left: 8px;">
          Avneesh Kumar - +91 74283 98599<br>
          Tanmay Maheshwari - +91 93544 24599
        </p>

        <p style="margin-top: 16px;">
          Please ensure you bring the following <strong>mandatory items</strong>:
        </p>

        <ul style="padding-left: 18px;">
          <li style="margin-bottom: 8px;">
            <strong>Your Tech Gear:</strong> Laptops, chargers, extension cords, and any hardware required for your project.
          </li>
          <li style="margin-bottom: 8px;">
            <strong>Valid Masked Government ID:</strong> You must carry a valid masked government ID and present it during verification if you choose to stay on campus on the night of the 28th.
          </li>
          <li style="margin-bottom: 8px;">
            <strong>Signed Undertaking:</strong> Please bring a physically signed copy of the Participant Undertaking and Declaration form. The undertaking has been sent to the mail of shortlisted participants.
          </li>
        </ul>

        <p style="margin-top: 16px;">
          We truly appreciate the momentum you have built over the past month. 
          Get some rest tonight, finalize your packing, and travel safe.
        </p>

        <p style="margin-top: 24px;">
          Cheers,<br>
          <a href="https://thefossclub.org" style="color:#2563eb; text-decoration:none;"><strong>The FOSS Club</strong></a><br>
          Delhi Technical Campus
        </p>

      </div>
    `,
    attachments: [
      {
        filename: "qrcode.png",
        content: Buffer.from(qrBase64, "base64"),
        cid,
      },
    ],
  });
}
