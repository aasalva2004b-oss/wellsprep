import { useState, useEffect, useRef, ReactNode, type RefObject } from "react";
import {
  BookOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ActivitySquare,
  Search,
  Shield,
  SlidersHorizontal,
  Settings,
  Calendar,
  MoreHorizontal,
  X,
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
import { playSound } from "./lib/sound";
import { initialTopics } from "./data/initialData";
import { motion, AnimatePresence } from "motion/react";
import { useAeroFocusSync } from "./hooks/useAeroFocusSync";
import { useDialogAccessibility } from "./hooks/useDialogAccessibility";

export default function App() {
  const [activeTab, setActiveTab] = useState<
    "planificador" | "temario" | "dashboard"
  >("planificador");
  const [plannerSubView, setPlannerSubView] = useState<any>("semana_completa");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isQuarantineDismissed, setIsQuarantineDismissed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const mobileFirstActionRef = useRef<HTMLButtonElement>(null);
  const mobileMoreRef = useRef<HTMLButtonElement>(null);
  const secondaryReturnFocusRef = useRef<HTMLElement | null>(null);
  const mobileMenuRef = useDialogAccessibility<HTMLDivElement>({
    isOpen: isMobileMenuOpen,
    onClose: () => setIsMobileMenuOpen(false),
    initialFocusRef: mobileFirstActionRef,
  });

  const {
    user,
    quarantinedEvents = [],
    fetchQuarantinedEvents,
  } = useFirebase();

  // Enrutador unificado para pestañas y sub-vistas del planificador
  const handleNavigateTab = (
    tab: "planificador" | "preparador" | "temario" | "dashboard",
    subView?: any,
  ) => {
    if (tab === "preparador") {
      setPlannerSubView(subView || "lunes");
      setActiveTab("planificador");
    } else if (tab === "planificador") {
      if (subView) setPlannerSubView(subView);
      setActiveTab("planificador");
    } else {
      setActiveTab(tab);
    }
  };

  // Escucha universal en tiempo real de AeroFocus Pro (BroadcastChannel + Heartbeat 15s)
  useAeroFocusSync(async () => {
    await fetchQuarantinedEvents();
    setIsQuarantineDismissed(false);
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

  const [selectedTopicIdForTemario, setSelectedTopicIdForTemario] = useState<
    string | null
  >(null);
  const [selectedSubjectIdForTemario, setSelectedSubjectIdForTemario] =
    useState<string | null>(null);

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

  const navigateMain = (tab: "planificador" | "temario" | "dashboard") => {
    playSound.click();
    setIsMobileMenuOpen(false);
    setActiveTab(tab);
    requestAnimationFrame(() =>
      mainRef.current?.focus({ preventScroll: true }),
    );
  };
  const openSearch = () => {
    playSound.click();
    setIsMobileMenuOpen(false);
    setIsCommandPaletteOpen(true);
  };
  const openSettings = () => {
    playSound.click();
    secondaryReturnFocusRef.current = isMobileMenuOpen ? mobileMoreRef.current : document.activeElement as HTMLElement;
    setIsMobileMenuOpen(false);
    setIsSyncCenterOpen(false);
    setIsSettingsOpen(true);
  };
  const openSyncCenter = () => {
    playSound.click();
    secondaryReturnFocusRef.current = isMobileMenuOpen ? mobileMoreRef.current : document.activeElement as HTMLElement;
    setIsMobileMenuOpen(false);
    setIsSettingsOpen(false);
    setIsSyncCenterOpen(true);
  };
  const pageLabel =
    activeTab === "planificador"
      ? "Planificador y cantes"
      : activeTab === "temario"
        ? "Temario oficial"
        : "Resumen de estudio";
  const profileName = user?.displayName || "Mi cuenta";

  return (
    <div className="wp-app-shell flex h-full min-h-0 overflow-hidden bg-[var(--wp-canvas)] font-sans text-[var(--wp-text)]">
      <a
        href="#workspace-main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus({ preventScroll: true });
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-[var(--wp-surface)] focus:px-4 focus:py-3 focus:font-semibold focus:shadow-lg"
      >
        Saltar al contenido principal
      </a>
      <aside
        aria-label="Menú lateral"
        className={cn(
          "relative z-20 hidden shrink-0 flex-col border-r border-[var(--wp-border)] bg-[var(--wp-surface)] transition-[width] duration-200 md:flex print:hidden",
          sidebarOpen ? "w-60" : "w-[4.5rem]",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 p-3",
            !sidebarOpen && "flex-col",
          )}
        >
          <button
            type="button"
            onClick={() => navigateMain("dashboard")}
            aria-label="WellsPrep · ir al resumen"
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-xl text-left",
              sidebarOpen ? "flex-1" : "w-11 justify-center",
            )}
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--wp-accent)] font-serif text-xl font-bold text-[#fff]"
            >
              W
            </span>
            {sidebarOpen && (
              <span>
                <span className="block font-serif text-lg font-bold tracking-tight">
                  WellsPrep
                </span>
                <span className="block text-[11px] text-[var(--wp-muted)]">
                  Preparación judicial
                </span>
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label={
              sidebarOpen ? "Contraer menú lateral" : "Expandir menú lateral"
            }
            aria-expanded={sidebarOpen}
            aria-controls="desktop-navigation"
            onClick={() => {
              playSound.click();
              setSidebarOpen((value) => !value);
            }}
            title={sidebarOpen ? "Ocultar menú" : "Mostrar menú"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--wp-muted)] hover:bg-slate-100"
          >
            {sidebarOpen ? (
              <PanelLeftClose size={18} aria-hidden="true" />
            ) : (
              <PanelLeftOpen size={18} aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={openSearch}
            aria-label="Búsqueda rápida"
            aria-haspopup="dialog"
            aria-expanded={isCommandPaletteOpen}
            title="Búsqueda rápida (Ctrl o ⌘ K)"
            className={cn(
              "flex min-h-11 w-full items-center rounded-xl border border-[var(--wp-border)] bg-[var(--wp-canvas)] text-sm text-[var(--wp-muted)]",
              sidebarOpen ? "gap-2 px-3" : "justify-center",
            )}
          >
            <Search size={17} aria-hidden="true" />
            {sidebarOpen && (
              <>
                <span className="flex-1 text-left">Buscar en WellsPrep</span>
                <kbd
                  aria-hidden="true"
                  className="rounded border border-[var(--wp-border)] px-1 text-[10px]"
                >
                  ⌘K
                </kbd>
              </>
            )}
          </button>
        </div>
        <nav
          id="desktop-navigation"
          aria-label="Navegación principal"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3"
        >
          <NavItem
            icon={<Calendar size={19} />}
            label="Planificador & Cantes"
            active={activeTab === "planificador"}
            compact={!sidebarOpen}
            onClick={() => navigateMain("planificador")}
          />
          <NavItem
            icon={<BookOpen size={19} />}
            label="Temario Oficial"
            active={activeTab === "temario"}
            compact={!sidebarOpen}
            onClick={() => navigateMain("temario")}
          />
          <NavItem
            icon={<ActivitySquare size={19} />}
            label="Dashboard & Métricas"
            active={activeTab === "dashboard"}
            compact={!sidebarOpen}
            onClick={() => navigateMain("dashboard")}
          />
          <NavItem
            icon={<Shield size={19} />}
            label="Bandeja AeroFocus"
            badge={quarantinedEvents.length || undefined}
            active={isSyncCenterOpen}
            compact={!sidebarOpen}
            opensDialog
            onClick={openSyncCenter}
          />
        </nav>
        <div
          className={cn(
            "flex shrink-0 gap-1 border-t border-[var(--wp-border)] p-3",
            !sidebarOpen && "flex-col items-center",
          )}
        >
          <button
            type="button"
            onClick={openSettings}
            aria-label={`Abrir ajustes de ${profileName}`}
            aria-haspopup="dialog"
            title="Abrir ajustes"
            className={cn(
              "flex min-h-11 min-w-11 items-center gap-2.5 rounded-xl text-left hover:bg-slate-100",
              sidebarOpen ? "min-w-0 flex-1 px-2" : "justify-center",
            )}
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-[var(--wp-accent)]"
            >
              {user?.displayName?.charAt(0).toUpperCase() || "O"}
            </span>
            {sidebarOpen && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {profileName}
                </span>
                <span className="block text-xs text-[var(--wp-muted)]">
                  Preferencias
                </span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              playSound.click();
              signOut();
            }}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--wp-muted)] hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main
          ref={mainRef}
          id="workspace-main"
          tabIndex={-1}
          aria-label={pageLabel}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-[var(--wp-focus)]"
        >
          {quarantinedEvents.length > 0 && !isQuarantineDismissed && (
            <div className="shrink-0 px-3 pt-3 sm:px-5" role="status">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                <div className="flex min-w-0 items-center gap-2">
                  <Shield size={17} className="shrink-0" aria-hidden="true" />
                  <p className="text-xs font-medium">
                    <strong>
                      {quarantinedEvents.length}{" "}
                      {quarantinedEvents.length === 1
                        ? "sesión de AeroFocus pendiente"
                        : "sesiones de AeroFocus pendientes"}
                    </strong>
                    <span className="hidden sm:inline">
                      {" "}
                      · Revisa los registros antes de incorporarlos al
                      historial.
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={openSyncCenter}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold hover:bg-amber-100"
                  >
                    <SlidersHorizontal size={15} aria-hidden="true" />
                    Revisar
                  </button>
                  <button
                    type="button"
                    aria-label="Ocultar aviso de AeroFocus"
                    onClick={() => setIsQuarantineDismissed(true)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-amber-100"
                  >
                    <X size={17} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === "planificador" && (
                <motion.div
                  key="planificador"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="absolute inset-0 h-full w-full"
                >
                  <PreparadorView
                    initialView={plannerSubView}
                    onSubViewChange={setPlannerSubView}
                  />
                </motion.div>
              )}
              {activeTab === "dashboard" && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="absolute inset-0 h-full w-full"
                >
                  <DashboardView
                    onNavigateTab={(tab) => handleNavigateTab(tab)}
                    onSelectTopic={handleSelectTopicFromPalette}
                  />
                </motion.div>
              )}
              {activeTab === "temario" && (
                <motion.div
                  key="temario"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="absolute inset-0 h-full w-full"
                >
                  <TemarioView
                    initialSelectedTopicId={selectedTopicIdForTemario}
                    initialSubjectId={selectedSubjectIdForTemario}
                    onTopicModalClose={() => setSelectedTopicIdForTemario(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
        <nav
          aria-label="Navegación móvil"
          className="relative z-20 grid shrink-0 grid-cols-5 gap-1 border-t border-[var(--wp-border)] bg-[var(--wp-surface)] px-2 pt-1.5 md:hidden print:hidden"
          style={{ paddingBottom: "max(.375rem, env(safe-area-inset-bottom))" }}
        >
          <MobileNavItem
            icon={<Calendar size={20} />}
            label="Plan"
            active={activeTab === "planificador"}
            onClick={() => navigateMain("planificador")}
          />
          <MobileNavItem
            icon={<BookOpen size={20} />}
            label="Temario"
            active={activeTab === "temario"}
            onClick={() => navigateMain("temario")}
          />
          <MobileNavItem
            icon={<ActivitySquare size={20} />}
            label="Resumen"
            active={activeTab === "dashboard"}
            onClick={() => navigateMain("dashboard")}
          />
          <MobileNavItem
            icon={<Search size={20} />}
            label="Buscar"
            active={isCommandPaletteOpen}
            opensDialog
            onClick={openSearch}
          />
          <MobileNavItem
            icon={<MoreHorizontal size={20} />}
            label="Más"
            buttonRef={mobileMoreRef}
            active={isMobileMenuOpen || isSettingsOpen || isSyncCenterOpen}
            badge={quarantinedEvents.length || undefined}
            opensDialog
            expanded={isMobileMenuOpen}
            onClick={() => {
              playSound.click();
              setIsMobileMenuOpen(true);
            }}
          />
        </nav>
      </div>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-[#14221d]/45 p-3 backdrop-blur-sm sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget)
              setIsMobileMenuOpen(false);
          }}
        >
          <div
            ref={mobileMenuRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
            className="w-full max-w-sm rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface)] p-4 shadow-xl"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h2
                  id="mobile-menu-title"
                  className="font-serif text-xl font-bold"
                >
                  Más opciones
                </h2>
                <p className="text-xs text-[var(--wp-muted)]">
                  WellsPrep · {profileName}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar más opciones"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-100"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <button
              ref={mobileFirstActionRef}
              type="button"
              onClick={openSyncCenter}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-slate-100"
            >
              <Shield size={19} aria-hidden="true" />
              <span className="flex-1">Bandeja AeroFocus</span>
              {quarantinedEvents.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-950">
                  {quarantinedEvents.length} pendientes
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={openSettings}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-slate-100"
            >
              <Settings size={19} aria-hidden="true" />
              Ajustes
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                signOut();
              }}
              className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl border-t border-[var(--wp-border)] px-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              <LogOut size={19} aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTopic={handleSelectTopicFromPalette}
        onSelectSubject={handleSelectSubjectFromPalette}
        onNavigateTab={(tab) => handleNavigateTab(tab)}
      />
      <AnimatePresence>
        {isSyncCenterOpen && (
          <SyncControlCenterDialog onClose={() => setIsSyncCenterOpen(false)} returnFocusRef={secondaryReturnFocusRef} />
        )}
        {isSettingsOpen && (
          <SettingsDialog onClose={() => setIsSettingsOpen(false)} returnFocusRef={secondaryReturnFocusRef} />
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
  compact = false,
  opensDialog = false,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
  compact?: boolean;
  opensDialog?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={!opensDialog && active ? "page" : undefined}
      aria-haspopup={opensDialog ? "dialog" : undefined}
      aria-expanded={opensDialog ? active : undefined}
      title={compact ? label : undefined}
      className={cn(
        "relative flex min-h-11 w-full items-center rounded-xl border border-transparent text-left text-[13px] font-semibold transition-colors",
        compact ? "justify-center px-1" : "gap-3 px-3",
        active
          ? "text-[var(--wp-accent)]"
          : "text-[var(--wp-muted)] hover:bg-slate-100",
      )}
      style={
        active
          ? {
              backgroundColor:
                "color-mix(in srgb, var(--wp-accent) 9%, var(--wp-surface))",
              borderColor:
                "color-mix(in srgb, var(--wp-accent) 15%, var(--wp-border))",
            }
          : undefined
      }
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", compact && "sr-only")}>
        {label}
      </span>
      {badge !== undefined && (
        <span
          className={cn(
            "rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-950",
            compact && "absolute right-0 top-0",
          )}
        >
          {badge}
          <span className="sr-only"> pendientes</span>
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
  opensDialog = false,
  expanded,
  buttonRef,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  opensDialog?: boolean;
  expanded?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-current={!opensDialog && active ? "page" : undefined}
      aria-haspopup={opensDialog ? "dialog" : undefined}
      aria-expanded={opensDialog ? (expanded ?? active) : undefined}
      className={cn(
        "relative flex min-h-[52px] min-w-11 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium",
        active ? "text-[var(--wp-accent)]" : "text-[var(--wp-muted)]",
      )}
      style={
        active
          ? {
              backgroundColor:
                "color-mix(in srgb, var(--wp-accent) 9%, var(--wp-surface))",
            }
          : undefined
      }
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {badge !== undefined && (
        <span className="absolute right-2 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-[#fff]">
          {badge}
          <span className="sr-only"> pendientes de AeroFocus</span>
        </span>
      )}
    </button>
  );
}
