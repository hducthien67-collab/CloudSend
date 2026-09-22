import React, { useState, useMemo } from 'react';
import { 
  X, 
  Scale, 
  Search, 
  Copy, 
  Check, 
  AlertTriangle, 
  Flame,
  CheckCircle2,
  Info
} from 'lucide-react';

export interface RuleClause {
  id: string;
  ruleNumber: string; // "Luật 1", "Luật 2", ...
  title: string;
  category: 'all' | 'speech' | 'file' | 'system' | 'sanctions';
  severity: 'low' | 'medium' | 'high' | 'critical';
  severityLabel: string;
  description: string;
  actions: string[];
  penalties: string[];
}

export const COMMUNITY_RULES: RuleClause[] = [
  // --- NHÓM NGÔN TỪ & GIAO TIẾP ---
  {
    id: '1',
    ruleNumber: 'Luật 1',
    title: 'Xúc phạm danh dự & Lăng mạ cá nhân',
    category: 'speech',
    severity: 'medium',
    severityLabel: 'Mức độ: Vừa',
    description: 'Nghiêm cấm mọi hành vi sử dụng từ ngữ thô tục, hạ nhục, chửi bới, miệt thị danh dự, nhân phẩm của cá nhân, gia đình hoặc tập thể người dùng khác.',
    actions: [
      'Chửi bới thô bạo bằng danh từ bộ phận sinh dục hoặc từ ngữ tục tĩu.',
      'Nhục mạ ngoại hình, hoàn cảnh, gia đình của người khác.',
      'Đe dọa dùng bạo lực hoặc khủng bố tinh thần trong phòng chat.'
    ],
    penalties: [
      'Cảnh cáo lần 1: Hệ thống tự động che chắn ***.',
      'Tái phạm: Khóa quyền gửi tin nhắn trong 24 giờ.'
    ]
  },
  {
    id: '2',
    ruleNumber: 'Luật 2',
    title: 'Cố tình lách luật & Ngụy trang từ ngữ tục tĩu',
    category: 'speech',
    severity: 'medium',
    severityLabel: 'Mức độ: Vừa',
    description: 'Nghiêm cấm hành vi cố ý chèn dấu chấm, dấu gạch, khoảng trắng, số thay chữ hoặc teencode nhằm vượt qua hệ thống kiểm duyệt tự động.',
    actions: [
      'Cố tình viết dạng ngắt âm: f.u.c.k, d.i.t, d_i_t, s e x, l.o.n, c.a.c.',
      'Viết teencode, tiếng lóng tục tĩu: djt, vcl, dkm, cailon, con cac, dau buoi.',
      'Dùng số thay chữ: d1t, s3x, đ3o.'
    ],
    penalties: [
      'Hệ thống tự động phát hiện, thay thế bằng *** và ghi nhận vi phạm.',
      'Nếu cố ý spam từ lách luật nhiều lần: Tạm khóa tài khoản từ 1 đến 12 giờ.'
    ]
  },
  {
    id: '3',
    ruleNumber: 'Luật 3',
    title: 'Kỳ thị vùng miền, tôn giáo & Kích động thù hận',
    category: 'speech',
    severity: 'high',
    severityLabel: 'Mức độ: Cao',
    description: 'Tuyệt đối tuân thủ Luật An ninh mạng: Nghiêm cấm mọi phát ngôn mang tính chia rẽ vùng miền, xúc phạm tôn giáo, tín ngưỡng, sắc tộc, giới tính hoặc kích động bạo lực.',
    actions: [
      'Dùng từ ngữ miệt thị văn hóa vùng miền (Bắc/Trung/Nam).',
      'Xúc phạm tín ngưỡng tôn giáo, phân biệt chủng tộc, giới tính.',
      'Tuyên truyền thông tin xuyên tạc, kích động tụ tập bạo lực.'
    ],
    penalties: [
      'Khóa tài khoản và quyền truy cập từ 3 đến 7 ngày.',
      'Cấm vĩnh viễn đối với hành vi tuyên truyền kích động nghiêm trọng.'
    ]
  },
  {
    id: '4',
    ruleNumber: 'Luật 4',
    title: 'Quấy rối tình dục & Gạ gẫm thô thiển',
    category: 'speech',
    severity: 'high',
    severityLabel: 'Mức độ: Cao',
    description: 'Nghiêm cấm gửi tin nhắn gạ tình thô thiển, quấy rối tình dục hoặc ép buộc người khác tiếp nhận các nội dung nhạy cảm.',
    actions: [
      'Nhắn tin gạ gẫm, đòi hỏi hình ảnh riêng tư nhạy cảm của người khác.',
      'Bình luận khiếm nhã, thô bỉ về cơ thể của thành viên trong phòng.',
      'Cố tình theo đuổi, spam tin nhắn sau khi đối phương đã từ chối.'
    ],
    penalties: [
      'Ngắt kết nối P2P lập tức giữa hai thiết bị.',
      'Khóa quyền tham gia các phòng chat công cộng trong 48 giờ.'
    ]
  },

  // --- NHÓM TỆP TIN & HÌNH ẢNH ---
  {
    id: '5',
    ruleNumber: 'Luật 5',
    title: 'Phát tán văn hóa phẩm đồi trụy, 18+ & Khiêu dâm',
    category: 'file',
    severity: 'critical',
    severityLabel: 'Mức độ: Nghiêm trọng',
    description: 'Căn cứ Luật An ninh mạng Việt Nam và Luật Quốc tế: Nghiêm cấm TUYỆT ĐỐI việc gửi, lưu trữ hoặc truyền tải hình ảnh, video khiêu dâm, đồi trụy hoặc lạm dụng tình dục trẻ em (CSAM).',
    actions: [
      'Gửi hình ảnh, video lộ bộ phận nhạy cảm, khỏa thân 18+.',
      'Truyền tải các tệp phim ảnh khiêu dâm, văn hóa phẩm đồi trụy.',
      'Bất kỳ hành vi nào liên quan đến hình ảnh bóc lột, xâm hại trẻ em.'
    ],
    penalties: [
      'MỨC PHẠT CAO NHẤT: Khóa vĩnh viễn UID thiết bị, hủy mã PIN.',
      'Đưa địa chỉ IP vào danh sách đen (Blacklist) vĩnh viễn và lưu vết để báo cáo pháp luật.'
    ]
  },
  {
    id: '6',
    ruleNumber: 'Luật 6',
    title: 'Hình ảnh bạo lực cực đoan, kinh dị & Tự hại',
    category: 'file',
    severity: 'critical',
    severityLabel: 'Mức độ: Nghiêm trọng',
    description: 'Nghiêm cấm chia sẻ hình ảnh máu me rùng rợn, tai nạn ghê rợn, hành vi tra tấn thể xác, tự sát, tự gây thương tích hoặc hướng dẫn chế tạo vũ khí.',
    actions: [
      'Chia sẻ ảnh thi thể, vết thương kinh dị không mang tính chất y khoa.',
      'Cổ súy hoặc chia sẻ hình ảnh/video tự làm hại bản thân, tự sát.',
      'Phát tán tài liệu hướng dẫn khủng bố, chế tạo vũ khí, chất nổ nguy hiểm.'
    ],
    penalties: [
      'Hệ thống AI tự động chặn và xóa tệp trước khi truyền đi.',
      'Đình chỉ tài khoản từ 7 ngày đến khóa vĩnh viễn.'
    ]
  },
  {
    id: '7',
    ruleNumber: 'Luật 7',
    title: 'Phát tán virus, mã độc & Đường dẫn lừa đảo (Phishing)',
    category: 'file',
    severity: 'critical',
    severityLabel: 'Mức độ: Nghiêm trọng',
    description: 'Nghiêm cấm truyền tệp chứa mã độc (Malware, Trojan, Ransomware, Keylogger, Zip Bomb) hoặc gửi liên kết lừa đảo nhằm chiếm đoạt dữ liệu, tài khoản của người khác.',
    actions: [
      'Gửi tệp thực thi .exe/.bat/.scr giả mạo ứng dụng hợp pháp.',
      'Gửi tệp zip bomb hoặc tệp lỗi nhằm làm treo đơ máy người nhận.',
      'Gửi đường link lừa đảo mạo danh ngân hàng, mạng xã hội để hack mật khẩu.'
    ],
    penalties: [
      'Khóa tài khoản vĩnh viễn lập tức.',
      'Chặn hàm băm (hash) của tệp trên toàn bộ hệ sinh thái dịch vụ.'
    ]
  },
  {
    id: '8',
    ruleNumber: 'Luật 8',
    title: 'Xâm phạm dữ liệu cá nhân & Bí mật đời tư (Doxxing)',
    category: 'file',
    severity: 'high',
    severityLabel: 'Mức độ: Cao',
    description: 'Nghiêm cấm tiết lộ thông tin định danh cá nhân của người khác mà chưa có sự đồng ý hợp pháp của họ.',
    actions: [
      'Đăng tải ảnh CCCD/CMND, hộ chiếu của người khác lên phòng chat.',
      'Công khai số điện thoại, địa chỉ nhà ở, tài khoản ngân hàng để kêu gọi phá hoại.',
      'Phát tán tài liệu nội bộ, thông tin mật cá nhân.'
    ],
    penalties: [
      'Xóa bỏ toàn bộ nội dung vi phạm ngay lập tức.',
      'Khóa tính năng chuyển tệp và nhắn tin từ 3 đến 14 ngày.'
    ]
  },

  // --- NHÓM HỆ THỐNG & PHÒNG CHAT ---
  {
    id: '9',
    ruleNumber: 'Luật 9',
    title: 'Spam tin nhắn & Phá hoại băng thông hệ thống',
    category: 'system',
    severity: 'medium',
    severityLabel: 'Mức độ: Vừa',
    description: 'Nghiêm cấm hành vi gửi tin nhắn dồn dập, dùng script tự động spam file rác làm nghẽn kênh truyền P2P/Relay của các người dùng khác.',
    actions: [
      'Gửi liên tiếp hàng chục tin nhắn giống nhau trong thời gian ngắn.',
      'Cố tình gửi liên tục nhiều file dung lượng lớn không có sự đồng ý của phòng.',
      'Sử dụng công cụ tự động bot treo làm quá tải phòng trò chuyện.'
    ],
    penalties: [
      'Kích hoạt giới hạn tần suất (Rate Limit), tạm khóa gửi tin 30 - 60 phút.',
      'Chủ phòng có quyền kick ra khỏi phòng ngay lập tức.'
    ]
  },
  {
    id: '10',
    ruleNumber: 'Luật 10',
    title: 'Mạo danh Quản trị viên (Admin/Dev) & Lừa đảo',
    category: 'system',
    severity: 'high',
    severityLabel: 'Mức độ: Cao',
    description: 'Nghiêm cấm đặt tên thiết bị, tên hiển thị hoặc mạo nhận là Quản trị viên, Đội ngũ kỹ thuật của CloudSend nhằm mục đích trục lợi hoặc đe dọa người dùng.',
    actions: [
      'Đặt tên "Hệ thống", "Admin", "Ban Quản Trị" để yêu cầu người khác cung cấp mã PIN.',
      'Giả danh lập trình viên để xin dữ liệu riêng tư hoặc lừa tiền.',
      'Tạo phòng chat giả mạo thông báo trúng thưởng lừa đảo.'
    ],
    penalties: [
      'Thu hồi tên hiển thị, khóa vĩnh viễn tài khoản giả mạo.',
      'Đưa vào danh sách cảnh báo lừa đảo toàn hệ thống.'
    ]
  },
  {
    id: '11',
    ruleNumber: 'Luật 11',
    title: 'Quyền hạn & Trách nhiệm của Chủ phòng chat',
    category: 'system',
    severity: 'low',
    severityLabel: 'Mức độ: Nhẹ',
    description: 'Chủ phòng chat có trách nhiệm quản lý trật tự trong phòng và có quyền xử lý các thành viên vi phạm theo nội quy chung.',
    actions: [
      'Chủ phòng có quyền xóa các tin nhắn vi phạm chuẩn mực văn hóa.',
      'Chủ phòng có quyền Kick (mời ra) những thành viên cố tình spam, gây rối.',
      'Đổi mã bảo mật phòng khi có người lạ xâm nhập quấy phá.'
    ],
    penalties: [
      'Nếu chủ phòng cố ý dung túng cho các hành vi 18+ (Luật 5) hoặc phát tán mã độc (Luật 7), cả phòng sẽ bị xóa và chủ phòng bị xử lý liên đới.'
    ]
  },

  // --- KHUNG XỬ PHẠT CHUNG ---
  {
    id: '12',
    ruleNumber: 'Luật 12',
    title: 'Quy trình xử lý vi phạm & Kháng cáo',
    category: 'sanctions',
    severity: 'low',
    severityLabel: 'Mức độ: Quy định chung',
    description: 'Hệ thống áp dụng các mức chế tài từ nhẹ đến nghiêm trọng dựa trên mức độ ảnh hưởng của hành vi vi phạm.',
    actions: [
      'Mức 1 (Cảnh cáo): Nhắc nhở trực tiếp, hệ thống tự động ẩn hoặc che chắn ***.',
      'Mức 2 (Đình chỉ có thời hạn): Khóa quyền gửi tin/file từ 1 giờ đến 7 ngày.',
      'Mức 3 (Đình chỉ vĩnh viễn): Khóa UID thiết bị và cấm IP truy cập vĩnh viễn.'
    ],
    penalties: [
      'Người dùng bị khóa có thể gửi phản hồi cho Quản trị viên kèm bằng chứng để được xem xét gỡ chặn nếu vi phạm do nhầm lẫn.'
    ]
  }
];

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMandatory?: boolean;
  onAccept?: () => void;
  initialCategory?: 'all' | 'speech' | 'file' | 'system' | 'sanctions';
}

