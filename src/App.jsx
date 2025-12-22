import React, { useState, useMemo, useRef, useEffect, useContext, createContext } from 'react';
import { 
  Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, 
  Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, 
  Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, 
  CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2, 
  Sparkles, Dices, Layers, PlusCircle, Play, UserCircle2, GripHorizontal, Users, Music, 
  Scissors, Save, FolderOpen, MoreHorizontal
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 样式合并工具 */
function cn(...inputs) { return twMerge(clsx(inputs)); }

// ==========================================
// 核心模块 0：工具函数库 & Sora v2 编译器
// ==========================================

/** 安全 JSON 解析 (V6.0 回归：防止白屏) */
const safeJsonParse = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`Data corrupted for ${key}, using default.`);
    return fallback;
  }
};

/** Blob URL 内存管理 (V6.0 回归：高性能) */
const base64ToBlobUrl = (base64, type = 'image/png') => {
  if (!base64 || typeof base64 !== 'string') return null;
  if (base64.startsWith('blob:')) return base64; // 已经是 Blob
  if (base64.startsWith('http')) return base64;   // 网络图片
  try {
    const clean = base64.includes(',') ? base64.split(',')[1] : base64;
    const byteCharacters = atob(clean);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.warn("Blob conversion failed, using raw base64 (Low Perf)", e);
    return base64;
  }
};

/** URL 转 Base64 (用于 API 发送) */
const urlToBase64 = async (url) => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url; 
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
};

/** 智能图片压缩器 (V6.0 回归：防止 Payload 过大) */
const compressImage = (base64Str, maxWidth = 1024) => {
  return new Promise((resolve) => {
    if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image')) {
      resolve(base64Str); return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width, height = img.height;
      if (width > height) {
        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      } else {
        if (height > maxWidth) { width *= maxWidth / height; height = maxWidth; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(base64Str);
  });
};

/** 
 * 核心逻辑：Sora v2 提示词编译器 (Prompt Compiler) 
 * 严格遵循用户提供的《Sora v2 提示词模板规范》
 */
const compileSoraPrompt = (shots, actorsInScene, globalParams) => {
  const { direction, style, physics } = globalParams || {};

  // 1. 全局头文件 (Global Context)
  let promptHeader = `# Global Context\n`;
  promptHeader += `Style: ${style || "Cinematic, High fidelity, 8k resolution"}.\n`;
  if (direction) promptHeader += `Environment: ${direction}.\n`;
  if (physics) promptHeader += `Physics: ${physics}.\n`;
  
  // 2. 角色锚定 (ID Mapping)
  let characterBlock = "";
  if (actorsInScene && actorsInScene.length > 0) {
    characterBlock = `\n# Character Definitions (ID Mapping)\n`;
    actorsInScene.forEach(actor => {
      // 提取核心视觉特征
      const visualDesc = `${actor.desc.visual_upper}, ${actor.desc.visual_lower}`;
      characterBlock += `Let "${actor.name}" be the character wearing: ${visualDesc}.\n`;
    });
  }

  // 3. 时间轴脚本 (Timeline Script)
  let scriptBlock = `\n# Timeline Script\n`;
  let currentTime = 0;

  const scriptParts = shots.map((shot, index) => {
    // 毫秒转秒
    let duration = typeof shot.duration === 'number' ? shot.duration / 1000 : 5;
    duration = Math.min(duration, 10); // 限制单镜头时长
    
    const startTime = currentTime;
    const endTime = currentTime + duration;
    currentTime = endTime;

    const timeTag = `[${startTime}s-${endTime}s]`;
    let content = `${timeTag} Shot ${index + 1}: ${shot.visual}.`;

    if (shot.camera) content += ` Camera Movement: ${shot.camera}.`;
    if (shot.sfx) content += ` [SFX: ${shot.sfx}]`;
    if (shot.audio) content += ` [Dialogue: "${shot.audio}"]`;

    return content;
  });

  scriptBlock += scriptParts.join("\n\nCUT TO:\n\n");

  // 4. 技术参数
  const totalDuration = Math.ceil(currentTime);
  const specsBlock = `\n\n# Technical Specs\n--duration ${totalDuration}s --quality high --ar 16:9`;

  return promptHeader + characterBlock + scriptBlock + specsBlock;
};

// ==========================================
// 核心模块 1: ProjectContext (全局状态管理)
// ==========================================

const ProjectContext = createContext();
export const useProject = () => useContext(ProjectContext);

export const ProjectProvider = ({ children }) => {
  // --- A. 配置中心 (Config) ---
  const [config, setConfig] = useState(() => safeJsonParse('app_config_v8', {
    analysis: { baseUrl: '', key: '', model: 'gemini-2.0-flash-exp' },
    image: { baseUrl: '', key: '', model: 'nanobanana-2-pro' }, 
    video: { baseUrl: '', key: '', model: 'kling-v1.6' },
    audio: { baseUrl: '', key: '', model: 'tts-1' }
  }));

  // --- B. 核心资产 (恢复 V6 持久化逻辑 + Blob 转换) ---
  const [actors, setActors] = useState(() => safeJsonParse('sb_actors_v8', []));
  const [clPrompts, setClPrompts] = useState(() => safeJsonParse('cl_prompts_v8', []));
  const [shots, setShots] = useState(() => safeJsonParse('sb_shots_v8', []));
  const [scenes, setScenes] = useState(() => safeJsonParse('sb_scenes_v8', []));
  const [timeline, setTimeline] = useState(() => safeJsonParse('studio_timeline_v8', []));
  
  // 剧本上下文
  const [scriptContext, setScriptContext] = useState(() => safeJsonParse('sb_context_v8', { 
    script: "", direction: "", style: "", physics: "" 
  }));

  // 运行时状态
  const [availableModels, setAvailableModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 简单的持久化 (注意：生产环境应使用 IndexedDB)
  const safeSave = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } 
    catch (e) { console.warn("Storage full", key); }
  };

  useEffect(() => { safeSave('app_config_v8', config); }, [config]);
  useEffect(() => { safeSave('sb_actors_v8', actors); }, [actors]);
  useEffect(() => { safeSave('cl_prompts_v8', clPrompts); }, [clPrompts]);
  useEffect(() => { safeSave('sb_shots_v8', shots); }, [shots]);
  useEffect(() => { safeSave('sb_scenes_v8', scenes); }, [scenes]);
  useEffect(() => { safeSave('studio_timeline_v8', timeline); }, [timeline]);
  useEffect(() => { safeSave('sb_context_v8', scriptContext); }, [scriptContext]);

  // --- API 交互层 (V6.0 健壮版) ---
  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!baseUrl || !key) return alert(`请先配置 [${type}] API`);
    setIsLoadingModels(true); setAvailableModels([]);
    try {
      let found = [];
      try { // OpenAI Format
        const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } }); 
        const d = await r.json(); 
        if (d.data) found = d.data.map(m => m.id);
      } catch(e) {}
      if (!found.length && baseUrl.includes('google')) { // Google Format
        const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); 
        const d = await r.json(); 
        if (d.models) found = d.models.map(m => m.name.replace('models/', ''));
      }
      setAvailableModels(found.length ? [...new Set(found)].sort() : []); 
      if (!found.length) alert("连接成功，但未自动获取模型，请手动输入ID。");
    } catch(e) { alert("连接失败: " + e.message); } 
    finally { setIsLoadingModels(false); }
  };

  const callApi = async (type, payload) => {
    const { baseUrl, key, model: configModel } = config[type];
    const activeModel = payload.model || configModel; 
    if (!baseUrl || !key) throw new Error(`请先配置 [${type}] API`);

    const fetchWithTimeout = async (url, options, timeout = 120000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw new Error(error.name === 'AbortError' ? 'API 请求超时 (120秒)' : error.message);
        }
    };

    // 1. LLM
    if (type === 'analysis') {
        const { system, user, assets } = payload;
        // Google Native
        if (baseUrl.includes('google') && !baseUrl.includes('openai')) {
            const parts = [{ text: system + "\n\n" + user }];
            if (assets) assets.forEach(b64 => {
                 if (b64?.includes(';base64,')) parts.push({ inlineData: { mimeType: b64.split(';base64,')[0].split(':')[1], data: b64.split(';base64,')[1] } });
            });
            const r = await fetchWithTimeout(`${baseUrl}/v1beta/models/${activeModel}:generateContent?key=${key}`, { 
              method: 'POST', headers: {'Content-Type': 'application/json'}, 
              body: JSON.stringify({ contents: [{ parts }] }) 
            });
            if (!r.ok) throw new Error((await r.json()).error?.message || "API Error");
            return (await r.json()).candidates[0].content.parts[0].text;
        }
        // OpenAI
        const content = [{ type: "text", text: user }];
        if (assets) assets.forEach(b64 => { if(b64) content.push({ type: "image_url", image_url: { url: b64 } }); });
        const r = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, { 
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
          body: JSON.stringify({ model: activeModel, messages: [{ role: "system", content: system }, { role: "user", content }] }) 
        });
        if (!r.ok) throw new Error((await r.json()).error?.message || "API Error");
        return (await r.json()).choices[0].message.content;
    }

    // 2. Image (多图参考)
    if (type === 'image') {
        const { prompt, aspectRatio, refImages, strength } = payload;
        let size = aspectRatio === "16:9" ? "1280x720" : aspectRatio === "9:16" ? "720x1280" : "1024x1024";
        const body = { model: activeModel, prompt, n: 1, size };
        if (refImages?.length > 0) {
            const cleanArr = await Promise.all(refImages.map(async img => {
                const c = await compressImage(img);
                return c.includes('base64,') ? c.split('base64,')[1] : c;
            }));
            body.image = cleanArr[0]; body.images = cleanArr;
            if (strength) body.strength = strength;
        }
        const r = await fetchWithTimeout(`${baseUrl}/v1/images/generations`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
            body: JSON.stringify(body) 
        });
        if (!r.ok) throw new Error(`Image API Error: ${r.status}`);
        const d = await r.json();
        const raw = d.data?.[0]?.url || d.data?.[0]?.b64_json;
        return base64ToBlobUrl(raw); // 转回 Blob URL
    }

    // 3. Video (长轮询)
    if (type === 'video') {
        const { prompt, startImg, duration } = payload;
        let imgParam = null;
        if (startImg) {
            const b64 = await urlToBase64(startImg);
            imgParam = (await compressImage(b64)).split('base64,')[1];
        }
        const body = { model: activeModel, prompt, image: imgParam, duration: duration || 5, aspectRatio: "16:9" };
        const submit = await fetchWithTimeout(`${baseUrl}/v1/videos/generations`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        if (!submit.ok) throw new Error(`Video Submit Failed: ${submit.status}`);
        const task = await submit.json();
        const taskId = task.id || task.data?.id;
        if (!taskId) return task.data?.[0]?.url;

        for (let i = 0; i < 60; i++) { // 5分钟轮询
            await new Promise(r => setTimeout(r, 5000));
            const check = await fetch(`${baseUrl}/v1/videos/generations/${taskId}`, { headers: { 'Authorization': `Bearer ${key}` } });
            if (check.ok) {
                const d = await check.json();
                const status = d.status || d.data?.status;
                if (['SUCCEEDED', 'completed'].includes(status)) return d.data?.[0]?.url || d.url;
                if (['FAILED', 'failed'].includes(status)) throw new Error("Video Gen Failed");
            }
        }
        throw new Error("Timeout");
    }

    // 4. Audio
    if (type === 'audio' || type === 'sfx') {
        const { input, voice, speed } = payload;
        const endpoint = type === 'sfx' ? '/v1/audio/sound-effects' : '/v1/audio/speech';
        const body = { model: activeModel, input, voice: voice||'alloy', speed: speed||1.0 };
        if(type==='sfx') { body.text = input; delete body.input; }
        const r = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error("Audio API Error");
        return base64ToBlobUrl(await blobToBase64(await r.blob()), 'audio/mpeg');
    }
  };

  const value = {
    config, setConfig, actors, setActors, clPrompts, setClPrompts,
    shots, setShots, scenes, setScenes, timeline, setTimeline,
    scriptContext, setScriptContext, availableModels, isLoadingModels,
    callApi, fetchModels
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
// ==========================================
// 核心模块 2: 通用 UI 组件库 (Common UI - Part A)
// ==========================================

// --- A. 模型选择器弹窗 (支持多分类筛选) ---
const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  
  const categorized = useMemo(() => {
    const lower = search.toLowerCase();
    const all = models.filter(m => m.toLowerCase().includes(lower));
    return { 
      "All": all, 
      "OpenAI": all.filter(m => /gpt|dall|tts|whisper|o1/.test(m)), 
      "Google": all.filter(m => /gemini|imagen/.test(m)), 
      "Image": all.filter(m => /flux|midjourney|sd|stable|banana|recraft/.test(m)), 
      "Video": all.filter(m => /kling|luma|runway|sora|hailuo/.test(m)) 
    };
  }, [models, search]);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="text-white font-bold flex gap-2 items-center"><LayoutGrid size={20} className="text-blue-500"/> 选择模型: <span className="text-blue-400">{title}</span></h3>
            <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-white"/></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={16}/>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索模型 ID (如 gemini, kling)..." className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:border-blue-500"/>
          </div>
        </div>
        <div className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 shrink-0 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 pb-3 min-w-max">
            {["All", "OpenAI", "Google", "Image", "Video"].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-1.5 text-xs font-medium rounded-full border transition-all", activeTab === tab ? "bg-blue-600 border-blue-500 text-white shadow-lg" : "bg-slate-800 border-slate-700 text-slate-400")}>{tab}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-900 scrollbar-thin">
            {categorized[activeTab]?.map(m => (
              <button key={m} onClick={() => { onSelect(m); onClose(); }} className="group flex justify-between items-center p-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:border-blue-500 text-left transition-all">
                <span className="text-xs text-slate-300 group-hover:text-white truncate font-mono">{m}</span>
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-blue-400"/>
              </button>
            ))}
            {categorized[activeTab]?.length === 0 && <div className="col-span-full text-center text-slate-500 py-10">未找到相关模型</div>}
        </div>
      </div>
    </div>
  );
};

