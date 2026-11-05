import { config } from '../../lib/config.js';

export async function telegramApi(method: string, body: object) {
  if (!config.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN não configurado');
  const res = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(`Telegram ${method}: ${json.description ?? `HTTP ${res.status}`}`);
  return json.result;
}

export async function sendTelegram(chatId: string, title: string, body: string, link?: string) {
  if (!config.TELEGRAM_BOT_TOKEN) return { status: 'skipped' as const, detail: 'TELEGRAM_BOT_TOKEN não configurado' };
  const text = `*${md(title)}*\n${md(body)}${link ? `\n[Abrir produto](${link})` : ''}`;
  await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'MarkdownV2', disable_web_page_preview: false });
  return { status: 'sent' as const, detail: `chat ${chatId}` };
}

/** Escapa caracteres reservados do MarkdownV2. */
const md = (s: string) => s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
