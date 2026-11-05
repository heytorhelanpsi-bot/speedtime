import { config } from '../../lib/config.js';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** E-mail via API HTTP do Resend (https://resend.com/docs/api-reference/emails/send-email). */
export async function sendEmail(to: string, subject: string, text: string, link?: string) {
  if (!config.RESEND_API_KEY) return { status: 'skipped' as const, detail: 'RESEND_API_KEY não configurada' };
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#111827;max-width:480px">
    <p style="font-size:12px;color:#374151;letter-spacing:.04em;text-transform:uppercase">SpeedTime</p>
    <h1 style="font-size:18px;font-weight:600">${escape(subject)}</h1>
    <p style="font-size:14px;color:#374151">${escape(text)}</p>
    ${link ? `<p><a href="${escape(link)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-size:14px">Ver produto</a></p>` : ''}
  </div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.EMAIL_FROM, to: [to], subject, text: link ? `${text}\n\n${link}` : text, html }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { status: 'sent' as const, detail: to };
}
