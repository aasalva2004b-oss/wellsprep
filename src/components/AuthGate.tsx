import { useFirebase } from '../lib/FirebaseProvider';
import { signIn } from '../lib/firebase';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { ReactNode } from 'react';
import { motion } from 'motion/react';

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useFirebase();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#F5F5F7]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-serif text-xl font-black shadow-lg shadow-slate-900/10 mb-4 animate-pulse">
            W
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Iniciando WellsPrep...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen w-screen bg-[#F5F5F7] p-4 relative overflow-hidden">
        {/* Subtle Ambient Background Gradients */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-slate-300/30 rounded-full blur-3xl pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="bg-white/90 backdrop-blur-2xl p-8 sm:p-10 rounded-[2.5rem] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.12)] w-full max-w-md text-center border border-slate-200/80 relative z-10"
        >
          <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-white font-serif font-black text-2xl mx-auto mb-5 shadow-xl shadow-slate-900/15 ring-1 ring-white/20">
            W
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[11px] font-black uppercase tracking-wider mb-3">
            <ShieldCheck size={13} /> Sistema de Alto Rendimiento
          </div>

          <h1 className="text-2xl sm:text-3xl font-black font-serif text-slate-900 tracking-tight mb-2">
            WellsPrep
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mb-8 leading-relaxed max-w-xs mx-auto">
            Plataforma de gestión y telemetría avanzada para la preparación de Oposiciones de Élite.
          </p>
          
          <button 
            type="button"
            onClick={signIn}
            className="w-full bg-slate-900 hover:bg-black text-white font-black text-xs uppercase tracking-wider py-4 px-6 rounded-2xl shadow-lg shadow-slate-900/15 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
          >
            <span>Continuar con Google</span>
            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </button>

          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-6">
            Datos protegidos con cifrado y sincronización en la nube
          </p>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
