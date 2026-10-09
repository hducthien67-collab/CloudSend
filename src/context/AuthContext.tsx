import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  sendSignInLinkToEmail
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase/config';
import { UserDevice, DeviceType, AppSettings, AppUser, LoginSession, EmailVerificationRecord } from '../types';
import { detectDeviceType, generateDefaultDeviceName, getRandomColor, isSmartTv, getRecommendedTvDpi, detectBrowserInfo, detectLocationInfo, fetchSpecificLocation } from '../utils/device';
import { 
  CustomAuthAccount, 
  hashPassword, 
  getAccountKey,
  getEmailKey, 
  generateSalt, 
  generateUid 
} from '../utils/authHelper';
import { checkUserBanStatus } from '../utils/devModeration';

interface AuthContextType {
  currentUser: AppUser | null;
  userProfile: UserDevice | null;
  settings: AppSettings;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (emailOrUsername: string, pass: string) => Promise<void>;
  loginWithAccount: (usernameOrEmail: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string, deviceName?: string) => Promise<void>;
  registerWithAccount: (
    dataOrUsername: string | {
      username: string;
      pass: string;
      dob?: string;
      gender?: 'Nam' | 'Nữ' | 'Không Muốn Trả Lời' | string;
      deviceName?: string;
    },
    passArg?: string,
    extra?: {
      dob?: string;
      gender?: 'Nam' | 'Nữ' | 'Không Muốn Trả Lời' | string;
      deviceName?: string;
    }
  ) => Promise<void>;
  loginAsGuest: (customDisplayName?: string, customDeviceName?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  changePassword: (currentPass: string, newPass: string) => Promise<void>;
  updateDisplayName: (newDisplayName: string) => Promise<void>;
  linkEmail: (newEmail: string) => Promise<void>;
  sendEmailVerificationCode: (targetEmail: string) => Promise<{
    code: string;
    expiresAt: string;
    expiresTimestamp: number;
    emailMessage: string;
    recipientEmail: string;
  }>;
  verifyEmailCodeAndLink: (targetEmail: string, inputCode: string) => Promise<void>;
  getLoginSessions: () => Promise<LoginSession[]>;
  logoutSession: (sessionId: string) => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  syncGoogleProfilePhoto: () => Promise<string | null>;
  linkWithGoogleAccount: () => Promise<{ email: string; photoURL: string | null } | null>;
  updatePresence: (uid?: string, profile?: Partial<UserDevice>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const getClientDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server_node';
  let id = localStorage.getItem('cloudsend_client_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('cloudsend_client_device_id', id);
  }
  return id;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Restore session synchronously from localStorage to prevent UI flashing or logout on F5
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('cloudsend_custom_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.uid) return parsed;
      } catch {
        // fallback
      }
    }
    return null;
  });

  const [userProfile, setUserProfile] = useState<UserDevice | null>(() => {
    if (typeof window === 'undefined') return null;
    const savedProfile = localStorage.getItem('cloudsend_user_profile');
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        if (parsed?.uid) return parsed;
      } catch {
        // fallback
      }
    }
    return null;
  });

  // If a session already exists locally, do not block with full screen loading
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !localStorage.getItem('cloudsend_custom_session');
  });
  
  const currentUserRef = useRef<AppUser | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Keep user profile persisted in localStorage
  useEffect(() => {
    if (userProfile) {
      try {
        localStorage.setItem('cloudsend_user_profile', JSON.stringify(userProfile));
      } catch {
        // ignore
      }
    }
  }, [userProfile]);

  const defaultDeviceType = detectDeviceType();
  const [settings, setSettings] = useState<AppSettings>(() => {
    const isTv = isSmartTv();
    const isTvStored = typeof window !== 'undefined' && localStorage.getItem('cloudsend_tv_mode') === 'true';
    const detected = detectDeviceType();
    const isTvEffective = isTv || isTvStored;
    const effectiveType: DeviceType = isTvEffective ? 'tv' : detected;
    const defaultDpi = isTvEffective ? getRecommendedTvDpi() : 1.0;

    const saved = typeof window !== 'undefined' ? localStorage.getItem('cloudsend_settings') : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const tvActive = parsed.tvModeEnabled ?? isTvEffective;
        const currentType: DeviceType = tvActive ? 'tv' : detected;
        return {
          ...parsed,
          deviceType: currentType,
          tvModeEnabled: tvActive,
          tvDpiScale: parsed.tvDpiScale || (tvActive ? getRecommendedTvDpi() : 1.0),
          autoAccept: tvActive ? (parsed.autoAccept ?? true) : (parsed.autoAccept ?? false),
        };
      } catch {
        // fallback
      }
    }
    return {
      deviceName: generateDefaultDeviceName(effectiveType),
      deviceType: effectiveType,
      avatarColor: getRandomColor(),
      autoAccept: isTvEffective,
      soundEnabled: true,
      tvModeEnabled: isTvEffective,
      tvDpiScale: defaultDpi,
      dpiScaleMode: isTvEffective ? 'tv_150' : 'auto',
    };
  });

  const settingsRef = useRef<AppSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Keep deviceType synchronized if window dimensions / hardware context changes
  useEffect(() => {
    const handleResize = () => {
      if (settingsRef.current.tvModeEnabled || isSmartTv()) {
        return; // Retain TV mode if enabled or on TV
      }
      const current = detectDeviceType();
      if (current !== settingsRef.current.deviceType) {
        setSettings(prev => ({ ...prev, deviceType: current }));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem('cloudsend_settings', JSON.stringify(settings));
  }, [settings]);

  // Handle Presence Heartbeat in Firestore using latest settings & real detected hardware
  const updatePresence = async (uid?: string, profile?: Partial<UserDevice>) => {
    try {
      const targetUid = uid || currentUserRef.current?.uid;
      if (!targetUid) return;
      const currentSettings = settingsRef.current;
      const currentHwType = currentSettings.deviceType || (isSmartTv() ? 'tv' : detectDeviceType());
      const currentUsr = currentUserRef.current;
      const avatarImg = currentSettings.customAvatarUrl || profile?.customAvatarUrl || currentUsr?.photoURL;
      const deviceId = getClientDeviceId();
      const connectCode = deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
      const presenceKey = `${targetUid}_${deviceId}`;
      const presenceRef = doc(db, 'presence', presenceKey);
      await setDoc(presenceRef, {
        uid: targetUid,
        deviceId,
        connectCode,
        displayName: profile?.displayName || currentUsr?.displayName || currentUsr?.email?.split('@')[0] || 'Người dùng',
        deviceName: currentSettings.deviceName || profile?.deviceName || 'Thiết bị',
        deviceType: currentHwType,
        avatarColor: currentSettings.avatarColor || profile?.avatarColor || '#10B981',
        customAvatarUrl: avatarImg || null,
        status: 'online',
        lastSeen: new Date().toISOString(),
        lastSeenMs: Date.now(),
        lastSeenServer: serverTimestamp(),
      }, { merge: true });

      // Synchronize latest active hardware to users record
      const userDocRef = doc(db, 'users', targetUid);
      setDoc(userDocRef, { deviceType: currentHwType }, { merge: true }).catch(() => {});
    } catch (err) {
      console.warn('Presence update error:', err);
    }
  };

  const removePresence = async (uid: string) => {
    try {
      const deviceId = getClientDeviceId();
      const presenceKey = `${uid}_${deviceId}`;
      const presenceRef = doc(db, 'presence', presenceKey);
      await setDoc(presenceRef, {
        status: 'offline',
        lastSeen: new Date().toISOString(),
        lastSeenMs: Date.now(),
        lastSeenServer: serverTimestamp(),
      }, { merge: true });
      await deleteDoc(presenceRef).catch(() => {});
      await deleteDoc(doc(db, 'presence', uid)).catch(() => {});
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Immediately announce presence if user is restored from localStorage
    if (currentUser?.uid) {
      updatePresence(currentUser.uid, userProfile || undefined);
    }

    const restoreCustomSession = async () => {
      const saved = localStorage.getItem('cloudsend_custom_session');
      if (saved) {
        try {
          const session: AppUser = JSON.parse(saved);
          if (session && session.uid) {
            // Check if user is currently banned
            const banCheck = await checkUserBanStatus(session.email, session.uid);
            if (banCheck.isBanned) {
              localStorage.removeItem('cloudsend_custom_session');
              localStorage.removeItem('cloudsend_user_profile');
              setCurrentUser(null);
              currentUserRef.current = null;
              setUserProfile(null);
              if (isMounted) setLoading(false);
              return;
            }

            if (!isMounted) return;
            setCurrentUser(session);
            currentUserRef.current = session;
            
            try {
              const userDocSnap = await getDoc(doc(db, 'users', session.uid));
              if (userDocSnap.exists() && isMounted) {
                const profileData = userDocSnap.data() as UserDevice;
                setUserProfile(profileData);
                const hasLocalSettings = Boolean(localStorage.getItem('cloudsend_settings'));
                if (!hasLocalSettings && profileData.deviceName) {
                  setSettings((prev) => ({
                    ...prev,
                    deviceName: profileData.deviceName,
                    deviceType: detectDeviceType(),
                    avatarColor: profileData.avatarColor || prev.avatarColor,
                  }));
                }
                await updatePresence(session.uid, profileData);
              } else {
                // User document not found in Firestore yet, announce with current session
                await updatePresence(session.uid);
              }
            } catch (err) {
              console.warn('Could not refresh custom session profile from firestore:', err);
              await updatePresence(session.uid);
            }
          }
        } catch {
          localStorage.removeItem('cloudsend_custom_session');
        }
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Enforce Dev Ban Check on Gmail / Firebase Auth
        const banCheck = await checkUserBanStatus(user.email, user.uid);
        if (banCheck.isBanned) {
          console.warn('User is banned by Dev:', banCheck.message);
          await signOut(auth);
          localStorage.removeItem('cloudsend_custom_session');
          localStorage.removeItem('cloudsend_user_profile');
          setCurrentUser(null);
          currentUserRef.current = null;
          setUserProfile(null);
          if (isMounted) setLoading(false);
          return;
        }

        const appUser: AppUser = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0] || 'Người dùng',
          photoURL: user.photoURL,
        };
        setCurrentUser(appUser);
        currentUserRef.current = appUser;
        localStorage.setItem('cloudsend_custom_session', JSON.stringify(appUser));

        try {
          const userDocRef = doc(db, 'users', user.uid);
          let userDocSnap;
          try {
            userDocSnap = await getDoc(userDocRef);
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          }

          let profileData: UserDevice;
          const googleAvatar = user.photoURL || undefined;
          if (userDocSnap && userDocSnap.exists()) {
            profileData = userDocSnap.data() as UserDevice;
            const effectiveAvatar = googleAvatar || profileData.customAvatarUrl;
            profileData.customAvatarUrl = effectiveAvatar;
            if (googleAvatar && profileData.customAvatarUrl !== googleAvatar) {
              setDoc(userDocRef, { customAvatarUrl: googleAvatar }, { merge: true }).catch(() => {});
            }
            setSettings((prev) => ({
              ...prev,
              deviceName: profileData.deviceName || prev.deviceName,
              deviceType: detectDeviceType(),
              avatarColor: profileData.avatarColor || prev.avatarColor,
              customAvatarUrl: effectiveAvatar,
            }));
          } else {
            profileData = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || user.email?.split('@')[0] || 'Người dùng',
              deviceName: settings.deviceName,
              deviceType: detectDeviceType(),
              avatarColor: settings.avatarColor,
              customAvatarUrl: googleAvatar,
              createdAt: new Date().toISOString(),
            };
            try {
              await setDoc(userDocRef, profileData);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
            }
            if (googleAvatar) {
              setSettings((prev) => ({ ...prev, customAvatarUrl: googleAvatar }));
            }
          }

          setUserProfile(profileData);
          await updatePresence(user.uid, profileData);
        } catch (error) {
          console.error('Error fetching user profile:', error);
          await updatePresence(user.uid);
        }
      } else {
        // No Firebase Auth user, restore custom session from localStorage
        await restoreCustomSession();
      }

      if (isMounted) {
        setLoading(false);
      }
    });

    // Fast Heartbeat interval every 7s (when tab is active) to keep real-time presence synchronized with zero lag
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      if (currentUserRef.current && typeof document !== 'undefined' && !document.hidden) {
        updatePresence(currentUserRef.current.uid);
      }
    }, 7000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden && currentUserRef.current) {
        updatePresence(currentUserRef.current.uid);
      }
    };
    const handleFocus = () => {
      if (currentUserRef.current) {
        updatePresence(currentUserRef.current.uid);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    const handleWindowUnload = () => {
      if (currentUserRef.current) {
        removePresence(currentUserRef.current.uid);
      }
    };
    window.addEventListener('beforeunload', handleWindowUnload);
    window.addEventListener('pagehide', handleWindowUnload);

    return () => {
      isMounted = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleWindowUnload);
      window.removeEventListener('pagehide', handleWindowUnload);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, []);

  const loginWithGoogle = async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        const banCheck = await checkUserBanStatus(res.user.email, res.user.uid);
        if (banCheck.isBanned) {
          await signOut(auth);
          throw new Error(banCheck.message || 'Tài khoản của bạn đã bị DEV cấm tham gia hệ thống.');
        }

        const photoUrl = res.user.photoURL;
        if (photoUrl) {
          setSettings((prev) => ({ ...prev, customAvatarUrl: photoUrl }));
          if (currentUserRef.current) {
            currentUserRef.current.photoURL = photoUrl;
          }
        }
      }
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        console.info('Google Sign-In popup was closed by user.');
        throw error;
      }
      console.warn('Google Sign-In notice:', error?.message || error);
      throw error;
    }
  };

  const loginWithAccount = async (usernameOrEmail: string, pass: string) => {
    const cleanIdentifier = usernameOrEmail.trim();
    if (!cleanIdentifier) {
      throw new Error('Vui lòng nhập tên tài khoản.');
    }
    if (!pass) {
      throw new Error('Vui lòng nhập mật khẩu tài khoản.');
    }

    const normalized = cleanIdentifier.toLowerCase();

    // Check ban status by identifier first
    const banCheck = await checkUserBanStatus(normalized);
    if (banCheck.isBanned) {
      throw new Error(banCheck.message || 'Tài khoản này đã bị DEV cấm đăng nhập.');
    }

    const accountKey = await getAccountKey(normalized);
    const accountRef = doc(db, 'accounts', accountKey);
    const accountSnap = await getDoc(accountRef);

    if (!accountSnap.exists()) {
      const err = new Error('Tên tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
      (err as any).code = 'auth/user-not-found';
      throw err;
    }

    const account = accountSnap.data() as CustomAuthAccount;

    // Check ban status by UID as well
    const uidBanCheck = await checkUserBanStatus(normalized, account.uid);
    if (uidBanCheck.isBanned) {
      throw new Error(uidBanCheck.message || 'Tài khoản này đã bị DEV cấm.');
    }

    const computedHash = await hashPassword(pass, account.salt);

    if (computedHash !== account.passwordHash) {
      const err = new Error('Tên tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
      (err as any).code = 'auth/wrong-password';
      throw err;
    }

    // Authenticated successfully!
    const userSession: AppUser = {
      uid: account.uid,
      email: account.email || `${account.username || account.displayName}@cloudsend.local`,
      displayName: account.displayName || account.username || cleanIdentifier,
    };

    localStorage.setItem('cloudsend_custom_session', JSON.stringify(userSession));
    setCurrentUser(userSession);
    currentUserRef.current = userSession;

    // Load or generate user profile
    let profileData: UserDevice;
    try {
      const userDocSnap = await getDoc(doc(db, 'users', account.uid));
      if (userDocSnap.exists()) {
        profileData = userDocSnap.data() as UserDevice;
      } else {
        profileData = {
          uid: account.uid,
          email: account.email || userSession.email || '',
          username: account.username || cleanIdentifier,
          dob: account.dob,
          gender: account.gender,
          displayName: account.displayName || cleanIdentifier,
          deviceName: account.deviceName || settings.deviceName,
          deviceType: detectDeviceType(),
          avatarColor: account.avatarColor || settings.avatarColor,
          createdAt: account.createdAt,
        };
        await setDoc(doc(db, 'users', account.uid), profileData);
      }
    } catch {
      profileData = {
        uid: account.uid,
        email: account.email || userSession.email || '',
        username: account.username || cleanIdentifier,
        dob: account.dob,
        gender: account.gender,
        displayName: account.displayName || cleanIdentifier,
        deviceName: account.deviceName || settings.deviceName,
        deviceType: detectDeviceType(),
        avatarColor: account.avatarColor || settings.avatarColor,
        createdAt: account.createdAt,
      };
    }

    setUserProfile(profileData);
    if (profileData.deviceName) {
      setSettings((prev) => ({ ...prev, deviceName: profileData.deviceName, deviceType: detectDeviceType() }));
    }
    await updatePresence(account.uid, profileData);
  };

  const loginWithEmail = async (emailOrUsername: string, pass: string) => {
    return loginWithAccount(emailOrUsername, pass);
  };

  const registerWithAccount = async (
    dataOrUsername: string | {
      username: string;
      pass: string;
      dob?: string;
      gender?: 'Nam' | 'Nữ' | 'Không Muốn Trả Lời' | string;
      deviceName?: string;
    },
    passArg?: string,
    extra?: {
      dob?: string;
      gender?: 'Nam' | 'Nữ' | 'Không Muốn Trả Lời' | string;
      deviceName?: string;
    }
  ) => {
    let data: {
      username: string;
      pass: string;
      dob?: string;
      gender?: 'Nam' | 'Nữ' | 'Không Muốn Trả Lời' | string;
      deviceName?: string;
    };

    if (typeof dataOrUsername === 'string') {
      data = {
        username: dataOrUsername,
        pass: passArg || '',
        dob: extra?.dob,
        gender: extra?.gender,
        deviceName: extra?.deviceName,
      };
    } else {
      data = dataOrUsername || { username: '', pass: '' };
    }

    const cleanUsername = (data.username || '').trim();
    if (!cleanUsername) {
      throw new Error('Vui lòng nhập tên tài khoản.');
    }
    if (!data.pass || data.pass.length < 6) {
      throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
    }

    const normalizedUsername = cleanUsername.toLowerCase();

    // Check if this account is banned by Dev
    const banCheck = await checkUserBanStatus(normalizedUsername);
    if (banCheck.isBanned) {
      throw new Error(banCheck.message || 'Tên tài khoản này đã bị DEV cấm đăng ký vào hệ thống.');
    }

    const devName = data.deviceName?.trim() || settings.deviceName;
    const accountKey = await getAccountKey(normalizedUsername);
    const accountRef = doc(db, 'accounts', accountKey);
    const accountSnap = await getDoc(accountRef);

    if (accountSnap.exists()) {
      const err = new Error('Tên tài khoản này đã được sử dụng. Vui lòng chọn tên khác hoặc chuyển sang Đăng nhập.');
      (err as any).code = 'auth/email-already-in-use';
      throw err;
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(data.pass, salt);
    const uid = generateUid();
    const emailEquivalent = `${normalizedUsername.replace(/\s+/g, '_')}@cloudsend.local`;

    const newAccount: CustomAuthAccount = {
      uid,
      email: emailEquivalent,
      username: cleanUsername,
      dob: data.dob?.trim() || undefined,
      gender: data.gender || 'Không Muốn Trả Lời',
      passwordHash,
      salt,
      displayName: cleanUsername,
      deviceName: devName,
      deviceType: settings.deviceType,
      avatarColor: settings.avatarColor,
      createdAt: new Date().toISOString(),
    };

    await setDoc(accountRef, newAccount);

    const newProfile: UserDevice = {
      uid,
      email: emailEquivalent,
      username: cleanUsername,
      dob: data.dob?.trim() || undefined,
      gender: data.gender || 'Không Muốn Trả Lời',
      displayName: cleanUsername,
      deviceName: devName,
      deviceType: settings.deviceType,
      avatarColor: settings.avatarColor,
      createdAt: newAccount.createdAt,
    };

    await setDoc(doc(db, 'users', uid), newProfile);

    const userSession: AppUser = {
      uid,
      email: emailEquivalent,
      displayName: cleanUsername,
    };

    localStorage.setItem('cloudsend_custom_session', JSON.stringify(userSession));
    setCurrentUser(userSession);
    currentUserRef.current = userSession;
    setUserProfile(newProfile);
    setSettings((prev) => ({ ...prev, deviceName: devName }));
    await updatePresence(uid, newProfile);
  };

  const registerWithEmail = async (email: string, pass: string, name: string, customDeviceName?: string) => {
    return registerWithAccount({
      username: name || email,
      pass,
      deviceName: customDeviceName,
    });
  };

  const loginAsGuest = async (customDisplayName?: string, customDeviceName?: string) => {
    // Reuse existing guest UID if already created on this browser to avoid ghost duplicate devices
    let uid = typeof window !== 'undefined' ? localStorage.getItem('cloudsend_guest_uid') : null;
    if (!uid) {
      uid = 'guest_' + generateUid();
      if (typeof window !== 'undefined') {
        localStorage.setItem('cloudsend_guest_uid', uid);
      }
    }

    const devName = customDeviceName?.trim() || settings.deviceName;
    const dispName = customDisplayName?.trim() || devName || 'Khách ' + Math.floor(1000 + Math.random() * 9000);
    const guestUser: AppUser = {
      uid,
      email: `${uid}@cloudsend.local`,
      displayName: dispName,
    };

    localStorage.setItem('cloudsend_custom_session', JSON.stringify(guestUser));
    setCurrentUser(guestUser);
    currentUserRef.current = guestUser;

    const profileData: UserDevice = {
      uid,
      email: guestUser.email || '',
      displayName: dispName,
      deviceName: devName,
      deviceType: settings.deviceType,
      avatarColor: settings.avatarColor || getRandomColor(),
      createdAt: new Date().toISOString(),
    };

    setUserProfile(profileData);
    localStorage.setItem('cloudsend_user_profile', JSON.stringify(profileData));
    setSettings((prev) => ({ ...prev, deviceName: devName }));

    // Persist to users collection in Firestore so guest accounts are first-class peers
    try {
      await setDoc(doc(db, 'users', uid), profileData, { merge: true });
    } catch (e) {
      console.warn('Could not save guest profile to firestore:', e);
    }

    // Clean up any stale presence records for this physical device from earlier sessions
    const deviceId = getClientDeviceId();
    try {
      const presenceKey = `${uid}_${deviceId}`;
      const snap = await getDocs(query(collection(db, 'presence'), where('deviceId', '==', deviceId)));
      for (const d of snap.docs) {
        if (d.id !== presenceKey) {
          deleteDoc(d.ref).catch(() => {});
        }
      }
    } catch {}

    await updatePresence(uid, profileData);
  };

  const getOrCreateSessionId = (): string => {
    if (typeof window === 'undefined') return 'sess_server';
    let sid = localStorage.getItem('cloudsend_session_id');
    if (!sid) {
      sid = 'sess_' + generateUid();
      localStorage.setItem('cloudsend_session_id', sid);
      localStorage.setItem('cloudsend_session_time', new Date().toISOString());
    }
    return sid;
  };

  const recordLoginSession = async (uid: string, customSettings?: AppSettings) => {
    try {
      const sid = getOrCreateSessionId();
      const currentSet = customSettings || settingsRef.current;
      const sessionRef = doc(db, 'sessions', sid);
      const sessionData: LoginSession = {
        id: sid,
        uid,
        deviceName: currentSet.deviceName || 'Thiết bị',
        deviceType: currentSet.deviceType || (isSmartTv() ? 'tv' : detectDeviceType()),
        browser: detectBrowserInfo(),
        location: detectLocationInfo(),
        loginAt: localStorage.getItem('cloudsend_session_time') || new Date().toISOString(),
        lastActive: new Date().toISOString(),
      };
      await setDoc(sessionRef, sessionData, { merge: true });
    } catch (err) {
      console.warn('Could not record login session:', err);
    }
  };

  // Listen to remote Logout All Trigger
  useEffect(() => {
    if (!currentUser?.uid) return;
    
    // Announce session
    recordLoginSession(currentUser.uid);

    const sessionLoginTime = localStorage.getItem('cloudsend_session_time') || new Date().toISOString();
    if (!localStorage.getItem('cloudsend_session_time')) {
      localStorage.setItem('cloudsend_session_time', sessionLoginTime);
    }

    const unsubUser = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.logoutAllTimestamp) {
          const logoutTime = new Date(data.logoutAllTimestamp).getTime();
          const myTime = new Date(sessionLoginTime).getTime();
          // If a global logout all was issued after this session was created
          if (logoutTime >= myTime) {
            logout();
          }
        }
      }
    });

    return () => unsubUser();
  }, [currentUser?.uid]);

  const logout = async () => {
    const currentUid = currentUserRef.current?.uid;
    const sid = typeof window !== 'undefined' ? localStorage.getItem('cloudsend_session_id') : null;
    
    if (sid) {
      try {
        await deleteDoc(doc(db, 'sessions', sid));
      } catch {
        // ignore
      }
      localStorage.removeItem('cloudsend_session_id');
      localStorage.removeItem('cloudsend_session_time');
    }

    if (currentUid) {
      await removePresence(currentUid);
    }
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
    localStorage.removeItem('cloudsend_custom_session');
    localStorage.removeItem('cloudsend_user_profile');
    if (auth.currentUser) {
      await signOut(auth);
    }
    setCurrentUser(null);
    currentUserRef.current = null;
    setUserProfile(null);
  };

  const changePassword = async (currentPass: string, newPass: string) => {
    if (!currentUserRef.current) {
      throw new Error('Vui lòng đăng nhập để đổi mật khẩu.');
    }
    if (!currentPass) {
      throw new Error('Vui lòng nhập mật khẩu hiện tại.');
    }
    if (!newPass || newPass.length < 6) {
      throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
    }

    const usr = currentUserRef.current;
    const prof = userProfile;
    const identifier = prof?.username || usr.displayName || usr.email || '';
    const cleanId = identifier.trim().toLowerCase();

    const accountKey = await getAccountKey(cleanId);
    const accountRef = doc(db, 'accounts', accountKey);
    let accountSnap = await getDoc(accountRef);

    // If not found by identifier, search by email if different
    if (!accountSnap.exists() && usr.email) {
      const emailKey = await getAccountKey(usr.email.trim().toLowerCase());
      const emailSnap = await getDoc(doc(db, 'accounts', emailKey));
      if (emailSnap.exists()) {
        accountSnap = emailSnap;
      }
    }

    if (!accountSnap.exists()) {
      throw new Error('Không tìm thấy bản ghi tài khoản để cập nhật mật khẩu. Nếu bạn dùng Google, vui lòng đăng nhập bằng Google.');
    }

    const account = accountSnap.data() as CustomAuthAccount;
    const computedCurrentHash = await hashPassword(currentPass, account.salt);
    if (computedCurrentHash !== account.passwordHash) {
      throw new Error('Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại.');
    }

    // Generate fresh salt and new hash
    const newSalt = generateSalt();
    const newPasswordHash = await hashPassword(newPass, newSalt);

    await setDoc(accountSnap.ref, {
      passwordHash: newPasswordHash,
      salt: newSalt,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  const updateDisplayName = async (newDisplayName: string) => {
    const cleanName = newDisplayName.trim();
    if (!cleanName) {
      throw new Error('Tên hiển thị không được để trống.');
    }
    if (cleanName.length < 2) {
      throw new Error('Tên hiển thị phải có ít nhất 2 ký tự.');
    }

    const currentUsr = currentUserRef.current;
    if (!currentUsr) {
      throw new Error('Chưa đăng nhập.');
    }

    const updatedUser: AppUser = {
      ...currentUsr,
      displayName: cleanName,
    };
    setCurrentUser(updatedUser);
    currentUserRef.current = updatedUser;
    localStorage.setItem('cloudsend_custom_session', JSON.stringify(updatedUser));

    setSettings((prev) => ({
      ...prev,
      deviceName: cleanName,
    }));

    const updatedProfile: UserDevice = {
      ...(userProfile || {
        uid: currentUsr.uid,
        email: currentUsr.email || '',
        displayName: cleanName,
        deviceName: cleanName,
        deviceType: settings.deviceType,
        avatarColor: settings.avatarColor || '#10B981',
        createdAt: new Date().toISOString(),
      }),
      displayName: cleanName,
      deviceName: cleanName,
    };
    setUserProfile(updatedProfile);
    localStorage.setItem('cloudsend_user_profile', JSON.stringify(updatedProfile));

    try {
      await setDoc(doc(db, 'users', currentUsr.uid), { 
        displayName: cleanName,
        deviceName: cleanName
      }, { merge: true });
      await updatePresence(currentUsr.uid, updatedProfile);

      // Also update account doc if custom account
      const identifier = userProfile?.username || currentUsr.displayName || currentUsr.email || '';
      if (identifier) {
        const accountKey = await getAccountKey(identifier.trim().toLowerCase());
        await setDoc(doc(db, 'accounts', accountKey), { displayName: cleanName }, { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.error('Error updating display name in firestore:', err);
    }
  };

  const linkEmail = async (newEmail: string) => {
    const cleanEmail = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Địa chỉ email không hợp lệ. Vui lòng nhập đúng định dạng (ví dụ: yourname@gmail.com).');
    }

    const currentUsr = currentUserRef.current;
    if (!currentUsr) {
      throw new Error('Chưa đăng nhập.');
    }

    const updatedUser: AppUser = {
      ...currentUsr,
      email: cleanEmail,
    };
    setCurrentUser(updatedUser);
    currentUserRef.current = updatedUser;
    localStorage.setItem('cloudsend_custom_session', JSON.stringify(updatedUser));

    const updatedProfile: UserDevice = {
      ...(userProfile || {
        uid: currentUsr.uid,
        displayName: currentUsr.displayName || 'Người dùng',
        deviceName: settings.deviceName,
        deviceType: settings.deviceType,
        avatarColor: settings.avatarColor || '#10B981',
        createdAt: new Date().toISOString(),
      }),
      email: cleanEmail,
    };
    setUserProfile(updatedProfile);
    localStorage.setItem('cloudsend_user_profile', JSON.stringify(updatedProfile));

    try {
      await setDoc(doc(db, 'users', currentUsr.uid), { email: cleanEmail, linkedEmail: cleanEmail }, { merge: true });
      
      const identifier = userProfile?.username || currentUsr.displayName || '';
      if (identifier) {
        const accountKey = await getAccountKey(identifier.trim().toLowerCase());
        await setDoc(doc(db, 'accounts', accountKey), { email: cleanEmail, linkedEmail: cleanEmail }, { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.error('Error linking email:', err);
      throw err;
    }
  };

  const sendEmailVerificationCode = async (targetEmail: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Địa chỉ email không hợp lệ. Vui lòng nhập đúng định dạng (ví dụ: yourname@gmail.com).');
    }

    const currentUsr = currentUserRef.current;
    if (!currentUsr) {
      throw new Error('Chưa đăng nhập.');
    }

    // Generate secure 6-digit code (e.g. 849201)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now();
    const expiresTimestamp = now + 15 * 60 * 1000; // strictly 15 minutes
    const expiresAt = new Date(expiresTimestamp).toISOString();
    const createdAt = new Date(now).toISOString();
    const verificationId = `otp_${currentUsr.uid}_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const formattedTimeSent = new Date(now).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const formattedTimeExpires = new Date(expiresTimestamp).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const emailMessage = `Kính gửi người dùng CloudSend,\n\nHệ thống đã tiếp nhận yêu cầu liên kết địa chỉ Email [${cleanEmail}] với tài khoản của bạn (${currentUsr.displayName || 'Người dùng'}).\n\nMÃ XÁC THỰC BẢO MẬT 6 CHỮ SỐ CỦA BẠN LÀ:\n\n    >>>  ${code}  <<<\n\nTHỜI HẠN VÀ ĐIỀU KHOẢN HIỆU LỰC:\n• Mã số này CHỈ CÓ HIỆU LỰC TRONG VÒNG 15 PHÚT (Từ: ${formattedTimeSent} - Hết hạn lúc: ${formattedTimeExpires}).\n• Khi quá 15 phút, mã sẽ tự động hết hiệu lực và hệ thống sẽ yêu cầu bạn gửi lại mã mới.\n• Tuyệt đối không cung cấp mã 6 chữ số này cho bất kỳ ai để đảm bảo an toàn tuyệt đối cho tài khoản của bạn.\n\nTrân trọng,\nĐội ngũ Bảo mật & Quản trị Hệ thống CloudSend Relay Network`;

    const record: EmailVerificationRecord = {
      id: verificationId,
      uid: currentUsr.uid,
      email: cleanEmail,
      code,
      createdAt,
      expiresAt,
      expiresTimestamp,
      isUsed: false,
    };

    try {
      await setDoc(doc(db, 'email_verifications', verificationId), record);
    } catch (err) {
      console.warn('Error saving OTP to firestore:', err);
    }
    // Also save locally for instant response & offline stability
    localStorage.setItem(`cloudsend_active_otp_${currentUsr.uid}`, JSON.stringify(record));

    // 1. Dispatch real email directly via Firebase Auth's Google email delivery infrastructure
    try {
      if (typeof window !== 'undefined') {
        const actionCodeSettings = {
          url: `${window.location.origin}/?emailVerifyCode=${code}&email=${encodeURIComponent(cleanEmail)}`,
          handleCodeInApp: true,
        };
        await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
        console.log(`[Firebase Auth Email] Real verification email successfully dispatched to ${cleanEmail}`);
      }
    } catch (fbErr) {
      console.warn('[Firebase Auth Email] sendSignInLinkToEmail notice:', fbErr);
    }

    // 2. Dispatch real email via backend server
    try {
      await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          code,
          username: currentUsr.displayName || 'Người dùng CloudSend',
          durationMinutes: 15
        })
      });
    } catch (err) {
      console.warn('API send-verification-email call notice:', err);
    }

    return {
      code,
      expiresAt,
      expiresTimestamp,
      emailMessage,
      recipientEmail: cleanEmail,
    };
  };

  const verifyEmailCodeAndLink = async (targetEmail: string, inputCode: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    const cleanCode = inputCode.trim();

    if (!cleanCode) {
      throw new Error('Vui lòng nhập mã xác nhận 6 chữ số.');
    }
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      throw new Error('Mã xác nhận phải gồm đúng 6 chữ số.');
    }

    const currentUsr = currentUserRef.current;
    if (!currentUsr) {
      throw new Error('Chưa đăng nhập.');
    }

    const verificationId = `otp_${currentUsr.uid}_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    let record: EmailVerificationRecord | null = null;

    try {
      const snap = await getDoc(doc(db, 'email_verifications', verificationId));
      if (snap.exists()) {
        record = snap.data() as EmailVerificationRecord;
      }
    } catch {
      // fallback to local storage
    }

    if (!record) {
      const local = localStorage.getItem(`cloudsend_active_otp_${currentUsr.uid}`);
      if (local) {
        try {
          record = JSON.parse(local);
        } catch {}
      }
    }

    if (!record || record.email !== cleanEmail) {
      throw new Error('Không tìm thấy yêu cầu xác nhận cho email này. Vui lòng nhấn "Gửi mã xác nhận 6 số" trước.');
    }

    // Check expiration: strictly 15 minutes
    const now = Date.now();
    if (now > record.expiresTimestamp) {
      const err = new Error('Mã xác nhận đã hết hạn (chỉ có hiệu lực trong 15 phút). Vui lòng nhấn "Gửi lại mã mới".');
      (err as any).code = 'OTP_EXPIRED';
      throw err;
    }

    if (record.isUsed) {
      const err = new Error('Mã xác nhận này đã được sử dụng trước đó. Vui lòng gửi lại mã mới.');
      (err as any).code = 'OTP_ALREADY_USED';
      throw err;
    }

    if (record.code !== cleanCode) {
      const err = new Error('Mã xác thực 6 số không chính xác. Vui lòng kiểm tra lại.');
      (err as any).code = 'OTP_MISMATCH';
      throw err;
    }

    // Code is valid! Mark as used & Link Email
    try {
      await setDoc(doc(db, 'email_verifications', verificationId), {
        isUsed: true,
        usedAt: new Date().toISOString()
      }, { merge: true });
    } catch {}
    localStorage.removeItem(`cloudsend_active_otp_${currentUsr.uid}`);

    // Update user record & profile (for registered accounts: verify email only, preserve avatar)
    const nowIso = new Date().toISOString();

    const updatedUser: AppUser = {
      ...currentUsr,
      email: cleanEmail,
    };
    setCurrentUser(updatedUser);
    currentUserRef.current = updatedUser;
    localStorage.setItem('cloudsend_custom_session', JSON.stringify(updatedUser));

    const updatedProfile: UserDevice = {
      ...(userProfile || {
        uid: currentUsr.uid,
        displayName: currentUsr.displayName || 'Người dùng',
        deviceName: settings.deviceName,
        deviceType: settings.deviceType,
        avatarColor: settings.avatarColor || '#10B981',
        createdAt: nowIso,
      }),
      email: cleanEmail,
      linkedEmail: cleanEmail,
      isEmailVerified: true,
      emailVerifiedAt: nowIso,
    };
    setUserProfile(updatedProfile);
    localStorage.setItem('cloudsend_user_profile', JSON.stringify(updatedProfile));

    try {
      await setDoc(doc(db, 'users', currentUsr.uid), {
        email: cleanEmail,
        linkedEmail: cleanEmail,
        isEmailVerified: true,
        emailVerifiedAt: nowIso,
      }, { merge: true });

      await updatePresence(currentUsr.uid, updatedProfile);

      const identifier = userProfile?.username || currentUsr.displayName || '';
      if (identifier) {
        const accountKey = await getAccountKey(identifier.trim().toLowerCase());
        await setDoc(doc(db, 'accounts', accountKey), {
          email: cleanEmail,
          linkedEmail: cleanEmail,
          isEmailVerified: true,
          emailVerifiedAt: nowIso,
        }, { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.error('Error linking email in firestore:', err);
    }
  };

  const getLoginSessions = async (): Promise<LoginSession[]> => {
    if (!currentUserRef.current) return [];
    const uid = currentUserRef.current.uid;
    const currentSid = typeof window !== 'undefined' ? localStorage.getItem('cloudsend_session_id') : null;

    let accurateLocation = 'Việt Nam';
    try {
      accurateLocation = await fetchSpecificLocation();
    } catch {
      accurateLocation = detectLocationInfo();
    }

    try {
      const q = query(collection(db, 'sessions'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const list: LoginSession[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data() as LoginSession;
        list.push({
          ...data,
          id: docSnap.id,
          isCurrent: docSnap.id === currentSid,
        });
      });

      // If current session is missing in list, construct and add it
      if (currentSid) {
        const currentSession: LoginSession = {
          id: currentSid,
          uid,
          deviceName: settingsRef.current.deviceName || 'Thiết bị này',
          deviceType: settingsRef.current.deviceType || (isSmartTv() ? 'tv' : detectDeviceType()),
          browser: detectBrowserInfo(),
          location: accurateLocation,
          loginAt: localStorage.getItem('cloudsend_session_time') || new Date().toISOString(),
          lastActive: new Date().toISOString(),
          isCurrent: true,
        };

        const existingIdx = list.findIndex(s => s.id === currentSid);
        if (existingIdx >= 0) {
          list[existingIdx] = {
            ...list[existingIdx],
            ...currentSession,
            browser: detectBrowserInfo(),
            location: accurateLocation,
          };
        } else {
          list.unshift(currentSession);
        }

        // Keep session record fresh in Firestore
        setDoc(doc(db, 'sessions', currentSid), currentSession, { merge: true }).catch(() => {});
      }

      // Sort current device first, then newest lastActive
      list.sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        return new Date(b.lastActive || b.loginAt).getTime() - new Date(a.lastActive || a.loginAt).getTime();
      });

      return list;
    } catch (err) {
      console.warn('Error fetching login sessions:', err);
      return [
        {
          id: currentSid || 'sess_current',
          uid,
          deviceName: settingsRef.current.deviceName || 'Thiết bị này',
          deviceType: settingsRef.current.deviceType || (isSmartTv() ? 'tv' : detectDeviceType()),
          browser: detectBrowserInfo(),
          location: accurateLocation,
          loginAt: localStorage.getItem('cloudsend_session_time') || new Date().toISOString(),
          lastActive: new Date().toISOString(),
          isCurrent: true,
        }
      ];
    }
  };

  const logoutSession = async (sessionId: string) => {
    const currentSid = typeof window !== 'undefined' ? localStorage.getItem('cloudsend_session_id') : null;
    try {
      await deleteDoc(doc(db, 'sessions', sessionId));
    } catch (err) {
      console.error('Failed to remove session:', err);
    }
    if (sessionId === currentSid) {
      await logout();
    }
  };

  const logoutAllDevices = async () => {
    const currentUsr = currentUserRef.current;
    if (!currentUsr) return;

    try {
      // 1. Delete all sessions in Firestore for this user
      const q = query(collection(db, 'sessions'), where('uid', '==', currentUsr.uid));
      const snap = await getDocs(q);
      const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);

      // 2. Write logoutAllTimestamp trigger to users table
      await setDoc(doc(db, 'users', currentUsr.uid), {
        logoutAllTimestamp: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.warn('Error during logout all devices broadcast:', err);
    }

    // 3. Log out current device as well
    await logout();
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    if (newSettings.tvModeEnabled !== undefined) {
      if (newSettings.tvModeEnabled) {
        localStorage.setItem('cloudsend_tv_mode', 'true');
      } else {
        localStorage.removeItem('cloudsend_tv_mode');
      }
    }
    const isTvStored = typeof window !== 'undefined' && localStorage.getItem('cloudsend_tv_mode') === 'true';
    const isTv = isSmartTv() || isTvStored || newSettings.tvModeEnabled === true;
    const effectiveType: DeviceType = isTv ? 'tv' : detectDeviceType();

    setSettings((prev) => {
      const updated = { 
        ...prev, 
        ...newSettings,
        deviceType: effectiveType
      };
      return updated;
    });

    const currentUsr = currentUserRef.current;
    if (currentUsr) {
      const effectiveAvatar = newSettings.customAvatarUrl !== undefined 
        ? newSettings.customAvatarUrl 
        : (settings.customAvatarUrl || userProfile?.customAvatarUrl || currentUsr.photoURL || undefined);

      if (newSettings.customAvatarUrl !== undefined) {
        setCurrentUser((prev) => prev ? ({ ...prev, photoURL: newSettings.customAvatarUrl || null }) : null);
      }

      const updatedProfile: UserDevice = {
        uid: currentUsr.uid,
        email: currentUsr.email || '',
        displayName: currentUsr.displayName || currentUsr.email?.split('@')[0] || 'Người dùng',
        createdAt: userProfile?.createdAt || new Date().toISOString(),
        ...(userProfile || {}),
        deviceName: newSettings.deviceName ?? settings.deviceName,
        deviceType: effectiveType,
        avatarColor: newSettings.avatarColor ?? settings.avatarColor,
        customAvatarUrl: effectiveAvatar || undefined,
      };
      setUserProfile(updatedProfile);
      try {
        await setDoc(doc(db, 'users', currentUsr.uid), updatedProfile, { merge: true });
        await updatePresence(currentUsr.uid, updatedProfile);
      } catch (err) {
        console.error('Failed to sync updated profile to firestore', err);
      }
    }
  };

  const syncGoogleProfilePhoto = async (): Promise<string | null> => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user && res.user.photoURL) {
        const photoUrl = res.user.photoURL;
        const currentUsr = currentUserRef.current;
        if (currentUsr) {
          const updatedUser: AppUser = {
            ...currentUsr,
            photoURL: photoUrl,
          };
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          localStorage.setItem('cloudsend_custom_session', JSON.stringify(updatedUser));

          const updatedProf: UserDevice = {
            ...(userProfile || {
              uid: currentUsr.uid,
              displayName: currentUsr.displayName || 'Người dùng',
              deviceName: settings.deviceName,
              deviceType: settings.deviceType,
              avatarColor: settings.avatarColor || '#10B981',
              createdAt: new Date().toISOString(),
              email: currentUsr.email || '',
            }),
            customAvatarUrl: photoUrl,
          };
          setUserProfile(updatedProf);
          localStorage.setItem('cloudsend_user_profile', JSON.stringify(updatedProf));

          setSettings((prev) => ({ ...prev, customAvatarUrl: photoUrl }));

          await setDoc(doc(db, 'users', currentUsr.uid), {
            customAvatarUrl: photoUrl,
          }, { merge: true });

          await updatePresence(currentUsr.uid, updatedProf);
        }
        return photoUrl;
      }
      return null;
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        return null;
      }
      console.warn('Sync Google photo error:', err);
      throw err;
    }
  };

  const linkWithGoogleAccount = async (): Promise<{ email: string; photoURL: string | null } | null> => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        const photoUrl = res.user.photoURL;
        const email = res.user.email || '';
        const nowIso = new Date().toISOString();
        const currentUsr = currentUserRef.current;
        if (currentUsr) {
          const updatedUser: AppUser = {
            ...currentUsr,
            email: email || currentUsr.email,
            photoURL: photoUrl || currentUsr.photoURL,
          };
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          localStorage.setItem('cloudsend_custom_session', JSON.stringify(updatedUser));

          const updatedProf: UserDevice = {
            ...(userProfile || {
              uid: currentUsr.uid,
              displayName: currentUsr.displayName || 'Người dùng',
              deviceName: settings.deviceName,
              deviceType: settings.deviceType,
              avatarColor: settings.avatarColor || '#10B981',
              createdAt: nowIso,
            }),
            email: email || currentUsr.email || '',
            linkedEmail: email || currentUsr.email || '',
            isEmailVerified: true,
            emailVerifiedAt: nowIso,
            customAvatarUrl: photoUrl || userProfile?.customAvatarUrl,
          };
          setUserProfile(updatedProf);
          localStorage.setItem('cloudsend_user_profile', JSON.stringify(updatedProf));

          if (photoUrl) {
            setSettings((prev) => ({ ...prev, customAvatarUrl: photoUrl }));
          }

          await setDoc(doc(db, 'users', currentUsr.uid), {
            email: email,
            linkedEmail: email,
            isEmailVerified: true,
            emailVerifiedAt: nowIso,
            customAvatarUrl: photoUrl || null,
          }, { merge: true });

          const identifier = userProfile?.username || currentUsr.displayName || '';
          if (identifier) {
            const accountKey = await getAccountKey(identifier.trim().toLowerCase());
            await setDoc(doc(db, 'accounts', accountKey), {
              email: email,
              linkedEmail: email,
              isEmailVerified: true,
              emailVerifiedAt: nowIso,
            }, { merge: true }).catch(() => {});
          }

          await updatePresence(currentUsr.uid, updatedProf);
        }
        return { email, photoURL: photoUrl };
      }
      return null;
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        return null;
      }
      console.warn('Link Google account error:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        settings,
        loading,
        loginWithGoogle,
        loginWithEmail,
        loginWithAccount,
        registerWithEmail,
        registerWithAccount,
        loginAsGuest,
        logout,
        updateSettings,
        changePassword,
        updateDisplayName,
        linkEmail,
        sendEmailVerificationCode,
        verifyEmailCodeAndLink,
        getLoginSessions,
        logoutSession,
        logoutAllDevices,
        syncGoogleProfilePhoto,
        linkWithGoogleAccount,
        updatePresence,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

