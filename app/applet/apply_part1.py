# -*- coding: utf-8 -*-
import sys

with open('src/components/DevDatastorePage.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
old_imports = """import { 
  ArrowLeft, 
  Database, 
  PanelTop, 
  PanelLeft, 
  PanelRight, 
  Layers, 
  FileText, 
  Code2, 
  SlidersHorizontal,
  MessageSquare,
  Users,
  AlertTriangle,
  Ban,
  Megaphone,
  CheckCircle2,
  Globe,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  Clock,
  Radio,
  Send,
  Eye,
  Trash2,
  Monitor,
  Smartphone,
  ExternalLink,
  Info,
  Check,
  Flame,
  VolumeX,
  Filter,
  Crown,
  Image as ImageIcon,
  Maximize2,
  Sparkles,
  X,
  Download,
  ChevronRight,
  ChevronLeft,
  Flag
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  setDoc,
  updateDoc, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { ChatRoom, UserDevice, UserSanction, ChatMessage, ContentReport } from '../types';
import { isDevUser } from '../utils/devModeration';"""

new_imports = """import { 
  ArrowLeft, 
  Database, 
  PanelTop, 
  PanelLeft, 
  PanelRight, 
  Layers, 
  FileText, 
  Code2, 
  SlidersHorizontal,
  MessageSquare,
  Users,
  AlertTriangle,
  Ban,
  Megaphone,
  CheckCircle2,
  Globe,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  Clock,
  Radio,
  Send,
  Eye,
  Trash2,
  Monitor,
  Smartphone,
  ExternalLink,
  Info,
  Check,
  Flame,
  VolumeX,
  Filter,
  Crown,
  Image as ImageIcon,
  Maximize2,
  Sparkles,
  X,
  Download,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Flag,
  Paperclip,
  Camera
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  setDoc,
  updateDoc, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { ChatRoom, UserDevice, UserSanction, ChatMessage, ContentReport, ChatAttachment } from '../types';
import { isDevUser } from '../utils/devModeration';
import { formatFileSize } from '../utils/device';"""

assert old_imports in code, "old_imports not found"
code = code.replace(old_imports, new_imports)
print("1. Imports replaced successfully")

# 2. State definitions
old_state = """  // 2. Các bộ lọc tương ứng trong "Khung 2" (Bên Trái)
  const [roomFilter, setRoomFilter] = useState<'all' | 'public' | 'private'>('all');
  const [userFilter, setUserFilter] = useState<'all' | 'online_verified' | 'offline'>('all');
  const [violatorFilter, setViolatorFilter] = useState<'all' | 'profanity' | 'spam' | 'severe'>('all');
  const [bannedFilter, setBannedFilter] = useState<'all' | 'perm' | 'temp' | 'muted'>('all');
  const [broadcastFilter, setBroadcastFilter] = useState<'all' | 'emergency' | 'maintenance' | 'news'>('all');
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');

  // 3. Tìm kiếm và mục đang chọn ở Khung 3 để xem ở Khung 4
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Form soạn thông báo toàn máy chủ (Tác vụ 5)
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastType, setBroadcastType] = useState<'emergency' | 'maintenance' | 'news'>('emergency');
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);

  // State dữ liệu thực tế từ Firestore
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [onlinePresence, setOnlinePresence] = useState<UserDevice[]>([]);
  const [sanctions, setSanctions] = useState<UserSanction[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);

  // State chuyên biệt cho Tác vụ 1. Các Phòng Chat (Live Chat & Giám sát)
  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [devInputText, setDevInputText] = useState('');
  const [isSendingDevMessage, setIsSendingDevMessage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [roomDetailsTab, setRoomDetailsTab] = useState<'chat' | 'users' | 'messages' | 'images'>('chat');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [roomMsgSearchQuery, setRoomMsgSearchQuery] = useState('');
  const messagesScrollRef = useRef<HTMLDivElement>(null);"""

new_state = """  // 2. Các bộ lọc tương ứng trong "Khung 2" (Bên Trái)
  const [roomFilter, setRoomFilter] = useState<'all' | 'public' | 'private' | 'violating'>('all');
  const [roomViolationSeverity, setRoomViolationSeverity] = useState<'all' | 'light' | 'medium' | 'heavy' | 'critical'>('all');
  const [userFilter, setUserFilter] = useState<'all' | 'online' | 'offline' | 'violating'>('all');
  const [userViolationSeverity, setUserViolationSeverity] = useState<'all' | 'light' | 'medium' | 'heavy' | 'critical'>('all');
  const [violatorFilter, setViolatorFilter] = useState<'all' | 'light' | 'medium' | 'heavy' | 'critical'>('all');
  const [bannedFilter, setBannedFilter] = useState<'all' | 'perm' | 'temp' | 'muted'>('all');
  const [broadcastFilter, setBroadcastFilter] = useState<'all' | 'emergency' | 'maintenance' | 'news'>('all');
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');

  // 3. Tìm kiếm và mục đang chọn ở Khung 3 để xem ở Khung 4
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Form soạn thông báo toàn máy chủ (Tác vụ 5)
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastType, setBroadcastType] = useState<'emergency' | 'maintenance' | 'news'>('emergency');
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);

  // State dữ liệu thực tế từ Firestore
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [onlinePresence, setOnlinePresence] = useState<UserDevice[]>([]);
  const [sanctions, setSanctions] = useState<UserSanction[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);

  // State chuyên biệt cho Tác vụ 1. Các Phòng Chat (Live Chat & Giám sát)
  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [devInputText, setDevInputText] = useState('');
  const [devAttachments, setDevAttachments] = useState<ChatAttachment[]>([]);
  const [isSendingDevMessage, setIsSendingDevMessage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [roomDetailsTab, setRoomDetailsTab] = useState<'chat' | 'users' | 'messages' | 'images'>('chat');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [roomMsgSearchQuery, setRoomMsgSearchQuery] = useState('');
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const devFileInputRef = useRef<HTMLInputElement>(null);
  const devImageInputRef = useRef<HTMLInputElement>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);"""

assert old_state in code, "old_state not found"
code = code.replace(old_state, new_state)
print("2. State definitions replaced successfully")

with open('src/components/DevDatastorePage.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Check 1 & 2 completed.")
