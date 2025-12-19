import React, { useState, useMemo, useRef, useEffect, useContext, createContext } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2, Sparkles, Dices, Layers, PlusCircle, Play, UserPlus, FileAudio } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) { return twMerge(clsx(inputs)); }

// --- 1. 全局项目上下文 (Project Context - Phase 1: Data Layer Upgrade) ---
const ProjectContext = createContext();
export const useProject = () => useContext(ProjectContext);

const ProjectProvider = ({ children }) => {
  // 基础工具：安全 JSON 读取
  const safeJsonParse = (key, fallback) => {
    try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : fallback; } 
    catch (e) { console.warn(`Data corrupted for ${key}, resetting.`); return fallback; }
  };

  // 基础工具：Blob 转 Base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // A. 配置中心 (Config)
  const [config, setConfig] = useState(() => {
    const v3 = safeJsonParse('app_config_v3', null);
    if (v3) return v3;
    const oldKey = localStorage.getItem('gemini_key');
    return {
      analysis: { baseUrl: 'https://generativelanguage.googleapis.com', key: oldKey||'', model: 'gemini-3-pro' },
      image: { baseUrl: '', key: oldKey||'', model: 'nanobanana-2-pro' },
      video: { baseUrl: '', key: '', model: 'kling-v2.6' },
      audio: { baseUrl: 'https://api.openai.com', key: '', model: 'tts-1' }
    };
  });

  const [availableModels, setAvailableModels] = useState([]); 
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // B. 核心资产 (Assets)
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  
  // 角色工坊
  const [clPrompts, setClPrompts] = useState(() => safeJsonParse('cl_prompts', []));
  const [clImages, setClImages] = useState(() => safeJsonParse('cl_images', {}));
  
  // 自动分镜
  const [shots, setShots] = useState(() => safeJsonParse('sb_shots', []));
  const [shotImages, setShotImages] = useState(() => safeJsonParse('sb_shot_images', {}));
  
  // 制片台 & 演员库
  const [timeline, setTimeline] = useState(() => safeJsonParse('studio_timeline', []));
  const [actors, setActors] = useState(() => safeJsonParse('studio_actors', [])); // 结构: {id, name, url, voice_tone}
  const [scenes, setScenes] = useState(() => safeJsonParse('sb_scenes', []));     // 结构: {id, video_history: [], ...}

  // 持久化监听 (Persistence)
  useEffect(() => { localStorage.setItem('app_config_v3', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('sb_script', script); }, [script]);
  useEffect(() => { localStorage.setItem('sb_direction', direction); }, [direction]);
  useEffect(() => { localStorage.setItem('cl_prompts', JSON.stringify(clPrompts)); }, [clPrompts]);
  useEffect(() => { localStorage.setItem('cl_images', JSON.stringify(clImages)); }, [clImages]);
  useEffect(() => { localStorage.setItem('sb_shots', JSON.stringify(shots)); }, [shots]);
  useEffect(() => { localStorage.setItem('sb_shot_images', JSON.stringify(shotImages)); }, [shotImages]);
  useEffect(() => { localStorage.setItem('studio_timeline', JSON.stringify(timeline)); }, [timeline]);
  useEffect(() => { localStorage.setItem('studio_actors', JSON.stringify(actors)); }, [actors]);
  useEffect(() => { localStorage.setItem('sb_scenes', JSON.stringify(scenes)); }, [scenes]);

  // 功能 1：获取模型列表
  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!key) return alert(`请先配置 [${type}] 的 API Key`);
    setIsLoadingModels(true); setAvailableModels([]);
    try {
      let found = [];
      try { const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } }); const d = await r.json(); if(d.data) found = d.data.map(m=>m.id); } catch(e){}
      if(!found.length && baseUrl.includes('google')) { const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); const d = await r.json(); if(d.models) found = d.models.map(m=>m.name.replace('models/','')); }
      if(found.length) { setAvailableModels([...new Set(found)].sort()); alert(`成功获取 ${found.length} 个模型`); } else { alert("连接成功，但未自动获取列表。"); }
    } catch(e) { alert("连接失败: " + e.message); } finally { setIsLoadingModels(false); }
  };

  // 功能 2：通用 API 路由 (The Router)
  const callApi = async (type, payload) => {
    const { baseUrl, key, model: configModel } = config[type];
    const activeModel = payload.model || configModel; 
    if (!key) throw new Error(`请先配置 [${type}] 的 API Key`);

    // 1. Analysis (Text/LLM)
    if (type === 'analysis') {
        const { system, user, asset } = payload;
        let mimeType=null, base64Data=null;
        if (asset) { const d=asset.data||asset; mimeType=d.split(';')[0].split(':')[1]; base64Data=d.split(',')[1]; }
        
        // Google Native Protocol
        if (baseUrl.includes('google') && !baseUrl.includes('openai') && !baseUrl.includes('v1')) {
            const parts=[{text:system+"\n"+user}]; if(base64Data) parts.push({inlineData:{mimeType,data:base64Data}});
            const r=await fetch(`${baseUrl}/v1beta/models/${activeModel}:generateContent?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts}]})});
            if(!r.ok) throw new Error("Analysis API Error"); 
            return (await r.json()).candidates[0].content.parts[0].text;
        }
        // OpenAI Standard
        const content=[{type:"text",text:user}]; if(base64Data) content.push({type:"image_url",image_url:{url:`data:${mimeType};base64,${base64Data}`}});
        const r=await fetch(`${baseUrl}/v1/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:activeModel,messages:[{role:"system",content:system},{role:"user",content:content}]})});
        return (await r.json()).choices[0].message.content;
    }

    // 2. Image (Generation)
    if (type === 'image') {
        const { prompt, aspectRatio, useImg2Img, refImg, refImages, strength } = payload;
        
        // 2025 画幅策略
        let size="1024x1024"; 
        if(aspectRatio==="16:9") size="1280x720"; 
        else if(aspectRatio==="9:16") size="720x1280"; 
        else if(aspectRatio==="2.35:1") size="1536x640";

        const body={model:activeModel, prompt, n:1, size}; 
        
        // [New] 多图参考支持 (如果 API 支持 ref_images 数组，优先使用)
        // 目前大多数中转 API 仍仅支持单图 image，这里做兼容处理：优先取 refImg，如果没有，取 refImages[0]
        const mainRef = refImg || (refImages && refImages.length > 0 ? refImages[0] : null);
        
        if (useImg2Img && mainRef) {
            body.image = mainRef.split(',')[1]; // 去头
            body.strength = parseFloat(strength);
        }
        
        const r=await fetch(`${baseUrl}/v1/images/generations`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify(body)});
        const data=await r.json(); 
        if(!r.ok) throw new Error(data.error?.message||"Image Gen Error"); 
        return data.data[0].url;
    }

    // 3. Audio (TTS)
    if (type === 'audio') {
        const { input, voice, speed } = payload;
        const r = await fetch(`${baseUrl}/v1/audio/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify({ model: activeModel, input, voice: voice || 'alloy', speed: speed || 1.0 }) });
        if (!r.ok) throw new Error((await r.json()).error?.message || "TTS Error");
        return await blobToBase64(await r.blob());
    }

    // 4. SFX (Sound Effects)
    if (type === 'sfx') {
        const { prompt, duration } = payload;
        const endpoint = baseUrl.includes('elevenlabs') ? '/v1/sound-generation' : '/v1/audio/sound-effects'; 
        const body = { text: prompt, duration_seconds: duration || 5, prompt_influence: 0.3 };
        if (!baseUrl.includes('elevenlabs')) body.model = activeModel || 'eleven-sound-effects'; 
        const r = await fetch(`${baseUrl}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error("SFX Error");
        return await blobToBase64(await r.blob());
    }

    // 5. Video (I2V)
    if (type === 'video') {
        const { prompt, startImg, duration, aspectRatio } = payload; 
        const body = {
            model: activeModel,
            prompt: prompt,
            image: startImg, 
            duration: duration || 5, 
            aspect_ratio: aspectRatio || "16:9",
            size: "1080p" 
        };

        const submitRes = await fetch(`${baseUrl}/v1/videos/generations`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        
        if (!submitRes.ok) throw new Error((await submitRes.json()).error?.message || "Video Submit Failed");
        const submitData = await submitRes.json();
        
        const taskId = submitData.id || submitData.data?.id;
        if (!taskId) { if (submitData.data && submitData.data[0].url) return submitData.data[0].url; throw new Error("No Task ID returned"); }

        // 轮询 (10分钟超时)
        for (let i = 0; i < 120; i++) { 
            await new Promise(r => setTimeout(r, 5000));
            const checkRes = await fetch(`${baseUrl}/v1/videos/generations/${taskId}`, { headers: { 'Authorization': `Bearer ${key}` } });
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                const status = checkData.status || checkData.data?.status;
                if (status === 'SUCCEEDED' || status === 'completed') return checkData.data?.[0]?.url || checkData.url;
                if (status === 'FAILED') throw new Error("Video Generation Failed");
            }
        }
        throw new Error("Video Generation Timeout");
    }
  };

  // 功能 3：真·AI 灵感生成 (New)
  const generateInspiration = async () => {
    // 调用 Analysis 接口，让 LLM 发挥创意
    const prompt = `Brainstorm 3 unique, high-concept film ideas. 
    Format: Return ONLY a valid JSON object with this structure:
    {
      "genre": "Genre Name (e.g. Cyberpunk Noir)",
      "theme": "Core Theme (e.g. Memory vs Reality)",
      "visual": "Visual Style Description (e.g. Neon-lit rain, high contrast)",
      "logline": "A one-sentence summary of the story."
    }
    Make it creative and diverse.`;
    
    try {
        const res = await callApi('analysis', { 
            system: "You are a creative film producer engine.", 
            user: prompt 
        });
        // 简单的 JSON 提取
        let jsonStr = res.match(/\{[\s\S]*\}/)?.[0];
        if (!jsonStr) throw new Error("Format Error");
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Inspiration Error:", e);
        // 降级方案：返回随机预设
        return { genre: "科幻", theme: "探索", visual: "赛博朋克", logline: "系统繁忙，这是备用灵感。" };
    }
  };

  const value = {
    config, setConfig,
    script, setScript, direction, setDirection,
    clPrompts, setClPrompts, clImages, setClImages,
    shots, setShots, shotImages, setShotImages,
    timeline, setTimeline,
    actors, setActors, 
    scenes, setScenes, 
    callApi, fetchModels, availableModels, isLoadingModels,
    generateInspiration // [New] 导出灵感生成器
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
// --- 2. 通用组件库 (UI Components - Fully Loaded v3.2) ---

// A. 大型模型选择弹窗 (支持滚轮横向滚动)
const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const scrollRef = useRef(null);
  const handleWheel = (e) => { if (scrollRef.current) { e.preventDefault(); scrollRef.current.scrollLeft += e.deltaY; } };

  const categorizedModels = useMemo(() => {
    const lower = search.toLowerCase();
    const all = models.filter(m => m.toLowerCase().includes(lower));
    return {
      "All": all,
      "OpenAI": all.filter(m => m.includes('gpt') || m.includes('o1') || m.includes('dall') || m.includes('tts')),
      "Google": all.filter(m => m.includes('gemini') || m.includes('banana') || m.includes('imagen') || m.includes('veo')),
      "Image": all.filter(m => ['flux', 'midjourney', 'stable', 'banana', 'jimeng', 'recraft'].some(k => m.toLowerCase().includes(k))),
      "Video": all.filter(m => ['kling', 'luma', 'runway', 'sora', 'hailuo', 'wan'].some(k => m.toLowerCase().includes(k))),
    };
  }, [models, search]);
  const tabs = ["All", "OpenAI", "Google", "Image", "Video"];

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4 shrink-0">
          <div className="flex justify-between items-center"><h3 className="text-white font-bold flex gap-2"><LayoutGrid size={20} className="text-blue-500"/> 选择: <span className="text-blue-400">{title}</span></h3><button onClick={onClose}><X size={20}/></button></div>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索模型 ID..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"/>
        </div>
        <div ref={scrollRef} onWheel={handleWheel} className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 shrink-0 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 pb-3 min-w-max">{tabs.map(tab => (<button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-1.5 text-xs font-medium rounded-full border transition-all", activeTab === tab ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400")}>{tab} <span className="ml-1 opacity-50">{categorizedModels[tab]?.length||0}</span></button>))}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-950/50 scrollbar-thin">
          {categorizedModels[activeTab]?.map(m => (<button key={m} onClick={() => { onSelect(m); onClose(); }} className="p-3 rounded border border-slate-800 bg-slate-900 hover:border-blue-500 text-left text-sm text-slate-300 truncate transition-all">{m}</button>))}
        </div>
      </div>
    </div>
  );
};