export const RulesModal: React.FC<RulesModalProps> = ({ 
  isOpen, 
  onClose,
  isMandatory = false,
  onAccept,
  initialCategory = 'all'
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'speech' | 'file' | 'system' | 'sanctions'>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasAgreed, setHasAgreed] = useState(false);

  // When mandatory (first login), always display all 12 rules without search or category filtering
  const displayedRules = useMemo(() => {
    if (isMandatory) {
      return COMMUNITY_RULES;
    }
    return COMMUNITY_RULES.filter(rule => {
      const matchCategory = activeCategory === 'all' || rule.category === activeCategory;
      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        rule.ruleNumber.toLowerCase().includes(q) ||
        rule.title.toLowerCase().includes(q) ||
        rule.description.toLowerCase().includes(q) ||
        rule.actions.some(act => act.toLowerCase().includes(q)) ||
        rule.penalties.some(pen => pen.toLowerCase().includes(q))
      );
    });
  }, [isMandatory, activeCategory, searchQuery]);

  if (!isOpen) return null;

  const handleCopyRule = (rule: RuleClause) => {
    const textToCopy = `[Căn cứ ${rule.ruleNumber}: ${rule.title}]\n- Các Hành Vi Cụ Thể:\n${rule.actions.map(a => `+ ${a}`).join('\n')}\n- Căn Cứ Xử Phạt:\n${rule.penalties.map(p => `+ ${p}`).join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(rule.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const renderSeverityBadge = (rule: RuleClause) => {
    switch (rule.severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <Flame className="w-3.5 h-3.5" />
            {rule.severityLabel}
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            {rule.severityLabel}
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Info className="w-3.5 h-3.5" />
            {rule.severityLabel}
          </span>
        );
      case 'low':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {rule.severityLabel}
          </span>
        );
    }
  };

  const handleStartUsing = () => {
    if (!hasAgreed && isMandatory) return;
    if (onAccept) {
      onAccept();
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-modal-title"
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-md">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="rules-modal-title" className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Nội Quy & Điều Khoản Sử Dụng Web
                </h2>
                {isMandatory && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                    Bắt buộc xác nhận
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-300/90 font-medium">
                (Lọc theo các luật an ninh mạng của Việt Nam, luật của các quốc gia và quy định của web)
              </p>
            </div>
          </div>

          {/* Close button only shown when not in mandatory first-login mode */}
          {!isMandatory && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filter & Search Bar - Only shown in normal mode, hidden in mandatory onboarding mode */}
        {!isMandatory && (
          <div className="p-3.5 sm:px-6 border-b border-slate-800 bg-slate-900/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            {/* Categories */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activeCategory === 'all'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Tất cả ({COMMUNITY_RULES.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('speech')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activeCategory === 'speech'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Ngôn từ & Giao tiếp
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('file')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activeCategory === 'file'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Tệp tin & Hình ảnh
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('system')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activeCategory === 'system'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Hệ thống & Phòng chat
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('sanctions')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activeCategory === 'sanctions'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Khung xử phạt
              </button>
            </div>

            {/* Search Box */}
            <div className="relative min-w-[200px] sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm điều luật (ví dụ: Luật 1, 18+, lách luật)..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Notice for First-time Login */}
        {isMandatory && (
          <div className="px-5 sm:px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-200 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Chào mừng bạn đến với CloudSend! Vui lòng xem 12 điều luật dưới đây, tích xác nhận ở cuối trang và nhấn <strong>Bắt đầu sử dụng</strong>.</span>
            </div>
            <span className="text-[11px] font-mono text-amber-300 font-bold shrink-0">12 / 12 Điều luật</span>
          </div>
        )}

        {/* Rules Content List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {displayedRules.map((rule) => {
            const isCopied = copiedId === rule.id;

            return (
              <div
                key={rule.id}
                id={`rule-clause-${rule.id}`}
                className="p-4 sm:p-5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all space-y-3 shadow-sm"
              >
                {/* Top Bar: Title on Left, Mức độ on Top-Right */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-emerald-400">
                      {rule.ruleNumber}: {rule.title}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {rule.description}
                    </p>
                  </div>

                  {/* Mức độ ở trên góc phải */}
                  <div className="shrink-0">
                    {renderSeverityBadge(rule)}
                  </div>
                </div>

                {/* Body: Các hành vi cụ thể */}
                <div className="space-y-2 pt-1 text-xs sm:text-sm">
                  <div>
                    <div className="font-bold text-amber-400 text-xs mb-1">
                      - Các Hành Vi Cụ Thể:
                    </div>
                    <div className="space-y-1 pl-2 sm:pl-3 text-slate-300">
                      {rule.actions.map((act, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-amber-400 font-bold shrink-0">+</span>
                          <span>{act}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Căn cứ xử phạt */}
                  <div className="pt-1">
                    <div className="font-bold text-rose-400 text-xs mb-1">
                      - Căn Cứ Xử Phạt & Chế Tài:
                    </div>
                    <div className="space-y-1 pl-2 sm:pl-3 text-slate-300">
                      {rule.penalties.map((pen, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-rose-400 font-bold shrink-0">+</span>
                          <span>{pen}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Bar: Sao chép ở dưới góc phải */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    Áp dụng cho toàn bộ người dùng trong hệ thống
                  </span>

                  {/* Nút sao chép ở dưới góc phải */}
                  <button
                    type="button"
                    onClick={() => handleCopyRule(rule)}
                    title="Sao chép điều luật để gửi làm căn cứ xử lý vi phạm"
                    className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isCopied
                        ? 'bg-emerald-600 text-white shadow'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                    }`}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? 'Đã sao chép điều luật!' : 'Sao chép'}</span>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Mandatory Confirmation Box at the bottom of 12 rules */}
          {isMandatory && (
            <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-950/30 border-2 border-emerald-500/40 space-y-4 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white">
                    Xác Nhận Chấp Nhận Nội Quy Web CloudSend
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Bằng việc xác nhận chấp nhận, bạn cam kết tuân thủ đầy đủ 12 điều luật trên để giữ an toàn và trải nghiệm tốt cho mọi thành viên.
                  </p>
                </div>
              </div>

              {/* Nút tích xác nhận chấp nhận các luật */}
              <label 
                id="rules-agree-label"
                className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-colors select-none group"
              >
                <input
                  type="checkbox"
                  id="agree-rules-checkbox"
                  checked={hasAgreed}
                  onChange={(e) => setHasAgreed(e.target.checked)}
                  className="w-5 h-5 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500 focus:ring-offset-slate-950 cursor-pointer accent-emerald-500"
                />
                <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
                  Tôi đã đọc và xác nhận chấp nhận các luật của web CloudSend
                </span>
              </label>

              {/* Nút bắt đầu sử dụng */}
              <button
                id="start-using-app-btn"
                type="button"
                disabled={!hasAgreed}
                onClick={handleStartUsing}
                className={`w-full py-3 px-6 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  hasAgreed
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 active:scale-[0.98]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/80'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Bắt đầu sử dụng</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 shrink-0">
          {isMandatory ? (
            <>
              <span className="text-amber-300/80">
                * Kéo xuống cuối trang để tích xác nhận và bắt đầu sử dụng.
              </span>

              <button
                type="button"
                disabled={!hasAgreed}
                onClick={handleStartUsing}
                className={`w-full sm:w-auto px-6 py-2 rounded-xl text-xs font-bold transition-all ${
                  hasAgreed
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                Bắt đầu sử dụng
              </button>
            </>
          ) : (
            <>
              <span>Người dùng có thể sao chép điều luật để nhắc nhở thành viên vi phạm trong phòng chat.</span>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
              >
                Đã hiểu & Đóng
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
