import React from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileCode2,
  FileArchive,
  FileAudio,
  FileVideo,
  FileImage,
  FileQuestion,
  FileBox,
  Presentation,
  BookOpen
} from 'lucide-react';

export type DocumentTypeInfo = {
  label: string;
  badge: string;
  color: string;
  bgLight: string;
  borderLight: string;
  gradient: string;
  ext: string;
};

/**
 * Returns precise metadata, labels, and color theme based on file extension and MIME type.
 */
export function getDocumentTypeInfo(fileName?: string, mimeType?: string): DocumentTypeInfo {
  const name = fileName || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  // PDF Document
  if (ext === 'pdf' || mime.includes('pdf')) {
    return {
      label: 'PDF Document',
      badge: 'PDF',
      color: 'text-rose-400',
      bgLight: 'bg-rose-500/10',
      borderLight: 'border-rose-500/30',
      gradient: 'from-rose-500/20 to-red-600/30',
      ext: 'pdf'
    };
  }

  // Word Document
  if (['docx', 'doc', 'dot', 'dotx', 'odt', 'rtf'].includes(ext) || mime.includes('word') || mime.includes('officedocument.wordprocessingml')) {
    return {
      label: 'Word Document',
      badge: 'DOC',
      color: 'text-blue-400',
      bgLight: 'bg-blue-500/10',
      borderLight: 'border-blue-500/30',
      gradient: 'from-blue-500/20 to-indigo-600/30',
      ext: ext || 'doc'
    };
  }

  // Excel / Spreadsheet
  if (['xlsx', 'xls', 'csv', 'ods', 'tsv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheetml') || mime.includes('csv')) {
    return {
      label: 'Bảng tính Excel',
      badge: ext === 'csv' ? 'CSV' : 'XLS',
      color: 'text-emerald-400',
      bgLight: 'bg-emerald-500/10',
      borderLight: 'border-emerald-500/30',
      gradient: 'from-emerald-500/20 to-teal-600/30',
      ext: ext || 'xls'
    };
  }

  // PowerPoint / Presentation
  if (['pptx', 'ppt', 'odp', 'key'].includes(ext) || mime.includes('presentation') || mime.includes('powerpoint')) {
    return {
      label: 'Bản trình chiếu',
      badge: 'PPT',
      color: 'text-amber-400',
      bgLight: 'bg-amber-500/10',
      borderLight: 'border-amber-500/30',
      gradient: 'from-amber-500/20 to-orange-600/30',
      ext: ext || 'ppt'
    };
  }

  // Plain Text / Markdown / Log / Ebook
  if (['txt', 'md', 'markdown', 'log', 'nfo'].includes(ext) || mime.startsWith('text/plain')) {
    return {
      label: ext === 'md' ? 'Markdown' : 'Tập tin văn bản',
      badge: ext.toUpperCase() || 'TXT',
      color: 'text-slate-300',
      bgLight: 'bg-slate-700/30',
      borderLight: 'border-slate-600/40',
      gradient: 'from-slate-700/30 to-slate-800/40',
      ext: ext || 'txt'
    };
  }

  // E-book formats
  if (['epub', 'mobi', 'azw3', 'djvu'].includes(ext)) {
    return {
      label: 'Sách điện tử',
      badge: ext.toUpperCase(),
      color: 'text-purple-400',
      bgLight: 'bg-purple-500/10',
      borderLight: 'border-purple-500/30',
      gradient: 'from-purple-500/20 to-pink-600/30',
      ext: ext || 'epub'
    };
  }

  // Code / Source files
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'sql', 'sh', 'yaml', 'yml', 'xml'].includes(ext)) {
    return {
      label: 'Mã nguồn / Lập trình',
      badge: ext.toUpperCase(),
      color: 'text-cyan-400',
      bgLight: 'bg-cyan-500/10',
      borderLight: 'border-cyan-500/30',
      gradient: 'from-cyan-500/20 to-blue-600/30',
      ext: ext || 'code'
    };
  }

  // Compressed / Archive
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return {
      label: 'Tệp nén lưu trữ',
      badge: ext.toUpperCase(),
      color: 'text-yellow-400',
      bgLight: 'bg-yellow-500/10',
      borderLight: 'border-yellow-500/30',
      gradient: 'from-yellow-500/20 to-amber-600/30',
      ext: ext || 'zip'
    };
  }

  // Audio
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return {
      label: 'Tập tin âm thanh',
      badge: ext.toUpperCase() || 'AUDIO',
      color: 'text-violet-400',
      bgLight: 'bg-violet-500/10',
      borderLight: 'border-violet-500/30',
      gradient: 'from-violet-500/20 to-fuchsia-600/30',
      ext: ext || 'mp3'
    };
  }

  // Video
  if (mime.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) {
    return {
      label: 'Tập tin Video',
      badge: ext.toUpperCase() || 'VIDEO',
      color: 'text-pink-400',
      bgLight: 'bg-pink-500/10',
      borderLight: 'border-pink-500/30',
      gradient: 'from-pink-500/20 to-rose-600/30',
      ext: ext || 'mp4'
    };
  }

  // Images
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return {
      label: 'Hình ảnh',
      badge: ext.toUpperCase() || 'IMG',
      color: 'text-teal-400',
      bgLight: 'bg-teal-500/10',
      borderLight: 'border-teal-500/30',
      gradient: 'from-teal-500/20 to-emerald-600/30',
      ext: ext || 'img'
    };
  }

  // Default fallback
  return {
    label: ext ? `Tệp ${ext.toUpperCase()}` : 'Tập tin',
    badge: ext ? ext.slice(0, 4).toUpperCase() : 'FILE',
    color: 'text-slate-400',
    bgLight: 'bg-slate-800/40',
    borderLight: 'border-slate-700/50',
    gradient: 'from-slate-800/40 to-slate-900/50',
    ext: ext || 'file'
  };
}

