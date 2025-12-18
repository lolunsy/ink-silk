import React, { useState, useMemo, useRef, useEffect, useContext, createContext } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2, Sparkles, Dices, Layers } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- 1. 全局项目上下文 (Project Context - Fixed) ---
const ProjectContext = createContext();
export const useProject = () => useContext(ProjectContext);

const ProjectProvider = ({ children }) => {
  // A. 配置中心数据
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('app_config_v3');
    if (saved) return JSON.parse(saved);
    return {
      analysis: { baseUrl: 'https://generativelanguage.googleapis.com', key: '', model: 'gemini-3-pro' },
      image: { baseUrl: '', key: '', model: 'nanobanana-2-pro' },
      video: { baseUrl: '', key: '', model: 'kling-v2.6' },
      audio: { baseUrl: '', key: '', model: 'tts-1-hd' }
    };
  });

  // 模型列表状态 (修复：之前忘了加这部分)
  const [availableModels, setAvailableModels] = useState([]); 
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // B. 核心资产数据
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  const [clPrompts, setClPrompts] = useState(() => JSON.parse(localStorage.getItem('cl_prompts')) || []);
  const [clImages, setClImages] = useState(() => JSON.parse(localStorage.getItem('cl_images')) || {});
  const [shots, setShots] = useState(() => JSON.parse(localStorage.getItem('sb_shots')) || []);
  const [shotImages, setShotImages] = useState(() => JSON.parse(localStorage.getItem('sb_shot_images')) || {});

  // 持久化监听
  useEffect(() => { localStorage.setItem('app_config_v3', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('sb_script', script); }, [script]);
  useEffect(() => { localStorage.setItem('sb_direction', direction); }, [direction]);
  useEffect(() => { localStorage.setItem('cl_prompts', JSON.stringify(clPrompts)); }, [clPrompts]);
  useEffect(() => { localStorage.setItem('cl_images', JSON.stringify(clImages)); }, [clImages]);
  useEffect(() => { localStorage.setItem('sb_shots', JSON.stringify(shots)); }, [shots]);
  useEffect(() => { localStorage.setItem('sb_shot_images', JSON.stringify(shotImages)); }, [shotImages]);

  // 模型获取 (Fetch Models - 修复：逻辑补全)
  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!key) return alert(`请先配置 [${type}] 的 API Key`);
    setIsLoadingModels(true); setAvailableModels([]);
    try {
      let found = [];
      try { const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } }); const d = await r.json(); if(d.data) found = d.data.map(m=>m.id); } catch(e){}
      if(!found.length && baseUrl.includes('google')) { const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); const d = await r.json(); if(d.models) found = d.models.map(m=>m.name.replace('models/','')); }
      if(found.length) { setAvailableModels([...new Set(found)].sort()); alert(`连接成功！获取到 ${found.length} 个模型。`); } 
      else { alert("连接成功，但未获取到模型列表。请手动输入。"); }
    } catch(e) { alert("连接失败: " + e.message); } finally { setIsLoadingModels(false); }
  };

  // 通用 API 调用器
  const callApi = async (type, payload) => {
    const { baseUrl, key, model } = config[type];
    if (!key) throw new Error(`请先配置 [${type}] 的 API Key`);

    if (type === 'analysis') {
        const { system, user, asset } = payload;
        let mimeType = null, base64Data = null;
        if (asset) { const d = asset.data || asset; mimeType = d.split(';')[0].split(':')[1]; base64Data = d.split(',')[1]; }
        
        // 简单判断是否为 Google Native 格式
        if (baseUrl.includes('google') && !baseUrl.includes('openai') && !baseUrl.includes('v1')) {
            const parts = [{ text: system + "\n" + user }];
            if (base64Data) parts.push({ inlineData: { mimeType, data: base64Data } });
            const r = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${key}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts}]}) });
            if(!r.ok) throw new Error("Analysis API Error");
            return (await r.json()).candidates[0].content.parts[0].text;
        }
        // 默认为 OpenAI 格式
        const content = [{ type: "text", text: user }];
        if (base64Data) content.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } });
        const r = await fetch(`${baseUrl}/v1/chat/completions`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, body:JSON.stringify({model, messages:[{role:"system",content:system},{role:"user",content:content}]}) });
        return (await r.json()).choices[0].message.content;
    }

    if (type === 'image') {
        const { prompt, aspectRatio, useImg2Img, refImg, strength } = payload;
        let size = "1024x1024";
        if (aspectRatio === "16:9") size = "1280x720"; else if (aspectRatio === "9:16") size = "720x1280"; else if (aspectRatio === "2.35:1") size = "1536x640";
        
        const body = { model, prompt, n: 1, size };
        if (useImg2Img && refImg) { body.image = refImg.split(',')[1]; body.strength = parseFloat(strength); }
        
        const r = await fetch(`${baseUrl}/v1/images/generations`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, body:JSON.stringify(body) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || "Image Gen Error");
        return data.data[0].url;
    }
  };

  // 修复：确保所有需要的方法都已导出
  const value = {
    config, setConfig,
    script, setScript,
    direction, setDirection,
    clPrompts, setClPrompts,
    clImages, setClImages,
    shots, setShots,
    shotImages, setShotImages,
    callApi,
    fetchModels, availableModels, isLoadingModels 
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

// --- 组件：大型模型选择弹窗 ---
const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const categorizedModels = useMemo(() => {
    const lower = search.toLowerCase();
    const all = models.filter(m => m.toLowerCase().includes(lower));
    return {
      "All": all,
      "OpenAI": all.filter(m => m.includes('gpt') || m.includes('o1') || m.includes('dall')),
      "Google": all.filter(m => m.includes('gemini') || m.includes('banana') || m.includes('imagen')),
      "Image": all.filter(m => ['flux', 'midjourney', 'stable', 'banana', 'jimeng', 'recraft'].some(k => m.includes(k))),
      "Video": all.filter(m => ['kling', 'luma', 'runway', 'sora', 'hailuo'].some(k => m.includes(k))),
    };
  }, [models, search]);
  const tabs = ["All", "OpenAI", "Google", "Image", "Video"];
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-white flex items-center gap-2"><LayoutGrid size={20}/> 切换模型: <span className="text-blue-400">{title}</span></h3><button onClick={onClose}><X size={20}/></button></div>
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型 ID..." className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"/>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {categorizedModels[activeTab || 'All'].map(m => (<button key={m} onClick={() => { onSelect(m); onClose(); }} className="p-3 rounded-lg border border-slate-800 bg-slate-900 hover:border-blue-500 text-left text-sm text-slate-300 hover:text-white truncate font-mono">{m}</button>))}
        </div>
      </div>
    </div>
  );
};

