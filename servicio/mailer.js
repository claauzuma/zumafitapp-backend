// servicio/mailer.js (Resend - sin SMTP)
import { Resend } from "resend";

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v;
}

const resend = new Resend(must("RESEND_API_KEY"));

export async function sendVerifyCodeEmail({ to, code }) {
  const from = must("MAIL_FROM");
  const ttl = Number(process.env.OTP_TTL_MIN || 10);

  const subject = "Verificá tu email - ZumaFit";
  const text = `Tu código de verificación es: ${code}. Expira en ${ttl} minutos.`;

  const html = `
  <div style="font-family:Arial,sans-serif;background:#0b0b0b;padding:24px;color:#eaeaea;">
    <div style="max-width:520px;margin:0 auto;border:1px solid #232323;border-radius:16px;padding:18px;background:linear-gradient(180deg,#141414,#0f0f0f);">
      <h2 style="margin:0 0 8px;color:#f5d76e;">ZumaFit</h2>
      <p style="margin:0 0 12px;color:#cfcfcf;">Tu código para verificar el email es:</p>
      <div style="font-size:28px;letter-spacing:6px;font-weight:900;background:#0f0f0f;border:1px solid #2b2b2b;padding:12px 14px;border-radius:12px;text-align:center;color:#fff;">
        ${code}
      </div>
      <p style="margin:12px 0 0;color:#a7a7a7;font-size:12px;">
        Este código expira en ${ttl} minutos.
      </p>
    </div>
  </div>`;

  return resend.emails.send({ from, to, subject, text, html });
}

export async function sendPasswordResetCodeEmail({ to, code }) {
  const from = must("MAIL_FROM");
  const ttl = Number(process.env.OTP_TTL_MIN || 10);

  const subject = "Recuperación de contraseña - ZumaFit";
  const text = `Tu código para restablecer la contraseña es: ${code}. Expira en ${ttl} minutos.`;

  const html = `
  <div style="font-family:Arial,sans-serif;background:#0b0b0b;padding:24px;color:#eaeaea;">
    <div style="max-width:520px;margin:0 auto;border:1px solid #232323;border-radius:16px;padding:18px;background:linear-gradient(180deg,#141414,#0f0f0f);">
      <h2 style="margin:0 0 8px;color:#f5d76e;">ZumaFit</h2>
      <p style="margin:0 0 12px;color:#cfcfcf;">Tu código para restablecer la contraseña es:</p>
      <div style="font-size:28px;letter-spacing:6px;font-weight:900;background:#0f0f0f;border:1px solid #2b2b2b;padding:12px 14px;border-radius:12px;text-align:center;color:#fff;">
        ${code}
      </div>
      <p style="margin:12px 0 0;color:#a7a7a7;font-size:12px;">
        Este código expira en ${ttl} minutos.
      </p>
    </div>
  </div>`;

  return resend.emails.send({ from, to, subject, text, html });
}
