import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Sliders, Trash2, X, Star } from 'lucide-react';
import type { UploadProfileDTO } from '@tubesender/shared';

export const ProfilesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [madeForKids, setMadeForKids] = useState(false);

  const { data: profiles, isLoading } = useQuery<UploadProfileDTO[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const res = await fetch('/api/profiles');
      if (!res.ok) throw new Error('Falha ao carregar perfis');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Falha ao salvar perfil');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/profiles/${id}/set-default`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  });

  const resetForm = () => {
    setName('');
    setDefaultDescription('');
    setTagsInput('');
    setIsDefault(false);
    setMadeForKids(false);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const defaultTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    createMutation.mutate({
      name: name.trim(),
      defaultDescription,
      defaultTags,
      isDefault,
      madeForKids,
      defaultLanguage: 'pt',
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Padrões de Upload</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crie perfis com descrições, tags e configurações reutilizáveis para seus lotes.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Perfil</span>
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Carregando perfis...</div>
      ) : profiles?.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <Sliders className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h4 className="text-sm font-semibold">Nenhum perfil cadastrado</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Crie seu primeiro perfil padrão para agilizar o preenchimento de descrições e tags.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2 rounded-lg text-xs font-medium border border-border"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar Perfil</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles?.map((p) => (
            <div
              key={p.id}
              className={`bg-card border rounded-xl p-5 space-y-3 transition-all ${
                p.isDefault ? 'border-primary/50 shadow-sm' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{p.name}</h3>
                  {p.isDefault && (
                    <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                      Padrão
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {!p.isDefault && (
                    <button
                      onClick={() => setDefaultMutation.mutate(p.id)}
                      title="Definir como padrão"
                      className="p-1.5 text-muted-foreground hover:text-amber-400 rounded transition-colors"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(p.id)}
                    title="Excluir perfil"
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {p.defaultDescription && (
                <p className="text-xs text-muted-foreground line-clamp-3 bg-secondary/30 p-2.5 rounded-md whitespace-pre-wrap">
                  {p.defaultDescription}
                </p>
              )}

              {p.defaultTags && p.defaultTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.defaultTags.map((t) => (
                    <span key={t} className="text-[10px] bg-secondary px-2 py-0.5 rounded text-foreground">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de Criação de Perfil */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold">Novo Perfil de Upload</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Nome do Perfil *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Vídeos Diários de IA"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-secondary border border-border text-xs rounded-lg px-3 py-2 outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Descrição Padrão
                </label>
                <textarea
                  rows={4}
                  placeholder="Insira os links e informações que devem constar em todas as publicações..."
                  value={defaultDescription}
                  onChange={(e) => setDefaultDescription(e.target.value)}
                  className="w-full bg-secondary border border-border text-xs rounded-lg p-3 outline-none focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Tags Padrão (separadas por vírgula)
                </label>
                <input
                  type="text"
                  placeholder="ia, tecnologia, automacao, tutorial"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full bg-secondary border border-border text-xs rounded-lg px-3 py-2 outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Definir como perfil padrão</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={madeForKids}
                    onChange={(e) => setMadeForKids(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Conteúdo para crianças</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim() || createMutation.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar Perfil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
