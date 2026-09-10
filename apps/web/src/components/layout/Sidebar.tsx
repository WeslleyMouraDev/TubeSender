import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarPlus,
  History,
  Sliders,
  Terminal,
  Settings,
  Youtube,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Agendar Vídeos', to: '/schedule', icon: CalendarPlus },
  { name: 'Histórico', to: '/history', icon: History },
  { name: 'Padrões de Upload', to: '/profiles', icon: Sliders },
  { name: 'Logs Operacionais', to: '/logs', icon: Terminal },
  { name: 'Configurações', to: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 border-r border-border bg-card/60 backdrop-blur-sm flex flex-col shrink-0 min-h-screen">
      <div className="h-16 flex items-center gap-3 px-6 border-b border-border">
        <div className="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold">
          <Youtube className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-foreground">TubeSender</h1>
          <p className="text-[11px] text-muted-foreground font-medium">YouTube Scheduler Local</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )
            }
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Ambiente Local Seguro</p>
          <p className="text-[11px] mt-0.5">Arquivos e credenciais nunca saem do computador.</p>
        </div>
      </div>
    </aside>
  );
};
