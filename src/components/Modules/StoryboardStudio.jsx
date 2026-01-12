import React, { useState, useRef, useEffect } from 'react';
import { Clapperboard, Trash2, FileText, Video, Settings, Sliders, Upload, X, ImageIcon, Mic, Film, Loader2, Layers, MessageSquare, Send, FileSpreadsheet, Download, Copy, RefreshCw, Camera, Clock, ChevronLeft, ChevronRight, CheckCircle2, User } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { cn } from '../../lib/utils';
import { useProject } from '../../context/ProjectContext';
import { AnimaticPlayer } from '../Preview/AnimaticPlayer'; // 引入播放器

export const StoryboardStudio = ({ onPreview }) => {
  const { script, setScript, direction, setDirection, shots, setShots, shotImages, setShotImages, scenes, setScenes, actors, callApi, assembleSoraPrompt } = useProject();
  
  const [messages, setMessages] = useState(() => JSON.parse(localStorage.getItem('sb_messages')) || [{ role: 'assistant', content: '我是您的 AI 分镜导演。' }]);
  const [mediaAsset, setMediaAsset] = useState(null); 
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sbAspectRatio, setSbAspectRatio] = useState(() => localStorage.getItem('sb_ar') || "16:9");
  const [sbTargetLang, setSbTargetLang] = useState(() => localStorage.getItem('sb_lang') || "English");
  const [imgStrength, setImgStrength] = useState(0.8); 
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [showAnimatic, setShowAnimatic] = useState(false);
  const [selectedShotIds, setSelectedShotIds] = useState([]); 
  const [activeTab, setActiveTab] = useState("shots");
  const [selectedActorForScene, setSelectedActorForScene] = useState(""); // 大分镜演员选择
  const chatEndRef = useRef(null);

  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem('sb_ar', sbAspectRatio); }, [sbAspectRatio]);
  useEffect(() => { localStorage.setItem('sb_lang', sbTargetLang); }, [sbTargetLang]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pendingUpdate]);

  const pushHistory = (newShots) => setShots(newShots);
  const handleAssetUpload = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setMediaAsset({ type: type || 'image', data: reader.result, name: file.name });
    reader.readAsDataURL(file);
  };
  const clearAsset = (e) => { if(e) e.stopPropagation(); setMediaAsset(null); };

  const handleAnalyzeScript = async () => {
    if (!script && !direction && !mediaAsset) return alert("请填写内容或上传素材");
    setIsAnalyzing(true);
    const system = `Role: Expert Film Director. Task: Create a Shot List for Video Generation. Requirements: Break down script into key shots. **Camera Lingo**: Use 'Truck Left', 'Dolly Zoom', 'Pan Right', 'Tilt Up', 'Extreme Close-up'. Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "camera_movement":"...", "image_prompt":"..."}]. Language: ${sbTargetLang}.`;
    try {
      const res = await callApi('analysis', { system, user: `Script: ${script}\nDirection: ${direction}`, asset: mediaAsset });
      let jsonStr = res.match(/```json([\s\S]*?)```/)?.[1] || res.substring(res.indexOf('['), res.lastIndexOf(']')+1);
      const json = JSON.parse(jsonStr.trim());
      if (Array.isArray(json)) { pushHistory(json); setMessages(prev => [...prev, { role: 'assistant', content: `分析完成！设计了 ${json.length} 个镜头。` }]); }
    } catch (e) { alert("分析失败: " + e.message); } finally { setIsAnalyzing(false); }
  };

  const handleSendMessage = async () => {
    if(!chatInput.trim()) return;
    const msg = chatInput; setChatInput(""); setMessages(prev => [...prev, { role: 'user', content: msg }]);
    try {
      const currentContext = shots.map(s => ({id: s.id, visual: s.visual, audio: s.audio, sora_prompt: s.sora_prompt}));
      const res = await callApi('analysis', {
        system: "Role: Co-Director. Task: Modify storyboard. Return JSON array ONLY.", 
        user: `Context: ${JSON.stringify(currentContext)}\nFeedback: ${msg}\nResponse: Wrap JSON in \`\`\`json ... \`\`\`.`
      });
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      const reply = jsonMatch ? res.replace(jsonMatch[0], "") : res;
      setMessages(prev => [...prev, { role: 'assistant', content: reply || "修改建议如下：" }]);
      if (jsonMatch) setPendingUpdate(JSON.parse(jsonMatch[1]));
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + e.message }]); }
  };

  const applyUpdate = () => {
    if (!pendingUpdate) return;
    let newShots = [...shots];
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];
    updates.forEach(upd => {
      const idx = newShots.findIndex(s => s.id === upd.id);
      if (idx !== -1) newShots[idx] = { ...newShots[idx], ...upd, image_prompt: upd.image_prompt || upd.sora_prompt };
      else newShots.push(upd);
    });
    setShots(newShots.sort((a,b) => a.id - b.id)); setPendingUpdate(null);
    setMessages(prev => [...prev, { role: 'assistant', content: "✅ 修改已应用。" }]);
  };

  const addImageToShot = (id, url) => setShotImages(prev => ({ ...prev, [id]: [...(prev[id] || []), url] }));
  
  const handleDownload = async (type) => {
    const zip = new JSZip(); const folder = zip.folder("storyboard");
    if (type === 'csv') {
      const csv = "\uFEFF" + [["Shot","Visual","Prompt"], ...shots.map(s=>[s.id, `"${s.visual}"`, `"${s.sora_prompt}"`])].map(e=>e.join(",")).join("\n");
      saveAs(new Blob([csv], {type:'text/csv;charset=utf-8;'}), "storyboard.csv"); return;
    }
    const promises = Object.entries(shotImages).map(async ([id, urls]) => { if (urls.length > 0) { try { const blob = await fetch(urls[urls.length-1]).then(r => r.blob()); folder.file(`shot_${id}.png`, blob); } catch(e){} } });
    await Promise.all(promises); saveAs(await zip.generateAsync({ type: "blob" }), "storyboard_pack.zip");
  };
  
  const clearAll = () => { if(confirm("确定清空？")) { setShots([]); setMessages([]); setShotImages({}); setScript(""); setDirection(""); setMediaAsset(null); localStorage.clear(); } };

  const ChangePreview = () => {
    if (!pendingUpdate) return null;
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];
    return (
      <div className="bg-slate-800/90 border border-purple-500/50 rounded-lg p-3 my-2 text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <div className="flex justify-between items-center mb-2 pb-2 border-b border-purple-500/20"><span className="font-bold text-purple-300 flex items-center gap-2"><Settings size={12}/> 修改方案 ({updates.length})</span><button onClick={applyUpdate} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded flex items-center gap-1 shadow"><CheckCircle2 size={10}/> 应用</button></div>
        <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-1">{updates.map((u, i) => (<div key={i} className="bg-slate-900/50 p-2.5 rounded border-l-2 border-purple-500"><div className="font-mono text-slate-400 mb-1 font-bold">Shot {u.id}</div><div className="text-slate-300 whitespace-pre-wrap leading-relaxed">{u.visual && <div className="mb-2"><span className="text-purple-400 font-bold">Visual:</span> {u.visual}</div>}{u.sora_prompt && <div><span className="text-purple-400 font-bold">Prompt:</span> {u.sora_prompt}</div>}</div></div>))}</div>
      </div>
    );
  };

  const toggleShotSelection = (id) => setSelectedShotIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  // === 重构：组装大分镜（调用 assembleSoraPrompt）===
  const compileScene = () => {
    if (selectedShotIds.length < 1) return alert("请至少选择 1 个镜头");
    
    const selectedShots = shots.filter(s => selectedShotIds.includes(s.id)).sort((a,b) => a.id - b.id);
    
    // 调用 assembleSoraPrompt 组装提示词
    const globalStyle = direction || "Cinematic, high fidelity, 8k resolution";
    const result = assembleSoraPrompt(
      selectedShots, 
      globalStyle, 
      selectedActorForScene || null,
      sbAspectRatio,
      direction || ""
    );
    
    if (!result) return; // assembleSoraPrompt 内部已 alert 阻断
    
    const { prompt: masterPrompt, duration, actorRef } = result;
    
    // startImg 优先级：选中镜头首张关键帧 > actorRef > null
    let startImg = shotImages[selectedShots[0].id]?.slice(-1)[0] || actorRef || null;
    
    const newScene = {
      id: Date.now(),
      title: `Scene ${scenes.length + 1} (Shots ${selectedShotIds.join(',')})`,
      prompt: masterPrompt,
      duration: duration,
      startImg: startImg,
      video_url: null,
      shots: selectedShotIds,
      assignedActorId: selectedActorForScene || null
    };
    
    setScenes([...scenes, newScene]);
    setSelectedShotIds([]);
    setActiveTab("scenes");
    alert("✨ 大分镜组装完成！");
  };

  const handleGenSceneVideo = async (scene) => {
    const arMatch = scene.prompt.match(/--ar\s+([\d:.]+)/);
    const ar = arMatch ? arMatch[1] : sbAspectRatio;
    try {
        const url = await callApi('video', { 
          model: 'kling-v2.6', 
          prompt: scene.prompt, 
          startImg: typeof scene.startImg === 'string' ? scene.startImg : scene.startImg?.url, 
          aspectRatio: ar, 
          duration: scene.duration 
        });
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, video_url: url } : s));
        alert("🎬 大分镜视频生成成功！");
    } catch (e) { alert("生成失败: " + e.message); }
  };

  const ShotCard = ({ shot, currentAr, currentUseImg, currentAsset, currentStrength }) => {
    const history = shotImages[shot.id] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [loading, setLoading] = useState(false);
    const [selectedActorId, setSelectedActorId] = useState(""); 
    const { actors } = useProject();
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    const currentUrl = history[verIndex];
    const gen = async () => { 
      setLoading(true); 
      try { 
        let refImgData = null;
        if (selectedActorId) { const actor = actors.find(a => a.id.toString() === selectedActorId); if (actor) { try { const r = await fetch(actor.url); const b = await r.blob(); const reader = new FileReader(); refImgData = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(b); }); } catch(e) {} } } else if (currentAsset?.type === 'image') { refImgData = currentAsset.data; }
        const url = await callApi('image', { prompt: shot.image_prompt, aspectRatio: currentAr, useImg2Img: !!refImgData, refImg: refImgData, strength: currentStrength }); 
        addImageToShot(shot.id, url); 
      } catch(e) { alert(e.message); } finally { setLoading(false); } 
    };
    const handlePreview = () => { if(currentUrl) onPreview(currentUrl); };
    return (
      <div className={cn("bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group transition-all hover:border-purple-500/50", selectedShotIds.includes(shot.id) ? "border-orange-500 bg-orange-900/10 ring-1 ring-orange-500" : "")}>
        <div className={cn("bg-black relative shrink-0 md:w-72 group/media", currentAr === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video")}>
          {loading ? <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div> 
          : currentUrl ? <div className="relative w-full h-full cursor-zoom-in" onClick={handlePreview}><img src={currentUrl} className="w-full h-full object-cover"/><div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity"><button onClick={(e)=>{e.stopPropagation();saveAs(currentUrl, `shot_${shot.id}.png`)}} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><Download size={12}/></button><button onClick={(e)=>{e.stopPropagation();gen()}} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><RefreshCw size={12}/></button></div></div> 
          : <div className="absolute inset-0 flex items-center justify-center"><button onClick={gen} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"><Camera size={14}/> 生成画面</button></div>}
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur pointer-events-none">Shot {shot.id}</div>
          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1 pointer-events-none"><Clock size={10}/> {shot.duration}</div>
          {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/media:opacity-100 transition-opacity z-20"><button disabled={verIndex<=0} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v-1)}} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v+1)}} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
        </div>
        <div className="p-4 flex-1 space-y-3 min-w-0 flex flex-col justify-center relative" onClick={()=>toggleShotSelection(shot.id)}>
          <button onClick={(e)=>{e.stopPropagation();toggleShotSelection(shot.id)}} className={cn("absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center transition-all", selectedShotIds.includes(shot.id)?"bg-orange-500 border-orange-500 text-white":"border-slate-600 text-transparent hover:border-orange-500")}><CheckCircle2 size={14}/></button>
          <div className="flex items-start justify-between gap-8 pr-6"><div className="text-sm text-slate-200 font-medium leading-relaxed">{shot.visual}</div></div>
          <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}><select value={selectedActorId} onChange={(e) => setSelectedActorId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded text-[10px] text-slate-300 p-1 outline-none focus:border-purple-500 max-w-[120px]"><option value="">(无指定演员)</option>{actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{selectedActorId && <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 size={10}/> 角色锁定</span>}</div>
          <div className="flex gap-2 text-xs"><div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400"><Mic size={12} className="text-purple-400"/> {shot.audio || "No Audio"}</div></div>
          <div className="bg-purple-900/10 border border-purple-900/30 p-2.5 rounded text-[10px] font-mono text-purple-200/70 break-all select-all hover:border-purple-500/50 transition-colors"><span className="text-purple-500 font-bold select-none">Sora: </span>{shot.sora_prompt}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <AnimaticPlayer isOpen={showAnimatic} onClose={() => setShowAnimatic(false)} shots={shots} images={shotImages} />
      <div className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center"><h2 className="text-sm font-bold text-slate-200 flex gap-2"><Clapperboard size={16}/> 导演控制台</h2><button onClick={clearAll} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><FileText size={12}/> 剧本 / 台词</label><textarea value={script} onChange={e => setScript(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600" placeholder="例如：(旁白) 2077年，霓虹灯下的雨夜..."/></div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Video size={12}/> 导演意图</label><textarea value={direction} onChange={e => setDirection(e.target.value)} className="w-full h-20 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600" placeholder="例如：赛博朋克风格..."/></div>
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 分镜生成设置</div>
             <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={sbAspectRatio} onChange={(e) => setSbAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="2.35:1">2.35:1</option></select></div><div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={sbTargetLang} onChange={(e) => setSbTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="English">English</option><option value="Chinese">中文</option></select></div></div>
             <div className="space-y-1"><label className="text-[10px] text-slate-500 flex items-center gap-1"><User size={10}/> 大分镜演员（可选）</label><select value={selectedActorForScene} onChange={(e) => setSelectedActorForScene(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="">(无指定演员)</option>{actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2"><div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考图权重</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>{useImg2Img && mediaAsset?.type === 'image' && (<div className="space-y-1 animate-in fade-in"><div className="flex justify-between text-[10px] text-slate-500"><span>Weight: {imgStrength}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/></div>)}</div>
          </div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Upload size={12}/> 多模态素材</label><div className="grid grid-cols-3 gap-2 h-20">
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors", mediaAsset?.type==='image'?"border-purple-500 bg-purple-900/20":"border-slate-600 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="image/*" onChange={(e)=>handleAssetUpload(e,'image')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='image' ? <><img src={mediaAsset.data} className="w-full h-full object-cover opacity-80"/><button onClick={(e)=>clearAsset(e)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500 z-10"><X size={10}/></button></> : <><ImageIcon size={16} className="mb-1"/><span className="text-[10px]">图片</span></>}</div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors", mediaAsset?.type==='audio'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="audio/*" onChange={(e)=>handleAssetUpload(e,'audio')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='audio' ? <Mic size={16} className="text-purple-400"/> : <><Mic size={16} className="text-slate-500 mb-1"/><span className="text-[10px]">音频</span></>}</div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors", mediaAsset?.type==='video'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="video/*" onChange={(e)=>handleAssetUpload(e,'video')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='video' ? <Film size={16} className="text-purple-400"/> : <><Film size={16} className="text-slate-500 mb-1"/><span className="text-[10px]">视频</span></>}</div>
          </div></div>
          <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} {isAnalyzing ? '分析中...' : '生成分镜表'}</button>
        </div>
        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4"><span className="flex items-center gap-2 font-medium text-slate-400"><MessageSquare size={12}/> AI 导演助手</span></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.map((m, i) => <div key={i} className={cn("rounded-lg p-2.5 text-xs shadow-sm max-w-[85%]", m.role==='user'?"bg-purple-600 text-white ml-auto":"bg-slate-800 text-slate-300 border border-slate-700")}>{m.content}</div>)}
            <ChangePreview />
            <div ref={chatEndRef}/>
          </div>
          <div className="p-3 border-t border-slate-800 flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 transition-colors" placeholder="输入修改建议..."/><button onClick={handleSendMessage} className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors shadow-lg shadow-purple-900/20"><Send size={14}/></button></div>
        </div>
      </div>
      <div className="flex-1 bg-slate-950 overflow-hidden flex flex-col">
        <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-4 bg-slate-900/80 backdrop-blur shrink-0">
            <button onClick={()=>setActiveTab("shots")} className={cn("px-4 py-2 text-sm font-bold border-b-2 transition-all", activeTab==="shots"?"border-purple-500 text-white":"border-transparent text-slate-500")}>分镜 Shot ({shots.length})</button>
            <button onClick={()=>setActiveTab("scenes")} className={cn("px-4 py-2 text-sm font-bold border-b-2 transition-all", activeTab==="scenes"?"border-orange-500 text-white":"border-transparent text-slate-500")}>大分镜 Scene ({scenes.length})</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {activeTab === "shots" ? (
            <div className="max-w-4xl mx-auto pb-20 space-y-4">
                <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur py-3 mb-4 border-b border-slate-800/50">
                   <div className="flex justify-between items-center mb-3 px-1">
                     <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2><button onClick={()=>setShowAnimatic(true)} className="ml-4 flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg"><Film size={12}/> 播放预览</button></div>
                     <div className="flex gap-2"><button onClick={() => handleDownload('csv')} className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1 transition-colors"><FileSpreadsheet size={12}/> 导出 CSV</button><button onClick={() => handleDownload('all')} className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors"><Download size={12}/> 打包全部</button></div>
                   </div>
                   {/* UI优化：引导文案 + 组装按钮上移 */}
                   <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-500/30 rounded-lg p-3 flex items-center justify-between">
                     <div className="text-xs text-orange-200/80 flex items-center gap-3">
                       <span className="font-bold text-orange-400">① 先生成小分镜</span>
                       <span className="text-orange-500">→</span>
                       <span className="font-bold text-orange-400">② 勾选镜头</span>
                       <span className="text-orange-500">→</span>
                       <span className="font-bold text-orange-400">③ 组装大分镜</span>
                     </div>
                     <button onClick={compileScene} disabled={selectedShotIds.length < 1} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"><Layers size={16}/> 组合为大分镜 ({selectedShotIds.length})</button>
                   </div>
                </div>
                {shots.map(s => <div key={s.id} className={cn("cursor-pointer border-2 rounded-xl transition-all", selectedShotIds.includes(s.id) ? "border-orange-500 bg-orange-900/10 ring-2 ring-orange-500" : "border-transparent")} onClick={()=>toggleShotSelection(s.id)}><ShotCard shot={s} currentAr={sbAspectRatio} currentUseImg={useImg2Img} currentAsset={mediaAsset} currentStrength={imgStrength}/></div>)}
                {shots.length===0 && <div className="text-center text-slate-500 mt-20">暂无分镜</div>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto pb-20">
                {scenes.map(scene => (
                    <div key={scene.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-orange-500/50 transition-all">
                        <div className="aspect-video bg-black relative">
                            {scene.video_url ? <video src={scene.video_url} controls className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center relative">{scene.startImg && <><img src={typeof scene.startImg==='string'?scene.startImg:scene.startImg.url} className="w-full h-full object-cover opacity-50"/><div className="absolute inset-0 bg-black/60"/></>}<div className="absolute inset-0 flex items-center justify-center z-10"><button onClick={()=>handleGenSceneVideo(scene)} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"><Film size={18}/> 生成长视频 ({scene.duration}s)</button></div></div>}
                            <div className="absolute top-2 left-2 bg-orange-600 text-white text-[10px] px-2 py-1 rounded font-bold shadow">{scene.title}</div>
                        </div>
                        <div className="p-4 space-y-2">
                            <div className="text-xs text-slate-500 font-mono bg-black/30 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap select-all">{scene.prompt}</div>
                            <div className="flex justify-between items-center text-xs text-slate-400"><span>包含 {scene.shots.length} 个镜头</span><button onClick={()=>navigator.clipboard.writeText(scene.prompt)} className="hover:text-white"><Copy size={12}/></button></div>
                        </div>
                    </div>
                ))}
                {scenes.length === 0 && <div className="col-span-full text-center text-slate-600 mt-20">暂无大分镜。请在"分镜 Shot"标签页选中多个镜头进行组合。</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
