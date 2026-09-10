import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  UploadCloud,
  GripVertical,
  Trash2,
  Plus,
  Play,
  Pause,
  XCircle,
  RotateCcw,
  CheckCircle2,
  Calendar,
  FileVideo,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import type { BatchDTO, VideoDraftDTO, UploadProfileDTO, SSEEvent } from '@tubesender/shared';

async function fetchCurrentBatch(): Promise<BatchDTO> {
  const res = await fetch('/api/batches/current');
  if (!res.ok) throw new Error('Falha ao carregar lote atual');
  return res.json();
}

async function fetchProfiles(): Promise<UploadProfileDTO[]> {
  const res = await fetch('/api/profiles');
  if (!res.ok) throw new Error('Falha ao listar perfis');
  return res.json();
}

interface SortableDraftItemProps {
  draft: VideoDraftDTO;
  index: number;
  onDelete: (id: string) => void;
  onUpdateTitle: (id: string, newTitle: string) => void;
}

const SortableDraftItem: React.FC<SortableDraftItemProps> = ({
  draft,
  index,
  onDelete,
  onUpdateTitle,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: draft.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(draft.title);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg shadow-sm group hover:border-primary/40 transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="w-6 text-center font-mono text-xs text-muted-foreground font-semibold">
        {index + 1}
      </div>

      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <FileVideo className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setIsEditing(false);
              if (title.trim() && title !== draft.title) {
                onUpdateTitle(draft.id, title.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditing(false);
                if (title.trim() && title !== draft.title) {
                  onUpdateTitle(draft.id, title.trim());
                }
              }
            }}
            autoFocus
            className="w-full text-sm bg-secondary px-2 py-1 rounded border border-primary outline-none"
          />
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className="text-sm font-medium text-foreground truncate cursor-pointer hover:underline"
            title="Clique para editar o título"
          >
            {draft.title}
          </div>
        )}
        <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
          {draft.filename} {draft.fileSize ? `• ${(draft.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}
        </p>
      </div>

      <button
        onClick={() => onDelete(draft.id)}
        className="text-muted-foreground hover:text-destructive p-1.5 rounded transition-colors opacity-80 hover:opacity-100"
        title="Remover vídeo"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export const SchedulePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Estados da Agenda
  const [slots, setSlots] = useState<string[]>(['12:00', '21:00']);
  const [newSlotTime, setNewSlotTime] = useState('09:00');
  const [timezone, setTimezone] = useState('America/Recife');
  const minimumLeadMinutes = 10;
  const [useLastScheduled, setUseLastScheduled] = useState(true);

  // Estado de Perfil Selecionado
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  // Queries
  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: ['batch', 'current'],
    queryFn: fetchCurrentBatch,
  });

  const { data: profiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  // Sensores dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Escuta Server-Sent Events (SSE) para atualização em tempo real do progresso
  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as SSEEvent;
        if (payload.type === 'job.status' || payload.type === 'batch.status') {
          queryClient.invalidateQueries({ queryKey: ['batch', 'current'] });
        }
      } catch {
        // Ignora pings ou formatos não JSON
      }
    };

    return () => {
      eventSource.close();
    };
  }, [queryClient]);

  // Se o lote estiver RUNNING ou UPLOADING, avança direto para o passo 5
  useEffect(() => {
    if (batch && (batch.status === 'RUNNING' || batch.status === 'PAUSED')) {
      setCurrentStep(5);
    }
  }, [batch?.status]);

  // Mutations
  const addDraftsMutation = useMutation({
    mutationFn: async (files: Array<{ filename: string; localPath: string; fileSize?: number }>) => {
      if (!batch) return;
      const res = await fetch(`/api/batches/${batch.id}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) throw new Error('Falha ao adicionar vídeos');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', 'current'] }),
  });

  const updateTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      if (!batch) return;
      const res = await fetch(`/api/batches/${batch.id}/drafts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar título');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', 'current'] }),
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!batch) return;
      const res = await fetch(`/api/batches/${batch.id}/drafts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Falha ao remover vídeo');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', 'current'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (draftIds: string[]) => {
      if (!batch) return;
      const res = await fetch(`/api/batches/${batch.id}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftIds }),
      });
      if (!res.ok) throw new Error('Falha ao reordenar vídeos');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', 'current'] }),
  });

  const applyScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!batch) return;
      const res = await fetch(`/api/batches/${batch.id}/apply-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots,
          timezone,
          minimumLeadMinutes,
          useLastScheduled,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Falha ao aplicar agenda');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', 'current'] });
      setCurrentStep(4);
    },
  });

  const startQueueMutation = useMutation({
    mutationFn: async () => {
      if (!batch) return;
      const res = await fetch(`/api/queue/start/${batch.id}`, { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao iniciar fila de uploads');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', 'current'] });
      setCurrentStep(5);
    },
  });

  const pauseQueueMutation = useMutation({
    mutationFn: async () => {
      if (!batch) return;
      const res = await fetch(`/api/queue/pause/${batch.id}`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', 'current'] }),
  });

  const cancelQueueMutation = useMutation({
    mutationFn: async () => {
      if (!batch) return;
      const res = await fetch(`/api/queue/cancel/${batch.id}`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', 'current'] }),
  });

  const retryDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(`/api/queue/retry/${draftId}`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', 'current'] }),
  });

  const applyProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      if (!batch) return;
      const res = await fetch(`/api/batches/${batch.id}/apply-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      if (!res.ok) throw new Error('Falha ao aplicar perfil aos vídeos');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', 'current'] });
      setCurrentStep(3);
    },
  });

  const createNewBatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/batches', { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao criar novo lote');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', 'current'] });
      setCurrentStep(1);
    },
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleRealFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files).map((f) => ({
      filename: f.name,
      localPath: (f as any).path || `C:/Videos/${f.name}`,
      fileSize: f.size,
    }));

    addDraftsMutation.mutate(newFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProceedFromProfile = () => {
    if (selectedProfileId) {
      applyProfileMutation.mutate(selectedProfileId);
    } else {
      setCurrentStep(3);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!batch || !over || active.id === over.id) return;

    const oldIndex = batch.drafts.findIndex((d) => d.id === active.id);
    const newIndex = batch.drafts.findIndex((d) => d.id === over.id);

    const reordered = arrayMove(batch.drafts, oldIndex, newIndex);
    reorderMutation.mutate(reordered.map((d) => d.id));
  };

  const handleSimulateAddFiles = () => {
    const sampleFiles = [
      {
        filename: `0${(batch?.drafts.length || 0) + 1} - O Futuro com Agentes Inteligentes.mp4`,
        localPath: `C:/Videos/0${(batch?.drafts.length || 0) + 1}-agentes.mp4`,
        fileSize: 450 * 1024 * 1024,
      },
      {
        filename: `0${(batch?.drafts.length || 0) + 2} - Dominando o YouTube Scheduler.mp4`,
        localPath: `C:/Videos/0${(batch?.drafts.length || 0) + 2}-scheduler.mp4`,
        fileSize: 620 * 1024 * 1024,
      },
    ];
    addDraftsMutation.mutate(sampleFiles);
  };

  const addSlot = () => {
    if (newSlotTime && !slots.includes(newSlotTime)) {
      setSlots([...slots, newSlotTime].sort());
    }
  };

  const removeSlot = (slotToRemove: string) => {
    if (slots.length > 1) {
      setSlots(slots.filter((s) => s !== slotToRemove));
    }
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return 'Aguardando cálculo';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('pt-BR', {
        timeZone: timezone,
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

  if (batchLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando lote...</div>;
  }

  const drafts = batch?.drafts || [];

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      {/* Stepper Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agendar Vídeos</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fluxo guiado de preparação, configuração e envio para o YouTube.
          </p>
        </div>

        {/* Stepper Indicator */}
        <div className="flex items-center gap-2">
          {[
            { step: 1, label: 'Vídeos' },
            { step: 2, label: 'Padrão' },
            { step: 3, label: 'Agenda' },
            { step: 4, label: 'Revisão' },
            { step: 5, label: 'Upload' },
          ].map((item) => (
            <div
              key={item.step}
              onClick={() => {
                if (batch?.status !== 'RUNNING') setCurrentStep(item.step);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                currentStep === item.step
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : currentStep > item.step
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50'
              }`}
            >
              <span>{item.step}.</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: Seleção e Reordenação de Vídeos */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleRealFileSelect}
            multiple
            accept="video/*"
            className="hidden"
          />

          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">1. Seleção de Vídeos</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={addDraftsMutation.isPending}
                className="flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-md text-xs font-medium border border-border transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Selecionar Arquivos</span>
              </button>
              <button
                onClick={handleSimulateAddFiles}
                disabled={addDraftsMutation.isPending}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Exemplo Mock</span>
              </button>
            </div>
          </div>

          {drafts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center space-y-3">
              <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto" />
              <div>
                <h4 className="text-sm font-semibold">Nenhum vídeo adicionado ao lote</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                  Selecione arquivos de vídeo locais do seu computador ou utilize o exemplo mock para testar.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-xs font-medium shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Selecionar Arquivos Locais</span>
                </button>
                <button
                  onClick={handleSimulateAddFiles}
                  className="inline-flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2 rounded-lg text-xs font-medium border border-border"
                >
                  <span>Carregar Exemplos Mock</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={drafts.map((d) => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {drafts.map((draft, idx) => (
                      <SortableDraftItem
                        key={draft.id}
                        draft={draft}
                        index={idx}
                        onDelete={(id) => deleteDraftMutation.mutate(id)}
                        onUpdateTitle={(id, title) => updateTitleMutation.mutate({ id, title })}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="flex justify-between items-center pt-4 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {drafts.length} {drafts.length === 1 ? 'vídeo' : 'vídeos'} no lote
                </span>
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-xs font-medium transition-colors"
                >
                  <span>Avançar para Padrão</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Padrão de Upload */}
      {currentStep === 2 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold">2. Padrão de Upload</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Selecione metadados compartilhados para aplicar aos vídeos do lote.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => setSelectedProfileId('')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedProfileId === ''
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Padrão do Canal</span>
                <CheckCircle2
                  className={`w-4 h-4 ${selectedProfileId === '' ? 'text-primary' : 'text-muted-foreground'}`}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Usa as configurações e tags individuais de cada arquivo sem sobrescrever.
              </p>
            </div>

            {profiles?.map((prof) => (
              <div
                key={prof.id}
                onClick={() => setSelectedProfileId(prof.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedProfileId === prof.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card hover:border-border/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{prof.name}</span>
                  {prof.isDefault && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                      Padrão
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 truncate">
                  {prof.defaultDescription || 'Sem descrição padrão'}
                </p>
                {prof.defaultTags && prof.defaultTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {prof.defaultTags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}
                    {prof.defaultTags.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{prof.defaultTags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-border">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-md transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Vídeos</span>
            </button>
            <button
              onClick={handleProceedFromProfile}
              disabled={applyProfileMutation.isPending}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            >
              <span>{applyProfileMutation.isPending ? 'Aplicando Perfil...' : 'Avançar para Agenda'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Configuração da Agenda */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold">3. Configuração da Agenda</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Defina os slots de horário diários e o fuso horário para distribuição automática.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-card border border-border p-5 rounded-xl">
            {/* Horários diários */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-foreground block">
                Horários de Publicação por Dia (Slots)
              </label>
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <div
                    key={s}
                    className="flex items-center gap-1.5 bg-secondary border border-border px-3 py-1.5 rounded-lg text-xs font-mono font-semibold"
                  >
                    <span>{s}</span>
                    <button
                      onClick={() => removeSlot(s)}
                      disabled={slots.length === 1}
                      className="text-muted-foreground hover:text-destructive p-0.5 disabled:opacity-30"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="time"
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  className="bg-secondary px-3 py-1.5 text-xs rounded-md border border-border outline-none font-mono"
                />
                <button
                  onClick={addSlot}
                  className="flex items-center gap-1 bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-md text-xs font-medium border border-border"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Slot</span>
                </button>
              </div>
            </div>

            {/* Timezone e Margem */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Fuso Horário
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-secondary border border-border text-xs rounded-md px-3 py-2 outline-none"
                >
                  <option value="America/Recife">America/Recife (UTC-3)</option>
                  <option value="America/Sao_Paulo">America/Sao_Paulo (UTC-3)</option>
                  <option value="America/Manaus">America/Manaus (UTC-4)</option>
                  <option value="UTC">UTC (Universal Time)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useLast"
                  checked={useLastScheduled}
                  onChange={(e) => setUseLastScheduled(e.target.checked)}
                  className="rounded border-border"
                />
                <label htmlFor="useLast" className="text-xs text-muted-foreground cursor-pointer">
                  Continuar agendamento a partir do último vídeo já programado no canal
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-border">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-md transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </button>
            <button
              onClick={() => applyScheduleMutation.mutate()}
              disabled={applyScheduleMutation.isPending || drafts.length === 0}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{applyScheduleMutation.isPending ? 'Calculando...' : 'Calcular e Ver Prévia'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Revisão */}
      {currentStep === 4 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">4. Revisão do Lote</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Confira a sequência e as datas exatas calculadas antes de disparar os uploads.
              </p>
            </div>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
              Pronto para envio
            </span>
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <table className="w-full text-xs text-left">
              <thead className="bg-secondary/60 text-muted-foreground font-medium border-b border-border">
                <tr>
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Título</th>
                  <th className="p-3">Data Programada</th>
                  <th className="p-3">Arquivo</th>
                  <th className="p-3 w-28 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {drafts.map((d, i) => (
                  <tr key={d.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="p-3 text-center font-mono font-semibold text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="p-3 font-medium text-foreground truncate max-w-xs">{d.title}</td>
                    <td className="p-3 font-mono text-primary font-medium">
                      {formatDate(d.scheduledAt)}
                    </td>
                    <td className="p-3 text-muted-foreground font-mono truncate max-w-xs">
                      {d.filename}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-secondary text-foreground text-[10px] font-mono">
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-border">
            <button
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-md transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Ajustar Agenda</span>
            </button>
            <button
              onClick={() => startQueueMutation.mutate()}
              disabled={startQueueMutation.isPending || drafts.length === 0}
              className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 px-5 py-2.5 rounded-lg text-xs font-semibold shadow-lg shadow-emerald-900/20 transition-colors"
            >
              <Play className="w-4 h-4" />
              <span>ENVIAR E AGENDAR {drafts.length} VÍDEOS</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Upload em Andamento & Fila */}
      {currentStep === 5 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-xl">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Processamento do Lote</h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    batch?.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : batch?.status === 'RUNNING'
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  {batch?.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Concorrência: 1 upload simultâneo • Retomável após reinício.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {batch?.status === 'RUNNING' ? (
                <button
                  onClick={() => pauseQueueMutation.mutate()}
                  className="flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-md text-xs font-medium border border-border transition-colors"
                >
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pausar Fila</span>
                </button>
              ) : batch?.status === 'PAUSED' ? (
                <button
                  onClick={() => startQueueMutation.mutate()}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Retomar Fila</span>
                </button>
              ) : null}

              {batch?.status === 'COMPLETED' ? (
                <button
                  onClick={() => createNewBatchMutation.mutate()}
                  disabled={createNewBatchMutation.isPending}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Criar Novo Lote</span>
                </button>
              ) : (
                <button
                  onClick={() => cancelQueueMutation.mutate()}
                  className="flex items-center gap-1.5 bg-secondary hover:bg-destructive/10 hover:text-destructive text-muted-foreground px-3 py-1.5 rounded-md text-xs font-medium border border-border transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancelar</span>
                </button>
              )}
            </div>
          </div>

          {/* Barra de Progresso do Lote */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Concluídos: {batch?.completedVideos || 0} de {batch?.totalVideos || 0}
              </span>
              <span>
                {Math.round(
                  ((batch?.completedVideos || 0) / Math.max(batch?.totalVideos || 1, 1)) * 100
                )}
                %
              </span>
            </div>
            <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${Math.round(
                    ((batch?.completedVideos || 0) / Math.max(batch?.totalVideos || 1, 1)) * 100
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Lista de Itens da Fila */}
          <div className="space-y-2.5">
            {drafts.map((d, idx) => (
              <div
                key={d.id}
                className="flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl"
              >
                <div className="w-6 text-center font-mono text-xs text-muted-foreground font-semibold">
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {d.title}
                    </span>
                    {d.youtubeVideoId && (
                      <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                        ID: {d.youtubeVideoId}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    Agendado para: {formatDate(d.scheduledAt)}
                  </p>
                  {d.errorMessage && (
                    <p className="text-xs text-destructive font-medium mt-1">
                      {d.errorMessage}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono px-2.5 py-1 rounded-full font-semibold ${
                      d.status === 'SCHEDULED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : d.status === 'UPLOADING' || d.status === 'VALIDATING' || d.status === 'VERIFYING'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse'
                        : d.status === 'FAILED'
                        ? 'bg-destructive/10 text-destructive border border-destructive/20'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {d.status}
                  </span>

                  {d.status === 'FAILED' && (
                    <button
                      onClick={() => retryDraftMutation.mutate(d.id)}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded bg-secondary transition-colors"
                      title="Tentar novamente"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
