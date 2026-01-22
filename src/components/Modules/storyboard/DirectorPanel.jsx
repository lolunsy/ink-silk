import React, { useRef, useEffect } from 'react';
import { Clapperboard, Trash2, FileText, Video, Settings, Sliders, Upload, X, ImageIcon, Mic, Film, Loader2, MessageSquare, Send, User, MapPin, Plus, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '../../../lib/utils';

export const DirectorPanel = ({ data, actions, ui }) => {
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data.messages, data.pendingUpdate]);

  const ChangePreview = () => {
    if (!data.pendingUpdate) return null;
    const updates = Array.isArray(data.pendingUpdate) ? data.pendingUpdate : [data.pendingUpdate];
    
    return (
      <div className="bg-slate-800/90 border border-purple-500/50 rounded-lg p-3 my-2 text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <div className="flex justify-between items-center mb-2 pb-2 border-b border-purple-500/20">
          <span className="font-bold text-purple-300 flex items-center gap-2">
            <Settings size={12}/> 修改方案 ({updates.length})
          </span>
          <button onClick={actions.applyUpdate} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded flex items-center gap-1 shadow">
            <CheckCircle2 size={10}/> 应用
          </button>
        </div>
        <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-1">
          {updates.map((u, i) => (
            <div key={i} className="bg-slate-900/50 p-2.5 rounded border-l-2 border-purple-500">
              <div className="font-mono text-slate-400 mb-1 font-bold">Shot {u.id}</div>
              <div className="text-slate-300 whitespace-pre-wrap leading-relaxed text-[10px]">
                {u.sora_prompt && <div className="mb-1"><span className="text-purple-400 font-bold">Prompt:</span> {u.sora_prompt}</div>}
                {u.mainCastIds && <div className="mb-1"><span className="text-green-400 font-bold">主角:</span> {u.mainCastIds.map(id => data.actors.find(a => a.id === id)?.name).filter(Boolean).join(", ") || "(无)"}</div>}
                {u.npcSpec && <div className="mb-1"><span className="text-blue-400 font-bold">NPC:</span> {u.npcSpec}</div>}
                {u.duration && <div><span className="text-orange-400 font-bold">时长:</span> {u.duration}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-200 flex gap-2">
          <Clapperboard size={16}/> 导演控制台
        </h2>
        <button onClick={actions.clearAll} className="text-slate-500 hover:text-red-400">
          <Trash2 size={14}/>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
        {/* 创作起点 Tab */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-3">
          <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2">
            <Film size={12}/> 创作起点
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-950/50 p-1 rounded-lg">
            <button
              onClick={() => actions.setStoryInputMode('text')}
              className={cn(
                "flex-1 px-2 py-1.5 text-[10px] rounded transition-all font-medium",
                data.storyInput.mode === 'text' 
                  ? "bg-purple-600 text-white shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <FileText size={10} className="inline mr-1"/> 文本
            </button>
            <button
              onClick={() => actions.setStoryInputMode('image')}
              className={cn(
                "flex-1 px-2 py-1.5 text-[10px] rounded transition-all font-medium",
                data.storyInput.mode === 'image' 
                  ? "bg-purple-600 text-white shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <ImageIcon size={10} className="inline mr-1"/> 母图
            </button>
            <button
              onClick={() => actions.setStoryInputMode('audio')}
              className={cn(
                "flex-1 px-2 py-1.5 text-[10px] rounded transition-all font-medium",
                data.storyInput.mode === 'audio' 
                  ? "bg-purple-600 text-white shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Mic size={10} className="inline mr-1"/> 音频
            </button>
            <button
              onClick={() => actions.setStoryInputMode('video')}
              className={cn(
                "flex-1 px-2 py-1.5 text-[10px] rounded transition-all font-medium",
                data.storyInput.mode === 'video' 
                  ? "bg-purple-600 text-white shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Video size={10} className="inline mr-1"/> 视频
            </button>
          </div>
          
          {/* Tab Content */}
          <div className="space-y-2">
            {data.storyInput.mode === 'text' && (
              <div className="text-[10px] text-slate-400 mb-1">
                通过文字描述创建分镜
              </div>
            )}
            
            {data.storyInput.mode === 'image' && (
              <div className="space-y-3">
                <div className="text-[10px] text-slate-400 mb-1">
                  上传单张母图作为视觉起点（非场景锚点）
                </div>
                {data.storyInput.image ? (
                  <div className="relative">
                    <img src={data.storyInput.image.dataUrl} className="w-full rounded border border-slate-600" alt="母图"/>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[9px] text-slate-500 truncate">{data.storyInput.image.name}</span>
                      <button
                        onClick={actions.clearCurrentModeAsset}
                        className="px-2 py-1 bg-red-600/20 text-red-400 text-[9px] rounded border border-red-600/30 hover:bg-red-600/30"
                      >
                        清除
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="block">
                    <div className="border-2 border-dashed border-purple-500/30 rounded-lg p-4 hover:border-purple-500 transition-colors cursor-pointer flex flex-col items-center gap-2">
                      <Upload size={20} className="text-purple-400"/>
                      <span className="text-[10px] text-purple-300">上传母图</span>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={actions.handleSourceImageUpload} 
                      className="hidden"
                    />
                  </label>
                )}
                
                {/* 母图解析区块 */}
                {data.storyInput.image && (
                  <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                        <Sliders size={10}/> 母图解析（自动）
                      </span>
                      {data.storyInput.imageBrief && !data.isAnalyzingImage && (
                        <span className="text-[9px] text-green-400">✓ 已解析</span>
                      )}
                      {data.isAnalyzingImage && (
                        <span className="text-[9px] text-yellow-400 flex items-center gap-1">
                          <Loader2 size={8} className="animate-spin"/> 解析中...
                        </span>
                      )}
                      {!data.storyInput.imageBrief && !data.isAnalyzingImage && (
                        <span className="text-[9px] text-slate-500">未解析</span>
                      )}
                    </div>
                    
                    {data.storyInput.imageBrief && (
                      <textarea
                        value={data.storyInput.imageBrief}
                        onChange={(e) => actions.updateImageBrief(e.target.value)}
                        className="w-full h-32 bg-slate-900/50 border border-indigo-500/30 rounded p-2 text-[9px] text-slate-300 font-mono resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                        placeholder="母图解析结果..."
                      />
                    )}
                    
                    <div className="flex gap-2">
                      {!data.storyInput.imageBrief ? (
                        <button
                          onClick={() => actions.handleAnalyzeImage(false)}
                          disabled={data.isAnalyzingImage}
                          className="flex-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                          {data.isAnalyzingImage ? <Loader2 size={10} className="animate-spin"/> : <Sliders size={10}/>}
                          解析母图
                        </button>
                      ) : (
                        <button
                          onClick={() => actions.handleAnalyzeImage(true)}
                          disabled={data.isAnalyzingImage}
                          className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                          {data.isAnalyzingImage ? <Loader2 size={10} className="animate-spin"/> : <RefreshCw size={10}/>}
                          重新解析
                        </button>
                      )}
                    </div>
                    
                    <div className="text-[9px] text-indigo-200/60">
                      💡 解析结果可手动编辑，用于指导小分镜生成
                    </div>
                  </div>
                )}
                
                {/* 母图模式优先级说明 */}
                <div className="bg-purple-900/20 border border-purple-500/30 rounded p-2 space-y-1 text-[9px] text-purple-200/80">
                  <div>· 母图：故事/镜头起点（Primary）</div>
                  <div>· 主角池：人物一致性约束（Secondary）</div>
                  <div>· 场景锚点：世界一致性约束（Secondary）</div>
                </div>
                
                {/* 场景锚点叠加开关 */}
                <label className="flex items-start gap-2 cursor-pointer bg-slate-900/50 p-2 rounded border border-slate-700 hover:border-purple-500/50 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={ui.includeSceneAnchorInSourceMode}
                    onChange={(e) => actions.setIncludeSceneAnchorInSourceMode(e.target.checked)}
                    className="mt-0.5 accent-purple-600"
                  />
                  <div className="flex-1">
                    <div className="text-[10px] text-slate-300 leading-relaxed">
                      在母图模式中叠加【场景锚点图片】作为次级参考
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">
                      若感觉结果被"场景图带跑"，关闭此开关
                    </div>
                  </div>
                </label>
              </div>
            )}
            
            {data.storyInput.mode === 'audio' && (
              <div className="space-y-2">
                <div className="text-[10px] text-orange-400 bg-orange-900/20 border border-orange-600/30 rounded p-2 mb-2">
                  ⚠️ 音频模式未实装（暂不参与生成）
                </div>
                {data.storyInput.audio ? (
                  <div className="bg-slate-900 border border-slate-700 rounded p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Mic size={12} className="text-purple-400"/>
                      <span className="text-[10px] text-slate-300 truncate flex-1">{data.storyInput.audio.name}</span>
                    </div>
                    <div className="text-[9px] text-slate-500">{actions.formatFileSize(data.storyInput.audio.size)}</div>
                    <button
                      onClick={actions.clearCurrentModeAsset}
                      className="w-full px-2 py-1 bg-red-600/20 text-red-400 text-[9px] rounded border border-red-600/30 hover:bg-red-600/30"
                    >
                      清除
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 hover:border-slate-500 transition-colors cursor-pointer flex flex-col items-center gap-2">
                      <Upload size={20} className="text-slate-400"/>
                      <span className="text-[10px] text-slate-400">上传音频文件</span>
                    </div>
                    <input 
                      type="file" 
                      accept="audio/*" 
                      onChange={actions.handleAudioUpload} 
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}
            
            {data.storyInput.mode === 'video' && (
              <div className="space-y-2">
                <div className="text-[10px] text-orange-400 bg-orange-900/20 border border-orange-600/30 rounded p-2 mb-2">
                  ⚠️ 视频模式未实装（暂不参与生成）
                </div>
                {data.storyInput.video ? (
                  <div className="bg-slate-900 border border-slate-700 rounded p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Video size={12} className="text-purple-400"/>
                      <span className="text-[10px] text-slate-300 truncate flex-1">{data.storyInput.video.name}</span>
                    </div>
                    <div className="text-[9px] text-slate-500">{actions.formatFileSize(data.storyInput.video.size)}</div>
                    <button
                      onClick={actions.clearCurrentModeAsset}
                      className="w-full px-2 py-1 bg-red-600/20 text-red-400 text-[9px] rounded border border-red-600/30 hover:bg-red-600/30"
                    >
                      清除
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 hover:border-slate-500 transition-colors cursor-pointer flex flex-col items-center gap-2">
                      <Upload size={20} className="text-slate-400"/>
                      <span className="text-[10px] text-slate-400">上传视频文件</span>
                    </div>
                    <input 
                      type="file" 
                      accept="video/*" 
                      onChange={actions.handleVideoUpload} 
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* 剧本/导演意图 */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-3">
          {data.storyInput.mode === 'image' && (
            <div className="text-[10px] text-blue-300 bg-blue-900/20 border border-blue-500/30 rounded p-2 mb-2">
              💡 建议填写导演意图以控制镜头拆解；不填将主要依赖母图推断
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <FileText size={10}/> 剧本 / 台词 {data.storyInput.mode === 'text' && <span className="text-red-400">*</span>}
            </label>
            <textarea 
              value={data.script} 
              onChange={e => actions.setScript(e.target.value)} 
              className="w-full h-20 bg-slate-900 border-slate-700 rounded p-2 text-[10px] focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600" 
              placeholder="例如：(旁白) 2077年，霓虹灯下的雨夜..."
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <Video size={10}/> 导演意图 {data.storyInput.mode === 'text' && <span className="text-red-400">*</span>}
            </label>
            <textarea 
              value={data.direction} 
              onChange={e => actions.setDirection(e.target.value)} 
              className="w-full h-16 bg-slate-900 border-slate-700 rounded p-2 text-[10px] focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600" 
              placeholder="例如：赛博朋克风格，雨夜霓虹..."
            />
          </div>
        </div>
        
        {/* 主角池选择 */}
        <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-500/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-green-300 flex items-center gap-1.5">
              <User size={12}/> 主角池（最多 2 个）
            </label>
            {data.storyInput.mode === 'image' && (
              <button
                onClick={() => actions.toggleShowMainActorsInImageMode()}
                className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 transition-colors"
              >
                {ui.showMainActorsInImageMode ? '收起' : '展开'}
                <ChevronRight size={12} className={cn("transition-transform", ui.showMainActorsInImageMode && "rotate-90")}/>
              </button>
            )}
          </div>
          
          {/* 母图模式下的说明提示 */}
          {data.storyInput.mode === 'image' && !ui.showMainActorsInImageMode && (
            <div className="text-[10px] text-green-200/70 bg-green-900/20 border border-green-700/30 rounded p-2 leading-relaxed">
              母图为主参考。如需叠加演员/场景，请展开后手动确认，避免参考混乱。
            </div>
          )}
          
          {/* 内容区域 */}
          {(data.storyInput.mode !== 'image' || ui.showMainActorsInImageMode) && (
            <>
              <div className="text-[10px] text-green-200/60 mb-2">
                来自演员库的资产级角色，保持跨镜头一致性
              </div>
              
              {data.actors.length === 0 ? (
                <div className="text-[10px] text-slate-500 p-2 bg-slate-800/50 rounded">
                  暂无演员，请先在"角色工坊"签约演员
                </div>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                  {data.actors.map(actor => (
                    <button
                      key={actor.id}
                      onClick={() => actions.toggleMainActor(actor.id)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded text-[10px] flex items-center justify-between transition-all",
                        data.mainActorIds.includes(actor.id)
                          ? "bg-green-600 text-white border border-green-500"
                          : "bg-slate-800 text-slate-300 border border-slate-700 hover:border-green-500"
                      )}
                    >
                      <span>{actor.name}</span>
                      {data.mainActorIds.includes(actor.id) && <CheckCircle2 size={12}/>}
                    </button>
                  ))}
                </div>
              )}
              
              <div className="text-[10px] text-green-300/80 flex items-center gap-1">
                <span>已选: {data.mainActorIds.length}/2</span>
              </div>
            </>
          )}
        </div>
        
        {/* 场景锚点 */}
        <div className="bg-gradient-to-r from-blue-900/20 to-cyan-900/20 border border-blue-500/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
              <MapPin size={12}/> 场景锚点
            </label>
            {data.storyInput.mode === 'image' && (
              <button
                onClick={() => actions.toggleShowSceneAnchorInImageMode()}
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                {ui.showSceneAnchorInImageMode ? '收起' : '展开'}
                <ChevronRight size={12} className={cn("transition-transform", ui.showSceneAnchorInImageMode && "rotate-90")}/>
              </button>
            )}
          </div>
          
          {/* 母图模式下的说明提示 */}
          {data.storyInput.mode === 'image' && !ui.showSceneAnchorInImageMode && (
            <div className="text-[10px] text-blue-200/70 bg-blue-900/20 border border-blue-700/30 rounded p-2 leading-relaxed">
              母图为主参考。如需叠加演员/场景，请展开后手动确认，避免参考混乱。
            </div>
          )}
          
          {/* 内容区域 */}
          {(data.storyInput.mode !== 'image' || ui.showSceneAnchorInImageMode) && (
            <>
              <div className="text-[10px] text-blue-200/60 mb-2">
                影响所有镜头的空间一致性
              </div>
              
              <textarea 
                value={data.sceneAnchor.description} 
                onChange={e => actions.updateSceneAnchorDescription(e.target.value)}
                className="w-full h-16 bg-slate-800 border-slate-700 rounded-lg p-2 text-[10px] focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-600" 
                placeholder="例如：赛博朋克城市街道，雨夜，霓虹灯反射在湿滑地面..."
              />
              
              <div className="space-y-2">
                <div className="text-[10px] text-blue-300/80">参考图（最多 3 张）</div>
                
                {data.sceneAnchor.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {data.sceneAnchor.images.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded overflow-hidden border border-blue-500/30">
                        <img src={img} className="w-full h-full object-cover"/>
                        <button
                          onClick={() => actions.removeSceneAnchorImage(idx)}
                          className="absolute top-0.5 right-0.5 bg-red-600 rounded-full p-0.5 text-white hover:bg-red-500"
                        >
                          <X size={10}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {data.sceneAnchor.images.length < 3 && (
                  <label className="block">
                    <div className="border-2 border-dashed border-blue-500/30 rounded-lg p-3 hover:border-blue-500 transition-colors cursor-pointer flex flex-col items-center gap-1">
                      <Plus size={16} className="text-blue-400"/>
                      <span className="text-[10px] text-blue-300">添加场景图片</span>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple
                      onChange={actions.handleSceneAnchorImageUpload} 
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </>
          )}
        </div>
        
        {/* 分镜设置 */}
        <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
            <Settings size={12}/> 分镜设置
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500">画面比例</label>
              <select 
                value={ui.sbAspectRatio} 
                onChange={(e) => actions.setSbAspectRatio(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="2.35:1">2.35:1</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500">语言</label>
              <select 
                value={ui.sbTargetLang} 
                onChange={(e) => actions.setSbTargetLang(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
              >
                <option value="English">English</option>
                <option value="Chinese">中文</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* 生成按钮 */}
        {(data.storyInput.mode === 'audio' || data.storyInput.mode === 'video') && (
          <div className="text-[10px] text-orange-400 bg-orange-900/20 border border-orange-600/30 rounded p-2 text-center">
            {data.storyInput.mode === 'audio' ? '音频' : '视频'}模式未实装，生成功能暂时禁用
          </div>
        )}
        <button 
          onClick={actions.handleAnalyzeScript} 
          disabled={data.isAnalyzing || data.storyInput.mode === 'audio' || data.storyInput.mode === 'video'} 
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {data.isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} 
          {data.isAnalyzing ? '分析中...' : '生成分镜表'}
        </button>
      </div>
      
      {/* AI 导演助手 */}
      <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
        <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4">
          <span className="flex items-center gap-2 font-medium text-slate-400">
            <MessageSquare size={12}/> AI 导演助手
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
          {data.messages.map((m, i) => (
            <div 
              key={i} 
              className={cn(
                "rounded-lg p-2.5 text-xs shadow-sm max-w-[85%]", 
                m.role==='user' 
                  ? "bg-purple-600 text-white ml-auto" 
                  : "bg-slate-800 text-slate-300 border border-slate-700"
              )}
            >
              {m.content}
            </div>
          ))}
          <ChangePreview />
          <div ref={chatEndRef}/>
        </div>
        
        <div className="p-3 border-t border-slate-800 flex gap-2">
          <input 
            value={ui.chatInput} 
            onChange={e => actions.setChatInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && actions.handleSendMessage()} 
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 transition-colors" 
            placeholder="输入修改建议..."
          />
          <button 
            onClick={actions.handleSendMessage} 
            className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors shadow-lg shadow-purple-900/20"
          >
            <Send size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
};

