import React, { useEffect, useState } from "react";
import { BookOpen, Save } from "lucide-react";
import { Topic } from "../../types";
import { toast } from "sonner";

interface TopicParametersCardProps {
  topic: Topic;
  customTitle: string;
  officialTitle?: string;
  setCustomTitle: (val: string) => void;
  pages: string;
  setPages: (val: string) => void;
  numeroPalabras: string;
  setNumeroPalabras: (val: string) => void;
  difficulty: number | "";
  setDifficulty: (val: number | "") => void;
  initialEpigrafes?: string;
  updateTopicProgress: (id: string, data: any) => Promise<void>;
}

export const TopicParametersCard: React.FC<TopicParametersCardProps> = ({
  topic,
  customTitle,
  officialTitle,
  setCustomTitle,
  pages,
  setPages,
  numeroPalabras,
  setNumeroPalabras,
  difficulty,
  setDifficulty,
  initialEpigrafes = "",
  updateTopicProgress,
}) => {
  const [epigrafes, setEpigrafes] = useState<string>(initialEpigrafes);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => setEpigrafes(initialEpigrafes), [topic.id, initialEpigrafes]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const parsedPages = pages.trim() ? Number(pages.replace(",", ".")) : undefined;
      const parsedPalabras = numeroPalabras.trim() ? parseInt(numeroPalabras, 10) : undefined;
      const parsedEpigrafes = epigrafes.trim() ? parseInt(epigrafes, 10) : undefined;
      if (parsedPages !== undefined && (!Number.isFinite(parsedPages) || parsedPages <= 0)) throw new Error("La extensión debe ser un número positivo.");
      if (parsedPalabras !== undefined && (!Number.isFinite(parsedPalabras) || parsedPalabras <= 0)) throw new Error("Las palabras deben ser un número positivo.");
      if (parsedEpigrafes !== undefined && (!Number.isFinite(parsedEpigrafes) || parsedEpigrafes < 0)) throw new Error("Los epígrafes deben ser un número válido.");

      await updateTopicProgress(topic.id, {
        customTitle: customTitle.trim() || topic.title,
        pages: parsedPages,
        numeroPalabras: parsedPalabras,
        epigrafes: parsedEpigrafes,
        difficulty: difficulty === "" ? undefined : Number(difficulty),
      });
      toast.success("Parámetros del tema guardados en la nube");
    } catch (err: any) {
      toast.error("Error guardando parámetros: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80">
      <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100">
        <h3 className="text-xs font-black text-slate-900 flex items-center gap-2 uppercase tracking-wider">
          <BookOpen size={15} className="text-indigo-600" />
          Parámetros del Tema
        </h3>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          Configuración
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
            Título personalizado
          </label>
          <input
            type="text"
            aria-label="Título personalizado del tema"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            className="w-full text-xs font-bold text-slate-800 bg-slate-50/90 border border-slate-200/80 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
          />
          {officialTitle && <p className="mt-1 text-[10px] text-slate-500">Título oficial: {officialTitle}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
              Extensión (Páginas)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0.5"
                aria-label="Páginas totales del tema"
                placeholder="Sin medir"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                className="w-full text-xs font-bold font-mono tabular-nums text-slate-800 bg-slate-50/90 border border-slate-200/80 rounded-xl px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
              />
              <span className="absolute right-2.5 top-2 text-[10px] font-bold text-slate-400 uppercase">
                pág
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
              Palabras Aprox.
            </label>
            <div className="relative">
              <input
                type="number"
                aria-label="Palabras totales del tema"
                placeholder="Sin medir"
                min="1"
                value={numeroPalabras}
                onChange={(e) => setNumeroPalabras(e.target.value)}
                className="w-full text-xs font-bold font-mono tabular-nums text-slate-800 bg-slate-50/90 border border-slate-200/80 rounded-xl px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
              />
              <span className="absolute right-2.5 top-2 text-[10px] font-bold text-slate-400 uppercase">
                pal
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
              Nº Epígrafes
            </label>
            <div className="relative">
              <input
                type="number"
                aria-label="Epígrafes totales del tema"
                min="0"
                value={epigrafes}
                onChange={(e) => setEpigrafes(e.target.value)}
                className="w-full text-xs font-bold font-mono tabular-nums text-slate-800 bg-slate-50/90 border border-slate-200/80 rounded-xl px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
              />
              <span className="absolute right-2.5 top-2 text-[10px] font-bold text-slate-400 uppercase">
                epíg
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
              Dificultad (1-10)
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="10"
                aria-label="Dificultad del tema"
                placeholder="Sin valorar"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value === "" ? "" : Math.max(1, Math.min(10, Number(e.target.value))))}
                className="w-full text-xs font-bold font-mono tabular-nums text-slate-800 bg-slate-50/90 border border-slate-200/80 rounded-xl px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
              />
              <span className="absolute right-2.5 top-2 text-[10px] font-bold text-slate-400 uppercase">
                /10
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-black rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Save size={13} />
          <span>{isSaving ? "Guardando..." : "Guardar Parámetros"}</span>
        </button>
      </div>
    </div>
  );
};