interface FileDocIconProps {
  fileName?: string;
  mimeType?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

/**
 * High-definition Document Icon Component tailored for each file format.
 * Features realistic folder/sheet styling with colorful badges.
 */
export const FileDocIcon: React.FC<FileDocIconProps> = ({
  fileName,
  mimeType,
  className = '',
  size = 'md'
}) => {
  const info = getDocumentTypeInfo(fileName, mimeType);
  const ext = info.ext;

  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg text-xs',
    md: 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl text-xs',
    lg: 'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl text-sm',
    hero: 'w-20 h-20 rounded-2xl text-base'
  }[size];

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5 sm:w-6 sm:h-6',
    lg: 'w-7 h-7 sm:w-8 sm:h-8',
    hero: 'w-10 h-10'
  }[size];

  // Specific Icon matching
  const renderIconGraphic = () => {
    if (ext === 'pdf') {
      return <FileText className={iconSizes} />;
    }
    if (['docx', 'doc', 'odt', 'rtf'].includes(ext)) {
      return <FileText className={iconSizes} />;
    }
    if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) {
      return <FileSpreadsheet className={iconSizes} />;
    }
    if (['pptx', 'ppt', 'key', 'odp'].includes(ext)) {
      return <Presentation className={iconSizes} />;
    }
    if (['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'py', 'java', 'sql', 'sh'].includes(ext)) {
      return <FileCode2 className={iconSizes} />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <FileArchive className={iconSizes} />;
    }
    if (['epub', 'mobi'].includes(ext)) {
      return <BookOpen className={iconSizes} />;
    }
    if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) {
      return <FileAudio className={iconSizes} />;
    }
    if (['mp4', 'mkv', 'mov', 'webm'].includes(ext)) {
      return <FileVideo className={iconSizes} />;
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return <FileImage className={iconSizes} />;
    }
    if (['apk', 'dmg', 'exe', 'iso'].includes(ext)) {
      return <FileBox className={iconSizes} />;
    }
    return <FileQuestion className={iconSizes} />;
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-center shrink-0 select-none shadow-sm transition-transform group-hover:scale-105 border ${info.bgLight} ${info.borderLight} ${info.color} ${sizeClasses} ${className}`}
      title={info.label}
    >
      {renderIconGraphic()}
      
      {/* File type badge sticker */}
      {info.badge && (
        <span
          className={`absolute -bottom-1 -right-1 px-1 py-0.2 rounded font-extrabold uppercase tracking-wider text-[8px] sm:text-[9px] shadow-sm leading-tight border ${info.borderLight} bg-slate-950/90 ${info.color}`}
        >
          {info.badge}
        </span>
      )}
    </div>
  );
};
