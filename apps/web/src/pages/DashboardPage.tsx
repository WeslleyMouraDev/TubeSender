import React from 'react';
import { Calendar, CheckCircle2, Clock, UploadCloud } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Visão geral do canal conectado, agendamentos ativos e métricas operacionais.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Publicados</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold">0</span>
            <span className="text-xs text-muted-foreground">vídeos públicos</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Agendados</span>
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold">0</span>
            <span className="text-xs text-muted-foreground">com publishAt</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Próximo Vídeo</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3">
            <span className="text-sm font-semibold text-muted-foreground">—</span>
            <p className="text-xs text-muted-foreground mt-0.5">Nenhum agendamento ativo</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Fim da Fila</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <span className="text-sm font-semibold text-muted-foreground">—</span>
            <p className="text-xs text-muted-foreground mt-0.5">Última data disponível</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Status da Infraestrutura (Fase 0)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Backend Fastify com SQLite local e Frontend Vite inicializados com sucesso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
