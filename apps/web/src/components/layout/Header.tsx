import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Clock, ShieldCheck, LogIn, LogOut, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
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
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showConfigHelp, setShowConfigHelp] = useState(false);

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

  // Detecta retorno de autenticação na URL (?auth=success ou ?auth=error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth');
    const message = params.get('message');
    const channelName = params.get('channel');

    if (authStatus === 'success') {
      setNotification({
        type: 'success',
        message: channelName ? `Canal "${channelName}" conectado com sucesso!` : 'Canal conectado com sucesso!',
      });
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });

      // Limpa os parâmetros da URL sem recarregar a página
      window.history.replaceState({}, '', window.location.pathname);
    } else if (authStatus === 'error') {
      setNotification({
        type: 'error',
        message: message ? `Erro no login: ${message}` : 'Falha na autorização com a conta do Google.',
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [queryClient]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao desconectar');
      return res.json();
    },
    onSuccess: () => {
      setNotification({ type: 'success', message: 'Canal desconectado.' });
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
      setNotification({ type: 'error', message: 'Não foi possível iniciar a conexão com o Google.' });
    }
  };

  return (
    <>
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
              <span className="font-medium text-foreground truncate max-w-[140px]">
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
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleConnect}
                disabled={authLoading}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md font-medium transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Conectar Google</span>
              </button>
              <button
                onClick={() => setShowConfigHelp(true)}
                title="Ajuda de Configuração OAuth"
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/60"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="hidden md:flex items-center gap-1.5 text-muted-foreground bg-secondary/50 px-2.5 py-1.5 rounded-md">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Local</span>
          </div>
        </div>
      </header>

      {/* Notificação Toast */}
      {notification && (
        <div
          className={`px-6 py-2.5 text-xs flex items-center justify-between transition-colors ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-b border-red-500/20 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-muted-foreground hover:text-foreground ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal de Ajuda de Configuração do Google Cloud */}
      {showConfigHelp && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-primary" />
                Configuração do Google OAuth 2.0
              </h3>
              <button
                onClick={() => setShowConfigHelp(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <p>
                Para evitar o erro <code className="text-red-400 font-mono">redirect_uri_mismatch</code>, certifique-se de que a URI de redirecionamento está cadastrada no Console do Google Cloud:
              </p>

              <div className="bg-secondary/60 p-3 rounded-lg border border-border space-y-1">
                <span className="font-semibold text-foreground block">
                  URIs de redirecionamento autorizados (Authorized redirect URIs):
                </span>
                <code className="text-primary font-mono block select-all break-all">
                  http://localhost:3333/api/auth/google/callback
                </code>
                <code className="text-primary font-mono block select-all break-all">
                  http://127.0.0.1:3333/api/auth/google/callback
                </code>
              </div>

              <div className="bg-secondary/60 p-3 rounded-lg border border-border space-y-1">
                <span className="font-semibold text-foreground block">
                  Origens JavaScript autorizadas (Authorized JavaScript origins):
                </span>
                <code className="text-muted-foreground font-mono block select-all">
                  http://localhost:5173
                </code>
                <code className="text-muted-foreground font-mono block select-all">
                  http://localhost:3333
                </code>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowConfigHelp(false)}
                className="px-4 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-md text-xs font-medium transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
