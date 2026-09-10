import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  Clock,
  HardDrive,
} from 'lucide-react';
import type { DiagnosticResult } from '@tubesender/shared';

interface DiagResponse {
  results: DiagnosticResult[];
  timestamp: string;
}

export const SettingsPage: React.FC = () => {
  const { data: diagData, isLoading, refetch, isFetching } = useQuery<DiagResponse>({
    queryKey: ['diagnostics'],
    queryFn: async () => {
      const res = await fetch('/api/diagnostics/run');
      if (!res.ok) throw new Error('Falha ao executar diagnóstico');
      return res.json();
    },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Configurações & Diagnóstico</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Parâmetros operacionais da aplicação local e diagnóstico de integridade ponta a ponta.
        </p>
      </div>

      {/* Seção de Diagnóstico */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Diagnóstico do Sistema</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Valida conectividade, permissões de escrita em disco e integridade do banco sem realizar uploads.
              </p>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>{isFetching ? 'Verificando...' : 'Executar Diagnóstico'}</span>
          </button>
        </div>

        {/* Lista de Resultados */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {isLoading ? (
            <div className="col-span-2 p-6 text-center text-xs text-muted-foreground">
              Executando checagem dos módulos...
            </div>
          ) : (
            diagData?.results.map((item) => (
              <div
                key={item.name}
                className="p-4 bg-secondary/40 border border-border rounded-lg space-y-1 flex items-start gap-3"
              >
                <div className="pt-0.5">
                  {item.status === 'pass' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : item.status === 'warn' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-foreground">{item.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.message}</p>
                  {item.details && (
                    <p className="text-[11px] font-mono text-primary/80 mt-1">{item.details}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Parâmetros do Ambiente */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold">Parâmetros Operacionais (Padrões do Sistema)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-secondary/40 p-3.5 rounded-lg border border-border space-y-1">
            <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Fuso Horário Padrão
            </span>
            <p className="text-sm font-semibold font-mono">America/Recife (UTC-3)</p>
          </div>

          <div className="bg-secondary/40 p-3.5 rounded-lg border border-border space-y-1">
            <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
              <Activity className="w-3.5 h-3.5 text-primary" />
              Margem Mínima de Agendamento
            </span>
            <p className="text-sm font-semibold font-mono">10 minutos</p>
          </div>

          <div className="bg-secondary/40 p-3.5 rounded-lg border border-border space-y-1">
            <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
              <HardDrive className="w-3.5 h-3.5 text-primary" />
              Banco de Dados Operacional
            </span>
            <p className="text-sm font-semibold font-mono">SQLite (data/app.db)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
