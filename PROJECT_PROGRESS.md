# Progresso do Projeto — TubeSender

- [x] **FASE 0 — Scaffold e Infraestrutura** `[CONCLUÍDA]`
  - Monorepo com `pnpm workspaces` (`apps/web`, `apps/api`, `packages/shared`).
  - Fastify com CORS restrito, tratamento de erro global e `/api/health`.
  - Prisma + SQLite configurado em `data/app.db`.
  - Frontend React + Vite + Tailwind + TanStack Query configurado.

- [x] **FASE 1 — OAuth + Canal** `[CONCLUÍDA]`
  - Endpoints de autenticação: `GET /api/auth/status`, `GET /api/auth/google/start`, `GET /api/auth/google/callback`, `POST /api/auth/logout`.
  - Serviço `OAuthService` com Google OAuth 2.0 e fallback transparente em modo mock local.
  - Persistência das credenciais em `OAuthAccount` e canal em `Channel`.
  - Renovação automática de access token via refresh token.
  - Header da aplicação com avatar, título do canal e botões Conectar/Desconectar.

- [x] **FASE 2 — Sincronização + Dashboard Mínimo** `[CONCLUÍDA]`
  - Serviço `YouTubeSyncService` com paginação `nextPageToken`.
  - Classificação estrita de vídeos (Publicado, Agendado com `publishAt > now`, Privado).
  - Endpoints `POST /api/channel/sync` e `GET /api/dashboard`.
  - Cards do Dashboard com contadores, próximo vídeo programado, fim da fila e botão de sincronização manual.

- [x] **FASE 3 — Scheduler Engine** `[CONCLUÍDA]`
  - Motor determinístico puro isolado com Luxon (`SchedulerService.buildSchedule`).
  - Cálculo respeitando múltiplos slots diários, fuso horário (`America/Recife`), margem mínima (10 min) e encadeamento a partir de `lastScheduledAt`.
  - Endpoint `POST /api/schedule/preview`.
  - Suíte completa de 22 testes unitários cobrindo todos os 20 cenários da Seção 25 da SPEC.

- [x] **FASE 4 — Seleção de Vídeos + Drafts** `[CONCLUÍDA]`
  - Gestão de lotes (`Batch`) e rascunhos de vídeos (`VideoDraft`).
  - Reordenação visual com `@dnd-kit` refletida no `orderIndex`.
  - Derivação automática de títulos limpos sem extensão.
  - Endpoints em `/api/batches` para CRUD, reordenação e aplicação de slots aos drafts.

- [x] **FASE 5 — Upload + Agendamento** `[CONCLUÍDA]`
  - Serviço `UploadService` com validação de arquivos locais e conversão de fuso horário para ISO UTC.
  - Agendamento estrito no YouTube com `privacyStatus = private` e `publishAt`.
  - Gravação imediata do `youtubeVideoId` na primeira resposta da API.
  - Verificação de confirmação antes de marcar como `SCHEDULED`.

- [x] **FASE 6 — Fila Persistente + Retry** `[CONCLUÍDA]`
  - `UploadQueueService` com concorrência inicial de 1 upload simultâneo.
  - Máquina de estados: `PENDING` -> `VALIDATING` -> `UPLOADING` -> `UPLOADED` -> `VERIFYING` -> `SCHEDULED`.
  - Prevenção total de duplicatas: nunca repete `videos.insert` se `youtubeVideoId` já existir.
  - Retomada de fila após reinício, pausa/cancelamento de lotes e retry com backoff para falhas transitórias.
  - Server-Sent Events (SSE) em `GET /api/events` para progresso e status em tempo real.

- [x] **FASE 7 — Histórico** `[CONCLUÍDA]`
  - Endpoints `GET /api/videos` e `GET /api/videos/:id` com paginação e busca por título.
  - Tela `HistoryPage.tsx` com tabs (Todos, Publicados, Agendados, Privados), grid de cards com thumbnails e modal detalhado com link para o YouTube Studio.

- [x] **FASE 8 — Padrões de Upload** `[CONCLUÍDA]`
  - CRUD de `UploadProfile` em `ProfileService` e `/api/profiles`.
  - Herança de metadados (Perfil -> Lote -> Vídeo), template de descrição (`{{descricao_video}}\n\n{{descricao_padrao}}`) e deduplicação de tags.
  - Criação de perfil a partir de vídeo existente (`POST /api/profiles/from-video/:videoId`).
  - Tela `ProfilesPage.tsx` para gerenciamento de perfis e seleção de perfil padrão.

- [x] **FASE 9 — Thumbnail + Playlist** `[CONCLUÍDA]`
  - `ThumbnailService` para upload de capa personalizada (`thumbnails.set`).
  - `PlaylistService` para inserção em playlists (`playlistItems.insert`).
  - Isolamento de falhas: falha na miniatura ou na playlist não reinicia o upload do vídeo e permite retry granular via endpoints dedicados.

- [x] **FASE 10 — Polimento + Diagnóstico + Build** `[CONCLUÍDA]`
  - Endpoint e tela de diagnóstico em tempo real (`GET /api/diagnostics/run` e `SettingsPage.tsx`).
  - Endpoint e visualizador de logs estruturados e sanitizados (`GET /api/logs` e `LogsPage.tsx`).
  - 46 testes automatizados passando com 100% de sucesso.
  - Tipagem TypeScript estrita sem erros (`pnpm typecheck` com 0 erros).
  - Build de produção validado (`pnpm build` com 0 erros em todos os pacotes).
