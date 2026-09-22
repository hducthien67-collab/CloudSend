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
import { DevCloudConsoleModal } from './components/DevCloudConsoleModal';
import { DevDatastorePage } from './components/DevDatastorePage';
import { RulesModal } from './components/RulesModal';
import { db } from './firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Send, Loader2, ShieldAlert, Database } from 'lucide-react';
import { isDevUser } from './utils/devModeration';

function MainApp() {
  const { currentUser, loading, settings } = useAuth();
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'chat'>('send');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isMandatoryRules, setIsMandatoryRules] = useState(false);
  const [incomingCount, setIncomingCount] = useState(0);

  // Check if first-time login / register needs to accept community rules
  useEffect(() => {
    if (!currentUser) return;
    const userAccepted = localStorage.getItem(`cloudsend_rules_accepted_${currentUser.uid}`) === 'true';
    const globalAccepted = localStorage.getItem('cloudsend_rules_accepted') === 'true';
    if (!userAccepted && !globalAccepted) {
      setIsMandatoryRules(true);
      setIsRulesOpen(true);
    }
  }, [currentUser?.uid]);

  const handleAcceptRules = () => {
    if (currentUser?.uid) {
      localStorage.setItem(`cloudsend_rules_accepted_${currentUser.uid}`, 'true');
    }
    localStorage.setItem('cloudsend_rules_accepted', 'true');
    setIsRulesOpen(false);
    setIsMandatoryRules(false);
  };

  const handleOpenRulesManually = () => {
    setIsMandatoryRules(false);
    setIsRulesOpen(true);
  };

  // Apply TV Mode and DPI Scaling dynamically to eliminate TV DPI issues
  const isTv = settings?.deviceType === 'tv' || settings?.tvModeEnabled;
  const tvScale = settings?.tvDpiScale || 1.4;

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (isTv) {
      document.documentElement.classList.add('tv-mode');
      // Apply DPI zoom: WebKit & Chromium (Tizen, WebOS, Android TV) support CSS zoom
      (document.body.style as any).zoom = String(tvScale);
      document.documentElement.style.setProperty('--tv-dpi-zoom', String(tvScale));
      document.documentElement.style.fontSize = `${16 * Math.min(tvScale, 1.25)}px`;
    } else {
      document.documentElement.classList.remove('tv-mode');
      (document.body.style as any).zoom = '1';
      document.documentElement.style.removeProperty('--tv-dpi-zoom');
      document.documentElement.style.fontSize = '16px';
    }

    return () => {
      (document.body.style as any).zoom = '1';
      document.documentElement.classList.remove('tv-mode');
      document.documentElement.style.fontSize = '16px';
    };
  }, [isTv, tvScale]);

  // TV Remote Control Keyboard Navigation (Arrow Keys / Enter / Back / Tab Switch)
  useEffect(() => {
    if (!isTv) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      
      // Remote D-Pad Tab Switching (when not typing in form field)
      if (!isInput) {
        if (e.key === 'ArrowLeft') {
          setActiveTab(prev => (prev === 'chat' ? 'receive' : prev === 'receive' ? 'send' : 'chat'));
        } else if (e.key === 'ArrowRight') {
          setActiveTab(prev => (prev === 'send' ? 'receive' : prev === 'receive' ? 'chat' : 'send'));
        }
      }

      // Close modal on Escape or Remote Back key (10009 = Tizen Return, 461 = WebOS Back)
      if (e.key === 'Escape' || e.key === 'GoBack' || e.keyCode === 10009 || e.keyCode === 461) {
        if (isSettingsOpen) setIsSettingsOpen(false);
        if (isDevConsoleOpen) setIsDevConsoleOpen(false);
        if (isRulesOpen && !isMandatoryRules) setIsRulesOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTv, isSettingsOpen, isDevConsoleOpen, isRulesOpen, isMandatoryRules]);

  // Dedicated Datastore Page Mode (Direct Datastore Web Interface)
  const [isDatastorePage, setIsDatastorePage] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('page') === 'datastore' ||
      params.get('page') === 'dev-cloud' ||
      window.location.hash === '#datastore' ||
      window.location.hash === '#dev-cloud' ||
      window.location.pathname === '/datastore' ||
      window.location.pathname === '/dev-cloud'
    );
  });

  // Keep route in sync with browser navigation (Back / Forward / Hash)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setIsDatastorePage(
        params.get('page') === 'datastore' ||
        params.get('page') === 'dev-cloud' ||
        window.location.hash === '#datastore' ||
        window.location.hash === '#dev-cloud' ||
        window.location.pathname === '/datastore' ||
        window.location.pathname === '/dev-cloud'
      );
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
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

  // === PRIORITY ROUTE: TRANG WEB DATASTORE DEV CLOUD ===
  // Must render directly without forcing user chat login!
  if (isDatastorePage) {
    return (
      <DevDatastorePage
        onBackToApp={() => {
          window.history.pushState(null, '', '/');
          setIsDatastorePage(false);
        }}
      />
    );
  }

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

  const isDev = isDevUser(currentUser.email);

  return (
    <div className={`w-full flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-900 ${
      activeTab === 'chat' ? 'h-screen max-h-screen overflow-hidden' : 'min-h-screen overflow-x-hidden'
    }`}>
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenRules={handleOpenRulesManually}
        onOpenDevConsole={() => setIsDevConsoleOpen(true)}
        onOpenDevPage={() => {
          window.history.pushState(null, '', '/?page=datastore');
          setIsDatastorePage(true);
        }}
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
        onOpenRules={handleOpenRulesManually}
        onOpenDevConsole={() => setIsDevConsoleOpen(true)}
        onOpenDevPage={() => {
          setIsSettingsOpen(false);
          window.history.pushState(null, '', '/?page=datastore');
          setIsDatastorePage(true);
        }}
      />

      {/* DEV Cloud Audit & Progressive Moderation Modal */}
      <DevCloudConsoleModal
        isOpen={isDevConsoleOpen}
        onClose={() => setIsDevConsoleOpen(false)}
        onSwitchToStandalone={() => {
          setIsDevConsoleOpen(false);
          window.history.pushState(null, '', '/?page=datastore');
          setIsDatastorePage(true);
        }}
      />

      {/* Community Rules & Terms of Service Modal */}
      <RulesModal
        isOpen={isRulesOpen}
        isMandatory={isMandatoryRules}
        onAccept={handleAcceptRules}
        onClose={() => {
          if (!isMandatoryRules) {
            setIsRulesOpen(false);
          }
        }}
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
