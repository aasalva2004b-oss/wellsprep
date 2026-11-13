import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  BookOpen,
  Mic,
  Calendar,
  Flame,
  Award,
  ChevronRight,
  ArrowRight,
  Sliders,
  Layers,
  Sparkles,
  Command,
  X,
} from "lucide-react";
import { initialSubjects, initialTopics } from "../data/initialData";
import { Topic } from "../types";
import { useFirebase } from "../lib/FirebaseProvider";
import { playSound } from "../lib/sound";
import { cn } from "../lib/utils";
import { motion } from "motion/react";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic: (topicId: string) => void;
  onNavigateTab?: (
    tab: "dashboard" | "temario" | "preparador" | "planificador",
  ) => void;
  onSelectSubject?: (subjectId: string) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onSelectTopic,
  onNavigateTab,
  onSelectSubject,
}: CommandPaletteProps) {
  const { userProgress } = useFirebase();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>({
    isOpen,
    onClose,
    initialFocusRef: inputRef,
  });

  // Combine static topics and custom topics
  const allTopics = useMemo(() => {
    const customList = Object.entries(userProgress || {})
      .filter(([id, data]: [string, any]) => data.isCustom && !data.isDeleted)
      .map(
        ([id, data]: [string, any]) =>
          ({
            id,
            subjectId: data.subjectId || "custom",
            number: data.number || 999,
            title: data.customTitle || "Tema Personalizado",
            pages: data.pages || 0,
            difficulty: data.difficulty || 5,
            tiempoEstudioHoras: data.studyTimeHours || 0,
            fechasRepasos: [],
            notas: data.notas || "",
          }) as unknown as Topic,
      );

    const combined = [...initialTopics, ...customList];
    return combined;
  }, [userProgress]);

  // Fast filtered items
  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Default quick actions and first few urgent topics
      const quickActions = [
        {
          type: "action" as const,
          id: "act-planificador",
          title: "Abrir el planificador semanal",
          subtitle: "Estudio, refrescos, repasos y cantes",
          icon: Calendar,
          action: () => onNavigateTab?.("planificador"),
        },
        {
          type: "action" as const,
          id: "act-preparador",
          title: "Abrir mis cantes de lunes y jueves",
          subtitle: "Temas asignados y registro de cantes",
          icon: Award,
          action: () => onNavigateTab?.("preparador"),
        },
        {
          type: "action" as const,
          id: "act-dashboard",
          title: "Ver el resumen de mi estudio",
          subtitle: "Sesiones, progreso y estadísticas",
          icon: Layers,
          action: () => onNavigateTab?.("dashboard"),
        },
        {
          type: "action" as const,
          id: "act-temario",
          title: "Explorar el temario",
          subtitle: "Asignaturas y fichas de cada tema",
          icon: BookOpen,
          action: () => onNavigateTab?.("temario"),
        },
      ];

      // Subjects quick filters
      const subjectActions = initialSubjects.map((s) => ({
        type: "subject" as const,
        id: `subj-${s.id}`,
        title: `Bloque: ${s.name}`,
        subtitle: `Filtrar temario oficial por ${s.name}`,
        icon: Sparkles,
        action: () => {
          onSelectSubject?.(s.id);
          onNavigateTab?.("temario");
        },
      }));

      return [...quickActions, ...subjectActions];
    }

    // Filter topics by number, title, or subject
    const matchedTopics = allTopics
      .filter((t) => {
        const titleMatch = t.title.toLowerCase().includes(q);
        const fullTitleMatch = t.fullTitle
          ? t.fullTitle.toLowerCase().includes(q)
          : false;
        const numberMatch =
          String(t.number) === q ||
          `tema ${t.number}`.includes(q) ||
          `t${t.number}`.includes(q);
        const subjectMatch = t.subjectId.toLowerCase().includes(q);
        return titleMatch || fullTitleMatch || numberMatch || subjectMatch;
      })
      .slice(0, 15)
      .map((t) => ({
        type: "topic" as const,
        id: t.id,
        topic: t,
        title: `Tema ${t.number}: ${t.title}`,
        subtitle: `${initialSubjects.find((s) => s.id === t.subjectId)?.name || t.subjectId} · ${t.pages > 0 ? `${t.pages} págs` : "Extensión sin medir"}`,
        icon: BookOpen,
        action: () => onSelectTopic(t.id),
      }));

    return matchedTopics;
  }, [query, allTopics, onNavigateTab, onSelectSubject, onSelectTopic]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);
  useEffect(() => {
    if (isOpen)
      listRef.current
        ?.querySelector<HTMLElement>(`[data-result-index="${selectedIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [isOpen, selectedIndex, query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      playSound.click();
      setSelectedIndex(
        (prev) => (prev + 1) % Math.max(1, filteredResults.length),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      playSound.click();
      setSelectedIndex(
        (prev) =>
          (prev - 1 + filteredResults.length) %
          Math.max(1, filteredResults.length),
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredResults[selectedIndex];
      if (current) {
        playSound.toggle();
        current.action();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-[#14221d]/45 p-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-6 sm:pt-[12vh]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface)] text-[var(--wp-text)] shadow-xl"
        style={{
          maxHeight:
            "calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 sm:px-5">
          <h2
            id="command-palette-title"
            className="font-serif text-lg font-bold"
          >
            Buscar en WellsPrep
          </h2>
          <button
            type="button"
            aria-label="Cerrar búsqueda"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--wp-muted)] hover:bg-slate-100"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center gap-3 border-b border-[var(--wp-border)] px-4 pb-3 sm:px-5">
          <Search
            size={19}
            className="shrink-0 text-[var(--wp-muted)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            role="combobox"
            aria-label="Buscar tema, asignatura o acción"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={
              filteredResults[selectedIndex]
                ? `command-result-${selectedIndex}`
                : undefined
            }
            aria-describedby="command-palette-help"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tema, número o asignatura…"
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-1 text-base text-[var(--wp-text)] outline-offset-2 placeholder:text-[var(--wp-muted)] sm:text-sm"
          />
          {query && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--wp-muted)] hover:bg-slate-100"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <p role="status" className="sr-only">
          {filteredResults.length} resultados disponibles.
        </p>
        <div
          ref={listRef}
          id="command-palette-results"
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
        >
          {filteredResults.map((item, index) => {
            const selected = index === selectedIndex;
            const Icon = item.icon;
            const topic =
              item.type === "topic" ? ((item as any).topic as Topic) : null;
            const progress = topic ? userProgress[topic.id] : null;
            return (
              <button
                key={item.id}
                id={`command-result-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                data-result-index={index}
                onClick={() => {
                  playSound.toggle();
                  item.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border border-transparent p-3 text-left transition-colors",
                  selected
                    ? "text-[var(--wp-accent)]"
                    : "text-[var(--wp-text)] hover:bg-slate-50",
                )}
                style={
                  selected
                    ? {
                        backgroundColor:
                          "color-mix(in srgb, var(--wp-accent) 9%, var(--wp-surface))",
                        borderColor:
                          "color-mix(in srgb, var(--wp-accent) 16%, var(--wp-border))",
                      }
                    : undefined
                }
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    selected
                      ? "bg-[var(--wp-accent)] text-[#fff]"
                      : "bg-slate-100 text-[var(--wp-muted)]",
                  )}
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--wp-muted)]">
                    {item.subtitle}
                  </span>
                </span>
                {progress?.vueltas ? (
                  <span className="hidden shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-[var(--wp-muted)] sm:inline">
                    {progress.vueltas}{" "}
                    {progress.vueltas === 1 ? "vuelta" : "vueltas"}
                  </span>
                ) : null}
                <ChevronRight
                  size={16}
                  className="shrink-0 text-[var(--wp-muted)]"
                  aria-hidden="true"
                />
              </button>
            );
          })}
          {!filteredResults.length && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold">
                No encontramos coincidencias
              </p>
              <p className="mt-2 text-sm text-[var(--wp-muted)]">
                Prueba con el número del tema, una palabra del título o la
                asignatura.
              </p>
            </div>
          )}
        </div>
        <div
          id="command-palette-help"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--wp-border)] bg-[var(--wp-canvas)] px-4 py-3 text-[11px] text-[var(--wp-muted)] sm:px-5"
        >
          <span>↑ ↓ para recorrer · Intro para abrir · Esc para cerrar</span>
          <span className="hidden sm:inline">WellsPrep</span>
        </div>
      </motion.div>
    </div>
  );
}
