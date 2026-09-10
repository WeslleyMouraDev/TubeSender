import React from 'react';
import { History } from 'lucide-react';

export const HistoryPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Histórico de Uploads e Agendamentos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhe todos os lotes processados, status de cada vídeo e links diretos no YouTube Studio.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
        <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium">Nenhum lote registrado</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
          Os registros históricos completos com filtros e re-tentativas serão integrados na Fase 7.
        </p>
      </div>
    </div>
  );
};
