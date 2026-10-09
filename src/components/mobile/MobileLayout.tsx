import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileSendView } from './MobileSendView';
import { MobileReceiveView } from './MobileReceiveView';
import { MobileChatView } from './MobileChatView';
import { MobileCloudView } from './MobileCloudView';
import { SettingsModal } from '../SettingsModal';
import { db } from '../../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface MobileLayoutProps {
  onToggleViewMode: () => void;
  onOpenRules: () => void;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  onToggleViewMode,
  onOpenRules
}) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'chat' | 'drive'>('send');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [incomingCount, setIncomingCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Track pending incoming transfers for receive badge
  useEffect(() => {
    if (!currentUser) return;

    const transfersRef = collection(db, 'transfers');
    const q = query(
      transfersRef,
      where('receiverId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pendingCount = snapshot.docs.filter(d => d.data()?.status === 'pending').length;
      setIncomingCount(pendingCount);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  return (
    <div className="h-screen max-h-screen w-full bg-[#0b0f19] text-slate-100 flex flex-col relative overflow-hidden selection:bg-emerald-500 selection:text-slate-950 font-sans touch-manipulation">
      {/* Mobile Top Header */}
      <MobileHeader
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleViewMode={onToggleViewMode}
        viewMode="mobile"
      />

      {/* Main Tab Content Area - No outer scrollbar */}
      <main className="flex-1 min-h-0 w-full flex flex-col overflow-hidden pb-[46px]">
        {activeTab === 'send' && (
          <div key="m-send" className="flex-1 min-h-0 h-full overflow-y-auto no-scrollbar animate-in fade-in duration-150">
            <MobileSendView />
          </div>
        )}
        {activeTab === 'receive' && (
          <div key="m-receive" className="flex-1 min-h-0 h-full overflow-y-auto no-scrollbar animate-in fade-in duration-150">
            <MobileReceiveView />
          </div>
        )}
        {activeTab === 'chat' && (
          <div key="m-chat" className="flex-1 min-h-0 h-full flex flex-col overflow-hidden animate-in fade-in duration-150">
            <MobileChatView />
          </div>
        )}
        {activeTab === 'drive' && (
          <div key="m-drive" className="flex-1 min-h-0 h-full overflow-y-auto no-scrollbar animate-in fade-in duration-150">
            <MobileCloudView />
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'chat') setUnreadChatCount(0);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        incomingCount={incomingCount}
        unreadChatCount={unreadChatCount}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenRules={onOpenRules}
        onOpenDevConsole={() => {}}
        onOpenDevPage={() => {}}
      />
    </div>
  );
};
