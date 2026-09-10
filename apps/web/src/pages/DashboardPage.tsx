import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  Clock,
  RefreshCw,
  Tv,
  Youtube,
  AlertCircle,
  FileVideo,
} from 'lucide-react';
import type { DashboardData } from '@tubesender/shared';

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/dashboard');
  if (!res.ok) throw new Error('Falha ao carregar dashboard');
  return res.json();
}

export const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/channel/sync', { method: 'POST' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Falha na sincronização');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    },
  });

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/google/start');
      const json = await res.json();
      if (json.url) window.location.href = json.url;
    } catch (err) {
      console.error(err);
    }
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('pt-BR', {
        timeZone: 'America/Recife',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <span className="text-sm">Carregando painel...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <div>
          <h3 className="font-semibold text-destructive">Erro ao carregar dados</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Não foi possível obter os dados do dashboard local.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="ml-auto px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md text-xs font-medium"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const channel = data?.channel;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Cabeçalho com canal e ação de sincronização */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral do canal conectado, agendamentos ativos e métricas operacionais.
          </p>
        </div>

        {channel && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2 rounded-lg text-sm font-medium border border-border transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin text-primary' : ''}`}
              />
              <span>{syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar agora'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Se não houver canal conectado */}
      {!channel ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <Youtube className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Conecte seu canal do YouTube para começar</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
              O TubeSender necessita de permissão para ler seus vídeos publicados e enviar agendamentos com segurança máxima.
            </p>
          </div>
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Youtube className="w-4 h-4" />
            <span>Conectar com Google</span>
          </button>
        </div>
      ) : (
        /* Cartão do Canal Conectado */
        <div className="rounded-xl border border-border bg-card/60 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {channel.thumbnailUrl ? (
              <img
                src={channel.thumbnailUrl}
                alt={channel.title}
                className="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Tv className="w-6 h-6" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{channel.title}</h3>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                  Canal conectado
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                ID: <span className="font-mono">{channel.youtubeChannelId}</span>
                {data.lastSyncedAt && (
                  <span className="ml-3">
                    Última sincronização: {formatDate(data.lastSyncedAt)}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Publicados</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{data?.counts.published ?? 0}</span>
            <span className="text-xs text-muted-foreground">vídeos públicos</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Agendados</span>
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{data?.counts.scheduled ?? 0}</span>
            <span className="text-xs text-muted-foreground">com publishAt futuro</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Próximo Vídeo</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3">
            {data?.nextScheduled ? (
              <div>
                <p className="text-sm font-semibold truncate text-foreground" title={data.nextScheduled.title}>
                  {data.nextScheduled.title}
                </p>
                <p className="text-xs text-blue-400 font-medium mt-0.5">
                  {formatDate(data.nextScheduled.publishAt)}
                </p>
              </div>
            ) : (
              <div>
                <span className="text-sm font-semibold text-muted-foreground">—</span>
                <p className="text-xs text-muted-foreground mt-0.5">Nenhum agendamento ativo</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Fim da Fila</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            {data?.lastScheduled ? (
              <div>
                <p className="text-sm font-semibold truncate text-foreground" title={data.lastScheduled.title}>
                  {data.lastScheduled.title}
                </p>
                <p className="text-xs text-amber-400 font-medium mt-0.5">
                  {formatDate(data.lastScheduled.publishAt)}
                </p>
              </div>
            ) : (
              <div>
                <span className="text-sm font-semibold text-muted-foreground">—</span>
                <p className="text-xs text-muted-foreground mt-0.5">Última data agendada</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Destaque do Próximo Vídeo Agendado */}
      {data?.nextScheduled && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Próximo Lançamento Programado
          </h4>
          <div className="flex items-center gap-4">
            {data.nextScheduled.thumbnailUrl ? (
              <img
                src={data.nextScheduled.thumbnailUrl}
                alt={data.nextScheduled.title}
                className="w-24 h-14 object-cover rounded-md border border-border"
              />
            ) : (
              <div className="w-24 h-14 bg-secondary/80 rounded-md flex items-center justify-center text-muted-foreground">
                <FileVideo className="w-6 h-6" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground truncate">
                {data.nextScheduled.title}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Horário de publicação: {formatDate(data.nextScheduled.publishAt)}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
