import React from 'react';
import { CalendarPlus } from 'lucide-react';

export const SchedulePage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Agendar Vídeos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione arquivos locais, defina slots diários e calcule as datas de publicação automaticamente.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
        <CalendarPlus className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium">Fluxo de Agendamento</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
          O motor de agendamento e a interface de seleção em lote serão ativados nas Fases 3, 4 e 5.
        </p>
      </div>
    </div>
  );
};