// --- B. 模型触发输入框 (顶部快捷栏使用) ---
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, colorTheme = "slate" }) => {
  const [isManual, setIsManual] = useState(false);
  const themes = { 
    slate: "border-slate-700 text-slate-400 bg-slate-900 hover:border-slate-500", 
    blue: "border-blue-900/50 text-blue-400 bg-blue-950/20 hover:border-blue-500", 
    purple: "border-purple-900/50 text-purple-400 bg-purple-950/20 hover:border-purple-500" 
  };
  return (
    <div className={cn("flex items-center rounded-lg border transition-all h-9 group overflow-hidden w-40 md:w-56", themes[colorTheme])}>
      <div className="flex items-center gap-2 px-3 border-r border-white/10 h-full shrink-0 bg-black/10">
        <Icon size={14}/><span className="text-xs font-medium hidden lg:inline">{label}</span>
      </div>
      <div className="flex-1 px-2 h-full flex items-center min-w-0 cursor-pointer" onClick={!isManual ? onOpenPicker : undefined}>
        {isManual ? 
          <input value={value} onChange={e => onManualChange(e.target.value)} className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono" autoFocus onBlur={() => setIsManual(false)}/> : 
          <div className="w-full flex justify-between items-center text-xs text-slate-300 font-mono group-hover:text-white"><span className="truncate mr-1">{value || "Default"}</span><ChevronDown size={12} className="opacity-50 group-hover:opacity-100"/></div>
        }
      </div>
      <button onClick={e => { e.stopPropagation(); setIsManual(!isManual); }} className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-white/10 shrink-0 hover:bg-white/5"><Pencil size={12}/></button>
    </div>
  );
};

// --- C. 配置中心 (Settings Panel) ---
const ConfigCenter = ({ onClose, fetchModels, availableModels, isLoadingModels }) => {
  const { config, setConfig } = useProject();
  const [activeTab, setActiveTab] = useState("analysis");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const tabs = [{id:"analysis", label:"大脑", icon:Brain, color:"text-blue-400"},{id:"image", label:"画师", icon:Palette, color:"text-purple-400"},{id:"video", label:"摄像", icon:Film, color:"text-orange-400"},{id:"audio", label:"录音", icon:Mic, color:"text-green-400"}];
  const cur = config[activeTab];

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[80vh] rounded-2xl flex overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-64 bg-slate-950 border-r border-slate-800 p-4 space-y-2 flex flex-col shrink-0">
          <div className="mb-6 px-2"><h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="text-blue-500"/> 设置中心</h2></div>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("w-full flex gap-3 px-4 py-3 rounded-lg transition-all text-left items-center", activeTab === t.id ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:bg-slate-900")}>
              <t.icon size={18} className={activeTab === t.id ? t.color : ""}/><span className="text-sm font-medium">{t.label} API</span>
            </button>
          ))}
        </div>
        <div className="flex-1 p-8 space-y-8 bg-slate-900 overflow-y-auto">
          <div className="space-y-4">
             <h4 className="text-xs font-bold text-slate-500 uppercase flex gap-2 items-center"><Server size={12}/> 连接参数</h4>
             <div className="space-y-1"><label className="text-xs text-slate-300">Base URL</label><input value={cur.baseUrl} onChange={e => setConfig(p=>({...p, [activeTab]:{...p[activeTab], baseUrl:e.target.value}}))} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 font-mono" placeholder="https://api.openai.com"/></div>
             <div className="space-y-1"><label className="text-xs text-slate-300">API Key</label><input type="password" value={cur.key} onChange={e => setConfig(p=>({...p, [activeTab]:{...p[activeTab], key:e.target.value}}))} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 font-mono" placeholder="sk-..."/></div>
          </div>
          <div className="pt-6 border-t border-slate-800 space-y-4">
             <div className="flex justify-between items-end"><label className="text-xs text-slate-300">Model ID</label><button onClick={() => fetchModels(activeTab)} disabled={isLoadingModels} className="text-xs text-blue-400 hover:text-blue-300 flex gap-1 items-center">{isLoadingModels ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} 测试连接</button></div>
             <ModelTrigger label="当前模型" icon={LayoutGrid} value={cur.model} onOpenPicker={() => { fetchModels(activeTab); setShowModelPicker(true); }} onManualChange={v => setConfig(p=>({...p, [activeTab]:{...p[activeTab], model:v}}))} className="w-full h-12 bg-slate-950" colorTheme={tabs.find(t=>t.id===activeTab).color.split('-')[1]}/>
          </div>
        </div>
      </div>
      <ModelSelectionModal isOpen={showModelPicker} models={availableModels} onClose={() => setShowModelPicker(false)} onSelect={m => setConfig(p=>({...p, [activeTab]:{...p[activeTab], model:m}}))} title={activeTab}/>
    </div>
  );
};
// ==========================================
// 核心模块 2-B: 高级功能弹窗 (Restored Heavy Modals)
// ==========================================

// --- D. 恢复的组件: 动态分镜播放器 (AnimaticPlayer) ---
const AnimaticPlayer = ({ isOpen, onClose, playlist }) => {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  useEffect(() => {
    if (isOpen && playlist.length > 0) { 
        setIsPlaying(true); 
        setIdx(0); 
        setProgress(0); 
    }
  }, [isOpen, playlist]);

  // 播放器计时器逻辑
  useEffect(() => {
    if (!isPlaying || playlist.length === 0) return;
    
    const item = playlist[idx];
    const dur = (item.duration || 5) * 1000;
    const step = 50; // Update every 50ms
    
    const timer = setInterval(() => {
      setProgress(p => {
        const next = p + (step / dur) * 100;
        if (next >= 100) {
           if (idx < playlist.length - 1) { 
               setIdx(i => i + 1); 
               return 0; 
           } else { 
               setIsPlaying(false); 
               return 100; 
           }
        }
        return next;
      });
    }, step);
    
    return () => clearInterval(timer);
  }, [isPlaying, idx, playlist]);

  if (!isOpen) return null;
  const current = playlist[idx];

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center">
      <div className="relative w-full h-full max-w-6xl max-h-[85vh] bg-black flex items-center justify-center overflow-hidden border border-slate-800 rounded-lg">
        {current ? (
            <>
               {/* 图片显示区 (带 Ken Burns 动画) */}
               <div className="w-full h-full overflow-hidden">
                   <img 
                     key={idx} // Key change triggers animation restart
                     src={current.url} 
                     className="w-full h-full object-contain animate-[kenburns_10s_ease-out_forwards]"
                     style={{ transformOrigin: 'center center' }}
                   />
               </div>
               
               {/* 字幕遮罩 */}
               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-8 pb-12 pt-20">
                  <div className="text-yellow-400 font-mono text-xs mb-2 tracking-widest uppercase">
                      SHOT {idx + 1} / {playlist.length} • {current.duration}s
                  </div>
                  <div className="text-white text-xl md:text-3xl font-bold font-serif leading-relaxed drop-shadow-lg max-w-4xl">
                      {current.visual}
                  </div>
               </div>
            </>
        ) : (
            <div className="text-slate-500">Playlist Empty</div>
        )}
        
        {/* 关闭按钮 */}
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur transition-colors">
            <X size={24}/>
        </button>
      </div>
      
      {/* 进度条 */}
      <div className="w-full max-w-6xl h-1 bg-slate-800 relative mt-4 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-75 ease-linear shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
            style={{ width: `${((idx + (progress/100)) / playlist.length) * 100}%` }}
          />
      </div>
      
      {/* 底部控制栏 */}
      <div className="h-20 w-full flex items-center justify-center gap-8 bg-slate-900 border-t border-slate-800 mt-auto">
         <button onClick={() => { setIdx(0); setIsPlaying(true); }} className="p-3 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors border border-slate-700">
             <Undo2 size={20}/>
         </button>
         
         <button onClick={() => setIsPlaying(!isPlaying)} className="p-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-900/50 scale-110 transition-transform active:scale-95">
             {isPlaying ? <div className="w-4 h-4 bg-white rounded-sm"/> : <Play size={20} fill="white" className="ml-1"/>}
         </button>
         
         <div className="text-slate-500 font-mono text-xs w-20 text-center">
             {Math.round((idx + progress/100) / playlist.length * 100)}%
         </div>
      </div>
      
      {/* 注入动画样式 */}
      <style>{`@keyframes kenburns { 0% { transform: scale(1); } 100% { transform: scale(1.1); } }`}</style>
    </div>
  );
};

