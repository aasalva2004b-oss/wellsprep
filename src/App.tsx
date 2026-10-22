import { useState, useEffect, ReactNode } from "react";
import { 
  BookOpen, LogOut, PanelLeftClose, PanelLeftOpen, ActivitySquare, Award,
  Search, Mic, Command, Shield, Sparkles, SlidersHorizontal, RefreshCw
} from "lucide-react";
import { cn } from "./lib/utils";
import { TemarioView } from "./components/TemarioView";
import { DashboardView } from "./components/DashboardView";
import { PreparadorView } from "./components/PreparadorView";
import { signOut } from "./lib/firebase";
import { useFirebase } from "./lib/FirebaseProvider";
import { Toaster } from "sonner";
import { SettingsDialog } from "./components/SettingsDialog";
import { SyncControlCenterDialog } from "./components/SyncControlCenterDialog";
import { CommandPalette } from "./components/CommandPalette";
import { playSound } from "./lib/sound";
import { Topic } from "./types";
import { initialTopics } from "./data/initialData";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "temario" | "preparador">("temario");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const { user, quarantinedEvents = [] } = useFirebase();

  // Global keyboard shortcut for Command Palette Spotlight (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        playSound.click();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectTopicFromPalette = (topicId: string) => {
    setActiveTab("temario");
  };

  return (
    <div className="flex h-[100dvh] bg-[#F5F5F7] text-slate-900 font-sans overflow-hidden select-none">
      {/* Premium Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-white/80 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] relative z-20 print:hidden border-r border-slate-200/60 shadow-[4px_0_30px_rgba(0,0,0,0.02)]",
          sidebarOpen ? "w-64" : "w-0 overflow-hidden opacity-0 border-r-0",
        )}
      >
        <div className="flex flex-col h-full w-64 max-w-[256px]">
          {/* Logo Area */}
          <div className="pt-7 pb-4 px-6 shrink-0 relative overflow-hidden flex items-center justify-between">
            <div className="flex items-center gap-3 relative z-10 group cursor-pointer" onClick={() => { playSound.click(); setActiveTab("dashboard"); }}>
              <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-serif font-black shrink-0 shadow-md shadow-slate-900/10 group-hover:scale-105 transition-transform ring-1 ring-white/20">
                W
              </div>
              <div>
                <h1 className="text-lg font-black font-serif tracking-tight text-slate-900 leading-none">
                  WellsPrep
                </h1>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">
                  Oposiciones
                </p>
              </div>
            </div>
            <button
              onClick={() => { playSound.click(); setSidebarOpen(false); }}
              className="text-slate-400 hover:text-slate-700 transition-colors p-1.5 rounded-xl hover:bg-slate-100"
              title="Ocultar menú"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* Apple Spotlight Search Trigger in Sidebar */}
          <div className="px-4 pb-2 shrink-0">
            <button
              onClick={() => {
                playSound.click();
                setIsCommandPaletteOpen(true);
              }}
              className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900 transition-all text-xs font-bold border border-slate-200/60 shadow-sm group active:scale-98"
            >
              <div className="flex items-center gap-2">
                <Search size={14} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                <span>Búsqueda Rápida</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-white text-[10px] font-mono text-slate-400 shadow-xs border border-slate-200/70">⌘K</kbd>
            </button>
          </div>

          <nav className="flex-1 px-3.5 py-2 space-y-1.5 overflow-y-auto min-w-[16rem] no-scrollbar">
            <NavItem
              icon={<BookOpen size={17} strokeWidth={2.3} />}
              label="Temario Oficial"
              active={activeTab === "temario"}
              onClick={() => { playSound.click(); setActiveTab("temario"); }}
            />
            <NavItem
              icon={<Award size={17} strokeWidth={2.3} />}
              label="Preparador (L/J)"
              active={activeTab === "preparador"}
              onClick={() => { playSound.click(); setActiveTab("preparador"); }}
            />
            <NavItem
              icon={<ActivitySquare size={17} strokeWidth={2.3} />}
              label="Dashboard & Cantes"
              active={activeTab === "dashboard"}
              onClick={() => { playSound.click(); setActiveTab("dashboard"); }}
            />
            <NavItem
              icon={<Shield size={17} strokeWidth={2.3} className={cn(quarantinedEvents.length > 0 && "text-amber-500 animate-pulse")} />}
              label="Bandeja AeroFocus"
              badge={quarantinedEvents.length > 0 ? `${quarantinedEvents.length}` : undefined}
              active={isSyncCenterOpen}
              onClick={() => { playSound.click(); setIsSyncCenterOpen(true); }}
            />
          </nav>

          {/* User Profile Card */}
          <div className="p-3.5 bg-transparent shrink-0 min-w-[16rem] mb-2 border-t border-slate-100/80">
            <div 
              onClick={() => { playSound.click(); setIsSettingsOpen(true); }}
              className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-100/80 transition-all cursor-pointer w-full border border-slate-200/60 bg-white/70 shadow-sm group"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white text-xs font-black shadow-sm">
                {user?.displayName?.charAt(0).toUpperCase() || "O"}
              </div>
              <div className="flex-1 min-w-0 text-left">
                 <div className="text-xs font-black text-slate-900 truncate">
                   {user?.displayName || "Opositor Elite"}
                 </div>
                 <div className="text-[9px] text-slate-400 font-black uppercase tracking-wider truncate">Preferencias</div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); playSound.click(); signOut(); }}
                className="text-slate-400 hover:text-rose-600 p-1.5 transition-colors rounded-xl hover:bg-rose-50"
                title="Cerrar sesión"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative min-w-0 bg-[#F5F5F7] z-30">
        {/* Toggle button space when closed */}
        {!sidebarOpen && (
          <div className="absolute top-6 left-6 z-40 hidden md:flex items-center gap-2">
            <button
              onClick={() => { playSound.click(); setSidebarOpen(true); }}
              className="flex items-center justify-center w-10 h-10 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-sm text-slate-600 hover:text-slate-900 focus:outline-none transition-all hover:scale-105 active:scale-95"
              title="Mostrar menú"
            >
              <PanelLeftOpen size={18} />
            </button>
            <button
              onClick={() => { playSound.click(); setIsCommandPaletteOpen(true); }}
              className="flex items-center gap-2 px-3 h-10 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-sm text-slate-600 hover:text-slate-900 focus:outline-none transition-all text-xs font-bold active:scale-95"
              title="Búsqueda rápida (⌘K)"
            >
              <Search size={14} className="text-slate-400" />
              <span>Buscar...</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-400">⌘K</kbd>
            </button>
          </div>
        )}

        {/* Banner de Sincronización AeroFocus en Cuarentena */}
        {quarantinedEvents.length > 0 && (
          <div className="shrink-0 px-4 pt-4 pb-1 z-35">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 backdrop-blur-xl rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0">
                  <Sparkles size={17} className="animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-black text-amber-950 flex items-center gap-2">
                    <span>⚡ Transmisión de AeroFocus recibida en Cuarentena</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
                      {quarantinedEvents.length} {quarantinedEvents.length === 1 ? "sesión pendiente" : "sesiones pendientes"}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900/80 mt-0.5">
                    Modo Prueba activo. Revisa los repasos recibidos, califica su dificultad (1-10), ajusta si suman vuelta o unifícalos antes de incorporarlos al expediente.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { playSound.click(); setIsSyncCenterOpen(true); }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <SlidersHorizontal size={13} />
                <span>Revisar, Calificar y Aprobar</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col relative w-full h-full bg-transparent">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="w-full h-full absolute inset-0"
              >
                <DashboardView />
              </motion.div>
            )}
            {activeTab === "temario" && (
              <motion.div
                key="temario"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="w-full h-full absolute inset-0"
              >
                <TemarioView />
              </motion.div>
            )}
            {activeTab === "preparador" && (
              <motion.div
                key="preparador"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="w-full h-full absolute inset-0"
              >
                <PreparadorView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Nav (Floating Glass Pill) */}
      <nav className="md:hidden fixed bottom-5 left-4 right-4 bg-white/80 backdrop-blur-2xl border border-slate-200/70 rounded-[2rem] flex justify-around p-1.5 z-50 shadow-[0_15px_35px_-10px_rgba(0,0,0,0.12)]">
        <MobileNavItem
          icon={<BookOpen size={18} strokeWidth={2.3} />}
          label="Temario"
          active={activeTab === "temario"}
          onClick={() => { playSound.click(); setActiveTab("temario"); }}
        />
        <MobileNavItem
          icon={<Award size={18} strokeWidth={2.3} />}
          label="Preparador"
          active={activeTab === "preparador"}
          onClick={() => { playSound.click(); setActiveTab("preparador"); }}
        />
        <MobileNavItem
          icon={<ActivitySquare size={18} strokeWidth={2.3} />}
          label="Cantes"
          active={activeTab === "dashboard"}
          onClick={() => { playSound.click(); setActiveTab("dashboard"); }}
        />
        <button
          onClick={() => { playSound.click(); setIsCommandPaletteOpen(true); }}
          className="flex flex-col items-center justify-center p-2 rounded-2xl text-slate-400 hover:text-slate-800"
          title="Búsqueda rápida"
        >
          <Search size={18} strokeWidth={2.3} />
          <span className="text-[9px] font-bold mt-0.5">Buscar</span>
        </button>
      </nav>

      {/* Global Command Palette Spotlight */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTopic={handleSelectTopicFromPalette}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      <AnimatePresence>
        {isSyncCenterOpen && (
          <SyncControlCenterDialog onClose={() => setIsSyncCenterOpen(false)} />
        )}
        {isSettingsOpen && (
          <SettingsDialog onClose={() => setIsSettingsOpen(false)} />
        )}
      </AnimatePresence>

      <Toaster position="top-center" richColors theme="light" />
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center w-full justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300 relative group overflow-hidden cursor-pointer",
        active
          ? "text-indigo-700 bg-indigo-50/50"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      {active && (
        <motion.div 
          layoutId="activeTabIndicator"
          className="absolute inset-0 bg-white shadow-sm border border-indigo-100/50 rounded-2xl -z-10"
          initial={false}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <div className="flex items-center gap-3 relative z-10">
        <div className={cn("transition-transform duration-300 origin-left", active ? "scale-110" : "group-hover:scale-110")}>
          {icon}
        </div>
        <span className="tracking-wide">{label}</span>
      </div>
      {badge !== undefined && (
        <span className="relative z-10 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-xs">
          {badge}
        </span>
      )}
    </button>
  );
}

function MobileNavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 px-4 py-2.5 transition-all rounded-3xl w-full relative overflow-hidden",
        active ? "text-indigo-700" : "text-slate-400",
      )}
    >
      {active && (
        <motion.div 
          layoutId="activeMobileTabIndicator"
          className="absolute inset-0 bg-indigo-50/80 -z-10 rounded-3xl"
          initial={false}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <div className={cn("transition-transform duration-300", active && "-translate-y-0.5 scale-110")}>
        {icon}
      </div>
      <span className={cn("text-[9px] uppercase tracking-[0.1em] font-black transition-all", active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 absolute")}>
        {label}
      </span>
    </button>
  );
}
