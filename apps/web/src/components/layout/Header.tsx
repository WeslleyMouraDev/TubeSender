import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Clock, ShieldCheck, LogIn, LogOut } from 'lucide-react';
import type { HealthResponse, OAuthStatusResponse } from '@tubesender/shared';

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Falha ao verificar saúde do backend');
  return res.json();
}

async function fetchAuthStatus(): Promise<OAuthStatusResponse> {
  const res = await fetch('/api/auth/status');
  if (!res.ok) throw new Error('Falha ao verificar status de autenticação');
  return res.json();
}

export const Header: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: health, isError: healthError, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 15000,
  });

  const { data: auth, isLoading: authLoading } = useQuery({
    queryKey: ['authStatus'],
    queryFn: fetchAuthStatus,
    refetchInterval: 20000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao desconectar');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/google/start');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Erro ao iniciar login Google:', err);
    }
  };

  return (
    <header className="h-16 border-b border-border bg-card/30 backdrop-blur px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground tracking-wide">
          TubeSender
        </span>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">
          v1.0.0
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="hidden sm:flex items-center gap-1.5 text-muted-foreground bg-secondary/50 px-2.5 py-1.5 rounded-md">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span>America/Recife</span>
        </div>

        <div className="flex items-center gap-2 bg-secondary/50 px-2.5 py-1.5 rounded-md border border-border">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          {healthLoading ? (
            <span className="text-muted-foreground">API...</span>
          ) : healthError || health?.status !== 'ok' ? (
            <span className="inline-flex items-center gap-1 text-red-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Offline
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Online
            </span>
          )}
        </div>

        {auth?.connected && auth.channel ? (
          <div className="flex items-center gap-2 bg-secondary/50 px-2.5 py-1 rounded-md border border-border">
            {auth.channel.thumbnailUrl && (
              <img
                src={auth.channel.thumbnailUrl}
                alt={auth.channel.title}
                className="w-5 h-5 rounded-full object-cover"
              />
            )}
            <span className="font-medium text-foreground truncate max-w-[120px]">
              {auth.channel.title}
            </span>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              title="Desconectar canal"
              className="ml-1 text-muted-foreground hover:text-red-400 transition-colors p-1"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={authLoading}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md font-medium transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Conectar Google</span>
          </button>
        )}

        <div className="hidden md:flex items-center gap-1.5 text-muted-foreground bg-secondary/50 px-2.5 py-1.5 rounded-md">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Local</span>
        </div>
      </div>
    </header>
  );
};