// --- E. 恢复的组件: 视频生成微调弹窗 (VideoGeneratorModal) ---
const VideoGeneratorModal = ({ isOpen, onClose, initialPrompt, onGenerate }) => {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [loading, setLoading] = useState(false);
  
  useEffect(() => { setPrompt(initialPrompt || ""); }, [initialPrompt]);

  const handleGen = async () => {
    setLoading(true);
    try { 
        await onGenerate(prompt); 
        onClose(); 
    } catch (e) { 
        alert(e.message); 
    } finally { 
        setLoading(false); 
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-orange-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in zoom-in" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-white flex gap-2 mb-4 items-center">
            <Film className="text-orange-400"/> 生成视频微调
        </h3>
        
        <div className="space-y-2 mb-4">
            <label className="text-xs text-slate-400">Sora Prompt (可手动修改)</label>
            <textarea 
                value={prompt} 
                onChange={e => setPrompt(e.target.value)} 
                className="w-full h-40 bg-slate-950 border border-slate-700 rounded p-3 text-xs text-slate-300 resize-none outline-none focus:border-orange-500 font-mono leading-relaxed custom-scrollbar" 
                placeholder="在此处优化生成的提示词..."
            />
        </div>
        
        <div className="mt-6 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors">取消</button>
            <button 
                onClick={handleGen} 
                disabled={loading} 
                className="flex-1 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg text-xs font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {loading ? <Loader2 className="animate-spin"/> : <Wand2 size={16}/>} 立即生成
            </button>
        </div>
      </div>
    </div>
  );
};

// --- F. 恢复的组件: 配音微调弹窗 (AudioGeneratorModal) ---
const AudioGeneratorModal = ({ isOpen, onClose, initialText, onGenerate }) => {
  const [text, setText] = useState(initialText || "");
  const [voice, setVoice] = useState("alloy");
  const [loading, setLoading] = useState(false);
  
  useEffect(() => { setText(initialText || ""); }, [initialText]);

  const handleGen = async () => {
    setLoading(true);
    try { 
        await onGenerate(text, voice); 
        onClose(); 
    } catch (e) { 
        alert(e.message); 
    } finally { 
        setLoading(false); 
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-green-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in zoom-in" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-white flex gap-2 mb-4 items-center">
            <Mic className="text-green-400"/> 配音微调
        </h3>
        
        <div className="space-y-4">
            <div className="space-y-1">
                <label className="text-xs text-slate-400">台词内容</label>
                <textarea 
                    value={text} 
                    onChange={e => setText(e.target.value)} 
                    className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white resize-none focus:border-green-500 outline-none" 
                    placeholder="输入要生成的语音内容..."
                />
            </div>
            
            <div className="space-y-1">
                <label className="text-xs text-slate-400">选择声线</label>
                <select 
                    value={voice} 
                    onChange={e => setVoice(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-white focus:border-green-500 outline-none"
                >
                    <option value="alloy">Alloy (中性/通用)</option>
                    <option value="echo">Echo (男声/柔和)</option>
                    <option value="shimmer">Shimmer (女声/清晰)</option>
                    <option value="onyx">Onyx (男声/深沉)</option>
                    <option value="nova">Nova (女声/活力)</option>
                    <option value="fable">Fable (英式/叙事)</option>
                </select>
            </div>
        </div>

        <div className="mt-6 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors">取消</button>
            <button 
                onClick={handleGen} 
                disabled={loading} 
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {loading ? <Loader2 className="animate-spin"/> : <Wand2 size={16}/>} 生成语音
            </button>
        </div>
      </div>
    </div>
  );
};

// --- G. 图片预览 (ImagePreviewModal - 带缩放) ---
const ImagePreviewModal = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDrag, setIsDrag] = useState(false);
  const start = useRef({ x: 0, y: 0 });

  // 阻止背景滚动
  useEffect(() => {
    if (url) document.body.style.overflow = 'hidden';
    return () => document.body.style.overflow = '';
  }, [url]);

  useEffect(() => {
    const handleWheel = (e) => { 
        e.preventDefault(); 
        setScale(s => Math.max(0.1, Math.min(10, s - e.deltaY * 0.001))); 
    };
    if(url) document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [url]);

  if (!url) return null;

  return (
    <div 
        className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center overflow-hidden cursor-move" 
        onClick={onClose}
        onMouseDown={e => { setIsDrag(true); start.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; }}
        onMouseMove={e => { if (isDrag) setPos({ x: e.clientX - start.current.x, y: e.clientY - start.current.y }); }}
        onMouseUp={() => setIsDrag(false)}
    >
      <img 
        src={url} 
        draggable={false} 
        className="transition-transform duration-75 ease-linear" 
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }} 
        onClick={e => e.stopPropagation()}
      />
      
      <div className="absolute top-4 right-4 flex gap-2">
          <div className="bg-slate-800/80 px-3 py-1 rounded-full text-xs text-white backdrop-blur border border-slate-700">
              {Math.round(scale * 100)}%
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur transition-colors">
              <X size={20}/>
          </button>
      </div>
      
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-2 rounded-full text-[10px] text-slate-300 backdrop-blur pointer-events-none border border-white/10">
          滚轮缩放 • 拖拽移动
      </div>
    </div>
  );
};

// --- H. 灵感老虎机 (InspirationSlotMachine) ---
const InspirationSlotMachine = ({ onClose }) => {
  const { setScriptContext, callApi } = useProject();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

  const spin = async () => {
      setSpinning(true); 
      setResult(null);
      try {
          const res = await callApi('analysis', { 
              system: "Creative Director. JSON Output Only.", 
              user: "Brainstorm a unique short film idea. Return JSON: {genre, style, logline}." 
          });
          setResult(JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}"));
      } catch (e) { 
          setResult({ logline: "Error: " + e.message, genre: "Error", style: "Retry" }); 
      } finally { 
          setSpinning(false); 
      }
  };

  const apply = () => {
      if(!result) return;
      setScriptContext(p => ({ 
          ...p, 
          direction: `Genre: ${result.genre}. Mood: ${result.style}`, 
          style: result.style,
          script: `(Based on idea: ${result.logline})\n\n[Opening Scene]...` 
      }));
      onClose(); 
      alert("灵感已注入导演控制台！");
  };

  return (
      <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
          <div className="bg-gradient-to-br from-indigo-900 to-purple-900 w-full max-w-md rounded-2xl p-8 shadow-2xl text-center border border-purple-500/50 relative overflow-hidden" onClick={e=>e.stopPropagation()}>
              <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none"/>
              
              <h2 className="text-2xl font-bold text-white mb-6 flex justify-center gap-2 items-center relative z-10">
                  <Sparkles className="text-yellow-400 fill-yellow-400"/> AI 灵感风暴
              </h2>
              
              <div className="min-h-[140px] mb-6 flex items-center justify-center relative z-10">
                  {spinning ? (
                      <div className="flex flex-col items-center gap-3">
                          <Loader2 size={48} className="text-yellow-400 animate-spin"/>
                          <span className="text-xs text-purple-200 animate-pulse">连接宇宙脑波...</span>
                      </div>
                  ) : result ? (
                      <div className="text-left bg-black/40 p-4 rounded-lg border border-purple-500/30 w-full animate-in zoom-in">
                          <div className="flex justify-between mb-2">
                              <span className="text-[10px] bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded border border-purple-700/50">{result.genre}</span>
                              <span className="text-[10px] bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded border border-blue-700/50">{result.style}</span>
                          </div>
                          <div className="text-sm text-white italic leading-relaxed">"{result.logline}"</div>
                      </div>
                  ) : (
                      <div className="flex flex-col items-center text-purple-300/30">
                          <Brain size={48} className="mb-2"/>
                          <span className="text-xs">点击下方按钮开始</span>
                      </div>
                  )}
              </div>
              
              <div className="space-y-3 relative z-10">
                  <button onClick={spin} disabled={spinning} className="w-full py-3.5 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-black text-lg rounded-xl shadow-lg shadow-orange-900/50 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2">
                      <Dices size={20}/> {spinning?"构思中...":"生成 AI 创意"}
                  </button>
                  
                  {result && (
                      <button onClick={apply} className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors border border-white/5">
                          采用此方案
                      </button>
                  )}
              </div>
          </div>
      </div>
  );
};
// ==========================================
// 核心模块 3: 角色工坊 (CharacterLab - Part A: Logic)
// ==========================================

const CharacterLab = ({ onPreview }) => {
  const { 
    clPrompts, setClPrompts, actors, setActors, callApi 
  } = useProject();

  // --- 1. 核心常量：12 视角定义 (中文标题，英文Prompt) ---
  const FIXED_VIEWS = [
    { title: "正面全身", key: "front_full", prompt: "Full body shot, front view, standing straight, neutral expression, looking at camera, detailed outfit. (Depth of Field)" },
    { title: "背面全身", key: "back_full", prompt: "Full body shot, back view, standing straight, detailed back design of outfit." },
    { title: "侧面半身", key: "side_half", prompt: "Upper body shot, side profile view, looking forward, sharp features. (Cinematic Lighting)" },
    { title: "面部特写", key: "face_close", prompt: "Extreme close-up on face, front view, detailed eyes, detailed skin texture, pores visible. (Macro Photography)" },
    { title: "侧颜特写", key: "face_side", prompt: "Extreme close-up on face, side profile, jawline focus, rim lighting." },
    { title: "背面特写", key: "back_close", prompt: "Close-up from behind, focus on hair texture and neck/collar details." },
    { title: "俯视视角", key: "high_angle", prompt: "High angle shot, looking down at character, cinematic composition." },
    { title: "仰视视角", key: "low_angle", prompt: "Low angle shot, looking up at character, imposing presence, dramatic sky." },
    { title: "动态姿势", key: "action", prompt: "Dynamic action pose, fighting stance or running, motion blur on limbs, high energy." },
    { title: "电影广角", key: "wide", prompt: "Wide angle cinematic shot, character in environment, rule of thirds, atmospheric lighting." },
    { title: "自然抓拍(喜)", key: "joy", prompt: "Candid shot, laughing or smiling naturally, sparkles in eyes, warm lighting." },
    { title: "自然抓拍(怒)", key: "anger", prompt: "Candid shot, angry expression, intense stare, dramatic shadows, cold lighting." }
  ];

  // --- 2. 状态管理 ---
  // A. 左侧参数
  const [description, setDescription] = useState("");
  const [refImage, setRefImage] = useState(null); // Base64
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [targetLang, setTargetLang] = useState("Chinese");
  const [imgStrength, setImgStrength] = useState(1.0); // 默认强参考
  const [isGeneratingGrid, setIsGeneratingGrid] = useState(false);

  // B. 12宫格数据 { [index]: [{ url, loading, error, timestamp }] }
  const [gridImages, setGridImages] = useState({}); 

  // C. 签约中心状态
  const [showSignModal, setShowSignModal] = useState(false);
  const [signStatus, setSignStatus] = useState('idle');
  const [signParams, setSignParams] = useState({
      name: "", voice_tone: "", visual_head: "", visual_upper: "", visual_lower: "", visual_access: "", style: ""
  });
  const [isRegeneratingVoice, setIsRegeneratingVoice] = useState(false); // 恢复：声线重组状态
  
  // D. 签约生成历史 (双轨)
  const [portraitHistory, setPortraitHistory] = useState([]);
  const [sheetHistory, setSheetHistory] = useState([]);
  const [portraitIdx, setPortraitIdx] = useState(0);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [selectedRefIndices, setSelectedRefIndices] = useState([0, 3, 2, 1]); // 默认选4张

  // E. 恢复：查看演员详情状态
  const [viewingActor, setViewingActor] = useState(null);

  // --- 3. 辅助逻辑 ---
  const handleUploadRef = (e) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = () => setRefImage(reader.result);
          reader.readAsDataURL(file);
      }
  };

  const getActiveRefs = () => {
      const refs = [];
      if (refImage) refs.push(refImage);
      selectedRefIndices.forEach(idx => {
          const hist = gridImages[idx];
          if (hist && hist.length > 0 && !hist[hist.length-1].error) {
              refs.push(hist[hist.length-1].url);
          }
      });
      return refs;
  };

  // 恢复：打包下载所有视角 (V6.0 Feature)
  const downloadAllViews = async () => {
      const zip = new JSZip();
      const folder = zip.folder("character_grid_views");
      
      let hasImages = false;
      let txtContent = `Character: ${description}\n\n`;

      for (let i = 0; i < FIXED_VIEWS.length; i++) {
          const view = FIXED_VIEWS[i];
          const hist = gridImages[i];
          txtContent += `[${view.title}]\n${view.prompt}\n\n`;

          if (hist && hist.length > 0) {
              const last = hist[hist.length - 1];
              if (last.url && !last.error) {
                  try {
                      const resp = await fetch(last.url);
                      const blob = await resp.blob();
                      folder.file(`${view.key}_${i+1}.png`, blob);
                      hasImages = true;
                  } catch (e) {
                      console.error("Failed to zip image", i);
                  }
              }
          }
      }
      
      folder.file("prompts.txt", txtContent);
      
      if (hasImages) {
          const content = await zip.generateAsync({ type: "blob" });
          saveAs(content, "character_views_pack.zip");
      } else {
          alert("没有可下载的图片");
      }
  };

  // --- 4. 核心功能: 12宫格生成 ---
  const handleGenGrid = async () => {
    if (!description && !refImage) return alert("请先填写描述或上传参考图");
    
    // 初始化 Prompts
    const initialPrompts = FIXED_VIEWS.map(v => ({
        ...v,
        fullPrompt: `(${description}), ${v.prompt}`
    }));
    setClPrompts(initialPrompts);
    setIsGeneratingGrid(true);

    // 简单并发控制
    for (let i = 0; i < initialPrompts.length; i++) {
        await handleGenSingleSlot(i, initialPrompts[i]);
    }
    setIsGeneratingGrid(false);
  };

  const handleGenSingleSlot = async (idx, item) => {
      setGridImages(prev => ({ ...prev, [idx]: [...(prev[idx]||[]), { loading: true }] }));
      try {
          const url = await callApi('image', {
              prompt: item.fullPrompt || `(${description}), ${item.prompt}`,
              aspectRatio: aspectRatio,
              refImages: refImage ? [refImage] : [],
              strength: imgStrength
          });
          setGridImages(prev => {
              const list = [...(prev[idx]||[])];
              list[list.length-1] = { url, loading: false, timestamp: Date.now() };
              return { ...prev, [idx]: list };
          });
      } catch (e) {
          setGridImages(prev => {
              const list = [...(prev[idx]||[])];
              list[list.length-1] = { error: e.message, loading: false };
              return { ...prev, [idx]: list };
          });
      }
  };

  // --- 5. 核心功能: 签约中心逻辑 ---
  
  // 恢复：声线重组 (V6.0 Feature)
  const handleRegenVoice = async () => {
      if (!description && !refImage) return;
      setIsRegeneratingVoice(true);
      try {
          const res = await callApi('analysis', { 
              system: "Voice Director. JSON Output Only.", 
              user: "Suggest 3-5 voice tone keywords for this character. JSON: {voice_tone: '...'}",
              assets: refImage ? [refImage] : []
          });
          const json = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
          if(json.voice_tone) setSignParams(p => ({ ...p, voice_tone: json.voice_tone }));
      } catch(e) { 
          alert("声线重组失败"); 
      } finally { 
          setIsRegeneratingVoice(false); 
      }
  };

  const openSignModal = async () => {
      const hasGrid = Object.keys(gridImages).length > 0;
      if (!description && !refImage && !hasGrid) return alert("请先在工坊中创造角色");
      
      setShowSignModal(true);
      if (signParams.visual_head) return; // 避免重复分析

      setSignStatus('analyzing');
      try {
          // 收集素材 (原图 + 正面 + 特写)
          const assets = [];
          if (refImage) assets.push(refImage);
          if (gridImages[0]?.length) assets.push(gridImages[0].slice(-1)[0].url); // 正面
          if (gridImages[3]?.length) assets.push(gridImages[3].slice(-1)[0].url); // 特写

          const prompt = `Role: Character Concept Director.
          Task: Analyze input. Output JSON Profile.
          Rules:
          1. visual_head: face/hair/makeup.
          2. visual_upper: top clothing.
          3. visual_lower: pants/shoes (invent if missing).
          4. style: art style keywords.
          5. voice_tone: suggested voice timbre.
          
          Language: ${targetLang === 'Chinese' ? 'Simplified Chinese' : 'English'}.
          Context: ${description || "See images"}`;

          const res = await callApi('analysis', { system: "JSON Output Only", user: prompt, assets });
          const json = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
          setSignParams(prev => ({ ...prev, ...json }));
      } catch (e) {
          alert("自动分析失败，请手动填写");
      } finally {
          setSignStatus('idle');
      }
  };

  const handleGenPortrait = async () => {
      if (!signParams.visual_head) return alert("参数缺失");
      setSignStatus('generating_portrait');
      setPortraitHistory(p => [...p, { loading: true }]);
      setPortraitIdx(p => p + 1);

      try {
          const refs = getActiveRefs();
          const p = signParams;
          // 定妆照规范：半身，干净背景
          const prompt = `(Character Portrait), (Waist Up), (Clean Background). Visuals: ${p.visual_head}, ${p.visual_upper}, ${p.style}.`;
          const url = await callApi('image', { prompt, aspectRatio: "3:4", refImages: refs, strength: 0.65 });
          setPortraitHistory(prev => { const n = [...prev]; n[n.length-1] = { url, loading: false }; return n; });
      } catch (e) {
          setPortraitHistory(prev => { const n = [...prev]; n[n.length-1] = { error: e.message, loading: false }; return n; });
      } finally {
          setSignStatus('idle');
      }
  };

  const handleGenSheet = async () => {
      if (!signParams.visual_head) return alert("参数缺失");
      setSignStatus('generating_sheet');
      setSheetHistory(p => [...p, { loading: true }]);
      setSheetIdx(p => p + 1);

      try {
          const refs = getActiveRefs();
          const p = signParams;
          // 设定图规范：三视图，全身
          const prompt = `(Character Design Sheet), (Three Views: Front, Side, Back), (Full Body). Visuals: ${p.visual_head}, ${p.visual_upper}, ${p.visual_lower}, ${p.visual_access}, ${p.style}. White background.`;
          const url = await callApi('image', { prompt, aspectRatio: "16:9", refImages: refs, strength: 0.65 });
          setSheetHistory(prev => { const n = [...prev]; n[n.length-1] = { url, loading: false }; return n; });
      } catch (e) {
          setSheetHistory(prev => { const n = [...prev]; n[n.length-1] = { error: e.message, loading: false }; return n; });
      } finally {
          setSignStatus('idle');
      }
  };

  const handleRegisterActor = () => {
      const portrait = portraitHistory[portraitIdx];
      const sheet = sheetHistory[sheetIdx];
      if (!portrait?.url || !sheet?.url) return alert("请完成定妆照和设定图的生成与确认");
      if (!signParams.name) return alert("请填写演员名称");

      const newActor = {
          id: Date.now(),
          name: signParams.name,
          voice_tone: signParams.voice_tone,
          desc: signParams, 
          images: { portrait: portrait.url, sheet: sheet.url }
      };
      setActors(prev => [...prev, newActor]);
      setShowSignModal(false);
      alert(`签约成功！演员 ${signParams.name} 已入库。`);
  };
  // ==========================================
