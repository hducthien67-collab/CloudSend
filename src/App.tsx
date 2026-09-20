/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { Navbar } from './components/Navbar';
import { SendView } from './components/SendView';
import { ReceiveView } from './components/ReceiveView';
import { ChatRoomView } from './components/ChatRoomView';
import { SettingsModal } from './components/SettingsModal';
import { db } from './firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Send, Radio, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { applyZoom, getSavedZoom, changeZoomBy, resetZoom } from './utils/zoom';

function MainApp() {
  const { currentUser, loading, settings } = useAuth();
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'chat'>('send');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [incomingCount, setIncomingCount] = useState(0);
  const [zoomNotification, setZoomNotification] = useState<number | null>(null);

  // Apply initial zoom scale and handle Ctrl + Mouse Wheel & keyboard shortcuts
  useEffect(() => {
    const initial = getSavedZoom();
    applyZoom(initial);

    let toastTimer: any = null;
    const showZoomToast = (scale: number) => {
      setZoomNotification(Math.round(scale * 100));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setZoomNotification(null), 1400);
    };

    // Listen to zoom changes from Navbar buttons as well
    const handleZoomEvent = (e: any) => {
      if (e.detail?.zoom) {
        showZoomToast(e.detail.zoom);
      }
    };
    window.addEventListener('cloudsend-zoom-change', handleZoomEvent);

    // Ctrl + Mouse Wheel (Ctrl + Lăn Chuột trên máy tính)
    let wheelAccumulator = 0;
    let wheelResetTimer: any = null;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        wheelAccumulator += e.deltaY;

        // Smooth calibrated stepping like Google Chrome zoom
        if (Math.abs(wheelAccumulator) >= 50) {
          const step = wheelAccumulator < 0 ? 0.05 : -0.05;
          wheelAccumulator = 0;
          const newZoom = changeZoomBy(step);
          showZoomToast(newZoom);
        }

        clearTimeout(wheelResetTimer);
        wheelResetTimer = setTimeout(() => {
          wheelAccumulator = 0;
        }, 250);
      }
    };

    // Keyboard shortcuts: Ctrl + Plus, Ctrl + Minus, Ctrl + 0
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const newZoom = changeZoomBy(0.05);
          showZoomToast(newZoom);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          const newZoom = changeZoomBy(-0.05);
          showZoomToast(newZoom);
        } else if (e.key === '0') {
          e.preventDefault();
          const newZoom = resetZoom();
          showZoomToast(newZoom);
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(toastTimer);
      clearTimeout(wheelResetTimer);
      window.removeEventListener('cloudsend-zoom-change', handleZoomEvent);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Monitor pending incoming transfers for badge
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'transfers'),
      where('receiverId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIncomingCount(snapshot.size);
    }, (err) => {
      console.warn('Pending transfers count notice:', err);
    });
    return () => unsubscribe();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
          <Send className="w-6 h-6 animate-pulse -rotate-12" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300 font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Đang kết nối Firebase Relay...</span>
        </div>
      </div>
    );
  }

  // Not signed in -> Show Auth Gate (Registration / Login)
  if (!currentUser) {
    return <AuthModal />;
  }

  return (
    <div className={`w-full flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-900 ${
      activeTab === 'chat' ? 'h-screen max-h-screen overflow-hidden' : 'min-h-screen overflow-x-hidden'
    }`}>
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        incomingCount={incomingCount}
      />

      {/* Main Content Area */}
      <main className={`flex-1 min-h-0 w-full flex flex-col ${
        activeTab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto pb-20 md:pb-6'
      }`}>
        {activeTab === 'send' && <SendView />}
        {activeTab === 'receive' && <ReceiveView />}
        {activeTab === 'chat' && <ChatRoomView />}
      </main>

      {/* Settings Modal (opened via gear icon) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Floating Zoom Toast (Appears on Ctrl + Wheel / Zoom change) */}
      {zoomNotification !== null && (
        <div className="fixed bottom-20 md:bottom-8 right-6 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="bg-slate-900/95 border border-emerald-500/40 text-white px-3.5 py-2 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-mono font-bold text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Kích thước: {zoomNotification}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
