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
  X
} from "lucide-react";
import { initialSubjects, initialTopics } from "../data/initialData";
import { Topic } from "../types";
import { useFirebase } from "../lib/FirebaseProvider";
import { playSound } from "../lib/sound";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic: (topicId: string) => void;
  onNavigateTab?: (tab: "dashboard" | "temario" | "preparador") => void;
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

  // Combine static topics and custom topics
  const allTopics = useMemo(() => {
    const customList = Object.entries(userProgress || {})
      .filter(([id, data]: [string, any]) => data.isCustom && !data.isDeleted)
      .map(([id, data]: [string, any]) => ({
        id,
        subjectId: data.subjectId || "custom",
        number: data.number || 999,
        title: data.customTitle || "Tema Personalizado",
        pages: data.pages || 0,
        difficulty: data.difficulty || 5,
        tiempoEstudioHoras: data.studyTimeHours || 0,
        fechasRepasos: [],
        notas: data.notas || ""
      } as unknown as Topic));

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
          id: "act-preparador",
          title: "Ir a Preparador (Lunes / Jueves)",
          subtitle: "Simulación de tribunal y asignación de temas",
          icon: Award,
          action: () => onNavigateTab?.("preparador"),
        },
        {
          type: "action" as const,
          id: "act-dashboard",
          title: "Ir a Dashboard & Cantes",
          subtitle: "Analítica predictiva, curvas Ebbinghaus y heatmaps",
          icon: Layers,
          action: () => onNavigateTab?.("dashboard"),
        },
        {
          type: "action" as const,
          id: "act-temario",
          title: "Ir a Temario General",
          subtitle: "Vista integral de los 300+ temas oficiales",
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
        const fullTitleMatch = t.fullTitle ? t.fullTitle.toLowerCase().includes(q) : false;
        const numberMatch = String(t.number) === q || `tema ${t.number}`.includes(q) || `t${t.number}`.includes(q);
        const subjectMatch = t.subjectId.toLowerCase().includes(q);
        return titleMatch || fullTitleMatch || numberMatch || subjectMatch;
      })
      .slice(0, 15)
      .map((t) => ({
        type: "topic" as const,
        id: t.id,
        topic: t,
        title: `Tema ${t.number}: ${t.title}`,
        subtitle: `${initialSubjects.find((s) => s.id === t.subjectId)?.name || t.subjectId} · ${t.pages || 0} págs`,
        icon: BookOpen,
        action: () => onSelectTopic(t.id),
      }));

    return matchedTopics;
  }, [query, allTopics, onNavigateTab, onSelectSubject, onSelectTopic]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      playSound.click();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredResults.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      playSound.click();
      setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % Math.max(1, filteredResults.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredResults[selectedIndex];
      if (current) {
        playSound.toggle();
        current.action();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-3 bg-slate-900/60 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Search Input Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3 bg-white">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar tema, número, bloque o acción... (ej. T.24 o 'Penal')"
            className="flex-1 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={15} />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-400 font-mono">
            ESC para salir
          </span>
        </div>

        {/* Results List */}
        <div ref={listRef} className="overflow-y-auto p-2 space-y-1 divide-y divide-slate-50 flex-1">
          {filteredResults.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const Icon = item.icon;
            const isTopic = item.type === "topic";
            const topic = isTopic ? (item as any).topic as Topic : null;
            const prog = topic ? userProgress[topic.id] : null;

            return (
              <div
                key={item.id}
                onClick={() => {
                  playSound.toggle();
                  item.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={cn(
                  "p-3 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-all",
                  isSelected
                    ? "bg-indigo-50/90 text-indigo-950 shadow-sm"
                    : "hover:bg-slate-50 text-slate-700"
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                      isSelected
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <Icon size={16} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {item.subtitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {topic && (
                    <>
                      {prog?.vueltas ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                          {prog.vueltas} {prog.vueltas === 1 ? "vuelta" : "vueltas"}
                        </span>
                      ) : null}
                    </>
                  )}
                  <ChevronRight
                    size={14}
                    className={cn(
                      "transition-transform",
                      isSelected ? "text-indigo-600 translate-x-0.5" : "text-slate-300"
                    )}
                  />
                </div>
              </div>
            );
          })}

          {filteredResults.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              No se encontraron coincidencias para &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">↑</kbd> <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">↓</kbd> navegar</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">↵</kbd> seleccionar</span>
          </div>
          <span>WellsPrep Judicatura</span>
        </div>
      </motion.div>
    </div>
  );
}