// --- 组件：模型触发器 ---
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange }) => {
  const [isManual, setIsManual] = useState(false);
  return (
    <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 h-9 w-40 md:w-48 group">
      <div className="flex items-center gap-2 px-3 border-r border-slate-800 h-full text-slate-400"><Icon size={14}/></div>
      <div className="flex-1 px-2 h-full flex items-center min-w-0">{isManual ? <input value={value} onChange={(e) => onManualChange(e.target.value)} className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono" autoFocus onBlur={()=>setIsManual(false)}/> : <button onClick={onOpenPicker} className="w-full text-left truncate text-xs text-slate-300 font-mono">{value || "Default"}</button>}</div>
      <button onClick={() => setIsManual(true)} className="px-2 h-full text-slate-500 hover:text-white"><Pencil size={12}/></button>
    </div>
  );
};

// --- 组件：全能配置中心 (连接 Context) ---
const ConfigCenter = ({ onClose, fetchModels, availableModels }) => {
  const { config, setConfig } = useProject(); // 直接从仓库拿数据
  const [activeTab, setActiveTab] = useState("analysis");
  const [showPicker, setShowPicker] = useState(false);
  
  const tabs = [
    { id: "analysis", label: "大脑 (LLM)", icon: Brain, color: "blue" },
    { id: "image", label: "画师 (Image)", icon: Palette, color: "purple" },
    { id: "video", label: "摄像 (Video)", icon: Film, color: "orange" },
    { id: "audio", label: "录音 (Audio)", icon: Mic, color: "green" },
  ];
  const cur = config[activeTab];

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl flex overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="w-64 bg-slate-950 border-r border-slate-800 p-4 space-y-2">
          <h2 className="text-xl font-bold text-white mb-6 flex gap-2"><Settings className="text-blue-500"/> 设置</h2>
          {tabs.map(t => (<button key={t.id} onClick={()=>setActiveTab(t.id)} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all", activeTab===t.id?"bg-slate-800 text-white":"text-slate-400 hover:bg-slate-900")}><t.icon size={18}/> <span>{t.label}</span></button>))}
        </div>
        <div className="flex-1 p-8 space-y-6">
          <h3 className="text-xl font-bold text-white mb-4">{tabs.find(t=>t.id===activeTab).label} 配置</h3>
          <div className="space-y-2"><label className="text-xs text-slate-400">Base URL</label><input value={cur.baseUrl} onChange={e=>setConfig(p=>({...p,[activeTab]:{...cur,baseUrl:e.target.value}}))} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"/></div>
          <div className="space-y-2"><label className="text-xs text-slate-400">API Key</label><input type="password" value={cur.key} onChange={e=>setConfig(p=>({...p,[activeTab]:{...cur,key:e.target.value}}))} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"/></div>
          <div className="space-y-2 pt-4 border-t border-slate-800">
             <div className="flex justify-between"><label className="text-xs text-slate-400">Model ID</label><button onClick={()=>fetchModels(activeTab)} className="text-xs text-blue-400 flex items-center gap-1"><RefreshCw size={12}/> 获取列表</button></div>
             <ModelTrigger label="模型" icon={LayoutGrid} value={cur.model} onOpenPicker={()=>{fetchModels(activeTab);setShowPicker(true)}} onManualChange={v=>setConfig(p=>({...p,[activeTab]:{...cur,model:v}}))}/>
          </div>
        </div>
      </div>
      <ModelSelectionModal isOpen={showPicker} models={availableModels} onClose={()=>setShowPicker(false)} onSelect={m=>setConfig(p=>({...p,[activeTab]:{...cur,model:m}}))} title={activeTab}/>
    </div>
  );
};

// --- 组件：图片预览灯箱 ---
const ImagePreviewModal = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({x:0,y:0});
  const [drag, setDrag] = useState(false);
  const start = useRef({x:0,y:0});
  useEffect(()=>{const h=e=>{e.preventDefault();setScale(s=>Math.max(0.5,Math.min(5,s-e.deltaY*0.001)))};document.addEventListener('wheel',h,{passive:false});return()=>document.removeEventListener('wheel',h)},[]);
  if(!url) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center overflow-hidden" onClick={onClose}>
      <img src={url} className="max-w-full max-h-full object-contain cursor-move transition-transform duration-75" 
        style={{transform:`scale(${scale}) translate(${pos.x/scale}px,${pos.y/scale}px)`}}
        onMouseDown={e=>{if(scale>1){setDrag(true);start.current={x:e.clientX-pos.x,y:e.clientY-pos.y}}}}
        onMouseMove={e=>{if(drag)setPos({x:e.clientX-start.current.x,y:e.clientY-start.current.y})}}
        onMouseUp={()=>setDrag(false)} onClick={e=>e.stopPropagation()}
      />
      <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-red-600"><X size={24}/></button>
    </div>
  );
};

// --- 组件：灵感老虎机 (Inspiration Slot Machine) ---
const InspirationSlotMachine = ({ onClose }) => {
  const { setScript, setDirection } = useProject(); // 这里的魔力：直接操作全局剧本
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

  const slots = {
    genre: ["赛博朋克", "废土末日", "维多利亚蒸汽", "现代悬疑", "吉卜力治愈", "克苏鲁神话"],
    theme: ["时间循环", "人工智能觉醒", "跨物种友谊", "寻找失落文明", "最后的晚餐", "梦境入侵"],
    visual: ["霓虹雨夜", "荒漠夕阳", "迷雾伦敦", "极简几何", "水彩手绘", "生物机械"]
  };

  const spin = () => {
    setSpinning(true);
    setResult(null);
    let i = 0;
    const timer = setInterval(() => {
      setResult({
        genre: slots.genre[Math.floor(Math.random() * slots.genre.length)],
        theme: slots.theme[Math.floor(Math.random() * slots.theme.length)],
        visual: slots.visual[Math.floor(Math.random() * slots.visual.length)],
      });
      i++;
      if (i > 15) { clearInterval(timer); setSpinning(false); }
    }, 100);
  };

  const apply = () => {
    if (!result) return;
    const newScript = `(开场) 在一个${result.genre}的世界中，故事关于${result.theme}...`;
    const newDir = `视觉风格：${result.visual}；\n核心基调：${result.genre}；\n镜头语言：强调氛围感与光影对比。`;
    setScript(newScript); // 自动填入
    setDirection(newDir); // 自动填入
    onClose(); // 关闭窗口
    // 这里可以加一个 Toast 提示“已应用到分镜台”
    alert("✨ 灵感已注入到【自动分镜】工作台！");
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gradient-to-br from-indigo-900 to-purple-900 border border-purple-500/50 w-full max-w-md rounded-2xl p-8 shadow-2xl text-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent animate-pulse"/>
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center justify-center gap-2"><Sparkles className="text-yellow-400"/> 灵感抽取</h2>
        
        <div className="grid grid-cols-3 gap-4 mb-8">
          {["风格", "主题", "视觉"].map((label, idx) => (
            <div key={label} className="bg-black/40 rounded-lg p-4 border border-purple-500/30">
              <div className="text-[10px] text-purple-300 uppercase tracking-widest mb-2">{label}</div>
              <div className="text-sm font-bold text-white h-6 flex items-center justify-center">
                {result ? Object.values(result)[idx] : "---"}
              </div>
            </div>
          ))}
        </div>

        <button onClick={spin} disabled={spinning} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-lg rounded-xl shadow-lg shadow-yellow-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 mb-4">
          <Dices size={24}/> {spinning ? "抽取中..." : "摇一摇"}
        </button>
        
        {result && !spinning && (
          <button onClick={apply} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors animate-in fade-in slide-in-from-bottom-2">
            使用此灵感 (填入分镜台)
          </button>
        )}
      </div>
    </div>
  );
};
// --- 组件：动态分镜播放器 (Animatic Player) ---
const AnimaticPlayer = ({ isOpen, onClose, shots, images }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const playlist = useMemo(() => {
    return shots.map(s => {
      const history = images[s.id] || [];
      const lastItem = history.length > 0 ? history[history.length - 1] : null;
      const url = typeof lastItem === 'string' ? lastItem : (lastItem?.url || null);
      let duration = 3000; 
      if (s.duration) { const match = s.duration.match(/(\d+)/); if (match) duration = parseInt(match[0]) * 1000; }
      return { ...s, url, duration: Math.max(2000, duration) }; 
    }).filter(item => item.url); 
  }, [shots, images]);

  useEffect(() => { if (isOpen && playlist.length > 0) { setIsPlaying(true); setCurrentIndex(0); setProgress(0); } }, [isOpen, playlist.length]);

  useEffect(() => {
    if (!isPlaying || playlist.length === 0) return;
    const currentItem = playlist[currentIndex];
    const stepTime = 50; const totalSteps = currentItem.duration / stepTime;
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++; setProgress((currentStep / totalSteps) * 100);
      if (currentStep >= totalSteps) {
        if (currentIndex < playlist.length - 1) { setCurrentIndex(p => p + 1); setProgress(0); currentStep = 0; } 
        else { setIsPlaying(false); clearInterval(timer); }
      }
    }, stepTime);
    return () => clearInterval(timer);
  }, [currentIndex, isPlaying, playlist]);

  if (!isOpen) return null;
  const currentShot = playlist[currentIndex];

  return (
    <div className="fixed inset-0 z-[210] bg-black flex flex-col items-center justify-center">
      <div className="relative w-full h-full max-w-5xl max-h-[80vh] bg-black overflow-hidden flex items-center justify-center">
        {playlist.length > 0 && currentShot ? (
          <>
            <div key={currentIndex} className="absolute inset-0 animate-in fade-in duration-1000">
               <img src={currentShot.url} className="w-full h-full object-contain animate-[kenburns_10s_ease-out_forwards]" style={{ transformOrigin: 'center center', animationDuration: `${currentShot.duration + 2000}ms` }} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-8 pb-16">
              <div className="text-yellow-400 font-mono text-xs mb-1">SHOT {currentShot.id} • {currentShot.duration}ms</div>
              <div className="text-white text-lg md:text-2xl font-bold font-serif leading-relaxed drop-shadow-md">{currentShot.visual}</div>
              {currentShot.audio && <div className="text-slate-300 text-sm mt-2 flex items-center gap-2"><Mic size={14}/> {currentShot.audio}</div>}
            </div>
          </>
        ) : (<div className="text-slate-500">列表为空或加载失败</div>)}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-2 text-white/80 font-bold"><Film size={18}/> 动态预览</div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur"><X size={20}/></button>
        </div>
      </div>
      <div className="w-full max-w-5xl h-1 bg-slate-800 mt-0 relative"><div className="h-full bg-blue-500 transition-all duration-75 ease-linear" style={{ width: `${((currentIndex + (progress/100)) / playlist.length) * 100}%` }} /></div>
      <div className="h-20 w-full flex items-center justify-center gap-6 bg-slate-900 border-t border-slate-800">
         <button onClick={() => { setCurrentIndex(0); setIsPlaying(true); }} className="p-3 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors"><Undo2 size={20}/></button>
         <button onClick={() => setIsPlaying(!isPlaying)} className="p-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg scale-110 transition-transform">{isPlaying ? <div className="w-4 h-4 bg-white rounded-sm" /> : <div className="w-0 h-0 border-t-8 border-t-transparent border-l-[16px] border-l-white border-b-8 border-b-transparent ml-1" />}</button>
         <div className="text-xs text-slate-500 font-mono">{currentIndex + 1} / {playlist.length}</div>
      </div>
      <style>{`@keyframes kenburns { 0% { transform: scale(1); } 100% { transform: scale(1.05); } }`}</style>
    </div>
  );
};

