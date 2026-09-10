import React from 'react';
import { Settings } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Credenciais OAuth 2.0 do YouTube, diretórios locais e parâmetros de agendamento.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold">Parâmetros do Sistema</h3>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-muted-foreground">Fuso Horário Padrão</span>
            <span className="font-mono">America/Recife</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-muted-foreground">Antecedência Mínima (Lead Time)</span>
            <span className="font-mono">10 minutos</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-muted-foreground">Porta da API Local</span>
            <span className="font-mono">3333</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-muted-foreground">Host Seguro</span>
            <span className="font-mono">127.0.0.1 (Localhost restrito)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
