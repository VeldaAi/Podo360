// Podo360 — contact form mailer (public landing-page quote requests)
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: (process.env.SMTP_SECURE || 'true') === 'true',
  auth: {
    user: process.env.SMTP_USER || 'service@velda.ai',
    pass: process.env.SMTP_PASS || 'JustVelda20!'
  }
});

/** Send a plan quote / contact request to the owner (jason@velda.ai). */
async function sendContact({ name, email, phone, clinic, message }) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const rows = [
    ['Nome / Name', name],
    ['E-mail', email],
    ['Telefone / Phone', phone],
    ['Clínica / Clinic', clinic],
    ['Mensagem / Message', message]
  ].filter(r => r[1] && String(r[1]).trim());
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #E4E9F0;border-radius:12px">
    <h2 style="color:#0B1220;margin-top:0">📩 Novo pedido de contato — Podo360</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #E4E9F0;color:#5B6B84;font-weight:700;width:180px">${esc(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #E4E9F0;color:#0B1220">${esc(v)}</td></tr>`).join('')}
    </table>
    <p style="color:#8B98AC;font-size:12px;margin-top:16px">Enviado via podo360.velda.ai — formulário de orçamento/contato.</p>
  </div>`;
  return transporter.sendMail({
    from: `"Podo360" <${process.env.SMTP_USER || 'service@velda.ai'}>`,
    to: 'jason@velda.ai',
    replyTo: email || undefined,
    subject: `📩 Podo360 — Contato de ${name || email || 'visitante'}`,
    html
  });
}

/** Send a plan upgrade request from an authenticated user to the owner. */
async function sendPlanRequest({ name, email, company, currentPlan, requestedPlan }) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const rows = [
    ['Nome / Name', name],
    ['E-mail', email],
    ['Clínica / Clinic', company],
    ['Plano atual / Current plan', currentPlan],
    ['Plano solicitado / Requested plan', requestedPlan]
  ].filter(r => r[1] && String(r[1]).trim());
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #E4E9F0;border-radius:12px">
    <h2 style="color:#0B1220;margin-top:0">⬆️ Pedido de upgrade de plano — Podo360</h2>
    <p style="color:#0B1220;font-size:14px">O cliente deseja alterar o plano da conta:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #E4E9F0;color:#5B6B84;font-weight:700;width:180px">${esc(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #E4E9F0;color:#0B1220">${esc(v)}</td></tr>`).join('')}
    </table>
    <p style="color:#8B98AC;font-size:12px;margin-top:16px">Enviado automaticamente de podo360.velda.ai — solicitação de upgrade feita em Configurações → Plano.</p>
  </div>`;
  return transporter.sendMail({
    from: `"Podo360" <${process.env.SMTP_USER || 'service@velda.ai'}>`,
    to: 'jason@velda.ai',
    replyTo: email || undefined,
    subject: `⬆️ Podo360 — Upgrade solicitado: ${requestedPlan || 'plano'} (${name || email || 'usuário'})`,
    html
  });
}

module.exports = { sendContact, sendPlanRequest };
