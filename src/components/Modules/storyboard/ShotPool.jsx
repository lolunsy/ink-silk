import React, { useState, useEffect } from 'react';
import { Film, FileSpreadsheet, Download, X, Layers, Camera, Clock, ChevronLeft, ChevronRight, CheckCircle2, User, Users, MapPin, Loader2, RefreshCw } from 'lucide-react';
import { saveAs } from 'file-saver';
import { cn } from '../../../lib/utils';

const ShotCard = ({ shot, currentAr, shotImages, selectedShotIds, actors, sceneAnchor, onToggleSelection, onAddImage, onPreview, uiScenes, hoverSceneId, onShotHover }) => {
  const history = shotImages[shot.id] || [];
  const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    setVerIndex(history.length > 0 ? history.length - 1 : 0);
  }, [history.length]);
  
  const currentUrl = history[verIndex];
  
  const gen = async () => {
    setLoading(true);
    try {
      let refImages = [];
      
      // 安全获取场景锚点图片（空值保护，使用缓存的 dataUrls）
      const anchorImages = sceneAnchor?._cachedDataUrls || [];
      
      // 规则：若有主角，使用主角图 + 场景锚点图；否则只用场景锚点图
      if (shot.mainCastIds && shot.mainCastIds.length > 0) {
        // 有主角：主角 portrait/sheet（最多2张）+ 场景锚点图
        const actorImages = shot.mainCastIds
          .map(actorId => {
            const actor = actors.find(a => a.id === actorId);
            if (actor) {
              const actorImg = actor.images?.portrait || actor.images?.sheet;
              return actorImg || null;
            }
            return null;
          })
          .filter(Boolean);
        
        refImages = [...actorImages];
        
        // 附加场景锚点图（作为次级参考）
        if (anchorImages.length > 0) {
          refImages = [...refImages, ...anchorImages];
        }
      } else {
        // 无主角：只用场景锚点图（NPC 不使用参考图）
        if (anchorImages.length > 0) {
          refImages = [...anchorImages];
        }
      }
      
      // 限制最多 5 张参考图
      refImages = refImages.slice(0, 5);
      
      const url = await shot._callApi('image', {
        prompt: shot.image_prompt || shot.sora_prompt,
        aspectRatio: currentAr,
        useImg2Img: refImages.length > 0,
        refImages: refImages.length > 0 ? refImages : undefined,
        strength: 0.75
      });
      
      onAddImage(shot.id, url);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handlePreview = () => {
    if (currentUrl) onPreview(currentUrl);
  };
  
  // 判断镜头类型
  const hasMainCast = shot.mainCastIds && shot.mainCastIds.length > 0;
  const hasNPC = shot.npcSpec && shot.npcSpec.trim();
  const isPureScene = !hasMainCast && !hasNPC;
  
  // Phase 4.5: 计算该 Shot 被哪些 Scene 引用
  const referencingScenes = uiScenes.filter(scene => scene.shotIds.includes(shot.id));
  const isHighlightedByHover = hoverSceneId && referencingScenes.some(s => s.id === hoverSceneId);
  
  return (
    <div 
      className={cn(
        "bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group transition-all relative",
        selectedShotIds.includes(shot.id) && "border-orange-500 bg-orange-900/10 ring-1 ring-orange-500",
        isHighlightedByHover ? "border-purple-400 ring-2 ring-purple-400/50 brightness-110 scale-[1.02] shadow-xl z-10" : "hover:border-purple-500/50",
        !isHighlightedByHover && hoverSceneId && "opacity-50"
      )}
      onMouseEnter={() => onShotHover?.(shot.id)}
      onMouseLeave={() => onShotHover?.(null)}
    >
      {/* Phase 4.5: 左边缘色条（幽灵高亮） */}
      <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col">
        {referencingScenes.length === 0 ? (
          <div className="flex-1 bg-slate-600"/>
        ) : referencingScenes.length === 1 ? (
          <div className="flex-1" style={{ backgroundColor: referencingScenes[0].colorTag }}/>
        ) : (
          <>
            {referencingScenes.slice(0, 3).map((scene, idx) => (
              <div 
                key={scene.id} 
                className="flex-1" 
                style={{ backgroundColor: scene.colorTag }}
              />
            ))}
            {referencingScenes.length > 3 && (
              <div 
                className="absolute bottom-1 left-0 w-4 h-4 -ml-1.5 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center text-[8px] text-slate-400 font-bold"
                title={`+${referencingScenes.length - 3} more scenes`}
              >
                +{referencingScenes.length - 3}
              </div>
            )}
          </>
        )}
      </div>
      
      <div className={cn(
        "bg-black relative shrink-0 md:w-72 group/media ml-1",
        currentAr === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video"
      )}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2">
            <Loader2 className="animate-spin"/>
            <span className="text-[10px]">Rendering...</span>
          </div>
        ) : currentUrl ? (
          <div className="relative w-full h-full cursor-zoom-in" onClick={handlePreview}>
            <img src={currentUrl} className="w-full h-full object-cover"/>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); saveAs(currentUrl, `shot_${shot.id}.png`); }}
                className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"
              >
                <Download size={12}/>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); gen(); }}
                className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"
              >
                <RefreshCw size={12}/>
              </button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={gen}
              className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <Camera size={14}/> 生成画面
            </button>
          </div>
        )}
        
        <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur pointer-events-none">
          Shot {shot.id}
        </div>
        
        <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1 pointer-events-none">
          <Clock size={10}/> {shot.duration}
        </div>
        
        {history.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/media:opacity-100 transition-opacity z-20">
            <button
              disabled={verIndex <= 0}
              onClick={(e) => { e.stopPropagation(); setVerIndex(v => v - 1); }}
              className="text-white hover:text-purple-400 disabled:opacity-30"
            >
              <ChevronLeft size={12}/>
            </button>
            <span className="text-[10px] text-white">{verIndex + 1}/{history.length}</span>
            <button
              disabled={verIndex >= history.length - 1}
              onClick={(e) => { e.stopPropagation(); setVerIndex(v => v + 1); }}
              className="text-white hover:text-purple-400 disabled:opacity-30"
            >
              <ChevronRight size={12}/>
            </button>
          </div>
        )}
      </div>
      
      <div
        className="p-4 flex-1 space-y-3 min-w-0 flex flex-col justify-center relative"
        onClick={() => onToggleSelection(shot.id)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelection(shot.id); }}
          className={cn(
            "absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center transition-all",
            selectedShotIds.includes(shot.id)
              ? "bg-orange-500 border-orange-500 text-white"
              : "border-slate-600 text-transparent hover:border-orange-500"
          )}
        >
          <CheckCircle2 size={14}/>
        </button>
        
        <div className="flex items-start justify-between gap-8 pr-6">
          <div className="text-sm text-slate-200 font-medium leading-relaxed">
            {shot.visual}
          </div>
        </div>
        
        {/* 显示主角/NPC/纯场景 */}
        <div className="flex flex-wrap gap-2 text-[10px]" onClick={e => e.stopPropagation()}>
          {hasMainCast && (
            <div className="flex items-center gap-1 px-2 py-1 bg-green-900/30 text-green-300 rounded border border-green-800">
              <User size={10}/>
              <span>主角: {shot.mainCastIds.map(id => actors.find(a => a.id === id)?.name).filter(Boolean).join(", ")}</span>
            </div>
          )}
          
          {hasNPC && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-900/30 text-blue-300 rounded border border-blue-800">
              <Users size={10}/>
              <span>NPC: {shot.npcSpec}</span>
            </div>
          )}
          
          {isPureScene && (
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-700/30 text-slate-400 rounded border border-slate-600">
              <MapPin size={10}/>
              <span>纯场景</span>
            </div>
          )}
        </div>
        
        {shot.audio && (
          <div className="flex gap-2 text-xs">
            <div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400">
              <Film size={12} className="text-purple-400"/>
              {shot.audio}
            </div>
          </div>
        )}
        
        <div className="bg-purple-900/10 border border-purple-900/30 p-2.5 rounded text-[10px] font-mono text-purple-200/70 break-all select-all hover:border-purple-500/50 transition-colors">
          <span className="text-purple-500 font-bold select-none">Sora: </span>
          {shot.sora_prompt}
        </div>
      </div>
    </div>
  );
};

