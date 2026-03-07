import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  LayoutGrid, Search, Box, User, Heart, Download,
  Star, Clock, Globe, Loader2
} from 'lucide-react';
import { RobotPreview } from './RobotPreview';
import { DraggableWindow } from '@/shared/components';
import { translations } from '@/shared/i18n';
import { URDF_STUDIO_MODELS, URDFStudioModel } from '../data';
import { useDraggableWindow, useEffectiveTheme } from '@/shared/hooks';

interface URDFGalleryProps {
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

const RobotThumbnail = ({
  model,
  theme,
  previewLabel
}: {
  model: URDFStudioModel;
  theme?: 'light' | 'dark';
  previewLabel: string;
}) => {
  // Use 3D preview for server-hosted models with urdfPath
  if (model.urdfPath && !model.urdfPath.startsWith('http')) {
    return (
      <RobotPreview
        urdfPath={model.urdfPath}
        urdfFile={model.urdfFile}
        modelId={model.id}
        thumbnail={model.thumbnail}
        theme={theme}
        fallbackLabel={previewLabel}
      />
    );
  }

  // Fallback to placeholder for URL-based models
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-text-tertiary w-full h-full">
      <Box className="w-10 h-10 opacity-40" />
      <span className="text-[9px] uppercase tracking-widest font-medium opacity-60">
        {previewLabel}
      </span>
    </div>
  );
};