// B. 模型触发器 (支持自定义宽度和颜色)
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, colorTheme = "slate", className }) => {
  const [isManual, setIsManual] = useState(false);
  const themes = { slate: { border: "border-slate-700", icon: "text-slate-400", bg: "bg-slate-900" }, blue: { border: "border-blue-900/50", icon: "text-blue-400", bg: "bg-blue-950/20 hover:border-blue-700" }, purple: { border: "border-purple-900/50", icon: "text-purple-400", bg: "bg-purple-950/20 hover:border-purple-700" } };
  const t = themes[colorTheme] || themes.slate;
  return (
    <div className={cn("flex items-center rounded-lg border transition-all h-9 group", t.bg, t.border, className || "w-40 md:w-56")}>
      <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full shrink-0"><Icon size={14} className={t.icon}/><span className={cn("text-xs font-medium hidden lg:inline", t.icon)}>{label}</span></div>
      <div className="flex-1 px-2 h-full flex items-center min-w-0 cursor-pointer" onClick={!isManual ? onOpenPicker : undefined}>
        {isManual ? <input value={value} onChange={e => onManualChange(e.target.value)} className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono" autoFocus onBlur={() => setIsManual(false)}/> : <div className="w-full flex justify-between text-xs text-slate-300 font-mono"><span className="truncate mr-1">{value || "Default"}</span><ChevronDown size={12} className="opacity-50"/></div>}
      </div>
      <button onClick={e => { e.stopPropagation(); setIsManual(!isManual); }} className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50 shrink-0 hover:bg-white/10"><Pencil size={12}/></button>
    </div>
  );
};

// C. 全能配置中心 (Config Center)
const ConfigCenter = ({ onClose, fetchModels, availableModels, isLoadingModels }) => {
  const { config, setConfig } = useProject();
  const [activeTab, setActiveTab] = useState("analysis");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], [key]: value } }));
  const tabs = [{id:"analysis",label:"大脑 (LLM)",icon:Brain,color:"text-blue-400"},{id:"image",label:"画师 (Image)",icon:Palette,color:"text-purple-400"},{id:"video",label:"摄像 (Video)",icon:Film,color:"text-orange-400"},{id:"audio",label:"录音 (Audio)",icon:Mic,color:"text-green-400"}];
  const cur = config[activeTab];
  return (
    <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[80vh] rounded-2xl flex overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="w-64 bg-slate-950 border-r border-slate-800 p-4 space-y-2">
          <h2 className="text-xl font-bold text-white mb-6 flex gap-2"><Settings className="text-blue-500"/> 设置中心</h2>
          {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("w-full flex gap-3 px-4 py-3 rounded-lg transition-all", activeTab === t.id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900")}><t.icon size={18} className={activeTab === t.id ? t.color : ""}/>{t.label}</button>)}
        </div>
        <div className="flex-1 p-8 space-y-6 overflow-y-auto">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4"><h3 className="text-xl font-bold text-white">{tabs.find(t => t.id === activeTab).label} 配置</h3><button onClick={onClose} className="px-4 py-2 bg-blue-600 rounded text-white text-sm hover:bg-blue-500 shadow-lg">完成设定</button></div>
          <div className="space-y-2"><label className="text-xs text-slate-400">Base URL</label><input value={cur.baseUrl} onChange={e => updateConfig('baseUrl', e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"/></div>
          <div className="space-y-2"><label className="text-xs text-slate-400">API Key</label><input type="password" value={cur.key} onChange={e => updateConfig('key', e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"/></div>
          <div className="space-y-2 pt-4 border-t border-slate-800">
             <div className="flex justify-between"><label className="text-xs text-slate-400">Model ID</label><button onClick={() => fetchModels(activeTab)} className="text-xs text-blue-400 flex gap-1"><RefreshCw size={12}/> 获取列表</button></div>
             <ModelTrigger label="当前模型" icon={LayoutGrid} value={cur.model} onOpenPicker={() => { fetchModels(activeTab); setShowModelPicker(true); }} onManualChange={v => updateConfig('model', v)} className="w-full" variant="horizontal" colorTheme={tabs.find(t => t.id === activeTab).color.split('-')[1]}/>
             <p className="text-[10px] text-slate-500 mt-2">推荐: gpt-5.2-pro, gemini-3-pro, nanobanana-2-pro, kling-v2.6, tts-1-hd</p>
          </div>
        </div>
      </div>
      <ModelSelectionModal isOpen={showModelPicker} models={availableModels} onClose={() => setShowModelPicker(false)} onSelect={m => updateConfig('model', m)} title={activeTab}/>
    </div>
  );
};

// D. 图片预览灯箱
const ImagePreviewModal = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  useEffect(() => { const h = (e) => { e.preventDefault(); setScale(s => Math.max(0.5, Math.min(5, s - e.deltaY * 0.001))); }; document.addEventListener('wheel', h, { passive: false }); return () => document.removeEventListener('wheel', h); }, []);
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center overflow-hidden" onClick={onClose}>
      <div className="absolute top-4 right-4 flex gap-4 z-50"><div className="bg-slate-800/80 px-3 py-1 rounded-full text-xs text-slate-300">{(scale * 100).toFixed(0)}%</div><button onClick={onClose} className="p-2 bg-slate-800/80 hover:bg-red-600 rounded-full text-white"><X size={20}/></button></div>
      <img src={url} className="max-w-full max-h-full object-contain transition-transform duration-75 cursor-move" style={{ transform: `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)` }} onMouseDown={e => { if (scale > 1) { setDrag(true); start.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; } }} onMouseMove={e => { if (drag) setPos({ x: e.clientX - start.current.x, y: e.clientY - start.current.y }); }} onMouseUp={() => setDrag(false)} onClick={e => e.stopPropagation()}/>
    </div>
  );
};
// E. 灵感老虎机 (Real AI)
const InspirationSlotMachine = ({ onClose }) => {
  const { setScript, setDirection, generateInspiration } = useProject();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const spin = async () => {
    setSpinning(true); setResult(null);
    try { const idea = await generateInspiration(); setResult(idea); } 
    catch(e) { alert("灵感生成失败"); } finally { setSpinning(false); }
  };
  const apply = () => { if (!result) return; setScript(`(Logline) ${result.logline}\n\n故事背景设定在${result.genre}的世界...`); setDirection(`视觉风格：${result.visual}；\n核心主题：${result.theme}`); onClose(); alert("✨ 灵感已注入！"); };
  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gradient-to-br from-indigo-900 to-purple-900 border border-purple-500/50 w-full max-w-md rounded-2xl p-8 shadow-2xl text-center relative" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-white mb-6 flex justify-center gap-2"><Sparkles className="text-yellow-400"/> AI 灵感抽取</h2>
        <div className="space-y-4 mb-8">
            <div className="bg-black/40 rounded p-4 border border-white/10"><div className="text-xs text-purple-300">类型</div><div className="text-lg font-bold text-white">{result ? result.genre : "---"}</div></div>
            <div className="bg-black/40 rounded p-4 border border-white/10"><div className="text-xs text-purple-300">视觉</div><div className="text-sm text-slate-300">{result ? result.visual : "---"}</div></div>
            <div className="bg-black/40 rounded p-4 border border-white/10"><div className="text-xs text-purple-300">梗概</div><div className="text-sm text-slate-300 italic">{result ? result.logline : "点击按钮，让 AI 构思..."}</div></div>
        </div>
        <button onClick={spin} disabled={spinning} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-lg rounded-xl mb-4 shadow-lg active:scale-95 transition-all"><Dices size={24}/> {spinning ? "AI 构思中..." : "生成创意"}</button>
        {result && !spinning && <button onClick={apply} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm animate-in fade-in">使用此灵感</button>}
      </div>
    </div>
  );
};

// F. 配音/音效 弹窗 (Audio Generator)
const AudioGeneratorModal = ({ isOpen, onClose, initialText, onGenerate }) => {
  const [activeTab, setActiveTab] = useState("tts");
  const [text, setText] = useState(initialText || "");
  const [voice, setVoice] = useState("alloy");
  const [speed, setSpeed] = useState(1.0);
  const [sfxModel, setSfxModel] = useState("eleven-sound-effects");
  const [loading, setLoading] = useState(false);
  const voices = [{id:'alloy',label:'Alloy (中性)'},{id:'echo',label:'Echo (男)'},{id:'fable',label:'Fable (英)'},{id:'onyx',label:'Onyx (深沉)'},{id:'nova',label:'Nova (女)'},{id:'shimmer',label:'Shimmer (清)'}];
  useEffect(() => { setText(initialText || ""); }, [initialText]);
  const handleFileUpload = (e) => { const f=e.target.files[0]; if(f){if(f.size>5*1024*1024)return alert("Too big");const r=new FileReader();r.onloadend=()=>{onGenerate({text:"[本地] "+f.name,audioData:r.result});onClose()};r.readAsDataURL(f);} };
  const handleGen = async () => { if(!text)return; setLoading(true); try{ if(activeTab==='tts')await onGenerate({text,voice,speed,isTTS:true}); else if(activeTab==='sfx')await onGenerate({text,isSFX:true,model:sfxModel}); onClose(); }catch(e){alert(e.message)}finally{setLoading(false)} };
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-green-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between mb-4"><h3 className="font-bold text-white flex gap-2"><Mic className="text-green-400"/> 添加声音</h3><div className="flex bg-slate-800 rounded p-1"><button onClick={()=>setActiveTab("tts")} className={cn("px-3 py-1 text-xs rounded",activeTab==="tts"?"bg-green-600":"text-slate-400")}>配音</button><button onClick={()=>setActiveTab("sfx")} className={cn("px-3 py-1 text-xs rounded",activeTab==="sfx"?"bg-orange-600":"text-slate-400")}>AI音效</button><button onClick={()=>setActiveTab("upload")} className={cn("px-3 py-1 text-xs rounded",activeTab==="upload"?"bg-blue-600":"text-slate-400")}>上传</button></div></div>
        {activeTab==="tts"&&<div className="space-y-4"><textarea value={text} onChange={e=>setText(e.target.value)} className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white resize-none" placeholder="台词..."/><div className="grid grid-cols-2 gap-4"><select value={voice} onChange={e=>setVoice(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white">{voices.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select><input type="range" min="0.5" max="2.0" step="0.1" value={speed} onChange={e=>setSpeed(parseFloat(e.target.value))} className="w-full accent-green-500"/></div><button onClick={handleGen} disabled={loading} className="w-full py-3 bg-green-600 text-white rounded font-bold shadow">{loading?<Loader2 className="animate-spin"/>:"生成配音"}</button></div>}
        {activeTab==="sfx"&&<div className="space-y-4"><textarea value={text} onChange={e=>setText(e.target.value)} className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white" placeholder="音效描述..."/><input value={sfxModel} onChange={e=>setSfxModel(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white" placeholder="Model ID"/><button onClick={handleGen} disabled={loading} className="w-full py-3 bg-orange-600 text-white rounded font-bold shadow">{loading?<Loader2 className="animate-spin"/>:"生成音效"}</button></div>}
        {activeTab==="upload"&&<div className="h-48 border-2 border-dashed border-slate-700 rounded flex flex-col items-center justify-center relative"><input type="file" accept="audio/*" onChange={handleFileUpload} className="absolute inset-0 opacity-0"/><Upload size={32} className="text-slate-500"/><p className="text-slate-300 mt-2">点击上传</p></div>}
      </div>
    </div>
  );
};

// G. 视频生成设置弹窗
const VideoGeneratorModal = ({ isOpen, onClose, initialPrompt, initialModel, onGenerate }) => {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [model, setModel] = useState(initialModel || "kling-v2.6");
  const [loading, setLoading] = useState(false);
  useEffect(() => { setPrompt(initialPrompt || ""); setModel(initialModel || "kling-v2.6"); }, [initialPrompt, initialModel, isOpen]);
  const handleGen = async () => { if(!model)return alert("No Model"); setLoading(true); try{ await onGenerate({prompt,model}); onClose(); }catch(e){}finally{setLoading(false)} };
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-purple-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in zoom-in" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between mb-4"><h3 className="font-bold text-white flex gap-2"><Film className="text-purple-400"/> 生成视频</h3><button onClick={onClose}><X size={20}/></button></div>
        <div className="space-y-4">
          <div className="flex gap-2"><input value={model} onChange={e=>setModel(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"/><button onClick={()=>setModel('kling-v2.6')} className="px-2 bg-slate-800 rounded text-xs text-slate-300">Kling</button><button onClick={()=>setModel('luma-ray-2')} className="px-2 bg-slate-800 rounded text-xs text-slate-300">Luma</button></div>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white resize-none" placeholder="运动提示词..."/>
          <button onClick={handleGen} disabled={loading} className="w-full py-3 bg-purple-600 text-white rounded font-bold shadow">{loading?<Loader2 className="animate-spin"/>:"确认生成"}</button>
        </div>
      </div>
    </div>
  );
};

// H. 动态播放器 (Video/Image/Audio Mixed)
const AnimaticPlayer = ({ isOpen, onClose, shots, images, customPlaylist }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(new Audio()); 
  const videoRef = useRef(null);

  const playlist = useMemo(() => {
    if (customPlaylist) return customPlaylist;
    return shots.map(s => {
      const history = images[s.id] || [];
      const lastItem = history.length > 0 ? history[history.length - 1] : null;
      const url = typeof lastItem === 'string' ? lastItem : (lastItem?.url || null);
      let duration = 3000; 
      if (s.duration) { const match = s.duration.match(/(\d+)/); if (match) duration = parseInt(match[0]) * 1000; }
      return { ...s, url, duration: Math.max(2000, duration), audio_url: null, video_url: null, type: 'image' }; 
    }).filter(item => item.url); 
  }, [shots, images, customPlaylist]);

  useEffect(() => {
    if (isOpen && playlist.length > 0) { setIsPlaying(true); setCurrentIndex(0); setProgress(0); } 
    else { audioRef.current.pause(); audioRef.current.src = ""; }
  }, [isOpen, playlist]);

  useEffect(() => {
    if (!isOpen || !playlist[currentIndex]) return;
    const item = playlist[currentIndex];
    if (item.audio_url) { audioRef.current.src = item.audio_url; audioRef.current.volume = 1.0; audioRef.current.play().catch(e=>{}); } 
    else { audioRef.current.pause(); }
    if (item.video_url && videoRef.current) { videoRef.current.src = item.video_url; videoRef.current.play().catch(e=>{}); }
  }, [currentIndex, isOpen, playlist]);

  useEffect(() => {
    if (!isPlaying || playlist.length === 0) return;
    const item = playlist[currentIndex];
    const stepTime = 50; const totalSteps = item.duration / stepTime;
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++; setProgress((currentStep / totalSteps) * 100);
      if (currentStep >= totalSteps) {
        if (currentIndex < playlist.length - 1) { setCurrentIndex(p => p + 1); setProgress(0); currentStep = 0; } 
        else { setIsPlaying(false); clearInterval(timer); audioRef.current.pause(); }
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
               {currentShot.video_url ? <video ref={videoRef} src={currentShot.video_url} className="w-full h-full object-contain" muted={false} /> : <img src={currentShot.url} className="w-full h-full object-contain animate-[kenburns_10s_ease-out_forwards]" style={{ transformOrigin: 'center center', animationDuration: `${currentShot.duration + 2000}ms` }} />}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-8 pb-16">
              <div className="text-yellow-400 font-mono text-xs mb-1">SHOT {currentShot.shotId || currentShot.id}</div>
              <div className="text-white text-lg md:text-2xl font-bold font-serif leading-relaxed drop-shadow-md">{currentShot.visual}</div>
              {currentShot.audio_url && <div className="text-green-400 text-sm mt-2 flex items-center gap-2 animate-pulse"><Volume2 size={14}/> 播放中...</div>}
            </div>
          </>
        ) : (<div className="text-slate-500">列表为空</div>)}
        <button onClick={()=>{onClose();audioRef.current.pause()}} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur"><X size={20}/></button>
      </div>
      <div className="w-full max-w-5xl h-1 bg-slate-800 mt-0 relative"><div className="h-full bg-blue-500 transition-all duration-75 ease-linear" style={{ width: `${((currentIndex + (progress/100)) / playlist.length) * 100}%` }} /></div>
      <div className="h-20 w-full flex items-center justify-center gap-6 bg-slate-900 border-t border-slate-800">
         <button onClick={() => { setCurrentIndex(0); setIsPlaying(true); }} className="p-3 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors"><Undo2 size={20}/></button>
         <button onClick={() => { if(isPlaying){setIsPlaying(false);audioRef.current.pause();if(videoRef.current)videoRef.current.pause();} else {setIsPlaying(true);if(playlist[currentIndex].audio_url)audioRef.current.play();if(playlist[currentIndex].video_url)videoRef.current.play();} }} className="p-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg scale-110 transition-transform">{isPlaying ? <div className="w-4 h-4 bg-white rounded-sm" /> : <div className="w-0 h-0 border-t-8 border-t-transparent border-l-[16px] border-l-white border-b-8 border-b-transparent ml-1" />}</button>
         <div className="text-xs text-slate-500 font-mono">{currentIndex + 1} / {playlist.length}</div>
      </div>
      <style>{`@keyframes kenburns { 0% { transform: scale(1); } 100% { transform: scale(1.05); } }`}</style>
    </div>
  );
};
// ==========================================
// 模块 2：角色工坊 (CharacterLab - Part 1: Logic & State)
// ==========================================
const CharacterLab = ({ onPreview }) => {
  // 接入中央厨房数据
  const { clPrompts, setClPrompts, clImages, setClImages, actors, setActors, callApi } = useProject();
  
  // 本地 UI 状态
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [referenceImage, setReferenceImage] = useState(() => { try { return localStorage.getItem('cl_ref') || null; } catch(e) { return null; } });
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('cl_ar') || "16:9");
  const [imgStrength, setImgStrength] = useState(0.8);
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 视图模式：grid=九宫格视角, sheet=角色设定卡
  const [activeView, setActiveView] = useState("grid"); 
  const [sheetUrl, setSheetUrl] = useState(null);

  // 内部状态同步
  const [localPrompts, setLocalPrompts] = useState(clPrompts);
  useEffect(() => { setLocalPrompts(clPrompts); }, [clPrompts]);

  // 数据持久化
  const safeSave = (key, val) => { try { localStorage.setItem(key, val); } catch (e) {} };
  useEffect(() => { safeSave('cl_desc', description); }, [description]);
  useEffect(() => { if(referenceImage) safeSave('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { safeSave('cl_lang', targetLang); }, [targetLang]);
  useEffect(() => { safeSave('cl_ar', aspectRatio); }, [aspectRatio]);

  // 图片上传处理
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) { 
      const reader = new FileReader(); 
      reader.onloadend = () => { 
        setReferenceImage(reader.result); 
        safeSave('cl_ref', reader.result); 
      }; 
      reader.readAsDataURL(file); 
    }
  };

  // 清空项目
  const clearProject = () => {
    if(confirm("确定清空角色设定吗？")) { 
      setDescription(""); 
      setReferenceImage(null); 
      setClPrompts([]); 
      setSheetUrl(null);
      localStorage.removeItem('cl_desc'); 
      localStorage.removeItem('cl_ref'); 
    }
  };

  // 核心功能 1：生成 9 大视角 Prompt
  const handleGenerateViews = async () => {
    setIsGenerating(true); 
    setClPrompts([]); 
    setClImages({});
    setActiveView("grid");
    
    const langInstruction = targetLang === "Chinese" 
      ? "2. 提示词内容(prompt)请**严格使用中文**，但需保留关键英文术语以便模型理解。" 
      : "2. 提示词内容(prompt)保持英文。";

    // 强制规定的 9 个视角
    const angleRequirements = "正面视图(Front View), 侧面视图(Side View), 背影(Back View), 面部特写(Close-up), 俯视(High Angle), 仰视(Low Angle), 动态姿势(Dynamic Pose), 电影广角(Wide Shot), 自然抓拍(Candid Shot)";

    const system = `你是一个专家级角色概念设计师。请生成 9 组标准电影镜头视角提示词。
    要求：
    1. 必须包含这9种视角，并作为 title 返回：${angleRequirements}。
    ${langInstruction}
    3. IMPORTANT: The 'prompt' field MUST explicitly describe the camera angle and character details.
    4. 严格返回 JSON 数组。格式示例：[{"title": "正面视图", "prompt": "Full body front view of..."}]`;

    try {
      const res = await callApi('analysis', { system, user: `描述内容: ${description}`, asset: referenceImage });
      
      // JSON 提取与清洗
      let jsonStr = res;
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      else {
        const start = res.indexOf('[');
        const end = res.lastIndexOf(']');
        if (start !== -1 && end !== -1) jsonStr = res.substring(start, end + 1);
      }
      
      setClPrompts(JSON.parse(jsonStr.trim()));
    } catch(e) { 
      alert("生成 Prompt 失败: " + e.message); 
    } finally { 
      setIsGenerating(false); 
    }
  };
  // 核心功能 2：生成角色设定卡 (Character Sheet)
  const handleGenerateSheet = async () => {
    if (!description) return alert("请先填写角色描述");
    setIsGenerating(true);
    setSheetUrl(null);
    setActiveView("sheet");

    // 反推的高级 Prompt 结构
    const sheetPrompt = `(Best Quality, Masterpiece), Character Reference Sheet, Concept Art of ${description}. 
    Composition: Split screen layout. 
    -- Left side: Full body main view of the character, dynamic pose, highly detailed.
    -- Right side: Orthographic turnarounds (Front view, Side view, Back view) diagram, flat lighting.
    -- Bottom: 3 different facial expressions (Happy, Angry, Surprised). 
    Style: High quality, white background, clean lines, consistent character features. --ar 16:9`;

    try {
      const url = await callApi('image', { 
        prompt: sheetPrompt, 
        aspectRatio: "16:9", // 设定图强制宽屏
        useImg2Img: !!referenceImage, 
        refImg: referenceImage, 
        strength: 0.65 // 稍微降低权重，给 AI 更多构图自由
      });
      setSheetUrl(url);
    } catch (e) {
      alert("生成设定卡失败: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 核心功能 3：注册为演员 (存入全局库)
  const handleRegisterActor = (url, defaultName) => {
    const name = prompt("请确认角色/演员名称:", defaultName || "主角");
    if (name) {
      const voice = prompt("请输入角色音色描述 (用于 TTS 配音):", "Neutral, clear voice");
      const newActor = { 
        id: Date.now(), 
        name, 
        url, 
        voice_tone: voice,
        desc: description 
      };
      setActors(prev => [...prev, newActor]);
      alert(`✅ 成功注册演员：【${name}】\n可在“自动分镜”中调用。`);
    }
  };

  // 核心功能 4：生成单张视角图 (带 Prompt 注入)
  const handleImageGen = async (idx, item, ar, useImg, ref, str) => {
    setClImages(prev => ({ ...prev, [idx]: [...(prev[idx] || []), { loading: true }] }));
    
    // 强制注入视角词和画幅参数
    const forcedPrompt = `(${item.title}), ${item.prompt} --ar ${ar}`;
    
    try {
      const url = await callApi('image', { 
        prompt: forcedPrompt, 
        aspectRatio: ar, 
        useImg2Img: useImg, 
        refImg: ref, 
        strength: str 
      });
      setClImages(prev => { 
        const h = [...(prev[idx] || [])].filter(i => !i.loading); 
        return { ...prev, [idx]: [...h, { url, loading: false }] }; 
      });
    } catch(e) { 
      setClImages(prev => { 
        const h = [...(prev[idx] || [])].filter(i => !i.loading); 
        return { ...prev, [idx]: [...h, { error: e.message, loading: false }] }; 
      });
    }
  };

  // 辅助功能：打包下载
  const downloadAll = async () => {
    const zip = new JSZip(); 
    const folder = zip.folder("character_design");
    
    // 保存提示词
    folder.file("prompts.txt", localPrompts.map(p => `[${p.title}]\n${p.prompt}`).join("\n\n"));
    
    // 保存九宫格图片
    const promises = Object.entries(clImages).map(async ([index, history]) => {
      const current = history[history.length - 1]; 
      if (current && current.url && !current.error) { 
        try { 
          const blob = await fetch(current.url).then(r => r.blob());
          folder.file(`view_${index}.png`, blob); 
        } catch (e) {} 
      }
    });

    // 保存设定卡
    if (sheetUrl) {
       try {
         const sheetBlob = await fetch(sheetUrl).then(r => r.blob());
         folder.file("character_sheet.png", sheetBlob);
       } catch(e) {}
    }

    await Promise.all(promises);
    saveAs(await zip.generateAsync({ type: "blob" }), "character_design.zip");
  };
  // 子组件：单视角卡片 (UI 细节修复版)
  const CharCard = ({ item, index, currentAr, currentRef, currentUseImg, currentStrength }) => {
    const history = clImages[index] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(item.prompt);
    
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    const currentImg = history[verIndex] || { loading: false, url: null, error: null };
    
    const handleGen = (e) => { 
      e.stopPropagation(); 
      handleImageGen(index, { title: item.title, prompt: isEditing ? editValue : item.prompt }, currentAr, currentUseImg, currentRef, currentStrength); 
    };

    const arClass = currentAr === "16:9" ? "aspect-video" : currentAr === "9:16" ? "aspect-[9/16]" : currentAr === "2.35:1" ? "aspect-[21/9]" : "aspect-square";

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col">
        {/* 图片区域 (增加 group/media 用于悬浮控制) */}
        <div className={cn("bg-black relative w-full shrink-0 group/media", arClass)}>
          
          {/* 渲染内容 */}
          {currentImg.loading ? (
            <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 text-slate-500">
              <Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span>
            </div>
          ) : currentImg.url ? (
            <div className="relative w-full h-full group/img cursor-zoom-in" onClick={(e)=>{e.stopPropagation(); onPreview(currentImg.url)}}>
              <img src={currentImg.url} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity">
                <button onClick={(e)=>{e.stopPropagation(); saveAs(currentImg.url, `view_${index}.png`)}} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={12}/></button>
              </div>
              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity">
                <button onClick={handleGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><RefreshCw size={12}/></button>
              </div>
            </div>
          ) : currentImg.error ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-xs text-center select-text bg-slate-900/80 backdrop-blur-sm z-10">
               <p className="line-clamp-4">{currentImg.error}</p>
               <button onClick={handleGen} className="mt-2 text-white underline hover:text-blue-400">重试</button>
             </div>
          ) : (
             <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/media:opacity-100 bg-black/40 backdrop-blur-[2px] transition-opacity">
               <button onClick={handleGen} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2"><Camera size={14}/> 生成</button>
             </div>
          )}
          
          {/* 历史记录翻页 (悬浮于最上层) */}
          {history.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur z-20 opacity-0 group-hover/media:opacity-100 transition-opacity">
              <button disabled={verIndex<=0} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v-1)}} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button>
              <span className="text-[10px] text-white select-none">{verIndex+1}/{history.length}</span>
              <button disabled={verIndex>=history.length-1} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v+1)}} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button>
            </div>
          )}
        </div>

        {/* 文字控制区域 */}
        <div className="p-3 border-t border-slate-800 flex-1 flex flex-col min-h-[100px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-200 text-xs truncate pr-2">{item.title}</h3>
            {/* 单图注册演员按钮 */}
            {currentImg.url && (
              <button onClick={()=>handleRegisterActor(currentImg.url, item.title)} className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 border border-green-800/50 bg-green-900/20 px-1.5 py-0.5 rounded transition-colors mr-2">
                <UserPlus size={10}/> 存为演员
              </button>
            )}
            <div className="flex gap-1 ml-auto">
              {isEditing ? (
                <><button onClick={()=>{const u=[...localPrompts];u[index].prompt=editValue;setLocalPrompts(u);setIsEditing(false)}} className="text-green-400 hover:text-green-300"><CheckCircle2 size={14}/></button>
                <button onClick={()=>setIsEditing(false)} className="text-red-400 hover:text-red-300"><X size={14}/></button></>
              ) : (
                <><button onClick={()=>setIsEditing(true)} className="text-slate-500 hover:text-blue-400"><Pencil size={12}/></button>
                <button onClick={()=>navigator.clipboard.writeText(item.prompt)} className="text-slate-500 hover:text-white"><Copy size={12}/></button></>
              )}
            </div>
          </div>
          {isEditing ? (
            <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-full h-full bg-slate-950 border border-blue-500/50 rounded p-2 text-[10px] text-slate-200 font-mono outline-none resize-none" autoFocus/>
          ) : (
            <p className="text-[10px] text-slate-500 line-clamp-3 font-mono bg-black/30 p-2 rounded flex-1 select-all hover:text-slate-400 transition-colors cursor-pointer" onClick={() => setIsEditing(true)}>{item.prompt}</p>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="flex h-full overflow-hidden">
      {/* 侧边栏：设置与控制 */}
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto z-10 scrollbar-thin">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-200 flex items-center gap-2"><ImageIcon size={16}/> 角色设定</h3>
          <button onClick={clearProject} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button>
        </div>

        <div className="space-y-6">
          {/* 参考图上传 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">参考图 (可选)</label>
            <div className="relative group h-32 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 overflow-hidden transition-all">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer"/>
              {referenceImage ? <img src={referenceImage} className="w-full h-full object-cover opacity-80"/> : <div className="text-slate-500 flex flex-col items-center"><Upload size={24} className="mb-2"/><span className="text-xs">上传参考图</span></div>}
            </div>
          </div>

          {/* 角色描述 */}
          <div className="space-y-2 flex-1">
            <label className="text-sm font-medium text-slate-300">角色描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-32 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-600" placeholder="例如：一位银发精灵弓箭手，穿着带有发光符文的森林绿色皮甲..."/>
          </div>

          {/* 参数面板 */}
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-4">
             <div className="grid grid-cols-2 gap-2">
               <div className="space-y-1">
                 <label className="text-[10px] text-slate-500">画面比例</label>
                 <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                   <option value="16:9">16:9 (横屏)</option>
                   <option value="9:16">9:16 (竖屏)</option>
                   <option value="1:1">1:1 (方图)</option>
                   <option value="2.35:1">2.35:1 (电影)</option>
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] text-slate-500">提示词语言</label>
                 <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                   <option value="Chinese">中文</option>
                   <option value="English">English</option>
                 </select>
               </div>
             </div>
             
             {/* 权重滑块 */}
             <div className="pt-2 border-t border-slate-700/50 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考权重</label>
                  <input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/>
                </div>
                {useImg2Img && referenceImage && (
                  <div className="space-y-1 animate-in fade-in">
                    <div className="flex justify-between text-[10px] text-slate-500"><span>Strength: {imgStrength}</span></div>
                    <input 
                      type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} 
                      onChange={(e) => setImgStrength(e.target.value)} 
                      onWheel={(e) => { e.preventDefault(); const d = e.deltaY < 0 ? 0.05 : -0.05; setImgStrength(p => Math.min(1.0, Math.max(0.1, (parseFloat(p) + d).toFixed(2)))); }}
                      className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"
                    />
                    <div className="text-[9px] text-slate-500 leading-tight mt-1">1.0: 强一致 (像原图)<br/>0.1: 弱一致 (自由发挥)</div>
                  </div>
                )}
             </div>
          </div>

          {/* 操作按钮区 */}
          <div className="space-y-3 pt-2">
            <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95">
              {isGenerating ? <Loader2 className="animate-spin" size={16}/> : <Wand2 size={16}/>} 
              {isGenerating ? '构思中...' : '1. 生成 9 组视角'}
            </button>
            <button onClick={handleGenerateSheet} disabled={isGenerating} className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95">
              {isGenerating ? <Loader2 className="animate-spin" size={16}/> : <ImageIcon size={16}/>} 
              {isGenerating ? '绘制中...' : '2. 生成设定卡 (Sheet)'}
            </button>
          </div>
        </div>
      </div>

      {/* 右侧展示区 */}
      <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
        {/* 顶部 Tab 切换 */}
        <div className="h-12 border-b border-slate-800 flex items-center gap-6 px-6 bg-slate-900/80 backdrop-blur z-10 shrink-0">
            <button onClick={()=>setActiveView("grid")} className={cn("text-sm font-bold border-b-2 py-3 transition-all", activeView==="grid"?"border-blue-500 text-white":"border-transparent text-slate-500 hover:text-slate-300")}>九宫格视角</button>
            <button onClick={()=>setActiveView("sheet")} className={cn("text-sm font-bold border-b-2 py-3 transition-all", activeView==="sheet"?"border-purple-500 text-white":"border-transparent text-slate-500 hover:text-slate-300")}>角色设定卡</button>
            
            {/* 批量操作 */}
            {activeView === "grid" && localPrompts.length > 0 && (
               <div className="ml-auto flex items-center gap-2 animate-in fade-in">
                 <button onClick={() => localPrompts.forEach((p, idx) => handleImageGen(idx, {title:p.title, prompt:p.prompt}, aspectRatio, useImg2Img, referenceImage, imgStrength))} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-200 text-xs rounded border border-blue-800 transition-all"><Camera size={14}/> 全部生成</button>
                 <button onClick={downloadAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-all"><Download size={14}/> 打包下载</button>
               </div>
            )}
        </div>

        {/* 内容滚动区 */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700">
          {activeView === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
                  {localPrompts.map((item, i) => (
                    <CharCard key={i} item={item} index={i} currentAr={aspectRatio} currentRef={referenceImage} currentUseImg={useImg2Img} currentStrength={imgStrength}/>
                  ))}
                  {localPrompts.length === 0 && (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-500 gap-4">
                      <LayoutGrid size={48} className="opacity-20"/>
                      <p>暂无视角数据，请先点击左侧生成</p>
                    </div>
                  )}
              </div>
          ) : (
              <div className="flex flex-col items-center justify-center min-h-[50vh]">
                  {sheetUrl ? (
                    <div className="relative max-w-4xl w-full group animate-in zoom-in duration-300">
                      <img src={sheetUrl} className="w-full rounded-xl shadow-2xl border border-slate-800 cursor-zoom-in" onClick={()=>onPreview(sheetUrl)}/>
                      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={()=>handleRegisterActor(sheetUrl)} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 transition-all transform hover:scale-105">
                           <UserPlus size={16}/> 注册为演员
                         </button>
                         <button onClick={()=>saveAs(sheetUrl, 'character_sheet.png')} className="bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded-full backdrop-blur"><Download size={20}/></button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-600 flex flex-col items-center gap-4">
                      <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800"><ImageIcon size={32} className="opacity-20"/></div>
                      <p>点击左侧“生成设定卡”，获取专业的三视图设定图</p>
                    </div>
                  )}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 3：自动分镜工作台 (StoryboardStudio - Phase 3: 3-Column & Logic)
// ==========================================

// 局部组件：灵感老虎机 (移入分镜内部)
const StoryboardInspiration = ({ onClose, onApply }) => {
  const { generateInspiration } = useProject();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  
  const spin = async () => {
    setSpinning(true); setResult(null);
    try { const idea = await generateInspiration(); setResult(idea); } 
    catch(e) { alert("AI 灵感生成失败"); } finally { setSpinning(false); }
  };

  return (
    <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-orange-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 to-red-500"/>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Sparkles className="text-yellow-400"/> 剧本灵感生成器</h3>
        
        {/* 结果展示区 */}
        <div className="space-y-3 mb-6 min-h-[120px]">
          {result ? (
            <div className="animate-in zoom-in duration-300 space-y-3">
               <div className="bg-black/40 p-3 rounded border border-white/10">
                 <div className="text-[10px] text-orange-300 uppercase">Logline (一句话故事)</div>
                 <div className="text-sm text-white font-medium">{result.logline}</div>
               </div>
               <div className="grid grid-cols-2 gap-2">
                 <div className="bg-black/40 p-2 rounded border border-white/10">
                   <div className="text-[10px] text-purple-300">风格</div>
                   <div className="text-xs text-white">{result.genre}</div>
                 </div>
                 <div className="bg-black/40 p-2 rounded border border-white/10">
                   <div className="text-[10px] text-blue-300">视觉</div>
                   <div className="text-xs text-white">{result.visual}</div>
                 </div>
               </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">点击下方按钮，让 AI 构思一个惊艳的开场...</div>
          )}
        </div>

        <div className="flex gap-2">
           <button onClick={spin} disabled={spinning} className="flex-1 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-bold rounded-lg shadow transition-all">
             {spinning ? <Loader2 className="animate-spin mx-auto"/> : <><Dices className="inline mr-2" size={18}/> 随机生成</>}
           </button>
           {result && !spinning && (
             <button onClick={()=>onApply(result)} className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg border border-white/20">
               采用此灵感
             </button>
           )}
        </div>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20}/></button>
      </div>
    </div>
  );
};
const StoryboardStudio = ({ onPreview }) => {
  const { script, setScript, direction, setDirection, shots, setShots, shotImages, setShotImages, scenes, setScenes, actors, callApi } = useProject();
  
  // 本地状态
  const [mediaAsset, setMediaAsset] = useState(null); 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sbAspectRatio, setSbAspectRatio] = useState(() => localStorage.getItem('sb_ar') || "16:9");
  const [sbTargetLang, setSbTargetLang] = useState(() => localStorage.getItem('sb_lang') || "English");
  
  // 交互状态
  const [selectedShotIds, setSelectedShotIds] = useState([]); // 多选池
  const [showInspiration, setShowInspiration] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState(null); // 当前查看的大分镜

  // 持久化
  useEffect(() => { localStorage.setItem('sb_ar', sbAspectRatio); }, [sbAspectRatio]);
  useEffect(() => { localStorage.setItem('sb_lang', sbTargetLang); }, [sbTargetLang]);

  // 工具：素材上传
  const handleAssetUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => setMediaAsset({ type: 'image', data: reader.result, name: file.name });
        reader.readAsDataURL(file);
    }
  };

  // 1. 剧本分析 (生成小分镜)
  const handleAnalyzeScript = async () => {
    if (!script && !direction && !mediaAsset) return alert("请先在左侧填写剧本或上传素材");
    setIsAnalyzing(true);
    const system = `Role: Expert Film Director. Task: Breakdown script into Key Shots.
    Requirements: 
    1. **Format**: JSON Array ONLY. Keys: id, visual, audio, sora_prompt.
    2. **Camera**: Use professional terms (Dolly In, Pan Left, Rack Focus).
    3. **Language**: ${sbTargetLang}.
    Output Example: [{"id":1, "visual":"...", "audio":"...", "sora_prompt":"..."}]`;
    
    try {
      const res = await callApi('analysis', { system, user: `Script: ${script}\nStyle: ${direction}`, asset: mediaAsset });
      let jsonStr = res.match(/```json([\s\S]*?)```/)?.[1] || res.substring(res.indexOf('['), res.lastIndexOf(']')+1);
      const newShots = JSON.parse(jsonStr.trim());
      // 保持原有图片，如果是重新生成则追加
      setShots(newShots); 
    } catch (e) { alert("剧本分析失败: " + e.message); } 
    finally { setIsAnalyzing(false); }
  };

  // 2. 核心：组合大分镜 (Scene Assembly)
  const compileScene = () => {
    if (selectedShotIds.length < 1) return;
    
    // 获取选中的镜头对象（按 ID 排序）
    const selectedShots = shots.filter(s => selectedShotIds.includes(s.id)).sort((a,b) => a.id - b.id);
    
    // A. 提取角色信息 (Character Context)
    // 逻辑：扫描所有选中镜头，看它们是否绑定了“演员”。如果有，提取演员的描述。
    // 注意：这里的 selectedActorId 存储在 shotCard 内部状态里，为了简单，我们假设用户在生成小分镜图时已经确认了演员。
    // *优化*：实际上，我们需要在 shots 数据里记录 `actorId`。
    // 既然目前 shots 结构里没有 actorId，我们从 `actors` 库里提取名字匹配的，或者在 Prompt 里通用描述。
    // 为了不改动太多底层，这里使用 global direction 作为主要参考。
    
    // B. 构建时间轴脚本
    let currentTime = 0;
    const timelineScript = selectedShots.map(s => {
        let dur = 5; // 默认 5s
        const start = currentTime; 
        const end = currentTime + dur; 
        currentTime = end;
        
        // 格式化音效
        const audioTag = s.audio ? (s.audio.includes('"') ? `[Dialogue: "${s.audio}"]` : `[SFX: ${s.audio}]`) : "";
        
        return `[${start}s-${end}s] SHOT ${s.id}:
        VISUAL: ${s.visual}
        CAMERA: ${s.sora_prompt}
        AUDIO: ${audioTag}`;
    }).join("\n\nTRANSITION: CUT TO\n\n");

    // C. 组装最终 Sora 2 Prompt
    const masterPrompt = `
# Global Context & Style
${direction || "Cinematic lighting, high fidelity, 35mm film grain."}

# Timeline Script (Strict Timing)
${timelineScript}

# Technical Specifications
--ar ${sbAspectRatio} --duration ${currentTime}s --quality high --fps 24
    `.trim();

    // D. 创建 Scene 对象
    const newScene = {
        id: Date.now(),
        title: `Sequence ${scenes.length + 1}`,
        prompt: masterPrompt,
        duration: currentTime,
        startImg: shotImages[selectedShots[0].id]?.slice(-1)[0] || null, // 首帧
        video_url: null,
        shots: selectedShotIds
    };

    setScenes([...scenes, newScene]);
    setSelectedShotIds([]); // 清空选择
  };

  // 3. 大分镜操作：生成视频
  const handleGenSceneVideo = async (scene) => {
    const arMatch = scene.prompt.match(/--ar\s+(\d+:\d+)/); 
    const ar = arMatch ? arMatch[1] : sbAspectRatio;
    try {
        const url = await callApi('video', { 
            model: 'kling-v2.6', // 默认，或弹窗选择
            prompt: scene.prompt, 
            startImg: typeof scene.startImg === 'string' ? scene.startImg : scene.startImg?.url, 
            aspectRatio: ar, 
            duration: scene.duration 
        });
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, video_url: url } : s));
        alert("🎬 场景视频生成成功！");
    } catch (e) { alert("生成失败: " + e.message); }
  };
  // 子组件：小分镜卡片 (Shot Card)
  const ShotCard = ({ shot, isSelected, onToggle }) => {
    const { shotImages, setShotImages, actors, callApi } = useProject();
    const history = shotImages[shot.id] || [];
    const currentUrl = history.length > 0 ? history[history.length - 1] : null;
    const [loading, setLoading] = useState(false);
    const [selectedActorId, setSelectedActorId] = useState(""); // 本地状态：当前镜头的演员

    const gen = async () => { 
      setLoading(true); 
      try { 
        let refImgData = null;
        if (selectedActorId) {
            const actor = actors.find(a => a.id.toString() === selectedActorId);
            if (actor) {
                // 简单的 fetch 转 base64 逻辑
                try { const r = await fetch(actor.url); const b = await r.blob(); const reader = new FileReader(); refImgData = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(b); }); } catch(e){}
            }
        } else if (mediaAsset?.type === 'image') { refImgData = mediaAsset.data; }
        
        // 提示词注入音色 (如果选了演员)
        const actorVoice = actors.find(a => a.id.toString() === selectedActorId)?.voice_tone || "";
        const finalPrompt = `${shot.image_prompt}. ${actorVoice ? `Character Voice Tone: ${actorVoice}` : ""}`;

        const url = await callApi('image', { prompt: finalPrompt, aspectRatio: sbAspectRatio, useImg2Img: !!refImgData, refImg: refImgData, strength: 0.8 }); 
        setShotImages(p=>({...p, [shot.id]:[...(p[shot.id]||[]), url]}));
      } catch(e) { alert(e.message); } finally { setLoading(false); } 
    };

    return (
      <div 
        onClick={onToggle}
        className={cn("bg-slate-900 border-2 rounded-xl overflow-hidden cursor-pointer transition-all hover:border-blue-400/50 flex flex-col", isSelected ? "border-orange-500 bg-orange-900/10 ring-1 ring-orange-500" : "border-slate-800")}
      >
        <div className={cn("bg-black relative w-full shrink-0 group/media", sbAspectRatio==="9:16"?"aspect-[9/16]":"aspect-video")}>
          {loading ? <div className="absolute inset-0 flex items-center justify-center text-slate-500"><Loader2 className="animate-spin"/></div> : currentUrl ? <img src={currentUrl} className="w-full h-full object-cover"/> : <div className="absolute inset-0 flex items-center justify-center"><button onClick={(e)=>{e.stopPropagation();gen()}} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">生成</button></div>}
          <div className="absolute top-1 left-1 bg-black/60 px-1.5 rounded text-[10px] text-white">Shot {shot.id}</div>
          {isSelected && <div className="absolute top-1 right-1 bg-orange-500 text-white rounded-full p-0.5"><CheckCircle2 size={12}/></div>}
        </div>
        
        {/* 简化的信息区 */}
        <div className="p-2 space-y-2">
            <div className="text-[10px] text-slate-300 line-clamp-2 leading-tight">{shot.visual}</div>
            <div className="flex items-center justify-between" onClick={e=>e.stopPropagation()}>
                {/* 演员绑定 */}
                <select value={selectedActorId} onChange={e=>setSelectedActorId(e.target.value)} className="bg-black border border-slate-700 rounded text-[9px] text-slate-400 max-w-[80px] h-5">
                    <option value="">+ 演员</option>
                    {actors.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div className="text-[9px] text-slate-500 flex items-center gap-1">{shot.audio ? <Mic size={8}/> : null}</div>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      {/* 灵感弹窗 */}
      {showInspiration && <StoryboardInspiration onClose={()=>setShowInspiration(false)} onApply={(res)=>{setScript(res.logline);setDirection(`风格：${res.visual}\n主题：${res.genre}`);setShowInspiration(false)}}/>}

      {/* 1. 左栏：控制与剧本 (Controls) */}
      <div className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800 font-bold text-slate-200">剧本控制</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            <button onClick={()=>setShowInspiration(true)} className="w-full py-2 bg-gradient-to-r from-yellow-600 to-orange-600 text-white rounded text-xs font-bold shadow flex items-center justify-center gap-2"><Sparkles size={12}/> AI 灵感抽取</button>
            <div className="space-y-1"><label className="text-xs text-slate-400">剧本</label><textarea value={script} onChange={e=>setScript(e.target.value)} className="w-full h-32 bg-slate-800 border-slate-700 rounded p-2 text-xs resize-none" placeholder="输入故事..."/></div>
            <div className="space-y-1"><label className="text-xs text-slate-400">导演意图</label><textarea value={direction} onChange={e=>setDirection(e.target.value)} className="w-full h-20 bg-slate-800 border-slate-700 rounded p-2 text-xs resize-none" placeholder="风格/色调..."/></div>
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><label className="text-[10px] text-slate-500">画幅</label><select value={sbAspectRatio} onChange={e=>setSbAspectRatio(e.target.value)} className="w-full bg-slate-800 border-slate-700 rounded text-xs p-1"><option>16:9</option><option>9:16</option></select></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={sbTargetLang} onChange={e=>setSbTargetLang(e.target.value)} className="w-full bg-slate-800 border-slate-700 rounded text-xs p-1"><option>Chinese</option><option>English</option></select></div>
            </div>
            <div className="border border-dashed border-slate-700 rounded h-12 flex items-center justify-center cursor-pointer hover:border-slate-500 relative"><input type="file" accept="image/*" onChange={handleAssetUpload} className="absolute inset-0 opacity-0"/><span className="text-[10px] text-slate-500 flex gap-1"><Upload size={12}/> 上传参考图</span></div>
        </div>
        <div className="p-4 border-t border-slate-800">
            <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-sm flex items-center justify-center gap-2">{isAnalyzing?<Loader2 className="animate-spin" size={16}/>:<Clapperboard size={16}/>} 生成分镜表</button>
        </div>
      </div>

      {/* 2. 中栏：分镜池 (Shot Pool) */}
      <div className="flex-1 flex flex-col border-r border-slate-800 min-w-0">
        <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50">
            <span className="text-sm font-bold text-slate-300">分镜池 ({shots.length})</span>
            <div className="flex gap-2">
                <button onClick={()=>{setShots([]);setSelectedShotIds([])}} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950 relative">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                {shots.map(s => <ShotCard key={s.id} shot={s} isSelected={selectedShotIds.includes(s.id)} onToggle={()=>setSelectedShotIds(p => p.includes(s.id)?p.filter(i=>i!==s.id):[...p,s.id])}/>)}
            </div>
            {/* 悬浮组合条 */}
            {selectedShotIds.length > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4 z-50 hover:scale-105 transition-transform cursor-pointer" onClick={compileScene}>
                    <span className="font-bold">已选 {selectedShotIds.length} 个镜头</span>
                    <div className="h-4 w-[1px] bg-white/30"/>
                    <span className="flex items-center gap-1 font-bold">组合为大分镜 <ChevronRight size={16}/></span>
                </div>
            )}
        </div>
      </div>

      {/* 3. 右栏：大分镜列表 (Scene List) */}
      <div className="w-80 flex flex-col bg-slate-900/50 shrink-0">
        <div className="h-12 border-b border-slate-800 flex items-center px-4"><span className="text-sm font-bold text-orange-500">大分镜 Scene ({scenes.length})</span></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {scenes.map(scene => (
                <div key={scene.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-orange-500/50 transition-all shadow-lg group">
                    <div className="aspect-video bg-black relative">
                        {scene.video_url ? <video src={scene.video_url} controls className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center relative">{scene.startImg && <img src={typeof scene.startImg==='string'?scene.startImg:scene.startImg.url} className="w-full h-full object-cover opacity-50"/><div className="absolute inset-0 bg-black/40"/>}<button onClick={()=>handleGenSceneVideo(scene)} className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded text-xs font-bold shadow z-10 flex gap-1 items-center transform group-hover:scale-105 transition-all"><Film size={12}/> 生成视频</button></div>}
                        <div className="absolute top-2 left-2 bg-orange-600/90 text-white text-[9px] px-1.5 py-0.5 rounded font-bold backdrop-blur">{scene.title}</div>
                    </div>
                    <div className="p-3">
                        <div className="text-[10px] text-slate-500 mb-2 flex justify-between">
                            <span>包含镜头: {scene.shots.join(', ')}</span>
                            <span>{scene.duration}s</span>
                        </div>
                        <div className="text-[10px] text-slate-600 font-mono bg-black/20 p-2 rounded max-h-20 overflow-y-auto">{scene.prompt.slice(0, 100)}...</div>
                        <div className="mt-2 flex justify-end gap-2">
                             <button onClick={()=>navigator.clipboard.writeText(scene.prompt)} className="text-slate-500 hover:text-white"><Copy size={12}/></button>
                             <button onClick={()=>setScenes(p=>p.filter(s=>s.id!==scene.id))} className="text-slate-500 hover:text-red-400"><Trash2 size={12}/></button>
                        </div>
                    </div>
                </div>
            ))}
            {scenes.length===0 && <div className="text-center text-slate-600 text-xs mt-10">暂无大分镜<br/>请在中栏选中镜头并组合</div>}
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 4：制片台 (StudioBoard - Final: Asset Integration & Video First)
// ==========================================
const StudioBoard = ({ onPreview }) => {
  const { config, shots, shotImages, scenes, timeline, setTimeline, callApi } = useProject();
  
  // 状态管理
  const [activeAssetTab, setActiveAssetTab] = useState("shots"); // shots | scenes
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [activeClipId, setActiveClipId] = useState(null); 
  const [showPlayer, setShowPlayer] = useState(false);
  const [loadingVideoId, setLoadingVideoId] = useState(null);

  // 核心逻辑：添加素材到时间轴
  const addToTimeline = (item, type) => {
    // 1. 处理小分镜 (Shot)
    if (type === 'shot') {
        const history = shotImages[item.id] || [];
        const lastImg = history.length > 0 ? (history[history.length - 1].url || history[history.length - 1]) : null;
        if (!lastImg) return alert("该镜头还未生成图片，请先在自动分镜中生成。");
        
        const newClip = {
          uuid: Date.now(),
          sourceId: item.id,
          sourceType: 'shot',
          visual: item.visual,
          audio_prompt: item.audio, 
          audio_url: null, 
          video_url: null, 
          url: lastImg,
          duration: 3000,
          type: 'image'
        };
        setTimeline([...timeline, newClip]);
    } 
    // 2. 处理大分镜 (Scene)
    else if (type === 'scene') {
        const startImg = typeof item.startImg === 'string' ? item.startImg : item.startImg?.url;
        
        const newClip = {
            uuid: Date.now(),
            sourceId: item.id,
            sourceType: 'scene',
            visual: item.title, // 标题作为视觉描述
            audio_prompt: "Scene Audio", // 大分镜通常自带音效描述
            audio_url: null,
            video_url: item.video_url || null, // 如果大分镜已有视频，直接带入
            url: startImg, // 首帧图
            duration: (item.duration || 5) * 1000, // 秒转毫秒
            type: item.video_url ? 'video' : 'image'
        };
        setTimeline([...timeline, newClip]);
    }
  };

  const removeFromTimeline = (uuid) => setTimeline(timeline.filter(clip => clip.uuid !== uuid));
  
  // 弹窗控制
  const openAudioModal = (clip) => { setActiveClipId(clip.uuid); setShowAudioModal(true); };
  const openVideoModal = (clip) => { setActiveClipId(clip.uuid); setShowVideoModal(true); };

  // 配音生成回调
  const handleAudioGen = async (params) => {
    if (!activeClipId) return;
    
    // 如果是本地上传，直接用 base64；如果是 AI，调用 API
    let audioData = params.audioData;
    if (!audioData) {
        audioData = await callApi(params.isSFX ? 'sfx' : 'audio', { 
            input: params.text, 
            voice: params.voice, 
            speed: params.speed, 
            prompt: params.text, 
            model: params.model 
        });
    }

    let labelText = params.isSFX ? `[SFX] ${params.text}` : params.text;
    
    setTimeline(prev => prev.map(clip => {
        if (clip.uuid === activeClipId) {
            return { ...clip, audio_url: audioData, audio_prompt: labelText };
        }
        return clip;
    }));
  };

  // 视频生成回调 (Sora 2 / Kling)
  const handleVideoGen = async (params) => {
    if (!activeClipId) return;
    setLoadingVideoId(activeClipId);
    
    const clip = timeline.find(c => c.uuid === activeClipId);
    if(!clip) { setLoadingVideoId(null); return; }

    try {
      // 动态参数获取
      const projectAr = localStorage.getItem('sb_ar') || "16:9";
      const clipSeconds = Math.ceil(clip.duration / 1000);
      const targetDuration = Math.max(5, clipSeconds); 

      // 智能提示词拼装
      const visualPart = clip.visual || "Cinematic shot";
      const userMotion = params.prompt ? `. Action: ${params.prompt}` : "";
      const specsPart = `--ar ${projectAr} --duration ${targetDuration}s --quality high`;
      const fullPrompt = `${visualPart}${userMotion}. ${specsPart}`;

      // 调用 API
      const videoUrl = await callApi('video', { 
        model: params.model, 
        prompt: fullPrompt, 
        startImg: clip.url,
        duration: targetDuration, 
        aspectRatio: projectAr
      });
      
      // 更新时间轴状态
      setTimeline(prev => prev.map(c => {
        if (c.uuid === activeClipId) {
          return { ...c, video_url: videoUrl, type: 'video', duration: targetDuration * 1000 };
        }
        return c;
      }));
      alert(`🎬 视频生成成功！\n规格: ${projectAr}, 时长: ${targetDuration}s`);
    } catch (e) {
      alert("视频生成失败: " + e.message);
    } finally {
      setLoadingVideoId(null);
    }
  };

  const handlePlayAll = () => { 
      if (timeline.length === 0) return alert("时间轴为空"); 
      setShowPlayer(true); 
  };
  
  const activeClip = activeClipId ? timeline.find(c => c.uuid === activeClipId) : null;

  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      {/* 弹窗挂载 */}
      <AudioGeneratorModal isOpen={showAudioModal} onClose={() => setShowAudioModal(false)} initialText={activeClip?.audio_prompt} onGenerate={handleAudioGen} />
      <VideoGeneratorModal isOpen={showVideoModal} onClose={() => setShowVideoModal(false)} initialPrompt={activeClip?.visual} initialModel={config.video.model} onGenerate={handleVideoGen} />
      <AnimaticPlayer isOpen={showPlayer} onClose={() => setShowPlayer(false)} shots={[]} images={{}} customPlaylist={timeline} />

      {/* A. 左侧素材库 (支持 Shots / Scenes 切换) */}
      <div className="w-72 flex flex-col border-r border-slate-800 bg-slate-900/50">
        <div className="h-12 border-b border-slate-800 flex items-center px-2 gap-2 shrink-0">
           <button onClick={()=>setActiveAssetTab("shots")} className={cn("flex-1 text-xs py-1.5 rounded font-bold transition-all", activeAssetTab==="shots"?"bg-slate-700 text-white":"text-slate-500 hover:text-slate-300")}>镜头 Shots</button>
           <button onClick={()=>setActiveAssetTab("scenes")} className={cn("flex-1 text-xs py-1.5 rounded font-bold transition-all", activeAssetTab==="scenes"?"bg-orange-900/30 text-orange-400":"text-slate-500 hover:text-slate-300")}>场面 Scenes</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
          {activeAssetTab === "shots" ? (
              // 镜头列表
              shots.map(s => {
                const hasImg = shotImages[s.id]?.length > 0;
                const thumb = hasImg ? (shotImages[s.id].slice(-1)[0].url || shotImages[s.id].slice(-1)[0]) : null;
                return (
                  <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-blue-500/50 transition-all group flex gap-2 cursor-pointer relative" onClick={() => addToTimeline(s, 'shot')}>
                    <div className="w-16 h-16 bg-black rounded shrink-0 overflow-hidden relative">
                      {thumb ? <img src={thumb} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">No Img</div>}
                      <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"><PlusCircle size={20}/></div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="text-xs text-slate-300 font-bold mb-1 truncate">Shot {s.id}</div>
                      <div className="text-[10px] text-slate-500 line-clamp-2 leading-tight">{s.visual}</div>
                    </div>
                  </div>
                );
              })
          ) : (
              // 场面列表
              scenes.map(s => (
                  <div key={s.id} className="bg-slate-900 border border-orange-900/30 rounded-lg overflow-hidden group cursor-pointer relative hover:border-orange-500 transition-all" onClick={() => addToTimeline(s, 'scene')}>
                      <div className="h-20 bg-black relative">
                          {s.video_url ? <video src={s.video_url} className="w-full h-full object-cover" muted/> : (s.startImg && <img src={typeof s.startImg==='string'?s.startImg:s.startImg.url} className="w-full h-full object-cover opacity-60"/>)}
                          <div className="absolute top-1 left-1 bg-orange-600 text-white text-[9px] px-1.5 rounded font-bold">{s.title}</div>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"><PlusCircle size={24}/></div>
                      </div>
                      <div className="p-2">
                          <div className="text-[10px] text-slate-400 line-clamp-2">{s.prompt}</div>
                      </div>
                  </div>
              ))
          )}
          
          {(activeAssetTab === "shots" ? shots.length : scenes.length) === 0 && <div className="text-center text-slate-600 text-xs mt-10">暂无素材，请先生成</div>}
        </div>
      </div>

      {/* B. 右侧工作区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 bg-black flex items-center justify-center relative border-b border-slate-800">
          <div className="text-slate-600 flex flex-col items-center gap-2"><Film size={48} className="opacity-20"/><span className="text-sm">点击底部“全片预览”查看最终效果</span></div>
        </div>
        
        {/* 时间轴 */}
        <div className="h-64 bg-slate-900 border-t border-slate-800 flex flex-col">
          <div className="h-10 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950">
            <div className="flex items-center gap-4"><span className="text-xs font-bold text-slate-400 flex items-center gap-2"><Clock size={12}/> 时间轴 ({timeline.length} clips)</span><button onClick={() => setTimeline([])} className="text-[10px] text-slate-500 hover:text-red-400">清空</button></div>
            <button onClick={handlePlayAll} className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-xs rounded-full font-bold transition-all shadow-lg"><Play size={12}/> 全片预览</button>
          </div>
          <div className="flex-1 overflow-x-auto p-4 whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700 space-x-2 flex items-center bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
            {timeline.length === 0 ? (<div className="w-full text-center text-slate-600 text-xs select-none">👈 拖拽或点击左侧素材，组装你的电影</div>) : (
              timeline.map((clip, idx) => (
                <div key={clip.uuid} className={cn("inline-block w-40 h-44 bg-slate-800 border rounded-lg overflow-hidden relative group shrink-0 transition-all flex flex-col shadow-lg hover:translate-y-[-2px]", loadingVideoId===clip.uuid ? "border-purple-500 animate-pulse" : "border-slate-700 hover:border-orange-500")}>
                  <div className="h-24 bg-black relative shrink-0">
                    {/* 优先显示视频 */}
                    {clip.video_url ? <video src={clip.video_url} className="w-full h-full object-cover" muted loop onMouseOver={e=>e.target.play()} onMouseOut={e=>e.target.pause()}/> : <img src={clip.url} className="w-full h-full object-cover"/>}
                    
                    {/* 状态角标 */}
                    <div className="absolute top-1 right-1 flex flex-col gap-1">
                        <span className="bg-black/60 px-1.5 rounded text-[9px] text-white backdrop-blur">{clip.duration/1000}s</span>
                        {clip.sourceType === 'scene' && <span className="bg-orange-600/80 px-1.5 rounded text-[8px] text-white">Scene</span>}
                    </div>
                    {clip.audio_url && <div className="absolute bottom-1 right-1 bg-green-600 p-1 rounded-full text-white shadow"><Volume2 size={8}/></div>}
                    {clip.video_url && <div className="absolute top-1 left-1 bg-purple-600 px-1.5 rounded text-[8px] text-white flex items-center gap-1"><Film size={8}/> Video</div>}
                    
                    {loadingVideoId===clip.uuid && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-purple-400 gap-1 text-[10px] backdrop-blur-sm"><Loader2 size={12} className="animate-spin"/> 生成中...</div>}
                  </div>
                  
                  <div className="p-2 flex-1 flex flex-col justify-between min-h-0 bg-slate-800">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-300 truncate w-24">#{idx+1} {clip.sourceType==='shot'?'Shot':'Scene'} {clip.sourceId}</span><button onClick={() => removeFromTimeline(clip.uuid)} className="text-slate-500 hover:text-red-400"><X size={10}/></button></div>
                    <div className="space-y-1">
                        <button onClick={() => openVideoModal(clip)} disabled={loadingVideoId!==null || !!clip.video_url} className={cn("w-full py-1 text-[9px] rounded flex items-center justify-center gap-1 border transition-all", clip.video_url ? "bg-purple-900/30 text-purple-400 border-purple-800" : "bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600/50")}>
                          {clip.video_url ? "🎬 已生成视频" : loadingVideoId===clip.uuid ? "⏳ 等待中..." : "⚡ 生成视频"}
                        </button>
                        <button onClick={() => openAudioModal(clip)} className={cn("w-full py-1 text-[9px] rounded flex items-center justify-center gap-1 border transition-all", clip.audio_url ? "bg-green-900/30 text-green-400 border-green-800 hover:bg-green-900/50" : "bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600/50")}>
                          {clip.audio_url ? <><CheckCircle2 size={8}/> 已配音</> : <><Mic size={8}/> 添加配音</>}
                        </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 主应用入口 (AppContent & Root - The Final Assembly)
// ==========================================
const AppContent = () => {
  const [activeTab, setActiveTab] = useState('character'); 
  const [showSettings, setShowSettings] = useState(false);
  const [showSlotMachine, setShowSlotMachine] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  // 顶部快捷选择状态
  const [activeModalType, setActiveModalType] = useState(null); 

  const { config, setConfig, fetchModels, availableModels, isLoadingModels } = useProject();

  const handleQuickModelChange = (type, val) => {
    setConfig(prev => ({ ...prev, [type]: { ...prev[type], model: val } }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* 全局组件挂载 */}
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      
      <ModelSelectionModal 
        isOpen={activeModalType !== null} 
        title={activeModalType === 'analysis' ? "分析模型 (大脑)" : "绘图模型 (画师)"} 
        models={availableModels} 
        onClose={() => setActiveModalType(null)} 
        onSelect={(m) => handleQuickModelChange(activeModalType, m)}
      />

      {showSettings && <ConfigCenter onClose={() => setShowSettings(false)} fetchModels={fetchModels} availableModels={availableModels} isLoadingModels={isLoadingModels}/>}
      {showSlotMachine && <InspirationSlotMachine onClose={() => setShowSlotMachine(false)} />}

      {/* 顶部导航栏 (Top Navigation) */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 z-50 shrink-0">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Wand2 size={18} className="text-white" />
            </div>
            <h1 className="font-bold text-lg hidden lg:block tracking-tight text-white">AI 导演工坊</h1>
          </div>

          {/* 核心 Tab 切换 */}
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <button onClick={()=>setActiveTab('character')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='character'?"bg-slate-700 text-white shadow-md":"text-slate-400 hover:text-slate-200")}>
              <ImageIcon size={14}/> 角色工坊
            </button>
            <button onClick={()=>setActiveTab('storyboard')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='storyboard'?"bg-purple-600 text-white shadow-md":"text-slate-400 hover:text-slate-200")}>
              <Clapperboard size={14}/> 自动分镜
            </button>
            <button onClick={()=>setActiveTab('studio')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='studio'?"bg-orange-600 text-white shadow-md":"text-slate-400 hover:text-slate-200")}>
              <Layers size={14}/> 制片台
            </button>
          </div>
        </div>
        
        {/* 右侧工具栏 */}
        <div className="flex items-center gap-3">
          {/* 快捷模型选择 (蓝色/紫色主题) */}
          <div className="hidden md:flex gap-3">
            <ModelTrigger 
              label="分析" 
              icon={Server} 
              value={config.analysis.model} 
              onOpenPicker={() => { setActiveModalType('analysis'); fetchModels('analysis'); }} 
              onManualChange={(v) => handleQuickModelChange('analysis', v)} 
              colorTheme="blue" 
            />
            <ModelTrigger 
              label="绘图" 
              icon={Palette} 
              value={config.image.model} 
              onOpenPicker={() => { setActiveModalType('image'); fetchModels('image'); }} 
              onManualChange={(v) => handleQuickModelChange('image', v)} 
              colorTheme="purple" 
            />
          </div>

          {/* 灵感按钮 */}
          <button onClick={() => setShowSlotMachine(true)} className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white text-xs font-bold rounded-full shadow-lg shadow-orange-500/20 transition-all transform hover:scale-105">
            <Sparkles size={12}/> 灵感
          </button>
          
          {/* 设置按钮 */}
          <button onClick={()=>setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
            <Settings size={20}/>
          </button>
        </div>
      </div>

      {/* 主工作区 (使用 display:none 实现 Keep-Alive，防止切换 Tab 丢失数据) */}
      <div className="flex-1 overflow-hidden relative">
        <div className={cn("h-full w-full", activeTab === 'character' ? 'block' : 'hidden')}>
          <CharacterLab onPreview={setPreviewUrl} /> 
        </div>
        <div className={cn("h-full w-full", activeTab === 'storyboard' ? 'block' : 'hidden')}>
          <StoryboardStudio onPreview={setPreviewUrl} />
        </div>
        <div className={cn("h-full w-full", activeTab === 'studio' ? 'block' : 'hidden')}>
          <StudioBoard onPreview={setPreviewUrl} />
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