export const ShotPool = ({ data, actions, ui, onSwitchToScenes }) => {
  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-4">
      {/* Sticky Bar */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur py-3 mb-4 border-b border-slate-800/50">
        <div className="flex justify-between items-center mb-3 px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-200">分镜脚本 ({data.shots.length})</h2>
            <button
              onClick={() => actions.setShowAnimatic(true)}
              className="ml-4 flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg"
            >
              <Film size={12}/> 播放预览
            </button>
            {/* Phase 4.5: 迷你 Scene 入口 */}
            {data.uiScenes && data.uiScenes.length > 0 && (
              <button
                onClick={onSwitchToScenes}
                className="ml-2 flex items-center gap-1.5 px-3 py-1 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/50 text-orange-300 text-xs rounded font-medium transition-colors"
                title="查看已创建的大分镜"
              >
                <Layers size={12}/> {data.uiScenes.length} 个大分镜
              </button>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={actions.handleDownloadCSV}
              className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1 transition-colors"
            >
              <FileSpreadsheet size={12}/> 导出 CSV
            </button>
            <button
              onClick={actions.handleDownloadAll}
              className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors"
            >
              <Download size={12}/> 打包全部
            </button>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-500/30 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs text-orange-200/80 flex items-center gap-3">
              <span className="font-bold text-orange-400">① 生成小分镜</span>
              <span className="text-orange-500">→</span>
              <span className="font-bold text-orange-400">② 勾选镜头</span>
              <span className="text-orange-500">→</span>
              <span className="font-bold text-orange-400">③ 组装大分镜</span>
            </div>
            <div className="text-xs font-bold text-orange-300 ml-2">
              已选 {ui.selectedShotIds.length} 条
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ui.selectedShotIds.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.clearSelectedShots();
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium shadow transition-all text-xs"
              >
                <X size={14}/> 清空选择
              </button>
            )}
            <button
              onClick={actions.compileScene}
              disabled={ui.selectedShotIds.length < 1}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all relative group"
              title={ui.selectedShotIds.length < 1 ? "请先勾选小分镜" : ""}
            >
              <Layers size={16}/> 生成大分镜
              {ui.selectedShotIds.length < 1 && (
                <div className="absolute -bottom-10 right-0 bg-slate-800 text-slate-300 text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  ⚠️ 请先勾选小分镜
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Shot Cards */}
      {data.shots.map(s => {
        // 注入 callApi 方法到 shot 对象（临时hack，避免传太多props）
        const shotWithApi = { ...s, _callApi: actions.callApi };
        
        return (
          <div
            key={s.id}
            className={cn(
              "border-2 rounded-xl transition-all",
              ui.selectedShotIds.includes(s.id)
                ? "border-orange-500 bg-orange-900/10 ring-2 ring-orange-500"
                : "border-transparent"
            )}
          >
            <ShotCard
              shot={shotWithApi}
              currentAr={ui.sbAspectRatio}
              shotImages={data.shotImages}
              selectedShotIds={ui.selectedShotIds}
              actors={data.actors}
              sceneAnchor={data.sceneAnchor}
              onToggleSelection={actions.toggleShotSelection}
              onAddImage={actions.addImageToShot}
              onPreview={actions.onPreview}
              uiScenes={data.uiScenes || []}
              hoverSceneId={ui.hoverSceneId}
              onShotHover={actions.setHoverShotId}
            />
          </div>
        );
      })}
      
      {data.shots.length === 0 && (
        <div className="text-center text-slate-500 mt-20">暂无分镜</div>
      )}
    </div>
  );
};

