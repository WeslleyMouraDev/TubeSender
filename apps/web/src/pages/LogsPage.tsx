import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, RefreshCw, Filter } from 'lucide-react';
import type { OperationLogDTO } from '@tubesender/shared';

interface LogsResponse {
  items: OperationLogDTO[];
  total: number;
}

export const LogsPage: React.FC = () => {
  const [level, setLevel] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');

  const { data, isLoading, refetch } = useQuery<LogsResponse>({
    queryKey: ['logs', level],
    queryFn: async () => {
      const res = await fetch(`/api/logs?level=${level}&limit=100`);
      if (!res.ok) throw new Error('Falha ao carregar logs');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Logs Operacionais</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Registro estruturado e sanitizado de atividades, autenticações e uploads locais.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-lg text-xs font-medium border border-border transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Filtros por Nível */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground mr-1" />
        {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              level === l
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {l === 'ALL' ? 'Todos' : l}
          </button>
        ))}
      </div>

      {/* Lista de Logs */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-muted-foreground">Carregando logs...</div>
      ) : data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <ScrollText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h4 className="text-sm font-semibold">Nenhum registro encontrado</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhuma operação registrada para o filtro selecionado.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden font-mono text-xs">
          {data?.items.map((log) => (
            <div key={log.id} className="p-3.5 hover:bg-secondary/20 transition-colors flex items-start gap-3">
              <span className="text-muted-foreground text-[11px] shrink-0 pt-0.5">
                {formatDate(log.createdAt)}
              </span>

              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${
                  log.level === 'INFO'
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : log.level === 'WARN'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                }`}
              >
                {log.level}
              </span>

              <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                {log.category}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-foreground font-sans font-medium text-xs">{log.message}</p>
                {log.metadata && (
                  <pre className="mt-1 text-[10px] text-muted-foreground bg-secondary/50 p-2 rounded max-h-24 overflow-x-auto">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
