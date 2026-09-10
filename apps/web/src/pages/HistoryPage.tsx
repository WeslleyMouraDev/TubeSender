import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ExternalLink,
  Calendar,
  Clock,
  FileVideo,
  X,
} from 'lucide-react';
import type { SyncedVideoDTO } from '@tubesender/shared';

interface VideosResponse {
  items: SyncedVideoDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const HistoryPage: React.FC = () => {
  const [tab, setTab] = useState<'all' | 'published' | 'scheduled' | 'private'>('all');
  const [search, setSearch] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<SyncedVideoDTO | null>(null);

  const { data, isLoading } = useQuery<VideosResponse>({
    queryKey: ['videos', tab, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('status', tab);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/videos?${params.toString()}`);
      if (!res.ok) throw new Error('Falha ao carregar histórico');
      return res.json();
    },
  });

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

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Histórico de Vídeos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Todos os vídeos sincronizados com o YouTube, seus status e agendamentos confirmados.
        </p>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 bg-secondary/80 p-1 rounded-lg border border-border w-full sm:w-auto">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'published', label: 'Publicados' },
            { id: 'scheduled', label: 'Agendados' },
            { id: 'private', label: 'Privados' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                tab === t.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-secondary text-xs rounded-lg border border-border outline-none focus:border-primary/60 transition-colors"
          />
        </div>
      </div>

      {/* Grid de Vídeos */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-muted-foreground">Carregando vídeos...</div>
      ) : data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <FileVideo className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h4 className="text-sm font-semibold">Nenhum vídeo encontrado</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Tente mudar o filtro ou realize uma nova sincronização no Dashboard.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.items.map((video) => {
            const isScheduled = video.privacyStatus === 'private' && !!video.publishAt;
            const isPublic = video.privacyStatus === 'public';
            const thumb = video.thumbnails?.medium?.url || video.thumbnails?.default?.url;

            return (
              <div
                key={video.id}
                onClick={() => setSelectedVideo(video)}
                className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-video bg-secondary/80 flex items-center justify-center overflow-hidden">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <FileVideo className="w-8 h-8 text-muted-foreground" />
                    )}

                    <span
                      className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-md ${
                        isScheduled
                          ? 'bg-purple-950/80 text-purple-300 border border-purple-500/30'
                          : isPublic
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                          : 'bg-zinc-900/80 text-zinc-300 border border-zinc-700'
                      }`}
                    >
                      {isScheduled ? 'Agendado' : isPublic ? 'Publicado' : 'Privado'}
                    </span>
                  </div>

                  <div className="p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-2" title={video.title}>
                      {video.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span>
                        {isScheduled
                          ? `Agendado: ${formatDate(video.publishAt)}`
                          : `Publicado: ${formatDate(video.publishedAt)}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-2.5 bg-secondary/40 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono text-[10px]">ID: {video.youtubeVideoId}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Detalhes do Vídeo */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">
                {selectedVideo.privacyStatus}
              </span>
              <h3 className="text-base font-semibold text-foreground mt-2">
                {selectedVideo.title}
              </h3>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                ID YouTube: {selectedVideo.youtubeVideoId}
              </p>
            </div>

            {selectedVideo.publishAt && (
              <div className="flex items-center gap-2 text-xs bg-secondary/60 p-2.5 rounded-lg">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span>Data de Publicação: {formatDate(selectedVideo.publishAt)}</span>
              </div>
            )}

            {selectedVideo.description && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Descrição</span>
                <p className="text-xs text-foreground bg-secondary/40 p-3 rounded-lg max-h-36 overflow-y-auto whitespace-pre-wrap">
                  {selectedVideo.description}
                </p>
              </div>
            )}

            {selectedVideo.tags && selectedVideo.tags.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedVideo.tags.map((t) => (
                    <span key={t} className="text-[10px] bg-secondary px-2 py-0.5 rounded-md text-foreground">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <a
                href={`https://studio.youtube.com/video/${selectedVideo.youtubeVideoId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
              >
                <span>Abrir no YouTube Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
