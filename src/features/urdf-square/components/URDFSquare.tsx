import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  X, LayoutGrid, Search, Box, User, Heart, Download,
  Star, Clock, Globe, Loader2,
  Minimize2, Maximize2, Minus
} from 'lucide-react';
import { RobotPreview } from './RobotPreview';
import { translations } from '@/shared/i18n';
import { URDF_STUDIO_MODELS, URDFStudioModel } from '../data';

interface URDFSquareProps {
  onClose: () => void;
  lang: 'en' | 'zh';
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}



const CATEGORIES = [
  { id: 'all', icon: Box },
  { id: 'Full Robots', icon: User },
  { id: 'End-effectors', icon: Box },
  { id: 'Sensors', icon: Box },
  { id: 'Articulated Objects', icon: Globe },
  { id: 'Data Assets', icon: Box },
];

// Get translated category name
const getCategoryName = (categoryId: string, t: typeof translations['en']) => {
  switch (categoryId) {
    case 'all': return t.allModels;
    case 'Full Robots': return t.fullRobots;
    case 'End-effectors': return t.endEffectors;
    case 'Sensors': return t.sensors;
    case 'Articulated Objects': return t.articulatedObjects;
    case 'Data Assets': return t.dataAssets;
    default: return categoryId;
  }
};

const RobotThumbnail = ({ model, theme }: { model: URDFStudioModel; theme?: 'light' | 'dark' }) => {
  // Use 3D preview for server-hosted models with urdfPath
  if (model.urdfPath && !model.urdfPath.startsWith('http')) {
    return (
      <RobotPreview
        urdfPath={model.urdfPath}
        urdfFile={model.urdfFile}
        modelId={model.id}
        thumbnail={model.thumbnail}
        theme={theme}
      />
    );
  }

  // Fallback to placeholder for URL-based models
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 w-full h-full">
      <Box className="w-10 h-10 opacity-40" />
      <span className="text-[9px] uppercase tracking-widest font-medium opacity-60">
        Preview
      </span>
    </div>
  );
};

