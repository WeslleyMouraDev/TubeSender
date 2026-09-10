import React from 'react';
import { Terminal } from 'lucide-react';

export const LogsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Logs Operacionais</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhamento em tempo real de operações, diagnósticos e eventos do sistema.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border text-xs text-muted-foreground">
          <Terminal className="w-4 h-4" />
          <span>Console de Eventos</span>
        </div>
        <div className="pt-4 font-mono text-xs space-y-1 text-muted-foreground">
          <p className="text-emerald-400">[INFO] [SYSTEM] TubeSender iniciado com sucesso no ambiente local.</p>
          <p className="text-muted-foreground">[INFO] [SYSTEM] Conexão com SQLite validada.</p>
          <p className="text-muted-foreground">[INFO] [SYSTEM] Servidor API ouvindo em 127.0.0.1.</p>
        </div>
      </div>
    </div>
  );
};
