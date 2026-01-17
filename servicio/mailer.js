// servicio/mailer.js (Resend - sin SMTP)
import { Resend } from "resend";

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v;
}

const resend = new Resend(must("RESEND_API_KEY"));

function maskFrom(from) {
  // evita loguear cosas raras, pero igual muestra útil
  return String(from || "").replace(/<.*?>/, "<...>");
}

async function sendWithLogs({ from, to, subject, text, html, tag }) {
  const startedAt = Date.now();

  console.log(
    `[RESEND] -> sending (${tag}) to=${to} from=${maskFrom(from)} subject="${subject}"`
  );

  try {
    const resp = await resend.emails.send({ from, to, subject, text, html });

    const ms = Date.now() - startedAt;
    // Resend devuelve { data: { id }, error: null } o similar
    console.log(
      `[RESEND] OK (${tag}) id=${resp?.data?.id || "no-id"} ms=${ms}`
    );

    // Si querés ver TODO (a veces ayuda):
    // console.log("[RESEND] RAW", resp);

    return resp;
  } catch (e) {
    const ms = Date.now() - startedAt;

    // Resend suele traer statusCode / message / name
    console.error(
      `[RESEND] FAIL (${tag}) ms=${ms} status=${e?.statusCode || "?"} message=${e?.message || e}`
    );

    // stack completo para Railway logs
    console.error(e);

    throw e;
  }
}

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

  return sendWithLogs({ from, to, subject, text, html, tag: "verify" });
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

  return sendWithLogs({ from, to, subject, text, html, tag: "reset" });
}
