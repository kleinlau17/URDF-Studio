/**
 * RobotPreview - Smart preview component
 * Uses pre-recorded animated WebP if available, falls back to 3D rendering
 * This significantly reduces CPU/GPU usage for the URDF Square
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Loader2 } from 'lucide-react';
import { RobotThumbnail3D } from './RobotThumbnail3D';

interface RobotPreviewProps {
  urdfPath: string;
  modelId: string;
  thumbnail?: string;
  urdfFile?: string;
  theme?: 'light' | 'dark';
}

/**
 * RobotPreview - Tries to load animated preview first, falls back to 3D
 */
export const RobotPreview: React.FC<RobotPreviewProps> = ({ 
  urdfPath, 
  modelId,
  thumbnail,
  urdfFile,
  theme = 'dark' 
}) => {
  const [previewType, setPreviewType] = useState<'loading' | 'animated' | '3d'>('loading');
  const [animationUrl, setAnimationUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Lazy loading with IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Check for pre-recorded animation when visible
  useEffect(() => {
    if (!isVisible) return;

    const checkForAnimation = async () => {
      // If thumbnail is not provided, fallback to 3D immediately
      if (!thumbnail) {
        setPreviewType('3d');
        return;
      }

      // Handle Cloud Storage via API
      try {
        const token = (import.meta as any).env.VITE_API_TOKEN;
        const response = await fetch('/api/get-signed-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ filePath: thumbnail }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.url) {
            setAnimationUrl(result.data.url);
            setPreviewType('animated');
            return;
          }
        }
      } catch (e) {
        console.error('[RobotPreview] Failed to check cloud animation:', e);
      }
      
      // 3. Fallback to 3D rendering
      setPreviewType('3d');
    };

    checkForAnimation();
  }, [urdfPath, isVisible, thumbnail]);

  // Loading state
  if (!isVisible || previewType === 'loading') {
    return (
      <div 
        ref={containerRef} 
        className="flex items-center justify-center w-full h-full bg-slate-100 dark:bg-[#000000]"
      >
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Animated preview (WebP)
  if (previewType === 'animated' && animationUrl) {
    return (
      <div 
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: theme === 'light' ? '#f8f9fa' : '#000000' }}
      >
        <img 
          src={animationUrl}
          alt={`${modelId} preview`}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => {
            // If image fails to load, fallback to 3D view
            setPreviewType('3d');
          }}
        />
      </div>
    );
  }

  // 3D fallback
  return (
    <div ref={containerRef} className="w-full h-full">
      <RobotThumbnail3D 
        urdfPath={urdfPath}
        urdfFile={urdfFile}
        theme={theme}
      />
    </div>
  );
};

export default RobotPreview;
