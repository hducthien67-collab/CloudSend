import React from 'react';
import { ArrowLeft, Database, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface DevDatastorePageProps {
  onBackToApp?: () => void;
}

export const DevDatastorePage: React.FC<DevDatastorePageProps> = ({ onBackToApp }) => {
  const { currentUser, settings } = useAuth();

  const handleBack = () => {
    if (onBackToApp) {
      onBackToApp();
    } else {
      window.history.pushState(null, '', '/');
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-900 font-sans">
      {/* Top Navigation Bar - Phù hợp với màu và phong cách CloudSend */}
      <header className="h-16 border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold transition-all group shadow-sm active:scale-95"
            title="Quay lại trang chính CloudSend"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400 group-hover:-translate-x-0.5 transition-transform" />
            <span>Quay lại CloudSend</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">DataStore</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Custom Design
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* User / Device Info */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden sm:inline-block">Thiết bị:</span>
          <span className="text-slate-200 font-medium">{settings?.deviceName || 'Cloud Device'}</span>
          {currentUser && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" title="Online" />
          )}
        </div>
      </header>

      {/* Main Canvas - Trang trống hoàn toàn để bạn tự thiết kế */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        <div className="w-full flex-1 min-h-[500px] rounded-2xl border-2 border-dashed border-slate-800/90 bg-slate-900/20 flex flex-col items-center justify-center text-center p-6 sm:p-12 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/5">
            <Sparkles className="w-8 h-8" />
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
            Trang DataStore Trống
          </h2>

          <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            Trang đã sẵn sàng với nền và màu sắc chuẩn CloudSend. Bạn có thể cho mình biết ý tưởng thiết kế, các khung hiển thị hoặc chức năng bạn muốn đặt vào đây!
          </p>

          <div className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800 px-4 py-2.5 rounded-xl font-mono">
            // Canvas trống sẵn sàng nhận yêu cầu thiết kế từ bạn
          </div>
        </div>
      </main>
    </div>
  );
};
