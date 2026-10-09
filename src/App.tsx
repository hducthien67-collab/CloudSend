/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { Navbar } from './components/Navbar';
import { SendView } from './components/SendView';
import { ReceiveView } from './components/ReceiveView';
import { ChatRoomView } from './components/ChatRoomView';
import { CloudDriveView } from './components/CloudDriveView';
import { SettingsModal } from './components/SettingsModal';
import { DevCloudConsoleModal } from './components/DevCloudConsoleModal';
import { DevDatastorePage } from './components/DevDatastorePage';
import { RulesModal } from './components/RulesModal';
import { GoogleDisplayNameModal } from './components/GoogleDisplayNameModal';
import { RobloxModerationModal } from './components/RobloxModerationModal';
import { MobileLayout } from './components/mobile/MobileLayout';
import { db, auth } from './firebase/config';
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { 
  Send, 
  Loader2, 
  ShieldAlert, 
  Database, 
  MessageSquare, 
  MessageSquareText, 
  X, 
  Download, 
  Check, 
  Copy, 
  CheckCheck 
} from 'lucide-react';
import { isDevUser } from './utils/devModeration';
import { playReceiveSound } from './utils/sound';
import { formatFileSize } from './utils/device';
import { renderClickableText } from './utils/textFormat';

function MainApp() {
  const { currentUser, loading, settings, verifyEmailCodeAndLink } = useAuth();
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'chat' | 'drive'>('send');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isMandatoryRules, setIsMandatoryRules] = useState(false);
  const [isGoogleDisplayNameOpen, setIsGoogleDisplayNameOpen] = useState(false);
  const [incomingCount, setIncomingCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [chatNotification, setChatNotification] = useState<{ id: string; senderName: string; text: string } | null>(null);
  const [copiedNoticeText, setCopiedNoticeText] = useState(false);

  // Real-time Automatic Mobile DPI & Viewport Detection
  const checkIsMobileDPI = (): boolean => {
    if (typeof window === 'undefined') return false;

    const width = window.innerWidth;
    const ua = navigator.userAgent || '';
    const isMobileUA = /mobile|iphone|ipod|android|blackberry|opera mini|iemobile|wpdesktop/i.test(ua);
    const isIPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Large desktop screen (>= 1024px) without mobile UA is Desktop
    if (width >= 1024 && !isMobileUA) {
      return false;
    }

    // Standard phone viewport / mobile preview in DevTools or AI Studio (<= 840px)
    if (width <= 840) {
      return true;
    }

    // Physical screen dimensions for phones
    const isMobileScreenWidth = typeof window.screen !== 'undefined' && window.screen.width > 0 && window.screen.width <= 840;

    // Coarse touch input with compact width
    const isCoarseTouch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const isTouchMobileViewport = isCoarseTouch && (width <= 900 || (typeof window.screen !== 'undefined' && window.screen.width <= 900));

    // High DPI mobile phone display
    const isHighDPIPhone = (window.devicePixelRatio || 1) >= 1.5 && (width <= 900 && (isMobileUA || isCoarseTouch));

    return isMobileScreenWidth || isMobileUA || isTouchMobileViewport || isHighDPIPhone;
  };

  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => checkIsMobileDPI());
  const [manualViewOverride, setManualViewOverride] = useState<'mobile' | 'desktop' | null>(null);

  // Clear any old stuck localStorage preference from previous turns so user is never locked out of mobile view
  useEffect(() => {
    try {
      localStorage.removeItem('cloudsend_view_mode_pref');
    } catch {
      // ignore
    }
  }, []);

  // Listen for real-time window resize, orientation change, and media queries
  useEffect(() => {
    const handleResize = () => {
      const isMobile = checkIsMobileDPI();
      setIsMobileScreen(isMobile);
      // When screen size changes (e.g. user toggles device toolbar between PC and Phone in browser or AI Studio),
      // clear any manual override so the view follows the new device mode immediately
      setManualViewOverride(null);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    const mqlWidth = window.matchMedia ? window.matchMedia('(max-width: 840px)') : null;
    const mqlPointer = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;

    if (mqlWidth?.addEventListener) {
      mqlWidth.addEventListener('change', handleResize);
    }
    if (mqlPointer?.addEventListener) {
      mqlPointer.addEventListener('change', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (mqlWidth?.removeEventListener) {
        mqlWidth.removeEventListener('change', handleResize);
      }
      if (mqlPointer?.removeEventListener) {
        mqlPointer.removeEventListener('change', handleResize);
      }
    };
  }, []);

  // Active view mode: follows manual override if user explicitly clicked toggle during this screen size,
  // otherwise 100% automatically follows device DPI / viewport width
  const isMobileMode = manualViewOverride !== null ? (manualViewOverride === 'mobile') : isMobileScreen;

  const handleToggleViewMode = () => {
    // If currently mobile, switch to desktop; if desktop, switch to mobile
    const nextMode = isMobileMode ? 'desktop' : 'mobile';
    setManualViewOverride(nextMode);
  };

  const notifiedTransfersRef = useRef<Set<string>>(new Set());
  const initialTransfersLoadedRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const [incomingTransferNotice, setIncomingTransferNotice] = useState<{
    id: string;
    senderName: string;
    senderDevice: string;
    fileName?: string;
    fileSize?: number;
    textContent?: string;
  } | null>(null);

  // Global Real-time Unread Message Tracking for Public Lounge
  useEffect(() => {
    if (!currentUser) return;
    const sessionStartTime = Date.now();
    const messagesRef = collection(db, 'rooms', 'public-relay-lounge', 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const msg = change.doc.data();
          const msgTime = msg.timestamp || (msg.createdAt ? new Date(msg.createdAt).getTime() : 0);
          if (msgTime > sessionStartTime && msg.senderId !== currentUser.uid && msg.senderDevice !== settings?.deviceName) {
            if (activeTab !== 'chat') {
              setUnreadMessagesCount((prev) => prev + 1);
              if (settings?.soundEnabled) {
                playReceiveSound();
              }
              const previewText = msg.text || (msg.attachments?.length ? `Đã gửi ${msg.attachments.length} tệp đính kèm` : 'Đã gửi một tin nhắn mới');
              setChatNotification({
                id: change.doc.id,
                senderName: msg.senderName || 'Bạn bè',
                text: previewText
              });
            }
          }
        }
      });
    }, (err) => {
      console.warn('Lounge messages listener notice:', err);
    });

    return () => unsubscribe();
  }, [currentUser, activeTab, settings?.soundEnabled]);

  // When user switches to chat, clear unread count and notification banner
  useEffect(() => {
    if (activeTab === 'chat') {
      setUnreadMessagesCount(0);
      setChatNotification(null);
    }
  }, [activeTab]);

  // Auto-verify when user clicks the link from their Gmail inbox
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('emailVerifyCode');
    const email = params.get('email');
    if (code && email && currentUser && verifyEmailCodeAndLink) {
      verifyEmailCodeAndLink(email, code)
        .then(() => {
          window.history.replaceState(null, '', window.location.pathname);
        })
        .catch((err) => {
          console.warn('Auto verify email link error:', err);
        });
    }
  }, [currentUser, verifyEmailCodeAndLink]);

  // Check if first-time login / register needs to accept community rules
  useEffect(() => {
    if (!currentUser) return;
    const userAccepted = localStorage.getItem(`cloudsend_rules_accepted_${currentUser.uid}`) === 'true';
    const globalAccepted = localStorage.getItem('cloudsend_rules_accepted') === 'true';
    if (!userAccepted && !globalAccepted) {
      setIsMandatoryRules(true);
      setIsRulesOpen(true);
    }

    // Check if first-time Google login needs to configure display name
    const isGoogle = Boolean(
      auth.currentUser?.providerData?.some((p: any) => p.providerId === 'google.com') ||
      (currentUser.email && !currentUser.email.includes('@cloudsend.local') && !currentUser.email.startsWith('guest_') && Boolean(currentUser.photoURL))
    );
    const googleNamePrompted = localStorage.getItem(`cloudsend_google_name_set_${currentUser.uid}`) === 'true';
    if (isGoogle && !googleNamePrompted) {
      setIsGoogleDisplayNameOpen(true);
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

  // Keep standard crisp responsive sizing on TV (prevent oversized rem blowing up TV browsers)
  const isTv = settings?.deviceType === 'tv' || settings?.tvModeEnabled;

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (isTv) {
      document.documentElement.classList.add('tv-mode');
    } else {
      document.documentElement.classList.remove('tv-mode');
    }
    document.documentElement.style.fontSize = '16px';
    (document.body.style as any).zoom = '1';

    return () => {
      document.documentElement.classList.remove('tv-mode');
      document.documentElement.style.fontSize = '16px';
      (document.body.style as any).zoom = '1';
    };
  }, [isTv]);

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

  // Monitor pending incoming transfers for badge & instant floating alert in corner of screen
  // (Chuyên biệt bắt tin nhắn & tệp gửi trực tiếp từ tab Gửi, không phụ thuộc tab chat)
  useEffect(() => {
    if (!currentUser) return;
    const sessionStartTime = Date.now();
    const q = query(
      collection(db, 'transfers'),
      where('receiverId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIncomingCount(snapshot.size);

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const data = change.doc.data();
          const transferTime = data.createdAt ? new Date(data.createdAt).getTime() : Date.now();

          // Tránh lặp thông báo nếu đã hiển thị trong phiên này
          if (notifiedTransfersRef.current.has(docId)) return;

          // Nếu tin nhắn mới nhận hoặc tạo trong vòng 15 phút gần nhất
          const isRecent = transferTime > sessionStartTime - (15 * 60 * 1000);
          const shouldNotify = !initialTransfersLoadedRef.current || isRecent;

          if (shouldNotify && activeTabRef.current !== 'receive') {
            notifiedTransfersRef.current.add(docId);
            if (settings?.soundEnabled) {
              playReceiveSound();
            }
            setIncomingTransferNotice({
              id: docId,
              senderName: data.senderName || 'Người dùng',
              senderDevice: data.senderDevice || 'Thiết bị',
              fileName: data.fileName,
              fileSize: data.fileSize,
              textContent: data.textContent,
            });
          } else {
            notifiedTransfersRef.current.add(docId);
          }
        }
      });

      initialTransfersLoadedRef.current = true;
    }, (err) => {
      console.warn('Pending transfers count notice:', err);
    });
    return () => unsubscribe();
  }, [currentUser, settings?.soundEnabled]);

  // When user switches to receive tab, clear transfer notification banner
  useEffect(() => {
    if (activeTab === 'receive') {
      setIncomingTransferNotice(null);
    }
  }, [activeTab]);

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

  // === ROUTE: TRANG WEB DATASTORE DEV CLOUD (YÊU CẦU ĐĂNG NHẬP VÀ XÁC THỰC QUYỀN DEV CHÍNH CHỦ) ===
  if (isDatastorePage) {
    // 1. Chưa đăng nhập -> Buộc phải đăng nhập trước
    if (!currentUser) {
      return <AuthModal />;
    }

    // 2. Chặn hoàn toàn trên điện thoại di động vì bảng dữ liệu Firestore không hỗ trợ màn hình hẹp
    if (isMobileMode || checkIsMobileDPI()) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100 selection:bg-amber-500 selection:text-white">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/10">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h1 className="text-base sm:text-lg font-bold text-white mb-2">DEV DataStore Không Hỗ Trợ Trên Điện Thoại</h1>
          <p className="text-xs text-slate-400 max-w-sm mb-2 leading-relaxed">
            Hệ thống Quản trị Datastore có bảng cấu trúc dữ liệu Firestore phức tạp, không hỗ trợ thiết bị di động để tránh vỡ khung và thao tác nhầm dữ liệu.
          </p>
          <p className="text-[11px] text-amber-300 font-mono bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 mb-6 max-w-sm">
            Vui lòng mở ứng dụng trên Máy tính / Laptop (Desktop) để sử dụng trang này.
          </p>
          <button
            type="button"
            onClick={() => {
              window.history.pushState(null, '', '/');
              setIsDatastorePage(false);
            }}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all shadow-md active:scale-95"
          >
            Quay lại ứng dụng CloudSend
          </button>
        </div>
      );
    }

    // 3. Đã đăng nhập nhưng KHÔNG PHẢI tài khoản DEV (hducthien67@gmail.com) -> Chặn truy cập 403
    if (!isDevUser(currentUser.email)) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100 selection:bg-rose-500 selection:text-white">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4 shadow-lg shadow-rose-500/10">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">403 - Quyền Truy Cập Bị Từ Chối</h1>
          <p className="text-sm text-slate-400 max-w-md mb-2">
            Trang Quản Trị & DataStore chỉ dành riêng cho tài khoản Nhà phát triển chính thức (<span className="text-emerald-400 font-mono font-semibold">hducthien67@gmail.com</span>).
          </p>
          <p className="text-xs text-rose-300 font-mono bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20 mb-6">
            Tài khoản hiện tại của bạn ({currentUser.email || 'Khách'}) không có quyền truy cập chức năng này.
          </p>
          <button
            type="button"
            onClick={() => {
              window.history.pushState(null, '', '/');
              setIsDatastorePage(false);
            }}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all shadow-md active:scale-95"
          >
            Quay lại ứng dụng CloudSend
          </button>
        </div>
      );
    }

    // 3. Là DEV chính chủ -> Cho phép vào
    return (
      <DevDatastorePage
        onBackToApp={() => {
          window.history.pushState(null, '', '/');
          setIsDatastorePage(false);
        }}
      />
    );
  }

  // Not signed in -> Show Auth Gate (Registration / Login)
  if (!currentUser) {
    return <AuthModal />;
  }

  const isDev = isDevUser(currentUser.email);

  // Render Dedicated Mobile Native Layout if in Mobile mode
  if (isMobileMode) {
    return (
      <>
        <MobileLayout
          onToggleViewMode={handleToggleViewMode}
          onOpenRules={handleOpenRulesManually}
        />

        {/* First-Time Google Sign-In Display Name Setup Modal */}
        <GoogleDisplayNameModal
          isOpen={isGoogleDisplayNameOpen}
          onClose={() => setIsGoogleDisplayNameOpen(false)}
        />

        {/* Roblox-Style Moderation & Ban Notice Window */}
        <RobloxModerationModal
          onOpenRules={handleOpenRulesManually}
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
      </>
    );
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
        onOpenRules={handleOpenRulesManually}
        onOpenDevConsole={() => setIsDevConsoleOpen(true)}
        onToggleViewMode={handleToggleViewMode}
        onOpenDevPage={() => {
          window.history.pushState(null, '', '/?page=datastore');
          setIsDatastorePage(true);
        }}
        incomingCount={incomingCount}
        unreadMessagesCount={unreadMessagesCount}
      />

      {/* Thông Báo Tin Nhắn / Tệp Tin Gửi Tới Ở Góc Màn Hình (Chỉ dành riêng cho tab Gửi/Transfers) */}
      {incomingTransferNotice && activeTab !== 'receive' && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-50 max-w-sm sm:max-w-md w-full bg-slate-900/95 border-2 border-emerald-500/70 rounded-2xl p-4 shadow-2xl shadow-emerald-950/50 backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in duration-200 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/40">
              {incomingTransferNotice.textContent ? (
                <MessageSquareText className="w-5 h-5 animate-pulse text-emerald-300" />
              ) : (
                <Download className="w-5 h-5 animate-bounce" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-white truncate">
                    {incomingTransferNotice.senderName}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    ({incomingTransferNotice.senderDevice})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIncomingTransferNotice(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                  title="Đóng thông báo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {incomingTransferNotice.textContent ? 'Tin nhắn từ tab Gửi' : 'Tệp tin từ tab Gửi'}
                </span>
              </div>
            </div>
          </div>

          {/* Nội dung tin nhắn văn bản gửi tới */}
          {incomingTransferNotice.textContent && (
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs sm:text-sm text-slate-100 whitespace-pre-wrap break-words leading-relaxed max-h-36 overflow-y-auto scrollbar-thin select-text">
              {renderClickableText(incomingTransferNotice.textContent, false, "text-emerald-400 underline font-semibold hover:text-emerald-300 inline-flex items-center gap-1")}
            </div>
          )}

          {/* Tệp tin đính kèm nếu có */}
          {incomingTransferNotice.fileName && (
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 truncate flex items-center justify-between gap-2">
              <span className="font-semibold text-white truncate">{incomingTransferNotice.fileName}</span>
              {incomingTransferNotice.fileSize && (
                <span className="text-[11px] text-slate-400 shrink-0 font-mono">
                  {formatFileSize(incomingTransferNotice.fileSize)}
                </span>
              )}
            </div>
          )}

          {/* Thanh nút thao tác nhanh ở góc màn hình */}
          <div className="flex items-center gap-2 pt-1">
            {incomingTransferNotice.textContent && (
              <button
                type="button"
                onClick={() => {
                  if (incomingTransferNotice.textContent) {
                    navigator.clipboard.writeText(incomingTransferNotice.textContent);
                    setCopiedNoticeText(true);
                    setTimeout(() => setCopiedNoticeText(false), 2000);
                  }
                }}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Sao chép toàn bộ nội dung tin nhắn vào bộ nhớ tạm"
              >
                {copiedNoticeText ? (
                  <>
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Đã chép!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sao chép</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                try {
                  await updateDoc(doc(db, 'transfers', incomingTransferNotice.id), { status: 'completed' });
                } catch (e) {
                  console.warn('Mark read error:', e);
                }
                setIncomingTransferNotice(null);
              }}
              className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{incomingTransferNotice.textContent ? 'Đã xem' : 'Nhận tệp'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('receive');
                setIncomingTransferNotice(null);
              }}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium text-center transition-all cursor-pointer truncate"
            >
              Xem trong tab Nhận →
            </button>
          </div>
        </div>
      )}

      {/* Global Floating Chat Notification Banner */}
      {chatNotification && activeTab !== 'chat' && (
        <div className="fixed top-20 right-4 sm:right-6 z-50 max-w-sm w-full bg-slate-900/95 border border-emerald-500/40 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-3 fade-in duration-200 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-300 truncate">
                {chatNotification.senderName} vừa nhắn:
              </span>
              <button
                type="button"
                onClick={() => setChatNotification(null)}
                className="text-slate-400 hover:text-white p-0.5 rounded-lg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-slate-200 truncate mt-0.5 font-medium">
              {chatNotification.text}
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('chat');
                setChatNotification(null);
              }}
              className="mt-2 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
            >
              <span>Mở phòng chat xem ngay →</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Nhận diện Tab đang sử dụng, chỉ kích hoạt Tab hiện tại và dừng các tab khác để chống giật lag */}
      <main className="flex-1 min-h-0 w-full flex flex-col relative overflow-hidden">
        {activeTab === 'send' && (
          <div key="send-tab" className="w-full flex-1 flex flex-col overflow-y-auto pb-20 md:pb-6 animate-tab-switch">
            <SendView />
          </div>
        )}
        {activeTab === 'receive' && (
          <div key="receive-tab" className="w-full flex-1 flex flex-col overflow-y-auto pb-20 md:pb-6 animate-tab-switch">
            <ReceiveView />
          </div>
        )}
        {activeTab === 'drive' && (
          <div key="drive-tab" className="w-full flex-1 flex flex-col overflow-y-auto pb-20 md:pb-6 animate-tab-switch">
            <CloudDriveView />
          </div>
        )}
        {activeTab === 'chat' && (
          <div key="chat-tab" className="w-full flex-1 flex flex-col overflow-hidden h-full animate-tab-switch pb-16 md:pb-0">
            <ChatRoomView />
          </div>
        )}
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

      {/* First-Time Google Sign-In Display Name Setup Modal */}
      <GoogleDisplayNameModal
        isOpen={isGoogleDisplayNameOpen}
        onClose={() => setIsGoogleDisplayNameOpen(false)}
      />

      {/* Roblox-Style Moderation & Ban Notice Window */}
      <RobloxModerationModal
        onOpenRules={handleOpenRulesManually}
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