export const URDFGallery: React.FC<URDFGalleryProps> = ({ onClose, lang, onImport }) => {
  const t = translations[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // Clear tags when language changes to avoid stale strings
  useEffect(() => {
    setSelectedTags([]);
  }, [lang]);

  // Compute all available tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    URDF_STUDIO_MODELS.forEach(model => {
      const currentTags = lang === 'zh' && model.tags_zh ? model.tags_zh : model.tags;
      currentTags.forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [lang]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };

  const [isDownloading, setIsDownloading] = useState(false);
  const windowState = useDraggableWindow({
    defaultSize: { width: 900, height: 600 },
    minSize: { width: 600, height: 400 },
    centerOnMount: true,
    enableMinimize: true,
  });
  const {
    isMinimized,
    size,
    isResizing,
  } = windowState;

  const theme = useEffectiveTheme();



  const handleImportModel = async (model: URDFStudioModel) => {
    if (!model.urdfPath) return;
    
    setIsDownloading(true);
    try {
      // Request backend to download model (e.g. from Baidu Cloud)
      const token = import.meta.env.VITE_API_TOKEN;
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
      // 1. Category Filter
      if (selectedCategory !== 'all' && model.category !== selectedCategory) {
        return false;
      }
      
      // 2. Tag Filter (Matches ALL selected tags)
      if (selectedTags.length > 0) {
        const modelTags = lang === 'zh' && model.tags_zh ? model.tags_zh : model.tags;
        const hasAllTags = selectedTags.every(tag => modelTags.includes(tag));
        if (!hasAllTags) return false;
      }

      // 3. Search Filter
      const searchLower = searchQuery.toLowerCase();
      const name = (lang === 'zh' && model.name_zh ? model.name_zh : model.name).toLowerCase();
      const desc = (lang === 'zh' && model.description_zh ? model.description_zh : model.description).toLowerCase();
      const tags = (lang === 'zh' && model.tags_zh ? model.tags_zh : model.tags).map(t => t.toLowerCase());

      const matchesSearch = name.includes(searchLower) || 
                            desc.includes(searchLower) ||
                            tags.some(tag => tag.includes(searchLower));

      return matchesSearch;
    });
  }, [searchQuery, selectedCategory, selectedTags, lang]);

  return (
    <>
      {/* Backdrop - no blur */}
      <div 
        className="fixed inset-0 z-[90] bg-black/50"
        onClick={onClose}
      />
      
      {/* Floating Window */}
      <DraggableWindow
        window={windowState}
        onClose={onClose}
        title={
          <>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-element-bg text-text-primary border border-border-black">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-semibold text-text-primary">
                {t.urdfGallery}
              </h1>
            </div>

            {!isMinimized && (
              <div className="hidden md:flex ml-4 relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                <input
                  type="text"
                  placeholder={t.searchModels}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-input-bg border border-border-black rounded-lg py-1.5 pl-9 pr-3 text-xs text-text-primary placeholder:text-text-tertiary focus:ring-2 focus:ring-system-blue/25 focus:border-system-blue transition-all"
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </>
        }
        className="z-[100] bg-panel-bg flex flex-col text-text-primary overflow-hidden rounded-2xl shadow-xl border border-border-black"
        headerClassName="h-12 border-b border-border-black flex items-center justify-between px-4 bg-element-bg shrink-0"
        interactionClassName="select-none"
        draggingClassName="cursor-grabbing"
        headerDraggableClassName="cursor-grab"
        headerDraggingClassName="cursor-grabbing"
        minimizeTitle={t.minimize}
        maximizeTitle={t.maximize}
        restoreTitle={t.restore}
        closeTitle={t.close}
        controlButtonClassName="p-1.5 hover:bg-element-hover rounded-md transition-colors"
        closeButtonClassName="p-1.5 text-text-tertiary hover:bg-red-500 hover:text-white rounded transition-colors"
        rightResizeHandleClassName="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-system-blue/20 transition-colors z-20"
        bottomResizeHandleClassName="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-system-blue/20 transition-colors z-20"
        cornerResizeHandleClassName="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-system-blue/30 transition-colors z-30"
        cornerResizeHandle={
          <svg className="w-4 h-4 text-text-tertiary" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 14H10V12H12V10H14V14Z" />
            <path d="M14 8H12V6H14V8Z" />
            <path d="M8 14H6V12H8V14Z" />
          </svg>
        }
      >

        {/* Content - Hidden when minimized */}
        {!isMinimized && (
          <div className="flex-1 flex overflow-hidden relative">
            {/* Sidebar */}
            <div className="w-48 border-r border-border-black bg-element-bg p-3 overflow-y-auto hidden lg:block">
              <div className="space-y-4">
                <div>
                  <h3 className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-2 px-2">
                    {t.categories}
                  </h3>
                  <div className="space-y-0.5">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all ${
                          selectedCategory === cat.id 
                            ? 'bg-system-blue/10 text-system-blue font-medium' 
                            : 'text-text-secondary hover:bg-element-hover'
                        }`}
                      >
                        <cat.icon className="w-3.5 h-3.5" />
                        {getCategoryName(cat.id, t)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags Section */}
                <div>
                  <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
                    {t.tags}
                  </h3>
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {allTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-2 py-1 text-[10px] rounded-md transition-all border ${
                            isSelected 
                              ? 'bg-[#0060FA] text-white border-[#0060FA]' 
                              : 'bg-white dark:bg-black text-slate-600 dark:text-slate-400 border-slate-200 dark:border-border-black hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto bg-panel-bg">
              <div className="p-4">
                {/* Page Header */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-system-blue text-xs font-medium mb-1">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{t.featuredModels}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-text-primary">
                    {t.findNextProject}
                  </h2>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {filteredModels.map(model => (
                    <div key={model.id} className="group bg-panel-bg rounded-lg border border-border-black hover:border-system-blue overflow-hidden transition-all shadow-sm hover:shadow-lg flex flex-col">
                      {/* Thumbnail Area */}
                      <div className="relative w-full aspect-video overflow-hidden bg-slate-100 dark:bg-black flex items-center justify-center">
                        <RobotThumbnail model={model} theme={theme}  previewLabel={t.preview}/>
                        
                        <div className="absolute top-2 left-2 flex gap-1">
                          <span className="px-1.5 py-0.5 bg-panel-bg text-text-primary text-[9px] font-semibold rounded uppercase shadow-sm border border-border-black">
                            {getCategoryName(model.category, t)}
                          </span>
                        </div>
                        
                        {/* Action Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 pointer-events-none">
                          <button 
                            onClick={() => handleImportModel(model)}
                            className="w-full py-1.5 bg-system-blue-solid text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-system-blue-hover transition-colors pointer-events-auto">
                            <Download className="w-3.5 h-3.5" />
                            {t.importNow}
                          </button>
                        </div>
                      </div>

                      {/* Details */}
                        <div className="p-3 flex-1 flex flex-col">
                          <div className="flex justify-between items-start mb-1">
                          <h3 className="font-semibold text-sm leading-tight text-text-primary group-hover:text-system-blue transition-colors">
                            {lang === 'zh' && model.name_zh ? model.name_zh : model.name}
                          </h3>
                          <button className="text-text-tertiary hover:text-rose-500 transition-colors">
                            <Heart className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-2">
                          <User className="w-3 h-3" />
                          <span>{lang === 'zh' && model.author_zh ? model.author_zh : model.author}</span>
                        </div>

                        <p className="text-xs text-text-secondary line-clamp-2 mb-2 flex-1">
                          {lang === 'zh' && model.description_zh ? model.description_zh : model.description}
                        </p>

                        <div className="flex flex-wrap gap-1 mb-2">
                          {(lang === 'zh' && model.tags_zh ? model.tags_zh : model.tags).slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-element-bg text-text-secondary text-[9px] rounded-full">
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-border-black flex items-center justify-between text-[10px] text-text-tertiary">
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
                    <div className="w-12 h-12 bg-element-bg rounded-full flex items-center justify-center mb-3">
                      <Search className="w-6 h-6 text-text-tertiary" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-1">{t.noModelsFound}</h3>
                    <p className="text-sm text-text-secondary">{t.changeSearchKeywords}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Loading Indicator */}
        {isDownloading && (
          <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-panel-bg shadow-md rounded-lg border border-border-black">
            <Loader2 className="w-4 h-4 text-system-blue animate-spin" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-text-primary">{t.processing}</span>
              <span className="text-[9px] text-text-tertiary">{t.fetchingResources}</span>
            </div>
          </div>
        )}
        
        {/* Resize indicator when resizing */}
        {isResizing && (
          <div className="absolute bottom-2 right-2 z-50 px-2 py-1 bg-system-blue-solid text-white text-[10px] rounded font-mono">
            {size.width} × {size.height}
          </div>
        )}
      </DraggableWindow>
    </>
  );
};

export default URDFGallery;
