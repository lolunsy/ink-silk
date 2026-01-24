import React, { useState } from 'react';
import { Film, Copy, ChevronLeft, ChevronRight, Edit3, Sparkles, RefreshCw, Save, ChevronDown, ChevronUp, Loader2, Play } from 'lucide-react';
import { cn } from '../../../lib/utils';

const SceneCard = ({ scene, shots, shotImages, actors, onHover, onLeave, isHighlighted, actions, direction, sbAspectRatio, sceneAnchor, mode = "full" }) => {
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  const isEmbedded = mode === "embedded";
  
  // 获取当前激活的版本数据
  const isLiveDraft = scene.activeVersionId === "live";
  const activeVersion = isLiveDraft ? null : scene.versions.find(v => v.id === scene.activeVersionId);
  
  // 当前显示的 prompt
  const currentPrompt = isLiveDraft ? scene.livePrompt : (activeVersion?.prompt || "");
  
  // 当前显示的预览内容
  const currentPreviewFrames = isLiveDraft ? scene.livePreviewFrames : (activeVersion?.assets?.previewFrames || []);
  const currentVideoUrl = isLiveDraft ? null : (activeVersion?.assets?.videoUrl || null);
  
  // 初始化 editedPrompt
  React.useEffect(() => {
    if (!scene.hasManualPrompt) {
      setEditedPrompt(currentPrompt);
    }
  }, [currentPrompt, scene.hasManualPrompt]);
  
  // 切换版本
  const switchVersion = (direction) => {
    const allVersions = ["live", ...scene.versions.map(v => v.id)];
    const currentIndex = allVersions.indexOf(scene.activeVersionId);
    let newIndex = currentIndex + direction;
    
    if (newIndex < 0) newIndex = allVersions.length - 1;
    if (newIndex >= allVersions.length) newIndex = 0;
    
    actions.setUIScenes(prev => prev.map(s => 
      s.id === scene.id ? { ...s, activeVersionId: allVersions[newIndex] } : s
    ));
  };
  
  // 保存版本（Draft）
  const saveVersion = () => {
    const newVersion = {
      id: `v${Date.now()}`,
      createdAt: Date.now(),
      kind: "draft",
      prompt: editedPrompt || currentPrompt,
      assets: { 
        previewFrames: currentPreviewFrames,
        videoUrl: null
      }
    };
    
    actions.setUIScenes(prev => prev.map(s => 
      s.id === scene.id 
        ? { ...s, versions: [...s.versions, newVersion], activeVersionId: newVersion.id }
        : s
    ));
    
    alert("💾 版本已保存");
  };
  
  // Reroll（再来一张）
  const handleReroll = async () => {
    const promptToUse = scene.hasManualPrompt ? editedPrompt : currentPrompt;
    
    setIsGenerating(true);
    try {
      await actions.handleGenSceneVideo(scene.id, promptToUse, scene.liveDuration, scene.liveStartImg);
    } catch (e) {
      alert("生成失败: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // 生成新版本
  const handleGenerate = async () => {
    const promptToUse = editedPrompt || currentPrompt;
    
    setIsGenerating(true);
    try {
      await actions.handleGenSceneVideo(scene.id, promptToUse, scene.liveDuration, scene.liveStartImg);
    } catch (e) {
      alert("生成失败: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // AI 重新融合
  const handleAIRecompose = () => {
    actions.recalculateLivePrompt(scene.id);
    actions.setUIScenes(prev => prev.map(s => 
      s.id === scene.id ? { ...s, hasManualPrompt: false } : s
    ));
    alert("✨ 已重新融合 Prompt");
  };
  
  // 处理手动编辑
  const handlePromptEdit = (value) => {
    setEditedPrompt(value);
    actions.setUIScenes(prev => prev.map(s => 
      s.id === scene.id ? { ...s, hasManualPrompt: true } : s
    ));
  };
  
  // 获取场景包含的 Shot 列表
  const sceneShots = shots.filter(s => scene.shotIds.includes(s.id)).sort((a,b) => a.id - b.id);
  
  return (
    <div 
      id={`scene-${scene.id}`}
      className={cn(
        "bg-slate-900 border-2 rounded-xl overflow-hidden transition-all",
        isHighlighted ? "border-purple-400 ring-2 ring-purple-400/50 shadow-xl scale-[1.02]" : "border-slate-800 hover:border-orange-500/50"
      )}
      onMouseEnter={() => onHover(scene.id)}
      onMouseLeave={() => onLeave()}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: scene.colorTag }}
          />
          <span className="text-sm font-bold text-slate-200">{scene.name}</span>
          <span className="text-xs text-slate-500">({scene.shotIds.length} shots)</span>
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(currentPrompt)}
          className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
          title="复制 Prompt"
        >
          <Copy size={12}/>
        </button>
      </div>
      
      {/* 1. Stage（结果区） */}
      <div className={cn(
        "bg-black relative",
        isEmbedded ? "aspect-[4/3]" : "aspect-video"
      )}>
        {currentVideoUrl ? (
          // 显示视频
          <video src={currentVideoUrl} controls className="w-full h-full object-cover"/>
        ) : currentPreviewFrames.length > 0 ? (
          // 显示预览胶卷条
          <div className="w-full h-full flex items-center justify-center p-2">
            <div className={cn(
              "flex gap-1 overflow-x-auto scrollbar-thin max-w-full",
              isEmbedded ? "flex-wrap justify-center" : "gap-2"
            )}>
              {currentPreviewFrames.map((frame, idx) => (
                <img 
                  key={idx}
                  src={frame} 
                  className={cn(
                    "rounded border border-slate-700 shadow-lg",
                    isEmbedded ? "h-16 w-16 object-cover" : "h-32"
                  )}
                  alt={`Frame ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        ) : (
          // 无预览内容
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <span className={cn("text-sm", isEmbedded && "text-xs")}>无预览内容</span>
          </div>
        )}
        
        {/* 版本切换控制 */}
        <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/80 px-3 py-1.5 rounded-full backdrop-blur">
          <button
            onClick={() => switchVersion(-1)}
            className="text-white hover:text-purple-400 transition-colors"
          >
            <ChevronLeft size={14}/>
          </button>
          <div className="text-xs text-white font-medium min-w-[80px] text-center">
            {isLiveDraft ? (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/>
                Live Draft
              </span>
            ) : (
              <span>{activeVersion?.id} ({activeVersion?.kind})</span>
            )}
          </div>
          <button
            onClick={() => switchVersion(1)}
            className="text-white hover:text-purple-400 transition-colors"
          >
            <ChevronRight size={14}/>
          </button>
        </div>
        
        {/* 版本总数 */}
        <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur">
          {scene.versions.length + 1} 版本
        </div>
      </div>
      
      {/* 2. Editor（编辑区，可折叠） */}
      <div className="border-t border-slate-800">
        <button
          onClick={() => setIsEditorExpanded(!isEditorExpanded)}
          className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Edit3 size={12}/>
            <span>修改最终提示词</span>
            {scene.hasManualPrompt && (
              <span className="text-yellow-400 text-[10px]">✏️ 已手动编辑</span>
            )}
          </div>
          {isEditorExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </button>
        
        {isEditorExpanded && (
          <div className="px-4 pb-4 space-y-2">
            <textarea
              value={editedPrompt}
              onChange={(e) => handlePromptEdit(e.target.value)}
              className="w-full h-32 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 font-mono resize-none focus:ring-1 focus:ring-purple-500 outline-none"
              placeholder="编辑 Scene Prompt..."
            />
            
            {scene.hasManualPrompt && (
              <button
                onClick={handleAIRecompose}
                className="w-full px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded text-xs flex items-center justify-center gap-1.5 hover:bg-indigo-600/30 transition-colors"
              >
                <Sparkles size={12}/>
                AI 重新融合（恢复自动合成）
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* 3. Trigger（操作区） */}
      <div className={cn(
        "border-t border-slate-800 bg-slate-900/50 flex gap-2",
        isEmbedded ? "p-2 flex-col" : "p-3"
      )}>
        <button
          onClick={handleReroll}
          disabled={isGenerating}
          className={cn(
            "px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            isEmbedded ? "flex-1 py-1.5 text-[10px]" : "flex-1 py-2 text-xs"
          )}
          title="不改 prompt，只追加一个新 version"
        >
          {isGenerating ? <Loader2 size={10} className="animate-spin"/> : <RefreshCw size={10}/>}
          {!isEmbedded && "再来一张"}
        </button>
        
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={cn(
            "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded flex items-center justify-center gap-1.5 font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            isEmbedded ? "flex-1 py-1.5 text-[10px] px-2" : "flex-1 py-2 text-xs px-3"
          )}
          title="用 textarea 当前内容生成"
        >
          {isGenerating ? <Loader2 size={10} className="animate-spin"/> : <Sparkles size={10}/>}
          生成{isEmbedded ? "" : "新版本"}
        </button>
        
        <button
          onClick={saveVersion}
          className={cn(
            "bg-green-700 hover:bg-green-600 text-white rounded flex items-center justify-center gap-1.5 font-medium transition-colors",
            isEmbedded ? "flex-1 py-1.5 text-[10px] px-2" : "flex-1 py-2 text-xs px-3"
          )}
          title="不调用生成，只 snapshot 当前状态"
        >
          <Save size={10}/>
          保存{isEmbedded ? "" : "版本"}
        </button>
      </div>
      
      {/* Shot 列表预览（仅 full 模式显示） */}
      {!isEmbedded && (
        <div className="border-t border-slate-800 px-4 py-2 bg-slate-950/50">
          <div className="text-[10px] text-slate-500 mb-1">包含镜头：</div>
          <div className="flex flex-wrap gap-1">
            {sceneShots.map(shot => (
              <span 
                key={shot.id}
                className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] border border-slate-700"
              >
                Shot {shot.id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const SequenceBuilder = ({ data, actions, ui, mode = "full" }) => {
  // Phase 4.5: embedded 模式（右侧 Scene 车间）vs full 模式（专注视图）
  const isEmbedded = mode === "embedded";
  
  return (
    <div className={cn(
      isEmbedded 
        ? "space-y-4" 
        : "grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto pb-20"
    )}>
      {data.scenes.map(scene => (
        <SceneCard
          key={scene.id}
          scene={scene}
          shots={data.shots}
          shotImages={data.shotImages}
          actors={data.actors}
          onHover={actions.setHoverSceneId}
          onLeave={() => actions.setHoverSceneId(null)}
          isHighlighted={ui.hoverShotId && scene.shotIds.includes(ui.hoverShotId)}
          actions={actions}
          direction={data.direction}
          sbAspectRatio={data.sbAspectRatio}
          sceneAnchor={data.sceneAnchor}
          mode={mode}
        />
      ))}
      
      {data.scenes.length === 0 && !isEmbedded && (
        <div className="col-span-full text-center text-slate-600 mt-20">
          <div className="text-lg mb-2">暂无大分镜</div>
          <div className="text-sm text-slate-500">
            请在"分镜 Shot"标签页选中多个镜头，点击"生成大分镜"按钮进行组合
          </div>
        </div>
      )}
    </div>
  );
};
