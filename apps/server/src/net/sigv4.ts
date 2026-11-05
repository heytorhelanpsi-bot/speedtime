import { createHash, createHmac } from 'node:crypto';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s, 'utf8').digest();

/** Assinatura AWS Signature V4 mínima (usada pela Amazon PA-API 5). */
export function signV4(opts: {
  method: string;
  host: string;
  path: string;
  region: string;
  service: string;
  accessKey: string;
  secretKey: string;
  headers: Record<string, string>;
  body: string;
  date?: Date;
}) {
  const date = opts.date ?? new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...opts.headers, host: opts.host, 'x-amz-date': amzDate };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [opts.method, opts.path, '', canonicalHeaders, signedHeaders, sha256(opts.body)].join('\n');
  const scope = `${day}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${opts.secretKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, opts.region), opts.service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