export const URDFSquare: React.FC<URDFSquareProps> = ({ onClose, lang, onImport }) => {
  const t = translations[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Detect theme from document class
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
    
    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  
  // Draggable state
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<'right' | 'bottom' | 'corner' | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Center the window on mount
  useEffect(() => {
    const centerX = (window.innerWidth - size.width) / 2;
    const centerY = (window.innerHeight - size.height) / 2;
    setPosition({ x: Math.max(0, centerX), y: Math.max(0, centerY) });
  }, []);

  // Handle mouse down on header for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  }, [position, isMaximized]);

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, size.width]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent, direction: 'right' | 'bottom' | 'corner') => {
    if (isMaximized || isMinimized) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    };
  }, [isMaximized, isMinimized, size]);

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeDirection) return;
      
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;
      const minWidth = 600;
      const minHeight = 400;
      const maxWidth = window.innerWidth - position.x;
      const maxHeight = window.innerHeight - position.y;
      
      if (resizeDirection === 'right' || resizeDirection === 'corner') {
        const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStartRef.current.width + deltaX));
        setSize(prev => ({ ...prev, width: newWidth }));
      }
      
      if (resizeDirection === 'bottom' || resizeDirection === 'corner') {
        const newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStartRef.current.height + deltaY));
        setSize(prev => ({ ...prev, height: newHeight }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeDirection, position.x, position.y]);



  const handleImportModel = async (model: URDFStudioModel) => {
    if (!model.urdfPath) return;
    
    setIsDownloading(true);
    try {
      // Request backend to download model (e.g. from Baidu Cloud)
      const token = (import.meta as any).env.VITE_API_TOKEN;
      const response = await fetch('/api/download-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ urdfPath: model.urdfPath }),
      });

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success || !result.data?.files) {
         throw new Error(result.message || 'Failed to list files');
      }

      const filesData = result.data.files as { path: string, url: string }[];
      
      // Determine root folder name based on urdfPath (e.g. "go2_description")
      const rootFolderName = model.urdfPath.split('/').filter(Boolean).pop() || model.id;

      // Download all files in parallel
      const fileObjects = await Promise.all(filesData.map(async (fileInfo) => {
          const res = await fetch(fileInfo.url);
          if (!res.ok) throw new Error(`Failed to download ${fileInfo.path}`);
          const blob = await res.blob();
          
          // Get filename from path
          const fileName = fileInfo.path.split('/').pop() || 'unknown';
          
          const file = new File([blob], fileName, { type: blob.type });
          
          // Set webkitRelativePath property (critical for folder structure)
          // Ensure path separators are normalized if needed, though they usually come as /
          const relativePath = `${rootFolderName}/${fileInfo.path}`;
          
          Object.defineProperty(file, 'webkitRelativePath', {
              value: relativePath
          });
          
          return file;
      }));

      // Create mock event
      const mockEvent = {
          target: {
              files: fileObjects
          }
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      // Trigger import
      onImport(mockEvent);
      setIsDownloading(false);
      onClose();
      
    } catch (err: any) {
      setIsDownloading(false);
      console.error('Failed to import model details:', {
        message: err.message,
        stack: err.stack,
        original: err
      });
      alert(lang === 'zh' 
        ? `请求后端失败: ${err.message}` 
        : `Failed to request backend: ${err.message}`);
    }
  };

  const filteredModels = useMemo(() => {
    return URDF_STUDIO_MODELS.filter(model => {
      const matchesSearch = model.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            model.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            model.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || model.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
    setIsMinimized(false);
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  // Get window style based on state
  const getWindowStyle = (): React.CSSProperties => {
    if (isMaximized) {
      return {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
      };
    }
    if (isMinimized) {
      return {
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: 48,
      };
    }
    return {
      position: 'fixed',
      left: position.x,
      top: position.y,
      width: size.width,
      height: size.height,
    };
  };

  return (
    <>
      {/* Backdrop - no blur */}
      <div 
        className="fixed inset-0 z-[90] bg-black/50"
        onClick={onClose}
      />
      
      {/* Floating Window */}
      <div
        ref={containerRef}
        style={getWindowStyle()}
        className={`z-[100] bg-white dark:bg-panel-bg flex flex-col text-slate-900 dark:text-slate-100 overflow-hidden rounded-xl shadow-2xl dark:shadow-black border border-slate-200 dark:border-border-black ${
          isDragging || isResizing ? 'select-none' : ''
        } ${isDragging ? 'cursor-grabbing' : ''}`}
      >
        {/* Resize handles - only show when not maximized or minimized */}
        {!isMaximized && !isMinimized && (
          <>
            {/* Right edge resize handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-[#0060FA]/20 transition-colors z-20"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
            />
            {/* Bottom edge resize handle */}
            <div
              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-[#0060FA]/20 transition-colors z-20"
              onMouseDown={(e) => handleResizeStart(e, 'bottom')}
            />
            {/* Bottom-right corner resize handle */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-[#0060FA]/30 transition-colors z-30"
              onMouseDown={(e) => handleResizeStart(e, 'corner')}
            >
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 16 16" fill="currentColor">
                <path d="M14 14H10V12H12V10H14V14Z" />
                <path d="M14 8H12V6H14V8Z" />
                <path d="M8 14H6V12H8V14Z" />
              </svg>
            </div>
          </>
        )}
        {/* Window Header - Draggable */}
        <div 
          className={`h-12 border-b border-slate-200 dark:border-border-black flex items-center justify-between px-4 bg-slate-50 dark:bg-element-active shrink-0 ${
            !isMaximized ? 'cursor-grab' : ''
          } ${isDragging ? 'cursor-grabbing' : ''}`}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-[#0060FA] rounded-lg text-white">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-bold tracking-tight">
                {t.urdfSquare}
              </h1>
            </div>
            
            {!isMinimized && (
              <div className="hidden md:flex ml-4 relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text"
                  placeholder={t.searchModels}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white dark:bg-black border border-slate-200 dark:border-element-hover rounded-lg py-1.5 pl-9 pr-3 text-xs focus:ring-2 focus:ring-[#0060FA] transition-all"
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button 
              onClick={toggleMinimize}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-element-hover rounded-md transition-colors"
              title={t.minimize}
            >
              <Minus className="w-4 h-4 text-slate-500" />
            </button>
            <button 
              onClick={toggleMaximize}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-element-hover rounded-md transition-colors"
              title={isMaximized ? t.restore : t.maximize}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4 text-slate-500" /> : <Maximize2 className="w-4 h-4 text-slate-500" />}
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:bg-red-500 hover:text-white dark:text-slate-400 dark:hover:bg-red-600 dark:hover:text-white rounded transition-colors"
              title={t.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content - Hidden when minimized */}
        {!isMinimized && (
          <div className="flex-1 flex overflow-hidden relative">
            {/* Sidebar */}
            <div className="w-48 border-r border-slate-200 dark:border-border-black bg-slate-50 dark:bg-panel-bg p-3 overflow-y-auto hidden lg:block">
              <div className="space-y-4">
                <div>
                  <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
                    {t.categories}
                  </h3>
                  <div className="space-y-0.5">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all ${
                          selectedCategory === cat.id 
                            ? 'bg-[#0060FA]/10 dark:bg-[#0060FA] text-[#0060FA] dark:text-white font-medium' 
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-element-hover'
                        }`}
                      >
                        <cat.icon className="w-3.5 h-3.5" />
                        {getCategoryName(cat.id, t)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-[#151515]">
              <div className="p-4">
                {/* Page Header */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-[#0060FA] dark:text-[#0060FA] text-xs font-medium mb-1">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{t.featuredModels}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                    {t.findNextProject}
                  </h2>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {filteredModels.map(model => (
                    <div key={model.id} className="group bg-white dark:bg-panel-bg rounded-lg border border-slate-200 dark:border-border-black hover:border-[#0060FA] dark:hover:border-[#0060FA] overflow-hidden transition-all shadow-md hover:shadow-2xl dark:shadow-black flex flex-col">
                      {/* Thumbnail Area */}
                      <div className="relative w-full aspect-video overflow-hidden bg-slate-100 dark:bg-black flex items-center justify-center">
                        <RobotThumbnail model={model} theme={theme} />
                        
                        <div className="absolute top-2 left-2 flex gap-1">
                          <span className="px-1.5 py-0.5 bg-white/90 dark:bg-black/80 text-slate-900 dark:text-white text-[9px] font-bold rounded uppercase shadow-sm backdrop-blur-[2px]">
                            {getCategoryName(model.category, t)}
                          </span>
                        </div>
                        
                        {/* Action Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 pointer-events-none">
                          <button 
                            onClick={() => handleImportModel(model)}
                            className="w-full py-1.5 bg-white dark:bg-[#0060FA] text-slate-900 dark:text-white rounded-md text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#0060FA] dark:hover:bg-blue-600 hover:text-white transition-colors pointer-events-auto">
                            <Download className="w-3.5 h-3.5" />
                            {t.importNow}
                          </button>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="p-3 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-sm leading-tight group-hover:text-[#0060FA] transition-colors">
                            {lang === 'zh' && model.name_zh ? model.name_zh : model.name}
                          </h3>
                          <button className="text-slate-400 hover:text-red-500 transition-colors">
                            <Heart className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                          <User className="w-3 h-3" />
                          <span>{lang === 'zh' && model.author_zh ? model.author_zh : model.author}</span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2 flex-1">
                          {lang === 'zh' && model.description_zh ? model.description_zh : model.description}
                        </p>

                        <div className="flex flex-wrap gap-1 mb-2">
                          {(lang === 'zh' && model.tags_zh ? model.tags_zh : model.tags).slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-slate-100 dark:bg-app-bg text-slate-600 dark:text-slate-300 text-[9px] rounded-full">
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-border-black flex items-center justify-between text-[10px] text-slate-400">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              <span>{model.stars}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              <span>{model.downloads}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{model.lastUpdated}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredModels.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-app-bg rounded-full flex items-center justify-center mb-3">
                      <Search className="w-6 h-6 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">{t.noModelsFound}</h3>
                    <p className="text-sm text-slate-500">{t.changeSearchKeywords}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Loading Indicator */}
        {isDownloading && (
          <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-white dark:bg-panel-bg shadow-md dark:shadow-xl rounded-lg border border-slate-200 dark:border-border-black">
            <Loader2 className="w-4 h-4 text-[#0060FA] animate-spin" />
            <div className="flex flex-col">
              <span className="text-xs font-bold">{t.processing}</span>
              <span className="text-[9px] text-slate-500">{t.fetchingResources}</span>
            </div>
          </div>
        )}
        
        {/* Resize indicator when resizing */}
        {isResizing && (
          <div className="absolute bottom-2 right-2 z-50 px-2 py-1 bg-[#0060FA] text-white text-[10px] rounded font-mono">
            {size.width} × {size.height}
          </div>
        )}
      </div>
    </>
  );
};

export default URDFSquare;
