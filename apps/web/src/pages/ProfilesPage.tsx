import React from 'react';
import { Sliders } from 'lucide-react';

export const ProfilesPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Padrões de Upload</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure templates reutilizáveis com títulos, descrições, tags, categoria e preferências padrão.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
        <Sliders className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium">Perfis de Upload</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
          Gerenciamento completo de perfis padrão e personalizados será implementado na Fase 8.
        </p>
      </div>
    </div>
  );
};
