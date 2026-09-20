import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase/config';
import { UserDevice, DeviceType, AppSettings, AppUser } from '../types';
import { detectDeviceType, generateDefaultDeviceName, getRandomColor } from '../utils/device';
import { 
  CustomAuthAccount, 
  hashPassword, 
  getEmailKey, 
  generateSalt, 
  generateUid 
} from '../utils/authHelper';

interface AuthContextType {
  currentUser: AppUser | null;
  userProfile: UserDevice | null;
  settings: AppSettings;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string, deviceName?: string) => Promise<void>;
  loginAsGuest: (customDisplayName?: string, customDeviceName?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    const saved = localStorage.getItem('cloudsend_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return {
      deviceName: generateDefaultDeviceName(defaultDeviceType),
      deviceType: defaultDeviceType,
      avatarColor: getRandomColor(),
      autoAccept: false,
      soundEnabled: true,
    };
  });

  const settingsRef = useRef<AppSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem('cloudsend_settings', JSON.stringify(settings));
  }, [settings]);

  // Handle Presence Heartbeat in Firestore using latest settings
  const updatePresence = async (uid: string, profile?: Partial<UserDevice>) => {
    try {
      const currentSettings = settingsRef.current;
      const currentUsr = currentUserRef.current;
      const presenceRef = doc(db, 'presence', uid);
      await setDoc(presenceRef, {
        uid,
        displayName: profile?.displayName || currentUsr?.displayName || currentUsr?.email?.split('@')[0] || 'Người dùng',
        deviceName: currentSettings.deviceName || profile?.deviceName || 'Thiết bị',
        deviceType: currentSettings.deviceType || profile?.deviceType || 'laptop',
        avatarColor: currentSettings.avatarColor || profile?.avatarColor || '#10B981',
        status: 'online',
        lastSeen: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.warn('Presence update error:', err);
    }
  };

  const removePresence = async (uid: string) => {
    try {
      const presenceRef = doc(db, 'presence', uid);
      await deleteDoc(presenceRef);
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
            if (!isMounted) return;
            setCurrentUser(session);
            currentUserRef.current = session;
            
            try {
              const userDocSnap = await getDoc(doc(db, 'users', session.uid));
              if (userDocSnap.exists() && isMounted) {
                const profileData = userDocSnap.data() as UserDevice;
                setUserProfile(profileData);
                if (profileData.deviceName) {
                  setSettings((prev) => ({
                    ...prev,
                    deviceName: profileData.deviceName,
                    deviceType: profileData.deviceType || prev.deviceType,
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
          if (userDocSnap && userDocSnap.exists()) {
            profileData = userDocSnap.data() as UserDevice;
            if (profileData.deviceName) {
              setSettings((prev) => ({
                ...prev,
                deviceName: profileData.deviceName,
                deviceType: profileData.deviceType || prev.deviceType,
                avatarColor: profileData.avatarColor || prev.avatarColor,
              }));
            }
          } else {
            profileData = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || user.email?.split('@')[0] || 'Người dùng',
              deviceName: settings.deviceName,
              deviceType: settings.deviceType,
              avatarColor: settings.avatarColor,
              createdAt: new Date().toISOString(),
            };
            try {
              await setDoc(userDocRef, profileData);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
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

    // Heartbeat interval every 15s to keep online presence solid across internet
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      if (currentUserRef.current) {
        updatePresence(currentUserRef.current.uid);
      }
    }, 15000);

    return () => {
      isMounted = false;
      unsubscribe();
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, []);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        console.info('Google Sign-In popup was closed by user.');
        throw error;
      }
      console.warn('Google Sign-In notice:', error?.message || error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const emailKey = await getEmailKey(cleanEmail);
    const accountRef = doc(db, 'accounts', emailKey);
    const accountSnap = await getDoc(accountRef);

    if (!accountSnap.exists()) {
      const err = new Error('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
      (err as any).code = 'auth/user-not-found';
      throw err;
    }

    const account = accountSnap.data() as CustomAuthAccount;
    const computedHash = await hashPassword(pass, account.salt);

    if (computedHash !== account.passwordHash) {
      const err = new Error('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
      (err as any).code = 'auth/wrong-password';
      throw err;
    }

    // Authenticated successfully!
    const userSession: AppUser = {
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
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
          email: account.email,
          displayName: account.displayName,
          deviceName: account.deviceName || settings.deviceName,
          deviceType: (account.deviceType as DeviceType) || settings.deviceType,
          avatarColor: account.avatarColor || settings.avatarColor,
          createdAt: account.createdAt,
        };
        await setDoc(doc(db, 'users', account.uid), profileData);
      }
    } catch {
      profileData = {
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        deviceName: account.deviceName || settings.deviceName,
        deviceType: (account.deviceType as DeviceType) || settings.deviceType,
        avatarColor: account.avatarColor || settings.avatarColor,
        createdAt: account.createdAt,
      };
    }

    setUserProfile(profileData);
    if (profileData.deviceName) {
      setSettings((prev) => ({ ...prev, deviceName: profileData.deviceName }));
    }
    await updatePresence(account.uid, profileData);
  };

  const registerWithEmail = async (email: string, pass: string, name: string, customDeviceName?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const devName = customDeviceName?.trim() || settings.deviceName;

    const emailKey = await getEmailKey(cleanEmail);
    const accountRef = doc(db, 'accounts', emailKey);
    const accountSnap = await getDoc(accountRef);

    if (accountSnap.exists()) {
      const err = new Error('Email này đã được đăng ký. Bạn vui lòng chuyển qua tab "Đăng nhập" để vào tài khoản nhé.');
      (err as any).code = 'auth/email-already-in-use';
      throw err;
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(pass, salt);
    const uid = generateUid();

    const newAccount: CustomAuthAccount = {
      uid,
      email: cleanEmail,
      passwordHash,
      salt,
      displayName: cleanName,
      deviceName: devName,
      deviceType: settings.deviceType,
      avatarColor: settings.avatarColor,
      createdAt: new Date().toISOString(),
    };

    await setDoc(accountRef, newAccount);

    const newProfile: UserDevice = {
      uid,
      email: cleanEmail,
      displayName: cleanName,
      deviceName: devName,
      deviceType: settings.deviceType,
      avatarColor: settings.avatarColor,
      createdAt: newAccount.createdAt,
    };

    await setDoc(doc(db, 'users', uid), newProfile);

    const userSession: AppUser = {
      uid,
      email: cleanEmail,
      displayName: cleanName,
    };

    localStorage.setItem('cloudsend_custom_session', JSON.stringify(userSession));
    setCurrentUser(userSession);
    currentUserRef.current = userSession;
    setUserProfile(newProfile);
    setSettings((prev) => ({ ...prev, deviceName: devName }));
    await updatePresence(uid, newProfile);
  };

  const loginAsGuest = async (customDisplayName?: string, customDeviceName?: string) => {
    const uid = 'guest_' + generateUid();
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
    await updatePresence(uid, profileData);
  };

  const logout = async () => {
    if (currentUserRef.current) {
      await removePresence(currentUserRef.current.uid);
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

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      return updated;
    });

    const currentUsr = currentUserRef.current;
    if (currentUsr) {
      const updatedProfile: UserDevice = {
        uid: currentUsr.uid,
        email: currentUsr.email || '',
        displayName: currentUsr.displayName || currentUsr.email?.split('@')[0] || 'Người dùng',
        createdAt: userProfile?.createdAt || new Date().toISOString(),
        ...(userProfile || {}),
        deviceName: newSettings.deviceName ?? settings.deviceName,
        deviceType: newSettings.deviceType ?? settings.deviceType,
        avatarColor: newSettings.avatarColor ?? settings.avatarColor,
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

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        settings,
        loading,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        loginAsGuest,
        logout,
        updateSettings,
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