// ==========================================
// 模块 2：角色工坊 (Context Integrated & Fixed UI)
// ==========================================
const CharacterLab = ({ onPreview }) => {
  const { clPrompts, setClPrompts, clImages, setClImages, callApi } = useProject();
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [referenceImage, setReferenceImage] = useState(() => { try { return localStorage.getItem('cl_ref') || null; } catch(e) { return null; } });
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('cl_ar') || "16:9");
  const [imgStrength, setImgStrength] = useState(0.8);
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [localPrompts, setLocalPrompts] = useState(clPrompts);

  useEffect(() => { setLocalPrompts(clPrompts); }, [clPrompts]);
  const safeSave = (key, val) => { try { localStorage.setItem(key, val); } catch (e) {} };
  useEffect(() => { safeSave('cl_desc', description); }, [description]);
  useEffect(() => { if(referenceImage) safeSave('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { safeSave('cl_lang', targetLang); }, [targetLang]);
  useEffect(() => { safeSave('cl_ar', aspectRatio); }, [aspectRatio]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onloadend = () => { setReferenceImage(reader.result); safeSave('cl_ref', reader.result); }; reader.readAsDataURL(file); }
  };

  const clearProject = () => {
    if(confirm("确定清空角色设定吗？")) { setDescription(""); setReferenceImage(null); setClPrompts([]); localStorage.removeItem('cl_desc'); localStorage.removeItem('cl_ref'); }
  };

  const handleGenerate = async () => {
    setIsGenerating(true); setClPrompts([]); setClImages({});
    const langInstruction = targetLang === "Chinese" ? "2. 提示词内容(prompt)请**严格使用中文**..." : "2. 提示词内容(prompt)保持英文...";
    const system = `你是一个专家级角色概念设计师。请生成 9 组标准电影镜头视角提示词。要求：1. 包含9种视角。${langInstruction} 3. 严格返回 JSON 数组。`;
    try {
      const res = await callApi('analysis', { system, user: `描述内容: ${description}`, asset: referenceImage });
      let jsonStr = res; const jsonMatch = res.match(/```json([\s\S]*?)```/); if (jsonMatch) jsonStr = jsonMatch[1]; else { const start = res.indexOf('['); const end = res.lastIndexOf(']'); if (start!==-1 && end!==-1) jsonStr = res.substring(start, end+1); }
      setClPrompts(JSON.parse(jsonStr.trim()));
    } catch(e) { alert("生成失败: " + e.message); } finally { setIsGenerating(false); }
  };

  const handleImageGen = async (idx, prompt, ar, useImg, ref, str) => {
    setClImages(prev => ({ ...prev, [idx]: [...(prev[idx] || []), { loading: true }] }));
    try {
      const url = await callApi('image', { prompt, aspectRatio: ar, useImg2Img: useImg, refImg: ref, strength: str });
      setClImages(prev => { const history = [...(prev[idx] || [])].filter(img => !img.loading); return { ...prev, [idx]: [...history, { url, loading: false }] }; });
    } catch(e) { 
      setClImages(prev => { const history = [...(prev[idx] || [])].filter(img => !img.loading); return { ...prev, [idx]: [...history, { error: e.message, loading: false }] }; });
    }
  };

  const CharCard = ({ item, index, currentAr, currentRef, currentUseImg, currentStrength }) => {
    const history = clImages[index] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(item.prompt);
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    const currentImg = history[verIndex] || { loading: false, url: null, error: null };
    
    const handleGen = (e) => { e.stopPropagation(); handleImageGen(index, isEditing ? editValue : item.prompt, currentAr, currentUseImg, currentRef, currentStrength); };
    const arClass = currentAr === "16:9" ? "aspect-video" : currentAr === "9:16" ? "aspect-[9/16]" : currentAr === "2.35:1" ? "aspect-[21/9]" : "aspect-square";

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col">
        <div className={cn("bg-black relative w-full shrink-0", arClass)}>
          {currentImg.loading ? (<div className="absolute inset-0 flex items-center justify-center flex-col gap-2 text-slate-500"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div>) 
          : currentImg.url ? (
            <div className="relative w-full h-full group/img cursor-zoom-in" onClick={(e)=>{e.stopPropagation();onPreview(currentImg.url)}}>
              <img src={currentImg.url} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"><button onClick={(e)=>{e.stopPropagation(); saveAs(currentImg.url, `view_${index}.png`)}} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={12}/></button></div>
              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"><button onClick={handleGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><RefreshCw size={12}/></button></div>
            </div>
          ) : currentImg.error ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-xs text-center select-text bg-slate-900/80 backdrop-blur-sm z-10"><p className="line-clamp-4">{currentImg.error}</p><button onClick={handleGen} className="mt-2 text-white underline hover:text-blue-400">重试</button></div>
          ) : (<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 backdrop-blur-[2px] transition-opacity"><button onClick={handleGen} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2"><Camera size={14}/> 生成</button></div>)}
          {history.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur z-20 group-hover:opacity-100 transition-opacity">
              <button disabled={verIndex<=0} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v-1)}} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v+1)}} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-slate-800 flex-1 flex flex-col min-h-[100px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-200 text-xs truncate pr-2">{item.title}</h3>
            <div className="flex gap-1">{isEditing ? (<><button onClick={()=>{const u=[...localPrompts];u[index].prompt=editValue;setLocalPrompts(u);setIsEditing(false)}} className="text-green-400"><CheckCircle2 size={14}/></button><button onClick={()=>setIsEditing(false)} className="text-red-400"><X size={14}/></button></>) : (<><button onClick={()=>setIsEditing(true)} className="text-slate-500 hover:text-blue-400"><Pencil size={12}/></button><button onClick={()=>navigator.clipboard.writeText(item.prompt)} className="text-slate-500 hover:text-white"><Copy size={12}/></button></>)}</div>
          </div>
          {isEditing ? <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-full h-full bg-slate-950 border border-blue-500/50 rounded p-2 text-[10px] text-slate-200 font-mono outline-none resize-none" autoFocus/> : <p className="text-[10px] text-slate-500 line-clamp-3 font-mono bg-black/30 p-2 rounded flex-1 select-all hover:text-slate-400 transition-colors cursor-pointer" onClick={() => setIsEditing(true)}>{item.prompt}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto z-10 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-slate-200 flex items-center gap-2"><ImageIcon size={16}/> 角色设定</h3><button onClick={clearProject} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button></div>
        <div className="space-y-6">
          <div className="space-y-2"><div className="relative group"><input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" /><label htmlFor="ref-img" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 overflow-hidden">{referenceImage ? (<img src={referenceImage} className="w-full h-full object-cover opacity-80" />) : (<div className="text-slate-500 flex flex-col items-center"><Upload size={24} className="mb-2"/><span className="text-xs">上传参考图</span></div>)}</label></div></div>
          <div className="space-y-2 flex-1"><label className="text-sm font-medium text-slate-300">角色描述</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-32 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="例如：一位银发精灵弓箭手，穿着带有发光符文的森林绿色皮甲..."/></div>
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-4">
             <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="2.35:1">2.35:1</option></select></div><div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"><option value="English">English</option><option value="Chinese">中文</option></select></div></div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2">
                <div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考权重 (Image Weight)</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>
                {useImg2Img && referenceImage && (
                  <div className="space-y-1 animate-in fade-in">
                    <div className="flex justify-between text-[10px] text-slate-500"><span>Weight: {imgStrength}</span></div>
                    <input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/>
                    {/* 修复：把这段文字加回来了 */}
                    <div className="text-[9px] text-slate-500 leading-tight mt-1">1.0: 强一致 (像原图)<br/>0.1: 弱一致 (自由发挥)</div>
                  </div>
                )}
             </div>
          </div>
          <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Wand2 size={20}/>} {isGenerating ? '正在构思...' : '生成 9 组视角'}</button>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm z-10">
          <h2 className="text-slate-400 text-sm hidden md:block">视角预览 ({localPrompts.length})</h2>
          <div className="flex items-center gap-3">{localPrompts.length > 0 && (<><button onClick={() => localPrompts.forEach((p, idx) => handleImageGen(idx, p.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength))} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-200 text-sm rounded border border-blue-800"><Camera size={16}/> 全部生成</button><button onClick={downloadAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700"><Download size={16}/> 打包下载</button></>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
            {localPrompts.map((item, idx) => <CharCard key={idx} item={item} index={idx} currentAr={aspectRatio} currentRef={referenceImage} currentUseImg={useImg2Img} currentStrength={imgStrength}/>)}
          </div>
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 3：自动分镜工作台 (Context Integrated)
// ==========================================
const StoryboardStudio = ({ onPreview }) => {
  // 接入中央厨房：直接读取全局剧本和分镜数据
  const { script, setScript, direction, setDirection, shots, setShots, shotImages, setShotImages, callApi } = useProject();
  
  const [messages, setMessages] = useState(() => JSON.parse(localStorage.getItem('sb_messages')) || [{ role: 'assistant', content: '我是您的 AI 分镜导演。请在左侧上传素材或输入剧本，点击“生成分镜表”开始工作。' }]);
  const [mediaAsset, setMediaAsset] = useState(null); 
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sbAspectRatio, setSbAspectRatio] = useState(() => localStorage.getItem('sb_ar') || "16:9");
  const [sbTargetLang, setSbTargetLang] = useState(() => localStorage.getItem('sb_lang') || "English");
  const [imgStrength, setImgStrength] = useState(0.8); 
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [showAnimatic, setShowAnimatic] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem('sb_ar', sbAspectRatio); }, [sbAspectRatio]);
  useEffect(() => { localStorage.setItem('sb_lang', sbTargetLang); }, [sbTargetLang]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pendingUpdate]);

  const pushHistory = (newShots) => {
    const newHist = history.slice(0, historyIndex + 1); newHist.push(newShots);
    setHistory(newHist); setHistoryIndex(newHist.length - 1); setShots(newShots);
  };
  const handleUndo = () => { if (historyIndex > 0) { setHistoryIndex(h => h - 1); setShots(history[historyIndex - 1]); } };
  const handleRedo = () => { if (historyIndex < history.length - 1) { setHistoryIndex(h => h + 1); setShots(history[historyIndex + 1]); } };

  const handleAssetUpload = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setMediaAsset({ type, data: reader.result, name: file.name });
    reader.readAsDataURL(file);
  };

  const handleAnalyzeScript = async () => {
    if (!script && !direction && !mediaAsset) return alert("请填写内容或上传素材");
    setIsAnalyzing(true);
    const system = `Role: Expert Film Director. Task: Create a Shot List. Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "image_prompt":"..."}]. Language: ${sbTargetLang}.`;
    try {
      const res = await callApi('analysis', { system, user: `Script: ${script}\nDirection: ${direction}`, asset: mediaAsset });
      let jsonStr = res; const jsonMatch = res.match(/```json([\s\S]*?)```/); if (jsonMatch) jsonStr = jsonMatch[1]; else { const start = res.indexOf('['); const end = res.lastIndexOf(']'); if (start!==-1 && end!==-1) jsonStr = res.substring(start, end+1); }
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
        system: "Role: Co-Director. Task: Modify storyboard based on feedback. IMPORTANT: Update 'visual', 'audio', 'sora_prompt', 'image_prompt'. Return JSON array ONLY for modified shots.", 
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
    newShots.sort((a,b) => a.id - b.id);
    pushHistory(newShots); setPendingUpdate(null);
    setMessages(prev => [...prev, { role: 'assistant', content: "✅ 修改已应用。" }]);
  };

  const addImageToShot = (id, url) => setShotImages(prev => ({ ...prev, [id]: [...(prev[id] || []), url] }));
  const handleDownload = async (type) => {
    const zip = new JSZip(); const folder = zip.folder("storyboard");
    if (type === 'csv') {
      const csv = "\uFEFF" + [["Shot","Visual","Prompt"], ...shots.map(s=>[s.id, `"${s.visual}"`, `"${s.sora_prompt}"`])].map(e=>e.join(",")).join("\n");
      saveAs(new Blob([csv], {type:'text/csv;charset=utf-8;'}), "storyboard.csv"); return;
    }
    shots.forEach(s => folder.file(`shot_${s.id}.txt`, `Visual: ${s.visual}\nPrompt: ${s.sora_prompt}`));
    if (type === 'all') {
      const promises = Object.entries(shotImages).map(async ([id, urls]) => { if (urls.length > 0) { try { const blob = await fetch(urls[urls.length-1]).then(r => r.blob()); folder.file(`shot_${id}.png`, blob); } catch(e){} } });
      await Promise.all(promises);
    }
    saveAs(await zip.generateAsync({ type: "blob" }), "storyboard_pack.zip");
  };
  const clearAll = () => { if(confirm("确定清空？")) { setShots([]); setMessages([]); setShotImages({}); setHistory([]); setScript(""); setDirection(""); setMediaAsset(null); localStorage.clear(); } };

  const ShotCard = ({ shot, currentAr, currentUseImg, currentAsset, currentStrength }) => {
    const history = shotImages[shot.id] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [loading, setLoading] = useState(false);
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    const currentUrl = history[verIndex];
    
    const gen = async () => { 
      setLoading(true); 
      try { 
        const url = await callApi('image', { prompt: shot.image_prompt, aspectRatio: currentAr, useImg2Img: currentUseImg, refImg: currentAsset?.type==='image'?currentAsset.data:null, strength: currentStrength }); 
        addImageToShot(shot.id, url); 
      } catch(e) { alert(e.message); } finally { setLoading(false); } 
    };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group hover:border-purple-500/50 transition-all">
        <div className={cn("bg-black relative shrink-0 md:w-72", currentAr === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video")}>
          {loading ? <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div> 
          : currentUrl ? <div className="relative w-full h-full group/img cursor-zoom-in" onClick={() => onPreview(currentUrl)}>
              <img src={currentUrl} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"><button onClick={(e)=>{e.stopPropagation();saveAs(currentUrl, `shot_${shot.id}.png`)}} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><Download size={12}/></button><button onClick={(e)=>{e.stopPropagation();gen()}} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><RefreshCw size={12}/></button></div>
              {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity z-20"><button disabled={verIndex<=0} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v-1)}} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v+1)}} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
            </div> 
          : <div className="absolute inset-0 flex items-center justify-center"><button onClick={gen} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"><Camera size={14}/> 生成画面</button></div>}
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur">Shot {shot.id}</div>
          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1"><Clock size={10}/> {shot.duration}</div>
        </div>
        <div className="p-4 flex-1 space-y-3 min-w-0 flex flex-col justify-center"><div className="flex items-start justify-between gap-4"><div className="text-sm text-slate-200 font-medium leading-relaxed">{shot.visual}</div><div className="flex gap-1 shrink-0"><button onClick={() => navigator.clipboard.writeText(shot.sora_prompt)} className="p-1.5 text-slate-500 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors"><Copy size={14}/></button></div></div><div className="flex gap-2 text-xs"><div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400"><Mic size={12} className="text-purple-400"/> {shot.audio || "No Audio"}</div></div><div className="bg-purple-900/10 border border-purple-900/30 p-2.5 rounded text-[10px] font-mono text-purple-200/70 break-all select-all hover:border-purple-500/50 transition-colors"><span className="text-purple-500 font-bold select-none">Sora: </span>{shot.sora_prompt}</div></div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <AnimaticPlayer isOpen={showAnimatic} onClose={() => setShowAnimatic(false)} shots={shots} images={shotImages} />
      <div className="w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
        <div className="p-4 border-b border-slate-800 sticky top-0 bg-slate-900/80 backdrop-blur flex justify-between items-center"><h2 className="text-sm font-bold text-slate-200 flex items-center gap-2"><Clapperboard size={16} className="text-purple-500"/> 导演控制台</h2><button onClick={clearAll} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><FileText size={12}/> 剧本 / 台词</label><textarea value={script} onChange={e => setScript(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600" placeholder="例如：(旁白) 2077年，霓虹灯下的雨夜..."/></div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Video size={12}/> 导演意图</label><textarea value={direction} onChange={e => setDirection(e.target.value)} className="w-full h-20 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600" placeholder="例如：赛博朋克风格，压抑的氛围..."/></div>
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 分镜设置</div>
             <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={sbAspectRatio} onChange={(e) => setSbAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="2.35:1">2.35:1</option></select></div><div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={sbTargetLang} onChange={(e) => setSbTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="English">English</option><option value="Chinese">中文</option></select></div></div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2"><div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考图权重</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>{useImg2Img && mediaAsset?.type === 'image' && (<div className="space-y-1 animate-in fade-in"><div className="flex justify-between text-[10px] text-slate-500"><span>Weight: {imgStrength}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/></div>)}</div>
          </div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Upload size={12}/> 多模态素材</label><div className="grid grid-cols-3 gap-2 h-20">
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='image'?"border-purple-500 bg-purple-900/20":"border-slate-600 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="image/*" onChange={(e)=>handleAssetUpload(e,'image')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='image' ? <img src={mediaAsset.data} className="w-full h-full object-cover opacity-80"/> : <><ImageIcon size={16} className="mb-1"/><span className="text-[10px]">图片</span></>}</div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='audio'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="audio/*" onChange={(e)=>handleAssetUpload(e,'audio')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='audio' ? <Mic size={16} className="text-purple-400"/> : <Mic size={16} className="text-slate-500"/>}</div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='video'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="video/*" onChange={(e)=>handleAssetUpload(e,'video')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='video' ? <Film size={16} className="text-purple-400"/> : <Film size={16} className="text-slate-500"/>}</div>
          </div></div>
          <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} {isAnalyzing ? '分析中...' : '生成分镜表'}</button>
        </div>
        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4"><span className="flex items-center gap-2 font-medium text-slate-400"><MessageSquare size={12}/> AI 导演助手</span></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.map((m, i) => <div key={i} className={cn("flex", m.role==='user'?"justify-end":"justify-start")}><div className={cn("max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed shadow-sm", m.role==='user'?"bg-purple-600 text-white":"bg-slate-800 text-slate-300 border border-slate-700")}>{m.content}</div></div>)}
            {pendingUpdate && <div className="bg-slate-800/90 border border-purple-500/50 rounded-lg p-3 my-2 text-xs shadow-lg"><div className="flex justify-between items-center mb-2 pb-2 border-b border-purple-500/20"><span className="font-bold text-purple-300">修改方案 ({Array.isArray(pendingUpdate)?pendingUpdate.length:1})</span><button onClick={applyUpdate} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded">应用</button></div></div>}
            <div ref={chatEndRef}/>
          </div>
          <div className="p-3 border-t border-slate-800 flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 transition-colors" placeholder="输入修改建议..."/><button onClick={handleSendMessage} className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors shadow-lg shadow-purple-900/20"><Send size={14}/></button></div>
        </div>
      </div>
      <div className="flex-1 bg-slate-950 p-6 overflow-y-auto">
        {shots.length > 0 ? (
          <div className="max-w-4xl mx-auto pb-20 space-y-4">
            <div className="flex items-center justify-between mb-4 px-1 sticky top-0 z-20 bg-slate-950/80 backdrop-blur py-2">
               <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2><button onClick={()=>setShowAnimatic(true)} className="ml-4 flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg animate-in fade-in"><Film size={12}/> 播放动态预览</button><div className="flex gap-1 ml-4 border-l border-slate-700 pl-4"><button onClick={handleUndo} className="p-1.5 text-slate-400 hover:text-white rounded"><Undo2 size={14}/></button><button onClick={handleRedo} className="p-1.5 text-slate-400 hover:text-white rounded"><Redo2 size={14}/></button></div></div>
               <div className="flex gap-2"><button onClick={() => handleDownload('csv')} className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1"><FileSpreadsheet size={12}/> 导出 CSV</button><button onClick={() => handleDownload('all')} className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1"><Download size={12}/> 打包全部</button></div>
            </div>
            {shots.map(s => <ShotCard key={s.id} shot={s} currentAr={sbAspectRatio} currentUseImg={useImg2Img} currentAsset={mediaAsset} currentStrength={imgStrength}/>)}
          </div>
        ) : (<div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4"><div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800"><Clapperboard size={32} className="opacity-20 text-purple-500"/></div><div className="text-center"><p className="text-sm font-medium text-slate-500">分镜白板为空</p><p className="text-xs text-slate-600 mt-1">请上传素材并生成</p></div></div>)}
      </div>
    </div>
  );
};

// ==========================================
// 主应用入口 (App - The "Central Kitchen" Architecture - Fixed Header)
// ==========================================
const AppContent = () => {
  const [activeTab, setActiveTab] = useState('character'); 
  const [showSettings, setShowSettings] = useState(false);
  const [showSlotMachine, setShowSlotMachine] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  // 新增：用于顶部快捷选择的状态
  const [activeModalType, setActiveModalType] = useState(null); 

  // 接入中央厨房
  const { config, setConfig, fetchModels, availableModels, isLoadingModels } = useProject();

  // 快捷切换处理
  const handleQuickModelChange = (type, val) => {
    setConfig(prev => ({ ...prev, [type]: { ...prev[type], model: val } }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      
      {/* 快捷选择弹窗 */}
      <ModelSelectionModal 
        isOpen={activeModalType !== null} 
        title={activeModalType === 'analysis' ? "分析模型 (大脑)" : "绘图模型 (画师)"} 
        models={availableModels} 
        onClose={() => setActiveModalType(null)} 
        onSelect={(m) => handleQuickModelChange(activeModalType, m)}
      />

      {showSettings && <ConfigCenter onClose={() => setShowSettings(false)} fetchModels={fetchModels} availableModels={availableModels} isLoadingModels={isLoadingModels}/>}
      {showSlotMachine && <InspirationSlotMachine onClose={() => setShowSlotMachine(false)} />}

      {/* Top Navigation */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20"><Wand2 size={18} className="text-white" /></div><h1 className="font-bold text-lg hidden lg:block tracking-tight text-white">AI 导演工坊</h1></div>
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <button onClick={()=>setActiveTab('character')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='character'?"bg-slate-700 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><ImageIcon size={14}/> 角色工坊</button>
            <button onClick={()=>setActiveTab('storyboard')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='storyboard'?"bg-purple-600 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><Clapperboard size={14}/> 自动分镜</button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* 修复：加回了顶部的快捷模型选择器 */}
          <div className="hidden md:flex gap-3">
            <ModelTrigger 
              label="分析" 
              icon={Server} 
              value={config.analysis.model} 
              onOpenPicker={() => { setActiveModalType('analysis'); fetchModels('analysis'); }} 
              onManualChange={(v) => handleQuickModelChange('analysis', v)} 
            />
            <ModelTrigger 
              label="绘图" 
              icon={Palette} 
              value={config.image.model} 
              onOpenPicker={() => { setActiveModalType('image'); fetchModels('image'); }} 
              onManualChange={(v) => handleQuickModelChange('image', v)} 
            />
          </div>

          <button onClick={() => setShowSlotMachine(true)} className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white text-xs font-bold rounded-full shadow-lg shadow-orange-500/20 transition-all"><Sparkles size={12}/> 灵感</button>
          <button onClick={()=>setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><Settings size={20}/></button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 overflow-hidden relative">
        <div className={cn("h-full w-full", activeTab === 'character' ? 'block' : 'hidden')}>
          <CharacterLab onPreview={setPreviewUrl} setAspectRatio={()=>{}} aspectRatio="16:9" /> 
        </div>
        <div className={cn("h-full w-full", activeTab === 'storyboard' ? 'block' : 'hidden')}>
          <StoryboardStudio onPreview={setPreviewUrl} />
        </div>
      </div>
    </div>
  );
};
// 最终根组件：包裹 Provider
export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}
