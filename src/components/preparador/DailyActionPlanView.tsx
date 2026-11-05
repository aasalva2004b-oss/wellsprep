import React, { useState } from "react";
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  BookOpen, 
  Sparkles, 
  Timer, 
  Zap, 
  ArrowRight, 
  ChevronRight,
  Award,
  AlertCircle,
  Plus,
  Minus
} from "lucide-react";
import { DayStudyQuota, DayTopicTask, WeeklyCantePlan } from "../../lib/weeklyCanteEngine";
import { cn, formatMinutesToHours } from "../../lib/utils";
import { playSound } from "../../lib/sound";
import { toast } from "sonner";
import { motion } from "motion/react";

interface DailyActionPlanViewProps {
  quota: DayStudyQuota | undefined;
  dateStr: string;
  plan: WeeklyCantePlan;
  daySessions: any[];
  topicMap: Map<string, any>;
  onToggleTaskComplete: (dateStr: string, topicId: string, isCompleted: boolean, pagesCount: number) => void;
  onRecordStudySession?: (topicId: string, durationMinutes: number) => void;
  onSwitchToCanteView?: (day: "lunes" | "jueves") => void;
}

export const DailyActionPlanView: React.FC<DailyActionPlanViewProps> = ({
  quota,
  dateStr,
  plan,
  daySessions,
  topicMap,
  onToggleTaskComplete,
  onRecordStudySession,
  onSwitchToCanteView
}) => {
  const [activeQuickSessionTopicId, setActiveQuickSessionTopicId] = useState<string | null>(null);

  const isCanteDay = quota?.isCanteDay || false;
  const isCanteToday = plan.targetCanteDate === dateStr;
  const tasks = quota?.tasks || [];
  const plannedPages = quota?.totalPlannedPages || 0;
  const plannedMinutes = quota?.totalPlannedMinutes || 0;
  const actualMinutes = quota?.totalActualMinutesStudied || 0;

  const totalPagesDone = tasks.filter((t) => t.isCompleted).reduce((acc, t) => acc + t.pagesCount, 0);
  const dayProgressPct = plannedPages > 0 ? Math.round((totalPagesDone / plannedPages) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Top Day Overview Banner */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center font-bold shrink-0 shadow-xs",
              isCanteDay 
                ? "bg-amber-500 text-white" 
                : "bg-indigo-600 text-white"
            )}>
              {isCanteDay ? <Award size={22} /> : <Calendar size={22} />}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg sm:text-xl font-black font-serif text-slate-900 tracking-tight">
                  {quota?.dayName || "Jornada de Estudio"} ({dateStr})
                </h3>
                {isCanteDay ? (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    Día Oficial de Cante
                  </span>
                ) : quota?.isToday ? (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Jornada en Curso
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-slate-500 mt-1 font-medium flex items-center gap-2 flex-wrap">
                <span>Meta del día: <strong className="font-mono text-slate-800">{plannedPages} páginas</strong></span>
                <span className="text-slate-300">·</span>
                <span>Tiempo previsto: <strong className="font-mono text-slate-800">{formatMinutesToHours(plannedMinutes)}</strong></span>
                <span className="text-slate-300">·</span>
                <span>Estudiado hoy: <strong className="font-mono text-emerald-700">{formatMinutesToHours(actualMinutes)}</strong></span>
              </p>
            </div>
          </div>

          {/* Quick Target Cante Switchers */}
          <div className="flex items-center gap-2 shrink-0">
            {onSwitchToCanteView && (
              <>
                <button
                  type="button"
                  onClick={() => onSwitchToCanteView("lunes")}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs",
                    plan.targetCanteDay === "lunes"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  )}
                >
                  Cante Lunes
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchToCanteView("jueves")}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs",
                    plan.targetCanteDay === "jueves"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  )}
                >
                  Cante Jueves
                </button>
              </>
            )}
          </div>
        </div>

        {/* Dynamic Rebalance Guidance Note */}
        {quota?.rebalanceNote && (
          <div className="mt-4 p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100/80 flex items-start gap-2.5 text-xs text-indigo-900">
            <Sparkles size={16} className="text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">Ajuste Inteligente: </strong>
              <span>{quota.rebalanceNote}</span>
            </div>
          </div>
        )}
      </div>

      {/* CANTE DAY SPECIAL PROTOCOL CARD */}
      {isCanteDay && (
        <div className="bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 rounded-3xl p-5 border border-amber-200/80 shadow-xs">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs">
              <Award size={16} />
            </div>
            <div>
              <h4 className="text-sm font-black font-serif text-amber-950">
                Protocolo de Mañana de Cante
              </h4>
              <p className="text-[11px] text-amber-800">
                Reserva prioritaria para repaso mental y simulacro oral
              </p>
            </div>
          </div>

          <div className="space-y-2 mt-3 text-xs text-amber-950/90 font-medium">
            <div className="p-3 bg-white/80 rounded-xl border border-amber-200/50 flex items-center justify-between">
              <span>1. Repaso mental de índices y estructura de epígrafes</span>
              <span className="font-mono font-bold text-amber-800">~45 min</span>
            </div>
            <div className="p-3 bg-white/80 rounded-xl border border-amber-200/50 flex items-center justify-between">
              <span>2. Simulacro oral con cronómetro (12m 30s por tema)</span>
              <span className="font-mono font-bold text-amber-800">Cante</span>
            </div>
            {tasks.some((t) => t.isCanteMorningBuffer) && (
              <div className="p-3 bg-amber-100/60 rounded-xl border border-amber-300/80 flex items-center justify-between font-bold text-amber-950">
                <span>⚡ Buffer activo: Terminar páginas pendientes antes del repaso</span>
                <span className="font-mono">1-2 horas max</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIST OF STUDY TASKS FOR THIS DAY */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 font-mono">
            <BookOpen size={13} className="text-indigo-600" />
            <span>Páginas Asignadas para Hoy ({tasks.length} temas)</span>
          </h4>
          {plannedPages > 0 && (
            <span className="text-xs font-mono font-bold text-slate-600">
              {totalPagesDone} de {plannedPages} págs listas ({dayProgressPct}%)
            </span>
          )}
        </div>

        {tasks.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/70 shadow-2xs">
            <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-800">Sin tareas pesadas asignadas</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Todos los temas para este cante ya están al día o cubiertos. Puedes hacer repasos de refuerzo o descansar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {tasks.map((task, idx) => {
              const topic = topicMap.get(task.topicId);
              const isDone = task.isCompleted;

              return (
                <div
                  key={`${task.topicId}-${task.fromPage}`}
                  className={cn(
                    "p-4 sm:p-5 rounded-3xl border transition-all duration-200 relative overflow-hidden",
                    isDone
                      ? "bg-emerald-50/50 border-emerald-200 shadow-2xs"
                      : "bg-white hover:border-slate-300 border-slate-200/90 shadow-xs"
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {/* Checkbox Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const nextState = !isDone;
                          if (nextState) playSound.success();
                          else playSound.click();
                          onToggleTaskComplete(dateStr, task.topicId, nextState, task.pagesCount);
                          toast.success(
                            nextState 
                              ? `Tema ${task.topicNumber}: ${task.pagesCount} páginas completadas` 
                              : `Tema ${task.topicNumber}: marcado como pendiente`,
                            { description: "El plan semanal se ha recalculado automáticamente." }
                          );
                        }}
                        className={cn(
                          "w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0 mt-0.5",
                          isDone 
                            ? "bg-emerald-600 text-white shadow-xs" 
                            : "border-2 border-slate-300 hover:border-indigo-600 bg-white"
                        )}
                        title={isDone ? "Desmarcar páginas" : "Marcar páginas como leídas"}
                      >
                        {isDone && <CheckCircle2 size={16} strokeWidth={2.5} />}
                      </button>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-slate-900 text-white">
                            Tema {task.topicNumber}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            {task.subjectId}
                          </span>
                          {task.isCanteMorningBuffer && (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              Buffer Cante
                            </span>
                          )}
                        </div>

                        <h4 className={cn(
                          "text-sm sm:text-base font-bold text-slate-900 mt-1 line-clamp-1",
                          isDone && "line-through text-slate-500"
                        )}>
                          {task.topicTitle}
                        </h4>

                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 flex-wrap">
                          <span className="font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 font-mono">
                            Páginas {task.fromPage} a {task.toPage} ({task.pagesCount} págs)
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="flex items-center gap-1 font-mono text-slate-500">
                            <Clock size={12} />
                            ~{task.estimatedMinutes} min a {task.minutesPerPage} min/pág
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Study Action */}
                    {onRecordStudySession && (
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            playSound.click();
                            onRecordStudySession(task.topicId, task.estimatedMinutes);
                          }}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-2xs"
                          title="Registrar sesión de estudio de este bloque"
                        >
                          <Zap size={13} className="text-amber-600" />
                          <span>Registrar Estudio</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ACTUAL SESSIONS RECORDED ON THIS DATE */}
      {daySessions.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-200/80 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 font-mono">
            <Clock size={13} className="text-indigo-600" />
            <span>Sesiones Reales Registradas ({daySessions.length})</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {daySessions.map((session, sIdx) => {
              const topic = topicMap.get(session.topicId);
              const durMins = session.durationMinutes || session.duration || 0;
              return (
                <div
                  key={session.id || sIdx}
                  className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {topic ? `Tema ${topic.number}` : "Sesión"}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
                        {session.type || "Estudio"}
                      </span>
                      {session.source === "aerofocus" && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          AeroFocus
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-800 line-clamp-1">
                      {topic?.title || session.notes || "Estudio de temario"}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-black text-slate-900 block">
                      {durMins} min
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {session.time || "Grabado"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
