import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock, ShieldCheck } from 'lucide-react';
import type { HealthResponse } from '@tubesender/shared';

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error('Falha ao verificar saúde do backend');
  }
  return res.json();
}

export const Header: React.FC = () => {
  const { data, isError, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 15000,
  });

  return (
    <header className="h-16 border-b border-border bg-card/30 backdrop-blur px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground tracking-wide">
          Painel de Controle
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground bg-secondary/50 px-2.5 py-1.5 rounded-md">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span>Fuso: America/Recife</span>
        </div>

        <div className="flex items-center gap-2 bg-secondary/50 px-2.5 py-1.5 rounded-md border border-border">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          <span>API:</span>
          {isLoading ? (
            <span className="text-muted-foreground">Verificando...</span>
          ) : isError || data?.status !== 'ok' ? (
            <span className="inline-flex items-center gap-1.5 text-red-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Offline
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Online (SQLite: {data.database})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 bg-secondary/50 px-2.5 py-1.5 rounded-md border border-border">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>Canal:</span>
          {data?.youtubeAuth === 'connected' ? (
            <span className="inline-flex items-center text-emerald-400 font-medium">
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center text-amber-400/90 font-medium">
              Desconectado
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground bg-secondary/50 px-2.5 py-1.5 rounded-md">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>127.0.0.1</span>
        </div>
      </div>
    </header>
  );
};
