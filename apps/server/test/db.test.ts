import { describe, expect, it } from 'vitest';
import { poolOptions } from '../src/lib/db.js';

describe('conexão com o Postgres', () => {
  it('sem SSL no banco local', () => {
    expect(poolOptions('postgres://postgres@localhost:5432/speedtime').ssl).toBeUndefined();
    expect(poolOptions('postgres://u:p@dpg-abc123/speedtime').ssl).toBeUndefined(); // host interno do Render
  });

  it('SSL automático no Supabase/Neon, removendo parâmetros que o driver não entende', () => {
    const o = poolOptions('postgresql://postgres.ref:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require&channel_binding=require');
    expect(o.ssl).toEqual({ rejectUnauthorized: false });
    expect(o.connectionString).toBe('postgresql://postgres.ref:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres');
  });

  it('respeita sslmode=disable', () => {
    expect(poolOptions('postgres://u:p@db.exemplo.com/x?sslmode=disable').ssl).toBeUndefined();
  });
});