// 核心模块 3: 角色工坊 (CharacterLab - Part B: UI)
// ==========================================

  // --- UI 渲染部分 ---
  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      {/* 左侧控制栏 */}
      <div className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col z-10">
         <div className="p-4 border-b border-slate-800 bg-slate-900">
             <h2 className="text-white font-bold flex items-center gap-2"><UserCircle2 className="text-blue-400"/> 角色工坊</h2>
         </div>
         <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
             {/* 1. 参考图 */}
             <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-400 flex justify-between">
                     <span>基础参考图 (Base Ref)</span>
                     {refImage && <button onClick={() => setRefImage(null)} className="text-[10px] text-red-400 hover:text-red-300">移除</button>}
                 </label>
                 <div className="relative group w-full h-32 border-2 border-dashed border-slate-700 rounded-lg hover:border-blue-500 transition-colors overflow-hidden bg-slate-900/50">
                     <input type="file" accept="image/*" onChange={handleUploadRef} className="absolute inset-0 opacity-0 cursor-pointer z-10"/>
                     {refImage ? (
                         <img src={refImage} className="w-full h-full object-cover"/>
                     ) : (
                         <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                             <Upload size={24} className="mb-2"/>
                             <span className="text-[10px]">点击上传人物立绘</span>
                         </div>
                     )}
                 </div>
             </div>
             
             {/* 2. 描述与设置 */}
             <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-400">角色描述</label>
                 <textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs resize-none outline-none focus:border-blue-500 placeholder:text-slate-600" 
                    placeholder="例如：一位穿着赛博朋克夹克的银发少女，眼神冷酷..."
                 />
             </div>

             <div className="grid grid-cols-2 gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                 <div className="space-y-1">
                     <label className="text-[10px] text-slate-500">画面比例</label>
                     <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white outline-none">
                         <option value="16:9">16:9</option>
                         <option value="9:16">9:16</option>
                         <option value="1:1">1:1</option>
                     </select>
                 </div>
                 <div className="space-y-1">
                     <label className="text-[10px] text-slate-500">提示词语言</label>
                     <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white outline-none">
                         <option value="Chinese">中文</option>
                         <option value="English">English</option>
                     </select>
                 </div>
                 <div className="col-span-2 pt-2 border-t border-slate-700/50 space-y-1">
                     <div className="flex justify-between text-[10px] text-slate-400">
                         <span>参考图权重 (Strength)</span>
                         <span className="text-blue-400 font-mono">{imgStrength}</span>
                     </div>
                     <input 
                        type="range" min="0.1" max="1.0" step="0.1" 
                        value={imgStrength} 
                        onChange={e => setImgStrength(parseFloat(e.target.value))} 
                        className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"
                     />
                 </div>
             </div>
             
             {/* 3. 核心操作按钮 */}
             <div className="space-y-2">
                 <button onClick={handleGenGrid} disabled={isGeneratingGrid} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95">
                     {isGeneratingGrid ? <Loader2 className="animate-spin" size={16}/> : <LayoutGrid size={16}/>} 生成/刷新 12 视角
                 </button>

                 <button onClick={openSignModal} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95">
                     <FileText size={16}/> 制作设定卡 & 签约
                 </button>
             </div>
             
             {/* 4. 演员库列表 (恢复详情点击) */}
             {actors.length > 0 && (
                 <div className="pt-4 border-t border-slate-800">
                     <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xs font-bold text-slate-400">已签约演员 ({actors.length})</h3>
                        <button className="text-[10px] text-slate-500 hover:text-white" onClick={() => saveAs(new Blob([JSON.stringify(actors)], {type:"application/json"}), "actors_backup.json")}>备份</button>
                     </div>
                     <div className="grid grid-cols-3 gap-2">
                         {actors.map(actor => (
                             <div 
                                key={actor.id} 
                                onClick={() => setViewingActor(actor)}
                                className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-800 group cursor-pointer hover:border-blue-500 transition-all" 
                                title="点击查看详情"
                             >
                                 <img src={actor.images.portrait} className="w-full h-full object-cover"/>
                                 <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition-opacity font-bold text-center p-1">
                                     {actor.name}
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}
         </div>
      </div>

      {/* 右侧：12宫格视图 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          <div className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0">
              <span className="text-xs font-bold text-slate-400">视角预览 ({FIXED_VIEWS.length})</span>
              {/* 恢复：打包下载按钮 */}
              <button 
                onClick={downloadAllViews} 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-colors"
              >
                  <Download size={12}/> 打包全部视角
              </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                  {FIXED_VIEWS.map((view, idx) => {
                      const history = gridImages[idx] || [];
                      const current = history.length > 0 ? history[history.length-1] : null;
                      
                      return (
                          <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow hover:border-blue-500/50 transition-all flex flex-col group relative">
                              {/* 图片区 */}
                              <div className={cn("bg-black relative w-full shrink-0 group/img", aspectRatio==="16:9"?"aspect-video":aspectRatio==="9:16"?"aspect-[9/16]":"aspect-square")}>
                                  {current?.loading ? (
                                      <div className="absolute inset-0 flex flex-col items-center justify-center text-blue-500 gap-2">
                                          <Loader2 className="animate-spin"/>
                                          <span className="text-[10px]">Rendering...</span>
                                      </div>
                                  ) : current?.error ? (
                                      <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 p-2 text-center text-xs">
                                          <span className="font-bold">Error</span>
                                          <span className="opacity-50 text-[9px] leading-tight">{current.error}</span>
                                          <button onClick={()=>handleGenSingleSlot(idx, clPrompts[idx])} className="mt-2 text-[9px] underline">Retry</button>
                                      </div>
                                  ) : current?.url ? (
                                      <>
                                        <img src={current.url} className="w-full h-full object-cover cursor-zoom-in" onClick={()=>onPreview(current.url)}/>
                                        {/* 悬浮按钮组 */}
                                        <div className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity flex gap-1">
                                            <button onClick={()=>saveAs(current.url, `${view.key}.png`)} className="p-1.5 bg-black/60 rounded text-white hover:bg-blue-600 transition-colors" title="下载"><Download size={12}/></button>
                                            <button onClick={()=>handleGenSingleSlot(idx, clPrompts[idx])} className="p-1.5 bg-black/60 rounded text-white hover:bg-green-600 transition-colors" title="重绘"><RefreshCw size={12}/></button>
                                        </div>
                                      </>
                                  ) : (
                                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
                                          <button onClick={()=>handleGenSingleSlot(idx, { fullPrompt: `(${description}), ${view.prompt}` })} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-full shadow flex items-center gap-1 transition-transform active:scale-95">
                                              <Camera size={12}/> 单独生成
                                          </button>
                                      </div>
                                  )}
                                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-[10px] text-white border border-white/10 pointer-events-none">
                                      {view.title}
                                  </div>
                              </div>
                              {/* 底部 Prompt 信息 */}
                              <div className="p-2 border-t border-slate-800 bg-slate-900/50 min-h-[40px] flex items-center justify-between">
                                  <span className="text-[10px] text-slate-500 font-mono truncate flex-1 pr-2" title={view.prompt}>{view.prompt}</span>
                                  <div className="text-[10px] text-slate-600 font-mono">{history.length>0 ? history.length : 0}v</div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      </div>

      {/* 弹窗：签约中心 (Sign Modal) */}
      {showSignModal && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowSignModal(false)}>
              <div className="w-full max-w-6xl h-[90vh] bg-slate-900 border border-purple-500/30 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950 shrink-0">
                      <h3 className="text-white font-bold flex items-center gap-2"><FileText className="text-purple-400"/> 角色定妆与签约中心</h3>
                      <button onClick={()=>setShowSignModal(false)}><X className="text-slate-500 hover:text-white"/></button>
                  </div>
                  
                  {/* Body */}
                  <div className="flex-1 flex overflow-hidden">
                      {/* 左侧参数区 (30%) */}
                      <div className="w-96 border-r border-slate-800 p-6 bg-slate-900/50 overflow-y-auto scrollbar-thin space-y-5">
                          {signStatus === 'analyzing' ? (
                              <div className="h-full flex flex-col items-center justify-center text-purple-400 gap-4">
                                  <Brain size={48} className="animate-pulse"/>
                                  <p className="text-xs text-center px-8 leading-relaxed">AI 艺术总监正在分析素材并构建档案...</p>
                              </div>
                          ) : (
                              <>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500">演员名称 (ID)</label>
                                    <input value={signParams.name} onChange={e=>setSignParams({...signParams, name:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-white font-bold outline-none focus:border-purple-500" placeholder="例如: Neo"/>
                                </div>
                                
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] uppercase font-bold text-slate-500">声线特点</label>
                                        <button onClick={handleRegenVoice} disabled={isRegeneratingVoice} className="text-[10px] text-purple-400 hover:text-white flex items-center gap-1">
                                            {isRegeneratingVoice ? <Loader2 size={10} className="animate-spin"/> : <RefreshCw size={10}/>} 重组
                                        </button>
                                    </div>
                                    <input value={signParams.voice_tone} onChange={e=>setSignParams({...signParams, voice_tone:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-xs text-slate-300 outline-none focus:border-purple-500"/>
                                </div>
                                
                                <div className="space-y-3 pt-4 border-t border-slate-800">
                                    <div className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1"><UserCircle2 size={12}/> 视觉特征 (可手动修正)</div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-slate-600">头部/五官</label>
                                        <textarea value={signParams.visual_head} onChange={e=>setSignParams({...signParams, visual_head:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] text-slate-300 resize-none outline-none focus:border-blue-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-slate-600">上身/服装</label>
                                        <textarea value={signParams.visual_upper} onChange={e=>setSignParams({...signParams, visual_upper:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] text-slate-300 resize-none outline-none focus:border-blue-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-slate-600">下身/鞋子</label>
                                        <textarea value={signParams.visual_lower} onChange={e=>setSignParams({...signParams, visual_lower:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] text-slate-300 resize-none outline-none focus:border-blue-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-slate-600">艺术风格</label>
                                        <textarea value={signParams.style} onChange={e=>setSignParams({...signParams, style:e.target.value})} className="w-full h-12 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] text-pink-300 resize-none outline-none focus:border-blue-500"/>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] uppercase font-bold text-green-400 block">签约素材库 (最多选5张)</label>
                                        <span className="text-[9px] text-slate-500">用于定妆照生成</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto scrollbar-thin">
                                        {/* 原图 */}
                                        {refImage && <div className="aspect-square border-2 border-green-500 rounded overflow-hidden relative"><img src={refImage} className="w-full h-full object-cover"/><div className="absolute top-0 right-0 p-0.5 bg-green-500 text-white"><CheckCircle2 size={10}/></div></div>}
                                        {/* 12宫格图 */}
                                        {Object.entries(gridImages).map(([k,v]) => {
                                            const url = v[v.length-1]?.url;
                                            if(!url) return null;
                                            const isSel = selectedRefIndices.includes(parseInt(k));
                                            return <div key={k} onClick={()=>setSelectedRefIndices(p=>isSel?p.filter(i=>i!=k):[...p,parseInt(k)])} className={cn("aspect-square border-2 rounded overflow-hidden cursor-pointer relative", isSel?"border-green-500":"border-transparent opacity-50 hover:opacity-100")}><img src={url} className="w-full h-full object-cover"/>{isSel && <div className="absolute top-0 right-0 p-0.5 bg-green-500 text-white"><CheckCircle2 size={10}/></div>}</div>
                                        })}
                                    </div>
                                </div>
                              </>
                          )}
                      </div>

                      {/* 右侧生成预览区 (70%) */}
                      <div className="flex-1 bg-black p-8 flex flex-col gap-6 items-center justify-center relative">
                          {/* 背景装饰 */}
                          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none"/>

                          <div className="flex gap-8 w-full max-w-5xl h-[500px] z-10">
                              {/* 定妆照卡片 */}
                              <div className="flex-1 flex flex-col gap-3">
                                  <div className="flex justify-between text-xs font-bold text-slate-400 items-center">
                                      <span className="flex items-center gap-2"><UserCircle2 size={14}/> 定妆照 (Portrait)</span>
                                      <span className="font-mono">{portraitHistory.length > 0 ? `${portraitIdx+1}/${portraitHistory.length}` : ''}</span>
                                  </div>
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative group shadow-2xl">
                                      {portraitHistory[portraitIdx]?.loading ? <div className="absolute inset-0 flex items-center justify-center gap-2 text-blue-500 bg-slate-900/80"><Loader2 className="animate-spin"/><span className="text-xs">Generating...</span></div> :
                                       portraitHistory[portraitIdx]?.url ? <img src={portraitHistory[portraitIdx].url} className="w-full h-full object-contain cursor-zoom-in bg-black" onClick={()=>onPreview(portraitHistory[portraitIdx].url)}/> :
                                       <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 gap-2"><UserCircle2 size={48} className="opacity-20"/><span className="text-xs opacity-50">等待生成</span></div>}
                                       
                                      {/* 历史回溯按钮 */}
                                      {portraitHistory.length>1 && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/90 rounded-full flex gap-4 px-4 py-2 opacity-0 group-hover:opacity-100 transition-all border border-slate-700 shadow-lg"><button onClick={()=>setPortraitIdx(i=>Math.max(0,i-1))}><ChevronLeft size={16} className="text-white hover:text-blue-400"/></button><button onClick={()=>setPortraitIdx(i=>Math.min(portraitHistory.length-1,i+1))}><ChevronRight size={16} className="text-white hover:text-blue-400"/></button></div>}
                                  </div>
                                  <button onClick={handleGenPortrait} disabled={signStatus!=='idle'} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                                      {signStatus==='generating_portrait' ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>} 生成 / 重绘定妆照
                                  </button>
                              </div>

                              {/* 设定图卡片 */}
                              <div className="flex-[1.5] flex flex-col gap-3">
                                  <div className="flex justify-between text-xs font-bold text-slate-400 items-center">
                                      <span className="flex items-center gap-2"><LayoutGrid size={14}/> 设定图 (Sheet)</span>
                                      <span className="font-mono">{sheetHistory.length > 0 ? `${sheetIdx+1}/${sheetHistory.length}` : ''}</span>
                                  </div>
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative group shadow-2xl">
                                      {sheetHistory[sheetIdx]?.loading ? <div className="absolute inset-0 flex items-center justify-center gap-2 text-purple-500 bg-slate-900/80"><Loader2 className="animate-spin"/><span className="text-xs">Generating...</span></div> :
                                       sheetHistory[sheetIdx]?.url ? <img src={sheetHistory[sheetIdx].url} className="w-full h-full object-contain cursor-zoom-in bg-black" onClick={()=>onPreview(sheetHistory[sheetIdx].url)}/> :
                                       <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 gap-2"><LayoutGrid size={48} className="opacity-20"/><span className="text-xs opacity-50">等待生成</span></div>}

                                      {/* 历史回溯按钮 */}
                                      {sheetHistory.length>1 && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/90 rounded-full flex gap-4 px-4 py-2 opacity-0 group-hover:opacity-100 transition-all border border-slate-700 shadow-lg"><button onClick={()=>setSheetIdx(i=>Math.max(0,i-1))}><ChevronLeft size={16} className="text-white hover:text-purple-400"/></button><button onClick={()=>setSheetIdx(i=>Math.min(sheetHistory.length-1,i+1))}><ChevronRight size={16} className="text-white hover:text-purple-400"/></button></div>}
                                  </div>
                                  <button onClick={handleGenSheet} disabled={signStatus!=='idle'} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                                      {signStatus==='generating_sheet' ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>} 生成 / 重绘设定图
                                  </button>
                              </div>
                          </div>
                          
                          {/* 底部确认栏 */}
                          <div className="w-full max-w-5xl border-t border-slate-800 pt-6 flex justify-end gap-6 items-center z-10">
                              <div className="text-xs text-slate-500 flex items-center gap-2 mr-auto bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-800">
                                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                  <span>当前显示的图片将被锁定为最终签约资产</span>
                              </div>
                              <button onClick={() => setShowSignModal(false)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm transition-colors">取消</button>
                              <button onClick={handleRegisterActor} disabled={signStatus!=='idle'} className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transform transition-transform active:scale-95 disabled:opacity-50">
                                  <CheckCircle2 size={18}/> 确认签约并入库
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* 恢复：查看演员详情弹窗 (Detail Modal) */}
      {viewingActor && (
         <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewingActor(null)}>
            <div className="bg-slate-900 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex border border-slate-700" onClick={e => e.stopPropagation()}>
               <div className="w-1/2 bg-black relative">
                   <img src={viewingActor.images.portrait} className="w-full h-full object-cover"/>
                   <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
                       <h3 className="text-3xl font-bold text-white mb-1">{viewingActor.name}</h3>
                       <span className="text-xs bg-purple-900/80 text-purple-200 px-2 py-0.5 rounded border border-purple-500/30">{viewingActor.voice_tone}</span>
                   </div>
               </div>
               <div className="w-1/2 p-6 bg-slate-900 flex flex-col">
                   <div className="flex justify-between items-start mb-4">
                       <h4 className="text-xs font-bold text-slate-500 uppercase">Actor Profile</h4>
                       <button onClick={() => setViewingActor(null)}><X size={20} className="text-slate-500 hover:text-white"/></button>
                   </div>
                   
                   <div className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-thin">
                       <div>
                           <div className="text-[10px] text-slate-500 mb-1">Character Sheet</div>
                           <img src={viewingActor.images.sheet} className="w-full h-32 object-cover rounded border border-slate-700 cursor-zoom-in hover:border-blue-500 transition-colors" onClick={() => onPreview(viewingActor.images.sheet)}/>
                       </div>
                       
                       <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                           <div>
                               <span className="text-[9px] text-blue-400 block uppercase font-bold">Visual Head</span>
                               <p className="text-[10px] text-slate-300 leading-relaxed">{viewingActor.desc.visual_head}</p>
                           </div>
                           <div>
                               <span className="text-[9px] text-blue-400 block uppercase font-bold">Outfit</span>
                               <p className="text-[10px] text-slate-300 leading-relaxed">{viewingActor.desc.visual_upper} {viewingActor.desc.visual_lower}</p>
                           </div>
                           <div>
                               <span className="text-[9px] text-pink-400 block uppercase font-bold">Style</span>
                               <p className="text-[10px] text-slate-300 leading-relaxed">{viewingActor.desc.style}</p>
                           </div>
                       </div>
                   </div>
                   
                   <div className="mt-4 pt-4 border-t border-slate-800 flex gap-3">
                       <button onClick={() => { setActors(p => p.filter(a => a.id !== viewingActor.id)); setViewingActor(null); }} className="flex-1 py-2 bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:text-white border border-red-900/50 rounded flex items-center justify-center gap-2 text-xs transition-colors">
                           <Trash2 size={14}/> 解除签约
                       </button>
                       <button onClick={() => setViewingActor(null)} className="flex-1 py-2 bg-slate-800 text-slate-300 hover:text-white rounded text-xs">
                           关闭
                       </button>
                   </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
// ==========================================
// 核心模块 4: 自动分镜 (StoryboardStudio)
// ==========================================

const StoryboardStudio = ({ onPreview }) => {
  const { 
    scriptContext, setScriptContext, 
    shots, setShots, 
    scenes, setScenes, 
    actors, callApi 
  } = useProject();

  // --- 1. 本地状态 ---
  // A. 导演控制台状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeShotIds, setActiveShotIds] = useState([]); // 左侧选中的镜头ID
  const [selectedActors, setSelectedActors] = useState([]); // 本场戏选用的演员ID列表
  const [globalAsset, setGlobalAsset] = useState(null); // 上传的通用参考图
  const [globalAssetType, setGlobalAssetType] = useState('image'); // image | video | audio
  
  // B. AI 助手状态 (恢复 V6 的对话功能)
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
      { role: 'assistant', content: '我是您的 AI 分镜导演。请在上方输入剧本，我将为您拆解镜头。' }
  ]);
  const [isChatting, setIsChatting] = useState(false);
  
  // C. 生成状态追踪
  const [genStatus, setGenStatus] = useState({}); // { [id]: 'loading' | 'success' | 'error' }

  // --- 2. 辅助逻辑 ---
  const handleAssetUpload = (e) => {
      const file = e.target.files?.[0];
      if (file) {
          const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
          setGlobalAssetType(type);
          const reader = new FileReader();
          reader.onload = () => setGlobalAsset(reader.result);
          reader.readAsDataURL(file);
      }
  };

  const toggleShotSelection = (id) => {
      setActiveShotIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleActorSelection = (id) => {
      setSelectedActors(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // 恢复：CSV 导出功能 (V6.0 Feature)
  const exportCsv = () => {
      if (shots.length === 0) return alert("没有分镜数据");
      const header = ["Shot ID", "Duration", "Visual", "Camera", "SFX", "Dialogue", "Keyframe Status"];
      const rows = shots.map(s => [
          s.displayId, 
          s.duration + "s", 
          `"${s.visual}"`, 
          s.camera || "N/A", 
          s.sfx || "N/A", 
          `"${s.audio || ""}"`,
          s.keyframeUrl ? "Generated" : "Pending"
      ]);
      const csvContent = "\uFEFF" + [header, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, "storyboard_export.csv");
  };

  // --- 3. 核心功能: 剧本分析 (LLM) ---
  const handleAnalyzeScript = async () => {
      const { script, direction, style, physics } = scriptContext;
      if (!script) return alert("请先填写剧本");
      
      setIsAnalyzing(true);
      try {
          // 注入演员信息
          const castList = actors.filter(a => selectedActors.includes(a.id));
          const castPrompt = castList.length > 0 
              ? `Available Cast: ${castList.map(a => `${a.name} (Visual: ${a.desc.visual_upper})`).join(', ')}.`
              : "No specific cast selected.";

          const system = `Role: Professional Film Director.
          Task: Break down the script into a Shot List for Sora v2 Video Generation.
          
          Context:
          - Genre/Direction: ${direction}
          - Visual Style: ${style}
          - Physics Rules: ${physics}
          - ${castPrompt}
          
          Requirements:
          1. Replace generic names (e.g. "The man") with Actor Names if applicable.
          2. visual: Detailed visual description.
          3. camera: Specific camera movement (e.g. "Truck Left", "Dolly Zoom").
          4. sfx: Sound effects.
          5. audio: Dialogue lines.
          6. duration: Estimated duration (2-5s).
          
          Output JSON Array Only:
          [{"id": 1, "visual": "...", "camera": "...", "sfx": "...", "audio": "...", "duration": 4}]`;

          const res = await callApi('analysis', { system, user: script });
          const json = JSON.parse(res.match(/\[[\s\S]*\]/)?.[0] || "[]");
          
          const newShots = json.map(s => ({
              ...s,
              id: Date.now() + Math.random(),
              displayId: s.id,
              keyframeUrl: null
          }));
          
          setShots(newShots);
          setChatMessages(p => [...p, { role: 'assistant', content: `分析完成！已为您设计了 ${newShots.length} 个镜头。您可以在下方列表中生成关键帧。` }]);
      } catch (e) {
          alert("剧本分析失败: " + e.message);
      } finally {
          setIsAnalyzing(false);
      }
  };

  // 恢复：AI 助手对话调整 (V6.0 Feature)
  const handleChatSend = async () => {
      if (!chatInput.trim()) return;
      const msg = chatInput;
      setChatInput("");
      setChatMessages(p => [...p, { role: 'user', content: msg }]);
      setIsChatting(true);

      try {
          const contextShots = shots.map(s => ({ id: s.displayId, visual: s.visual }));
          const res = await callApi('analysis', {
              system: "Director Assistant. Task: Suggest changes to storyboard based on user feedback. Return JSON suggestions if applicable, otherwise plain text.",
              user: `Current Shots: ${JSON.stringify(contextShots)}\nUser Feedback: ${msg}`
          });
          setChatMessages(p => [...p, { role: 'assistant', content: res }]);
      } catch(e) {
          setChatMessages(p => [...p, { role: 'assistant', content: "Error: " + e.message }]);
      } finally {
          setIsChatting(false);
      }
  };

  // --- 4. 核心功能: 关键帧生成 (Shot Gen) ---
  // 逻辑: 双轨制 (有演员->多图参考; 无演员->单图参考)
  const handleGenKeyframe = async (shot) => {
      setGenStatus(prev => ({ ...prev, [shot.id]: 'loading_keyframe' }));
      
      try {
          // A. 准备 Prompt
          const basePrompt = `(Cinematic Keyframe), ${scriptContext.style}. ${shot.visual}. Camera: ${shot.camera}.`;
          
          // B. 准备参考图 (双轨逻辑)
          let refImages = [];
          
          // 检测 Prompt 中是否包含演员名字
          const cast = actors.filter(a => selectedActors.includes(a.id));
          const matchedActor = cast.find(a => shot.visual.includes(a.name));
          
          if (matchedActor) {
              // 命中演员 -> 强参考 (定妆照 + 设定图)
              refImages = [matchedActor.images.portrait, matchedActor.images.sheet];
          } else if (globalAsset && globalAssetType === 'image') {
              // 未命中 -> 使用全局风格参考
              refImages = [globalAsset];
          }

          // C. 调用生图 API
          const url = await callApi('image', {
              prompt: basePrompt,
              aspectRatio: "16:9",
              refImages: refImages,
              strength: matchedActor ? 0.75 : 0.5 
          });
          
          setShots(prev => prev.map(s => s.id === shot.id ? { ...s, keyframeUrl: url } : s));
          setGenStatus(prev => ({ ...prev, [shot.id]: 'success' }));

      } catch (e) {
          setGenStatus(prev => ({ ...prev, [shot.id]: 'error' }));
          alert(`镜头 ${shot.displayId} 生成失败: ${e.message}`);
      }
  };

  // --- 5. 核心功能: 大分镜组装 (Scene Assembly) ---
  const handleAssembleScene = () => {
      if (activeShotIds.length === 0) return alert("请至少在左侧勾选一个镜头");
      
      // 1. 获取选中的 Shot 对象
      const selectedShots = shots.filter(s => activeShotIds.includes(s.id));
      
      // 2. 检查是否有关键帧 (视频锚定基础)
      if (!selectedShots[0].keyframeUrl) {
          return alert("错误：第一镜头必须生成关键帧，作为视频首帧锚定。");
      }

      // 3. 调用 Sora 编译器
      const cast = actors.filter(a => selectedActors.includes(a.id));
      const compiledPrompt = compileSoraPrompt(selectedShots, cast, scriptContext);

      // 4. 创建 Scene 对象 (快照)
      const newScene = {
          id: Date.now(),
          title: `Scene ${scenes.length + 1} (${selectedShots.length} Shots)`,
          shots: JSON.parse(JSON.stringify(selectedShots)), // Deep Copy
          startImg: selectedShots[0].keyframeUrl, // 首帧锚定
          masterPrompt: compiledPrompt,
          videoUrl: null,
          duration: selectedShots.reduce((sum, s) => sum + (s.duration||5), 0)
      };

      setScenes(prev => [...prev, newScene]);
      setActiveShotIds([]); // 清空选择
      alert("✨ 大分镜组装完成！已添加至右侧列表。");
  };

  // --- 6. 核心功能: 视频生成 (Video Gen) ---
  const handleGenVideo = async (scene) => {
      setGenStatus(prev => ({ ...prev, [`scene_${scene.id}`]: 'loading_video' }));
      try {
          const url = await callApi('video', {
              prompt: scene.masterPrompt,
              startImg: scene.startImg,
              duration: Math.min(10, scene.duration),
              aspectRatio: "16:9"
          });
          
          setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoUrl: url } : s));
          setGenStatus(prev => ({ ...prev, [`scene_${scene.id}`]: 'success' }));
      } catch (e) {
          alert("视频生成失败: " + e.message);
          setGenStatus(prev => ({ ...prev, [`scene_${scene.id}`]: 'error' }));
      }
  };

  // --- UI 组件: 镜头卡片 (Shot Card) ---
  const ShotCard = ({ shot, isSelected, onToggle }) => {
      return (
          <div className={cn("bg-slate-900 border rounded-xl overflow-hidden flex flex-col transition-all group relative shadow-md", isSelected ? "border-orange-500 ring-1 ring-orange-500" : "border-slate-800 hover:border-slate-600")}>
             {/* 顶部: 图片预览区 */}
             <div className="aspect-video bg-black relative shrink-0">
                 {shot.keyframeUrl ? (
                     <>
                        <img src={shot.keyframeUrl} className="w-full h-full object-cover"/>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={()=>saveAs(shot.keyframeUrl, `shot_${shot.displayId}.png`)} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={12}/></button>
                            <button onClick={()=>onPreview(shot.keyframeUrl)} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600"><Eye size={12}/></button>
                        </div>
                     </>
                 ) : (
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-2">
                         <Camera size={24} className="opacity-20"/>
                         <button 
                            onClick={(e) => {e.stopPropagation(); handleGenKeyframe(shot);}} 
                            disabled={genStatus[shot.id] === 'loading_keyframe'}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-full border border-slate-700 flex items-center gap-1 transition-colors disabled:opacity-50"
                         >
                            {genStatus[shot.id] === 'loading_keyframe' ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>}
                            生成关键帧
                         </button>
                     </div>
                 )}
                 <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-[10px] text-white border border-white/10 font-bold">Shot {shot.displayId}</div>
                 <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-[10px] text-white flex items-center gap-1"><Clock size={10}/> {shot.duration}s</div>
                 
                 {/* 选中勾选框 */}
                 <div onClick={()=>onToggle(shot.id)} className={cn("absolute bottom-2 left-2 w-5 h-5 rounded border cursor-pointer flex items-center justify-center transition-colors z-10", isSelected ? "bg-orange-500 border-orange-500" : "bg-black/40 border-slate-400 hover:border-white")}>
                     {isSelected && <CheckCircle2 size={12} className="text-white"/>}
                 </div>
             </div>
             
             {/* 底部: 参数编辑区 */}
             <div className="p-3 space-y-2">
                 <textarea 
                    value={shot.visual} 
                    onChange={e => {
                        const val = e.target.value;
                        setShots(prev => prev.map(s => s.id === shot.id ? {...s, visual: val} : s));
                    }}
                    className="w-full h-14 bg-slate-950/50 border border-slate-800 rounded p-2 text-[11px] text-slate-300 resize-none outline-none focus:border-blue-500"
                    placeholder="画面描述..."
                 />
                 <div className="grid grid-cols-2 gap-2">
                     <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-2">
                        <Video size={10} className="text-slate-500"/>
                        <select 
                            value={shot.camera || ""} 
                            onChange={e => setShots(prev => prev.map(s => s.id === shot.id ? {...s, camera: e.target.value} : s))}
                            className="bg-transparent w-full p-1 text-[10px] text-slate-400 outline-none"
                        >
                            <option value="">(无运镜)</option>
                            <option value="Static">Static</option>
                            <option value="Pan Left">Pan Left</option>
                            <option value="Pan Right">Pan Right</option>
                            <option value="Tilt Up">Tilt Up</option>
                            <option value="Tilt Down">Tilt Down</option>
                            <option value="Dolly Zoom">Dolly Zoom</option>
                            <option value="Drone Shot">Drone Shot</option>
                        </select>
                     </div>
                     <input 
                        value={shot.sfx || ""}
                        onChange={e => setShots(prev => prev.map(s => s.id === shot.id ? {...s, sfx: e.target.value} : s))}
                        placeholder="SFX (音效)"
                        className="bg-slate-950 border border-slate-800 rounded p-1 text-[10px] text-slate-300 outline-none pl-2"
                     />
                 </div>
                 {shot.audio && (
                     <div className="text-[10px] text-green-400 flex items-center gap-1 bg-green-900/10 p-1 rounded border border-green-900/30">
                         <Mic size={10}/> "{shot.audio}"
                     </div>
                 )}
             </div>
          </div>
      );
  };

  // --- UI 部分 ---
  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      {/* ================= 左侧：导演控制台 & 分镜流 (40%) ================= */}
      <div className="w-[40%] flex flex-col border-r border-slate-800 bg-slate-900/30 min-w-[360px]">
        {/* Top: 控制台 */}
        <div className="p-4 border-b border-slate-800 bg-slate-900 shadow-md z-10 space-y-3 shrink-0">
            <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-white flex items-center gap-2"><Clapperboard size={16} className="text-purple-400"/> 导演控制台</h2>
                <button onClick={() => setShots([])} className="text-[10px] text-slate-500 hover:text-red-400 flex items-center gap-1"><Trash2 size={10}/> 清空</button>
            </div>
            
            {/* 剧本输入 */}
            <div className="space-y-2">
                <textarea value={scriptContext.script} onChange={e=>setScriptContext({...scriptContext, script:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white resize-none focus:border-purple-500 placeholder:text-slate-600" placeholder="剧本 / 故事大纲..."/>
                <div className="grid grid-cols-2 gap-2">
                    <input value={scriptContext.style} onChange={e=>setScriptContext({...scriptContext, style:e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-purple-500" placeholder="风格 (Style)"/>
                    <input value={scriptContext.direction} onChange={e=>setScriptContext({...scriptContext, direction:e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-purple-500" placeholder="环境 (Environment)"/>
                </div>
                
                {/* 恢复：带缩略图的参考素材上传 */}
                <div className="flex items-center gap-2">
                    <label className="flex-1 flex items-center justify-center h-8 border border-dashed border-slate-700 rounded cursor-pointer hover:border-purple-500 bg-slate-950 gap-2 relative overflow-hidden">
                        {globalAsset ? (
                            <>
                                {globalAssetType === 'image' && <img src={globalAsset} className="absolute inset-0 w-full h-full object-cover opacity-50"/>}
                                <span className="relative z-10 text-[10px] text-white shadow-black drop-shadow-md">已上传 {globalAssetType}</span>
                                <button onClick={(e)=>{e.preventDefault();setGlobalAsset(null)}} className="absolute right-1 z-20 p-0.5 bg-red-600 rounded-full text-white"><X size={8}/></button>
                            </>
                        ) : (
                            <><ImageIcon size={12} className="text-slate-500"/><span className="text-[10px] text-slate-500">上传风格参考</span></>
                        )}
                        <input type="file" className="hidden" onChange={handleAssetUpload}/>
                    </label>
                    <input value={scriptContext.physics} onChange={e=>setScriptContext({...scriptContext, physics:e.target.value})} className="flex-1 h-8 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-purple-500" placeholder="物理规则"/>
                </div>
            </div>

            {/* 演员选择 */}
            {actors.length > 0 && (
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">卡司 (Cast)</label>
                    <div className="flex flex-wrap gap-2 max-h-16 overflow-y-auto scrollbar-none">
                        {actors.map(actor => (
                            <button 
                                key={actor.id} 
                                onClick={() => toggleActorSelection(actor.id)}
                                className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border transition-all", selectedActors.includes(actor.id) ? "bg-purple-600 border-purple-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-purple-500")}
                            >
                                <img src={actor.images.portrait} className="w-4 h-4 rounded-full object-cover"/>
                                {actor.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold rounded shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                {isAnalyzing ? <Loader2 className="animate-spin" size={14}/> : <Brain size={14}/>} AI 剧本拆解 & 镜头设计
            </button>
        </div>

        {/* Middle: 分镜列表 */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50 scrollbar-thin flex flex-col gap-4">
            <div className="flex justify-between items-center sticky top-0 bg-slate-950/90 backdrop-blur z-10 py-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400">分镜草稿箱 ({shots.length})</span>
                <div className="flex gap-2">
                    {/* 恢复：CSV 导出按钮 */}
                    <button onClick={exportCsv} className="p-1.5 bg-slate-800 text-green-400 rounded hover:bg-green-900/30" title="导出CSV"><FileSpreadsheet size={14}/></button>
                    {activeShotIds.length > 0 && (
                         <button onClick={handleAssembleScene} className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded-full font-bold shadow animate-in zoom-in flex items-center gap-1">
                             <Layers size={12}/> 组合 ({activeShotIds.length})
                         </button>
                    )}
                </div>
            </div>
            
            {shots.map(shot => <ShotCard key={shot.id} shot={shot} isSelected={activeShotIds.includes(shot.id)} onToggle={toggleShotSelection}/>)}
            {shots.length === 0 && <div className="text-center text-slate-600 py-10 text-xs">暂无镜头</div>}
        </div>
        
        {/* Bottom: AI 助手聊天 (恢复 V6) */}
        <div className="h-48 border-t border-slate-800 bg-slate-900 flex flex-col shrink-0">
            <div className="p-2 border-b border-slate-800 text-[10px] font-bold text-slate-500 flex items-center gap-2"><MessageSquare size={10}/> AI 助手</div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                {chatMessages.map((m, i) => (
                    <div key={i} className={cn("text-[10px] p-2 rounded max-w-[90%]", m.role==='user'?"bg-purple-600 text-white ml-auto":"bg-slate-800 text-slate-300")}>{m.content}</div>
                ))}
            </div>
            <div className="p-2 flex gap-2">
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleChatSend()} className="flex-1 bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white" placeholder="输入修改建议..."/>
                <button onClick={handleChatSend} disabled={isChatting} className="p-1.5 bg-purple-600 text-white rounded hover:bg-purple-500">{isChatting?<Loader2 className="animate-spin" size={12}/>:<Send size={12}/>}</button>
            </div>
        </div>
      </div>

      {/* ================= 右侧：大分镜组装区 (60%) ================= */}
      <div className="flex-1 flex flex-col bg-slate-950 border-l border-slate-800">
          <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50">
              <h2 className="text-sm font-bold text-white flex items-center gap-2"><Layers size={16} className="text-orange-500"/> 大分镜组装 (Scene Assembly)</h2>
              <span className="text-xs text-slate-500">Sora v2 Prompt Compiler Enabled</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              <div className="grid grid-cols-1 gap-8 max-w-4xl mx-auto">
                  {scenes.map(scene => (
                      <div key={scene.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:border-orange-500/30 transition-all">
                          {/* 头部信息 */}
                          <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/30">
                              <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-orange-400">{scene.title}</span>
                                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{scene.duration}s</span>
                              </div>
                              <button onClick={() => setScenes(prev => prev.filter(s => s.id !== scene.id))} className="text-slate-500 hover:text-red-400"><X size={14}/></button>
                          </div>
                          
                          {/* 核心内容区 */}
                          <div className="flex flex-col xl:flex-row h-[320px]">
                              {/* 左: 视频预览 */}
                              <div className="xl:w-[45%] bg-black relative shrink-0 h-full border-b xl:border-b-0 xl:border-r border-slate-800">
                                  {scene.videoUrl ? (
                                      <video src={scene.videoUrl} controls className="w-full h-full object-cover"/>
                                  ) : (
                                      <>
                                          <img src={scene.startImg} className="w-full h-full object-cover opacity-50"/>
                                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black via-transparent to-transparent">
                                              <button 
                                                onClick={() => handleGenVideo(scene)} 
                                                disabled={genStatus[`scene_${scene.id}`] === 'loading_video'}
                                                className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-full shadow-lg flex items-center gap-2 transition-transform hover:scale-105 disabled:opacity-50"
                                              >
                                                  {genStatus[`scene_${scene.id}`] === 'loading_video' ? <Loader2 className="animate-spin"/> : <Film size={18}/>}
                                                  生成长视频
                                              </button>
                                          </div>
                                      </>
                                  )}
                              </div>
                              
                              {/* 右: Prompt 代码 */}
                              <div className="flex-1 bg-slate-950 relative flex flex-col h-full">
                                  <div className="p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                                      <span className="text-[10px] text-slate-500 font-bold uppercase">Sora v2 Prompt</span>
                                      <button onClick={() => navigator.clipboard.writeText(scene.masterPrompt)} className="text-slate-500 hover:text-white"><Copy size={12}/></button>
                                  </div>
                                  <textarea 
                                      readOnly 
                                      value={scene.masterPrompt} 
                                      className="flex-1 w-full bg-transparent p-3 text-[10px] font-mono text-slate-400 resize-none outline-none scrollbar-thin hover:text-slate-300 transition-colors leading-relaxed"
                                  />
                              </div>
                          </div>
                      </div>
                  ))}
                  
                  {scenes.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-4 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                          <Layers size={48} className="opacity-20"/>
                          <p className="text-sm">暂无大分镜</p>
                          <p className="text-xs opacity-50">请在左侧勾选多个小分镜，点击“组合”按钮</p>
                      </div>
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};
// ==========================================
// 核心模块 5: 制片台 (StudioBoard)
// ==========================================

const StudioBoard = () => {
  const { 
    shots, scenes, timeline, setTimeline, callApi 
  } = useProject();

  const [activeBin, setActiveBin] = useState('scenes'); // scenes | shots | uploads
  const [playingClipId, setPlayingClipId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // 本地上传素材状态
  const [uploads, setUploads] = useState([]);

  // 恢复：微调弹窗状态
  const [activeModal, setActiveModal] = useState({ type: null, clipId: null }); // type: 'video' | 'audio'

  // --- 辅助逻辑 ---
  const handleUpload = (e) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = () => {
              setUploads(p => [...p, {
                  id: Date.now(),
                  type: file.type.startsWith('video') ? 'video' : 'image',
                  url: reader.result,
                  name: file.name
              }]);
          };
          reader.readAsDataURL(file);
      }
  };

  const addToTimeline = (item, type) => {
      const newClip = {
          uuid: Date.now() + Math.random(),
          type: type, // 'scene' | 'shot' | 'upload'
          mediaType: item.videoUrl ? 'video' : (item.type || 'image'),
          url: item.videoUrl || item.keyframeUrl || item.url || item.startImg,
          duration: item.duration || 5,
          name: item.title || `Shot ${item.displayId}` || item.name,
          sourceData: item,
          // 继承原始 Prompt 以便微调
          visualPrompt: item.masterPrompt || item.visual || "",
          audioPrompt: item.audio || ""
      };
      setTimeline(prev => [...prev, newClip]);
  };

  const removeFromTimeline = (uuid) => {
      setTimeline(prev => prev.filter(c => c.uuid !== uuid));
  };

  const updateClip = (uuid, updates) => {
      setTimeline(prev => prev.map(c => c.uuid === uuid ? { ...c, ...updates } : c));
  };

  // --- 恢复：弹窗生成逻辑 ---
  const handleRegenVideo = async (prompt) => {
      const clip = timeline.find(c => c.uuid === activeModal.clipId);
      if (!clip) return;
      
      // 这里的 startImg 必须是原始关键帧，而不是可能已经生成的视频URL
      const startImg = clip.type === 'scene' ? clip.sourceData.startImg : 
                       clip.type === 'shot' ? clip.sourceData.keyframeUrl : clip.url;

      const url = await callApi('video', {
          prompt: prompt,
          startImg: startImg,
          duration: clip.duration,
          aspectRatio: "16:9"
      });
      
      updateClip(clip.uuid, { 
          url: url, 
          mediaType: 'video', 
          visualPrompt: prompt 
      });
      alert("视频已更新！");
  };

  const handleRegenAudio = async (text, voice) => {
      const clip = timeline.find(c => c.uuid === activeModal.clipId);
      if (!clip) return;

      const audioUrl = await callApi('audio', { input: text, voice: voice });
      
      updateClip(clip.uuid, { 
          audioUrl: audioUrl,
          audioPrompt: text 
      });
      alert("配音已添加/更新！");
  };

  // --- 播放控制逻辑 ---
  const handlePlay = () => {
      if (timeline.length === 0) return;
      setIsPlaying(!isPlaying);
      if (!isPlaying) setPlayingClipId(timeline[0].uuid);
      else setPlayingClipId(null);
  };

  useEffect(() => {
      if (!isPlaying || !playingClipId) return;
      const currentIdx = timeline.findIndex(c => c.uuid === playingClipId);
      if (currentIdx === -1) { setIsPlaying(false); return; }

      const clip = timeline[currentIdx];
      const durationMs = (clip.duration || 5) * 1000;

      const timer = setTimeout(() => {
          if (currentIdx < timeline.length - 1) {
              setPlayingClipId(timeline[currentIdx + 1].uuid);
          } else {
              setIsPlaying(false);
              setPlayingClipId(null);
          }
      }, durationMs);

      return () => clearTimeout(timer);
  }, [isPlaying, playingClipId, timeline]);

  const currentDisplay = useMemo(() => {
      if (!playingClipId) return timeline.length > 0 ? timeline[0] : null;
      return timeline.find(c => c.uuid === playingClipId);
  }, [playingClipId, timeline]);

  const handleExportEDL = () => {
      const header = "EDL EXPORT - AI DIRECTOR STUDIO v7.0\n------------------------------------\n";
      const content = timeline.map((c, i) => `${i+1}. [${c.mediaType.toUpperCase()}] ${c.name} (${c.duration}s)\n   Source: ${c.visualPrompt.substring(0, 50)}...`).join('\n\n');
      saveAs(new Blob([header + content], { type: "text/plain;charset=utf-8" }), "project_timeline.txt");
  };

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden relative">
        {/* 恢复：微调弹窗挂载 */}
        {activeModal.type === 'video' && (
            <VideoGeneratorModal 
                isOpen={true} 
                onClose={() => setActiveModal({ type: null, clipId: null })} 
                initialPrompt={timeline.find(c => c.uuid === activeModal.clipId)?.visualPrompt}
                onGenerate={handleRegenVideo}
            />
        )}
        {activeModal.type === 'audio' && (
            <AudioGeneratorModal 
                isOpen={true} 
                onClose={() => setActiveModal({ type: null, clipId: null })} 
                initialText={timeline.find(c => c.uuid === activeModal.clipId)?.audioPrompt}
                onGenerate={handleRegenAudio}
            />
        )}

        {/* 左侧：素材箱 */}
        <div className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col z-10">
            <div className="p-4 border-b border-slate-800 bg-slate-900">
                <h2 className="text-white font-bold flex items-center gap-2 mb-4"><FolderOpen className="text-orange-400"/> 制片素材箱</h2>
                <div className="flex bg-slate-800 rounded p-1">
                    {['scenes', 'shots', 'uploads'].map(tab => (
                        <button key={tab} onClick={() => setActiveBin(tab)} className={cn("flex-1 py-1 text-[10px] uppercase font-bold rounded transition-colors", activeBin === tab ? "bg-orange-600 text-white shadow" : "text-slate-500 hover:text-slate-300")}>{tab}</button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                {activeBin === 'scenes' && scenes.map(scene => (
                    <div key={scene.id} onClick={() => addToTimeline(scene, 'scene')} className="group bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-orange-500 cursor-pointer flex gap-2 items-center transition-all">
                        <div className="w-16 h-10 bg-black rounded overflow-hidden shrink-0 relative">
                            {scene.videoUrl ? <video src={scene.videoUrl} className="w-full h-full object-cover"/> : <img src={scene.startImg} className="w-full h-full object-cover"/>}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100"><PlusCircle size={16} className="text-white"/></div>
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-300 truncate">{scene.title}</div>
                            <div className="text-[10px] text-slate-500">{scene.duration}s • {scene.videoUrl ? 'Video' : 'Static'}</div>
                        </div>
                    </div>
                ))}
                {activeBin === 'shots' && shots.map(shot => (
                    <div key={shot.id} onClick={() => addToTimeline(shot, 'shot')} className="group bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-orange-500 cursor-pointer flex gap-2 items-center transition-all">
                        <div className="w-16 h-10 bg-black rounded overflow-hidden shrink-0 relative">
                            {shot.keyframeUrl ? <img src={shot.keyframeUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-500">No Img</div>}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100"><PlusCircle size={16} className="text-white"/></div>
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-300 truncate">Shot {shot.displayId}</div>
                            <div className="text-[10px] text-slate-500 truncate">{shot.visual}</div>
                        </div>
                    </div>
                ))}
                {activeBin === 'uploads' && (
                    <div className="space-y-3">
                        <label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-orange-500 hover:bg-slate-800/50 text-slate-500 gap-2 transition-colors">
                            <Upload size={16}/> <span className="text-xs">上传本地素材</span>
                            <input type="file" className="hidden" onChange={handleUpload}/>
                        </label>
                        {uploads.map(u => (
                            <div key={u.id} onClick={() => addToTimeline(u, 'upload')} className="group bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-orange-500 cursor-pointer flex gap-2 items-center transition-all">
                                <div className="w-16 h-10 bg-black rounded overflow-hidden shrink-0 relative">
                                    {u.type === 'video' ? <video src={u.url} className="w-full h-full object-cover"/> : <img src={u.url} className="w-full h-full object-cover"/>}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100"><PlusCircle size={16} className="text-white"/></div>
                                </div>
                                <div className="text-xs text-slate-300 truncate flex-1">{u.name}</div>
                            </div>
                        ))}
                    </div>
                )}
                {((activeBin === 'scenes' && scenes.length === 0) || (activeBin === 'shots' && shots.length === 0)) && (
                    <div className="text-center text-slate-600 py-10 text-xs">暂无素材，请在自动分镜中生成</div>
                )}
            </div>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 flex flex-col min-w-0">
            {/* 顶部播放器 */}
            <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
                {currentDisplay ? (
                    <div className="relative w-full h-full max-w-5xl max-h-[80vh] aspect-video bg-black shadow-2xl">
                        {currentDisplay.mediaType === 'video' ? (
                            <video src={currentDisplay.url} className="w-full h-full object-contain" autoPlay={isPlaying} loop controls={false}/>
                        ) : (
                            <div className="w-full h-full overflow-hidden relative">
                                <img 
                                    src={currentDisplay.url} 
                                    className={cn("w-full h-full object-contain", isPlaying ? "animate-[kenburns_10s_ease-out_forwards]" : "")} 
                                    style={{ transformOrigin: 'center center' }}
                                />
                                {isPlaying && <div className="absolute bottom-10 left-0 right-0 text-center text-white/50 text-sm animate-pulse font-mono">Simulating Motion...</div>}
                            </div>
                        )}
                        <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-white text-xs backdrop-blur border border-white/10 font-mono">
                            {currentDisplay.name} • {currentDisplay.duration}s
                        </div>
                    </div>
                ) : (
                    <div className="text-slate-600 flex flex-col items-center gap-4">
                        <Monitor size={64} className="opacity-20"/>
                        <p className="text-sm">时间轴为空，请拖入素材</p>
                    </div>
                )}
            </div>
            
            {/* 底部时间轴 */}
            <div className="h-64 bg-slate-900 border-t border-slate-800 flex flex-col shrink-0">
                <div className="h-10 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-2"><Clock size={12}/> Timeline ({timeline.length} clips)</span>
                        <button onClick={() => setTimeline([])} className="text-[10px] text-slate-500 hover:text-red-400">清空</button>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={handleExportEDL} className="text-[10px] flex items-center gap-1 text-blue-400 hover:text-blue-300"><FileSpreadsheet size={12}/> 导出 EDL</button>
                        <button onClick={handlePlay} className={cn("flex items-center gap-1.5 px-6 py-1 text-white text-xs rounded-full font-bold transition-all shadow-lg", isPlaying ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500")}>
                            {isPlaying ? <><span className="animate-pulse">●</span> 停止</> : <><Play size={12}/> 播放全片</>}
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-x-auto p-4 space-x-2 flex items-center whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700 bg-slate-900/50 relative">
                    <div className="absolute top-0 left-0 right-0 h-4 border-b border-slate-800 bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] opacity-20 pointer-events-none"/>
                    
                    {timeline.map((clip, idx) => (
                        <div 
                            key={clip.uuid} 
                            className={cn("inline-flex flex-col w-48 h-40 bg-slate-800 border rounded-lg overflow-hidden relative group shrink-0 transition-all cursor-pointer", playingClipId === clip.uuid ? "border-green-500 ring-2 ring-green-500 z-10 scale-105 shadow-xl" : "border-slate-700 hover:border-orange-500")}
                            onClick={() => setPlayingClipId(clip.uuid)}
                        >
                            {/* 上半部分：预览 */}
                            <div className="h-24 bg-black relative shrink-0">
                                {clip.mediaType === 'video' ? <video src={clip.url} className="w-full h-full object-cover"/> : <img src={clip.url} className="w-full h-full object-cover"/>}
                                <div className="absolute top-1 right-1 bg-black/60 px-1.5 rounded text-[9px] text-white font-mono">{clip.duration}s</div>
                                {clip.mediaType === 'video' && <div className="absolute top-1 left-1 bg-purple-600 px-1 rounded text-[8px] text-white"><Film size={8}/></div>}
                                {clip.audioUrl && <div className="absolute bottom-1 right-1 bg-green-600 p-1 rounded-full text-white"><Volume2 size={8}/></div>}
                            </div>
                            
                            {/* 下半部分：操作与信息 */}
                            <div className="flex-1 p-2 flex flex-col justify-between bg-slate-800">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-bold text-slate-300 truncate w-24" title={clip.name}>{idx+1}. {clip.name}</span>
                                    <button onClick={(e) => {e.stopPropagation(); removeFromTimeline(clip.uuid)}} className="text-slate-500 hover:text-red-400"><X size={10}/></button>
                                </div>
                                {/* 恢复：操作按钮组 */}
                                <div className="flex gap-1 mt-1">
                                    <button onClick={(e) => {e.stopPropagation(); setActiveModal({type: 'video', clipId: clip.uuid})}} className="flex-1 bg-slate-700 hover:bg-orange-600 text-[9px] text-slate-300 hover:text-white rounded py-0.5 transition-colors border border-slate-600" title="重生成视频">Video</button>
                                    <button onClick={(e) => {e.stopPropagation(); setActiveModal({type: 'audio', clipId: clip.uuid})}} className="flex-1 bg-slate-700 hover:bg-green-600 text-[9px] text-slate-300 hover:text-white rounded py-0.5 transition-colors border border-slate-600" title="添加/修改配音">Audio</button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {timeline.length === 0 && <div className="w-full text-center text-slate-600 text-xs italic">👈 请从左侧素材箱添加镜头或上传视频</div>}
                </div>
            </div>
        </div>
    </div>
  );
};

// ==========================================
// 主程序架构 (App & Navigation)
// ==========================================

const AppContent = () => {
  const [activeTab, setActiveTab] = useState('character'); 
  const [showSettings, setShowSettings] = useState(false);
  const [showSlotMachine, setShowSlotMachine] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [activeModalType, setActiveModalType] = useState(null); 

  const { config, setConfig, fetchModels, availableModels, isLoadingModels } = useProject();

  const handleQuickModelChange = (type, val) => {
    setConfig(prev => ({ ...prev, [type]: { ...prev[type], model: val } }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans select-none">
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      <ModelSelectionModal isOpen={activeModalType !== null} title={activeModalType?.toUpperCase()} models={availableModels} onClose={() => setActiveModalType(null)} onSelect={(m) => handleQuickModelChange(activeModalType, m)} />
      {showSettings && <ConfigCenter onClose={() => setShowSettings(false)} fetchModels={fetchModels} availableModels={availableModels} isLoadingModels={isLoadingModels}/>}
      {showSlotMachine && <InspirationSlotMachine onClose={() => setShowSlotMachine(false)} />}

      <div className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex items-center justify-between px-4 z-50 shrink-0 shadow-lg">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 group cursor-default">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
                  <Wand2 size={18} className="text-white" />
              </div>
              <div>
                  <h1 className="font-bold text-base tracking-tight text-white leading-tight">AI Director</h1>
                  <p className="text-[9px] text-slate-500 font-mono tracking-wider">STUDIO V7.0</p>
              </div>
          </div>
          
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            {[
                { id: 'character', label: '角色工坊', icon: UserCircle2, color: 'text-blue-400' },
                { id: 'storyboard', label: '自动分镜', icon: Clapperboard, color: 'text-purple-400' },
                { id: 'studio', label: '制片台', icon: Monitor, color: 'text-orange-400' }
            ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all", activeTab === tab.id ? "bg-slate-700 text-white shadow-md ring-1 ring-white/10" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
                    <tab.icon size={14} className={activeTab === tab.id ? tab.color : ""}/>{tab.label}
                </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden xl:flex gap-3">
            <ModelTrigger label="大脑" icon={Brain} value={config.analysis.model} onOpenPicker={() => { setActiveModalType('analysis'); fetchModels('analysis'); }} onManualChange={(v) => handleQuickModelChange('analysis', v)} colorTheme="blue" />
            <ModelTrigger label="画师" icon={Palette} value={config.image.model} onOpenPicker={() => { setActiveModalType('image'); fetchModels('image'); }} onManualChange={(v) => handleQuickModelChange('image', v)} colorTheme="purple" />
            <ModelTrigger label="摄像" icon={Video} value={config.video.model} onOpenPicker={() => { setActiveModalType('video'); fetchModels('video'); }} onManualChange={(v) => handleQuickModelChange('video', v)} colorTheme="slate" />
          </div>
          <div className="h-6 w-px bg-slate-800 mx-2 hidden xl:block"></div>
          <button onClick={() => setShowSlotMachine(true)} className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white text-xs font-bold rounded-full shadow-lg shadow-orange-500/20 transition-all active:scale-95"><Sparkles size={12}/> 灵感</button>
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors" title="全局设置"><Settings size={20}/></button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-slate-950">
        <div className={cn("absolute inset-0 transition-opacity duration-300", activeTab === 'character' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none')}><CharacterLab onPreview={setPreviewUrl} /></div>
        <div className={cn("absolute inset-0 transition-opacity duration-300", activeTab === 'storyboard' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none')}><StoryboardStudio onPreview={setPreviewUrl} /></div>
        <div className={cn("absolute inset-0 transition-opacity duration-300", activeTab === 'studio' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none')}><StudioBoard /></div>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}
