import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { getResolvedDatabaseUrl } from '../src/db/prisma.js';

describe('getResolvedDatabaseUrl', () => {
  it('deve manter caminhos absolutos intactos', () => {
    const absolutePath = 'file:C:/custom/path/app.db';
    const result = getResolvedDatabaseUrl(absolutePath);
    expect(result).toBe('file:C:/custom/path/app.db');
  });

  it('deve resolver caminhos relativos ao schema prisma (../data/app.db)', () => {
    const result = getResolvedDatabaseUrl('file:../data/app.db');
    expect(result.startsWith('file:')).toBe(true);
    expect(result.endsWith('/data/app.db')).toBe(true);
    expect(result).not.toContain('\\');
  });

  it('deve resolver caminhos relativos à raiz do projeto (./data/custom.db)', () => {
    const result = getResolvedDatabaseUrl('file:./data/custom.db');
    expect(result.startsWith('file:')).toBe(true);
    expect(result.endsWith('/data/custom.db')).toBe(true);
  });

  it('deve retornar caminho padrão quando URL não for fornecida', () => {
    const result = getResolvedDatabaseUrl('');
    expect(result.startsWith('file:')).toBe(true);
    expect(result.endsWith('/data/app.db')).toBe(true);
  });
});
