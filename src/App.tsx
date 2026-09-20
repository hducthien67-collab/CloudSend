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
import { Send, Loader2 } from 'lucide-react';

function MainApp() {
  const { currentUser, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'chat'>('send');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [incomingCount, setIncomingCount] = useState(0);

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

      {/* Main Content Area: Persistent view mounting to eliminate tab-switching lag */}
      <main className="flex-1 min-h-0 w-full flex flex-col relative overflow-hidden">
        <div className={`w-full flex-1 flex flex-col overflow-y-auto pb-20 md:pb-6 ${activeTab === 'send' ? '' : 'hidden'}`}>
          <SendView />
        </div>
        <div className={`w-full flex-1 flex flex-col overflow-y-auto pb-20 md:pb-6 ${activeTab === 'receive' ? '' : 'hidden'}`}>
          <ReceiveView />
        </div>
        <div className={`w-full flex-1 flex flex-col overflow-hidden h-full ${activeTab === 'chat' ? '' : 'hidden'}`}>
          <ChatRoomView />
        </div>
      </main>

      {/* Settings Modal (opened via gear icon) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
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
