import { useState, useEffect, ReactNode } from "react";
import { 
  BookOpen, LogOut, PanelLeftClose, PanelLeftOpen, ActivitySquare, Award,
  Search, Mic, Command, Shield, Sparkles, SlidersHorizontal, RefreshCw, Settings, Calendar
} from "lucide-react";
import { cn } from "./lib/utils";
import { TemarioView } from "./components/TemarioView";
import { DashboardView } from "./components/DashboardView";
import { PreparadorView } from "./components/PreparadorView";
import { signOut } from "./lib/firebase";
import { useFirebase } from "./lib/FirebaseProvider";
import { Toaster, toast } from "sonner";
import { SettingsDialog } from "./components/SettingsDialog";
import { SyncControlCenterDialog } from "./components/SyncControlCenterDialog";
import { CommandPalette } from "./components/CommandPalette";
import { WeeklyPlannerView } from "./components/planner/WeeklyPlannerView";
import { playSound } from "./lib/sound";
import { Topic } from "./types";
import { initialTopics } from "./data/initialData";
import { motion, AnimatePresence } from "motion/react";
import { useAeroFocusSync } from "./hooks/useAeroFocusSync";

export default function App() {
  const [activeTab, setActiveTab] = useState<"planificador" | "preparador" | "temario" | "dashboard">("planificador");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isQuarantineDismissed, setIsQuarantineDismissed] = useState(false);
  const { user, quarantinedEvents = [], addQuarantineEventManually } = useFirebase();

  // Escucha universal en tiempo real de AeroFocus Pro (BroadcastChannel + Heartbeat 15s)
  useAeroFocusSync(async (session) => {
    if (!session) return;
    try {
      const payload = session.payload || session;
      const success = await addQuarantineEventManually(payload);
      if (success) {
        setIsQuarantineDismissed(false);
        playSound.success();
        const flightId = payload.flightId || payload.transactionId || "Touchdown";
        toast.success(`🛬 Vuelo sincronizado desde AeroFocus Pro (#${flightId})`, {
          description: "La sesión ha aterrizado en tu Bandeja de Cuarentena para validar y calificar dificultad.",
        });
      }
    } catch (err) {
      console.warn("Aviso en auto-recepción AeroFocus:", err);
    }
  });

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

  const [selectedTopicIdForTemario, setSelectedTopicIdForTemario] = useState<string | null>(null);
  const [selectedSubjectIdForTemario, setSelectedSubjectIdForTemario] = useState<string | null>(null);

  const handleSelectTopicFromPalette = (topicId: string) => {
    const topic = initialTopics.find((t) => t.id === topicId);
    if (topic?.subjectId) {
      setSelectedSubjectIdForTemario(topic.subjectId);
    }
    setSelectedTopicIdForTemario(topicId);
    setActiveTab("temario");
  };

  const handleSelectSubjectFromPalette = (subjectId: string) => {
    setSelectedSubjectIdForTemario(subjectId);
    setActiveTab("temario");
  };

  return (
    <div className="flex h-[100dvh] bg-[#F5F5F7] text-slate-900 font-sans overflow-hidden">
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
              icon={<Calendar size={17} strokeWidth={2.3} />}
              label="Planificador Semanal"
              active={activeTab === "planificador"}
              onClick={() => { playSound.click(); setActiveTab("planificador"); }}
            />
            <NavItem
              icon={<Award size={17} strokeWidth={2.3} />}
              label="Preparador & Cantes (L/J)"
              active={activeTab === "preparador"}
              onClick={() => { playSound.click(); setActiveTab("preparador"); }}
            />
            <NavItem
              icon={<BookOpen size={17} strokeWidth={2.3} />}
              label="Temario Oficial"
              active={activeTab === "temario"}
              onClick={() => { playSound.click(); setActiveTab("temario"); }}
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
        {quarantinedEvents.length > 0 && !isQuarantineDismissed && (
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { playSound.click(); setIsSyncCenterOpen(true); }}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <SlidersHorizontal size={13} />
                  <span>Revisar y Calificar</span>
                </button>
                <button
                  type="button"
                  onClick={() => { playSound.click(); setIsQuarantineDismissed(true); }}
                  className="px-2 py-1.5 text-xs text-amber-900/60 hover:text-amber-900 hover:bg-amber-500/10 rounded-xl transition-colors font-bold"
                  title="Ocultar aviso de cabecera"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative w-full h-full bg-transparent">
          <AnimatePresence mode="wait">
            {activeTab === "planificador" && (
              <motion.div
                key="planificador"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="w-full h-full absolute inset-0 overflow-y-auto p-3 sm:p-6 md:p-8"
              >
                <WeeklyPlannerView
                  allTopics={initialTopics}
                  onOpenPreparadorSession={(day) => {
                    setActiveTab("preparador");
                  }}
                />
              </motion.div>
            )}
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="w-full h-full absolute inset-0"
              >
                <DashboardView 
                  onNavigateTab={setActiveTab}
                  onSelectTopic={handleSelectTopicFromPalette}
                />
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
                <TemarioView
                  initialSelectedTopicId={selectedTopicIdForTemario}
                  initialSubjectId={selectedSubjectIdForTemario}
                  onTopicModalClose={() => setSelectedTopicIdForTemario(null)}
                />
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

      {/* Mobile Bottom Nav (Floating Apple Glass Island) */}
      <nav 
        aria-label="Navegación móvil"
        className="md:hidden fixed bottom-4 left-3 right-3 max-w-md mx-auto bg-white/85 backdrop-blur-2xl border border-slate-200/80 rounded-[1.75rem] flex items-center justify-between p-1.5 z-50 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.04]"
      >
        <MobileNavItem
          icon={<Calendar size={18} strokeWidth={activeTab === "planificador" && !isSyncCenterOpen && !isSettingsOpen ? 2.5 : 2} />}
          label="Semana"
          active={activeTab === "planificador" && !isSyncCenterOpen && !isSettingsOpen}
          onClick={() => {
            playSound.click();
            setIsSyncCenterOpen(false);
            setIsSettingsOpen(false);
            setActiveTab("planificador");
          }}
        />
        <MobileNavItem
          icon={<Award size={18} strokeWidth={activeTab === "preparador" && !isSyncCenterOpen && !isSettingsOpen ? 2.5 : 2} />}
          label="Preparador"
          active={activeTab === "preparador" && !isSyncCenterOpen && !isSettingsOpen}
          onClick={() => {
            playSound.click();
            setIsSyncCenterOpen(false);
            setIsSettingsOpen(false);
            setActiveTab("preparador");
          }}
        />
        <MobileNavItem
          icon={<BookOpen size={18} strokeWidth={activeTab === "temario" && !isSyncCenterOpen && !isSettingsOpen ? 2.5 : 2} />}
          label="Temario"
          active={activeTab === "temario" && !isSyncCenterOpen && !isSettingsOpen}
          onClick={() => {
            playSound.click();
            setIsSyncCenterOpen(false);
            setIsSettingsOpen(false);
            setActiveTab("temario");
          }}
        />
        <MobileNavItem
          icon={<ActivitySquare size={18} strokeWidth={activeTab === "dashboard" && !isSyncCenterOpen && !isSettingsOpen ? 2.5 : 2} />}
          label="Cantes"
          active={activeTab === "dashboard" && !isSyncCenterOpen && !isSettingsOpen}
          onClick={() => {
            playSound.click();
            setIsSyncCenterOpen(false);
            setIsSettingsOpen(false);
            setActiveTab("dashboard");
          }}
        />
        <MobileNavItem
          icon={<Shield size={18} strokeWidth={isSyncCenterOpen ? 2.5 : 2} className={cn(quarantinedEvents.length > 0 && "text-amber-500")} />}
          label="AeroFocus"
          badge={quarantinedEvents.length > 0 ? quarantinedEvents.length : undefined}
          active={isSyncCenterOpen}
          onClick={() => {
            playSound.click();
            setIsSettingsOpen(false);
            setIsSyncCenterOpen(true);
          }}
        />
        <MobileNavItem
          icon={<Settings size={18} strokeWidth={isSettingsOpen ? 2.5 : 2} />}
          label="Ajustes"
          active={isSettingsOpen}
          onClick={() => {
            playSound.click();
            setIsSyncCenterOpen(false);
            setIsSettingsOpen(true);
          }}
        />
      </nav>

      {/* Global Command Palette Spotlight */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTopic={handleSelectTopicFromPalette}
        onSelectSubject={handleSelectSubjectFromPalette}
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
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center py-2 px-1 rounded-2xl w-full relative transition-all duration-200 select-none active:scale-90",
        active ? "text-indigo-600 font-bold" : "text-slate-400 hover:text-slate-600 font-medium",
      )}
    >
      {active && (
        <motion.div 
          layoutId="activeMobileTabIndicator"
          className="absolute inset-0 bg-indigo-50/90 rounded-2xl shadow-xs border border-indigo-100/60 -z-10"
          initial={false}
          transition={{ type: "spring", stiffness: 450, damping: 32 }}
        />
      )}
      <div className="relative">
        <div className={cn("transition-transform duration-200", active ? "scale-105" : "scale-100")}>
          {icon}
        </div>
        {badge !== undefined && (
          <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black bg-amber-500 text-white flex items-center justify-center shadow-xs border border-white font-mono animate-pulse">
            {badge}
          </span>
        )}
      </div>
      <span className={cn(
        "text-[10px] tracking-tight mt-1 transition-colors duration-200 truncate max-w-full leading-none",
        active ? "text-indigo-900 font-bold" : "text-slate-400"
      )}>
        {label}
      </span>
    </button>
  );
}
