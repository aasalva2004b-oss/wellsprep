/**
 * WellsPrep Apple Pro Editorial Design System Tokens
 * Standardized surfaces, typography, elevations, and transition easing.
 */

export const DS = {
  // Surfaces & Containers (Single elevation, zero nested card disorder)
  card: "bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] transition-all",
  cardInteractive: "bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.03)] transition-all active:scale-[0.99]",
  cardSubtle: "bg-slate-50/70 border border-slate-200/60 rounded-xl",
  modalContainer: "bg-white/98 backdrop-blur-2xl border border-slate-200/90 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.04)]",
  
  // Headers & Titles
  titlePage: "text-2xl sm:text-3xl font-black font-serif text-slate-900 tracking-tight",
  titleSection: "text-base sm:text-lg font-black font-serif text-slate-900 tracking-tight",
  titleCard: "text-xs font-black uppercase tracking-wider text-slate-700",
  subtitle: "text-xs text-slate-500 font-medium leading-relaxed",
  
  // Tabular Numerals (Strict standard for zero-jitter metrics)
  metricHero: "text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight text-slate-900",
  metricValue: "text-lg sm:text-xl font-black font-mono tabular-nums text-slate-900",
  metricSmall: "text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-700",
  monoBadge: "font-mono tabular-nums text-[11px] font-semibold",
  
  // Badges & Pills (Crisp, clean semantic labeling)
  badgeNeutral: "px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100/80 text-slate-700 border-slate-200/80",
  badgeSuccess: "px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-200/80",
  badgeWarning: "px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200/80",
  badgeDanger: "px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-rose-50 text-rose-800 border-rose-200/80",
  badgeBrand: "px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 text-blue-800 border-blue-200/80",
  badgeCanto: "px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50/90 text-amber-900 border-amber-300/80 font-mono tabular-nums",
  
  // Buttons
  btnPrimary: "px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white rounded-xl text-xs font-black shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none",
  btnSecondary: "px-4 py-2 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none",
  btnGhost: "px-3 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100/70 active:scale-[0.98] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5",
  btnDanger: "px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-[0.98]",
  
  // Motion curve
  springTransition: {
    duration: 0.18,
    ease: [0.16, 1, 0.3, 1]
  }
};
