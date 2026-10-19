import React from "react";
import { Zap, AlertOctagon, Flame, Calendar, CheckCircle2 } from "lucide-react";
import { Topic } from "../../types";
import { cn } from "../../lib/utils";

export interface SmartQueueItem {
  topic: Topic;
  urgency: number;
  reason: string;
}

interface DashboardSmartQueueProps {
  smartQueue: SmartQueueItem[];
  onSelectTopic?: (topicId: string) => void;
}

export const DashboardSmartQueue: React.FC<DashboardSmartQueueProps> = ({
  smartQueue,
  onSelectTopic,
}) => {
  return (
    <div className="md:col-span-1 xl:col-span-1 xl:row-span-2 bg-white/95 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col relative overflow-hidden group">
      <div className="relative z-10 flex-1 flex flex-col">
        <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2 mb-1 tracking-tight">
          <Zap size={17} className="text-amber-500" fill="currentColor" />
          Agenda Inteligente
        </h3>
        <p className="text-xs text-slate-500 font-medium mb-4">
          Planificación sugerida por repetición espaciada (SRS)
        </p>

        <div className="space-y-2.5 flex-1 overflow-y-auto no-scrollbar pr-1 max-h-[500px]">
          {smartQueue.length > 0 ? (
            smartQueue.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onSelectTopic && onSelectTopic(item.topic.id)}
                className="bg-white hover:bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl transition-all cursor-pointer group/item shadow-2xs hover:border-slate-300 active:scale-[0.99]"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono tabular-nums">
                    Tema {item.topic.number}
                  </span>
                  {item.urgency === 3 && (
                    <span className="flex h-2 w-2 rounded-full bg-rose-500" />
                  )}
                  {item.urgency === 2 && (
                    <span className="flex h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </div>
                <h4 className="text-xs font-bold text-slate-900 line-clamp-1 group-hover/item:text-indigo-600 transition-colors">
                  {item.topic.title}
                </h4>
                <p
                  className={cn(
                    "text-[11px] font-bold mt-1.5 flex items-center gap-1",
                    item.urgency === 3
                      ? "text-rose-600"
                      : item.urgency === 2
                      ? "text-amber-600"
                      : "text-indigo-600"
                  )}
                >
                  {item.urgency === 3 ? (
                    <AlertOctagon size={12} />
                  ) : item.urgency === 2 ? (
                    <Flame size={12} />
                  ) : (
                    <Calendar size={12} />
                  )}
                  {item.reason}
                </p>
              </div>
            ))
          ) : (
            <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2 opacity-50" />
              <p className="text-xs font-bold text-slate-700">¡Todo al día!</p>
              <p className="text-[11px] text-slate-400 mt-0.5">No tienes repasos pendientes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
