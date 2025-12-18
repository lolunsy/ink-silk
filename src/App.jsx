import React, { useState, useMemo, useRef, useEffect, useContext, createContext } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2, Sparkles, Dices, Layers } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) { return twMerge(clsx(inputs)); }

// --- 1. 全局项目上下文 (Project Context - The "Central Kitchen") ---
const ProjectContext = createContext();
export const useProject = () => useContext(ProjectContext);

const ProjectProvider = ({ children }) => {
  // 安全读取工具：防止 JSON 解析报错导致白屏
  const safeJsonParse = (key, fallback) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      console.warn(`Data corrupted for ${key}, resetting.`);
      return fallback;
    }
  };

  // A. 配置中心数据 (V3 架构)
  const [config, setConfig] = useState(() => {
    // 优先读取 V3
    const v3 = safeJsonParse('app_config_v3', null);
    if (v3) return v3;
    
    // 默认配置
    const defaults = {
      analysis: { baseUrl: 'https://generativelanguage.googleapis.com', key: '', model: 'gemini-3-pro' },
      image: { baseUrl: '', key: '', model: 'nanobanana-2-pro' },
      video: { baseUrl: '', key: '', model: 'kling-v2.6' },
      audio: { baseUrl: '', key: '', model: 'tts-1-hd' }
    };

    // 尝试迁移旧数据
    const oldKey = localStorage.getItem('gemini_key');
    if (oldKey) {
        defaults.analysis.key = oldKey;
        defaults.image.key = oldKey;
    }
    return defaults;
  });

  // 模型列表状态
  const [availableModels, setAvailableModels] = useState([]); 
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // B. 核心资产数据
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  
  // 角色工坊资产
  const [clPrompts, setClPrompts] = useState(() => safeJsonParse('cl_prompts', []));
  const [clImages, setClImages] = useState(() => safeJsonParse('cl_images', {}));
  
  // 自动分镜资产
  const [shots, setShots] = useState(() => safeJsonParse('sb_shots', []));
  const [shotImages, setShotImages] = useState(() => safeJsonParse('sb_shot_images', {}));

  // 持久化监听
  useEffect(() => { localStorage.setItem('app_config_v3', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('sb_script', script); }, [script]);
  useEffect(() => { localStorage.setItem('sb_direction', direction); }, [direction]);
  useEffect(() => { localStorage.setItem('cl_prompts', JSON.stringify(clPrompts)); }, [clPrompts]);
  useEffect(() => { localStorage.setItem('cl_images', JSON.stringify(clImages)); }, [clImages]);
  useEffect(() => { localStorage.setItem('sb_shots', JSON.stringify(shots)); }, [shots]);
  useEffect(() => { localStorage.setItem('sb_shot_images', JSON.stringify(shotImages)); }, [shotImages]);

  // 功能：获取模型列表
  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!key) return alert(`请先在设置中配置 [${type}] 的 API Key`);
    
    setIsLoadingModels(true); 
    setAvailableModels([]);
    
    try {
      let found = [];
      // 1. OpenAI Format
      try { 
        const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } }); 
        const d = await r.json(); 
        if(d.data) found = d.data.map(m=>m.id); 
      } catch(e){}
      
      // 2. Google Format
      if(!found.length && baseUrl.includes('google')) { 
        const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); 
        const d = await r.json(); 
        if(d.models) found = d.models.map(m=>m.name.replace('models/','')); 
      }
      
      if(found.length) {
        const list = [...new Set(found)].sort();
        setAvailableModels(list);
        alert(`连接成功！获取到 ${list.length} 个模型。`);
      } else { 
        alert("连接成功，但未获取到模型列表，请手动输入 ID。"); 
      }
    } catch(e) { alert("连接失败: " + e.message); } 
    finally { setIsLoadingModels(false); }
  };

  // 功能：通用 API 调用器
  const callApi = async (type, payload) => {
    const { baseUrl, key, model } = config[type];
    if (!key) throw new Error(`请先配置 [${type}] 的 API Key`);

    // 1. 文本分析 (LLM)
    if (type === 'analysis') {
        const { system, user, asset } = payload;
        let mimeType = null, base64Data = null;
        if (asset) {
          const d = asset.data || asset; 
          mimeType = d.split(';')[0].split(':')[1]; 
          base64Data = d.split(',')[1]; 
        }
        
        // Google Native Check
        if (baseUrl.includes('google') && !baseUrl.includes('openai') && !baseUrl.includes('v1')) {
            const parts = [{ text: system + "\n" + user }];
            if (base64Data) parts.push({ inlineData: { mimeType, data: base64Data } });
            const r = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${key}`, { 
              method:'POST', 
              headers:{'Content-Type':'application/json'}, 
              body:JSON.stringify({contents:[{parts}]}) 
            });
            if(!r.ok) { const err = await r.json(); throw new Error(err.error?.message || "Analysis API Error"); }
            return (await r.json()).candidates[0].content.parts[0].text;
        }

        // OpenAI Standard
        const content = [{ type: "text", text: user }];
        if (base64Data) content.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } });
        
        const r = await fetch(`${baseUrl}/v1/chat/completions`, { 
          method:'POST', 
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, 
          body:JSON.stringify({model, messages:[{role:"system",content:system},{role:"user",content:content}]}) 
        });
        if(!r.ok) throw new Error("LLM API Error");
        return (await r.json()).choices[0].message.content;
    }

    // 2. 绘图 (Image)
    if (type === 'image') {
        const { prompt, aspectRatio, useImg2Img, refImg, strength } = payload;
        
        // 2025 分辨率策略
        let size = "1024x1024";
        if (aspectRatio === "16:9") size = "1280x720";
        else if (aspectRatio === "9:16") size = "720x1280";
        else if (aspectRatio === "2.35:1") size = "1536x640";
        
        const body = { model, prompt, n: 1, size };
        if (useImg2Img && refImg) { 
          body.image = refImg.split(',')[1]; 
          body.strength = parseFloat(strength); 
        }
        
        const r = await fetch(`${baseUrl}/v1/images/generations`, { 
          method:'POST', 
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, 
          body:JSON.stringify(body) 
        });
        
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || "Image Gen Error");
        return data.data[0].url;
    }
  };

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
// --- 组件库 (UI Components v3.1 - Enhanced UX) ---

// A. 大型模型选择弹窗 (支持滚轮、颜色区分)
const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");

  const categorizedModels = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const allFiltered = models.filter(m => m.toLowerCase().includes(lowerSearch));
    return {
      "All": allFiltered,
      "OpenAI": allFiltered.filter(m => m.includes('gpt') || m.includes('o1') || m.includes('dall-e') || m.includes('tts')),
      "Google": allFiltered.filter(m => m.includes('gemini') || m.includes('imagen') || m.includes('veo') || m.includes('banana')),
      "Image": allFiltered.filter(m => ['dall-e', 'mj', 'midjourney', 'flux', 'sd', 'stable-diffusion', 'imagen', 'drawing', 'nano', 'banana', 'recraft', 'jimeng'].some(k => m.toLowerCase().includes(k))),
      "Video": allFiltered.filter(m => ['sora', 'kling', 'luma', 'runway', 'minimax', 'hailuo', 'veo', 'wan', 'jimeng'].some(k => m.toLowerCase().includes(k))),
    };
  }, [models, search]);

  const tabs = ["All", "OpenAI", "Google", "Image", "Video"];
  
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4 shrink-0">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-white flex items-center gap-2"><LayoutGrid size={20} className="text-blue-500"/> 切换模型: <span className="text-blue-400">{title}</span></h3><button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400"><X size={20}/></button></div>
          <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-500"/><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型 ID..." className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"/></div>
        </div>
        <div className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 shrink-0"><div className="flex gap-2 pb-3">{tabs.map(tab => (<button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-1.5 text-xs font-medium rounded-full border transition-all", activeTab === tab ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400")}>{tab} <span className="ml-1 opacity-50">{categorizedModels[tab].length}</span></button>))}</div></div>
        {/* 修复：flex-1 和 overflow-y-auto 确保鼠标滚轮可用 */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {categorizedModels[activeTab].map(m => (
              <button key={m} onClick={() => { onSelect(m); onClose(); }} className="group flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900 hover:border-blue-500/50 hover:bg-slate-800 text-left transition-all">
                <span className="text-sm text-slate-300 group-hover:text-white truncate font-mono">{m}</span>
                <ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"/>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// B. 模型触发器 (恢复：颜色区分 + 铅笔独立交互)
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, colorTheme = "slate" }) => {
  const [isManual, setIsManual] = useState(false);
  const themes = { 
    slate: { border: "border-slate-700", icon: "text-slate-400", bg: "bg-slate-900" }, 
    blue: { border: "border-blue-900/50", icon: "text-blue-400", bg: "bg-blue-950/20 hover:border-blue-700" }, 
    purple: { border: "border-purple-900/50", icon: "text-purple-400", bg: "bg-purple-950/20 hover:border-purple-700" } 
  };
  const t = themes[colorTheme] || themes.slate;

  return (
    <div className={cn("flex items-center rounded-lg border transition-all h-9 w-40 md:w-56 group", t.bg, t.border)}>
      {/* 图标区 */}
      <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full select-none shrink-0">
        <Icon size={14} className={t.icon} />
        <span className={cn("text-xs font-medium hidden lg:inline", t.icon)}>{label}</span>
      </div>
      {/* 内容区 (点击打开选择器) */}
      <div className="flex-1 px-2 h-full flex items-center min-w-0 cursor-pointer" onClick={!isManual ? onOpenPicker : undefined}>
        {isManual ? (
          <input value={value} onChange={(e) => onManualChange(e.target.value)} placeholder="输入ID..." className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono placeholder:text-slate-600" autoFocus onBlur={() => setIsManual(false)} />
        ) : (
          <div className="w-full flex items-center justify-between text-xs text-slate-300 font-mono hover:text-white">
            <span className="truncate mr-1">{value || "Default"}</span>
            <ChevronDown size={12} className="opacity-50"/>
          </div>
        )}
      </div>
      {/* 铅笔区 (独立点击) */}
      <button onClick={(e) => { e.stopPropagation(); setIsManual(!isManual); }} className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50 shrink-0 hover:bg-white/5 transition-colors">
        <Pencil size={12}/>
      </button>
    </div>
  );
};

// C. 全能配置中心 (恢复：推荐文字 + 铅笔指引)
const ConfigCenter = ({ onClose, fetchModels, availableModels, isLoadingModels }) => {
  const { config, setConfig } = useProject(); 
  const [activeTab, setActiveTab] = useState("analysis");
  const [showModelPicker, setShowModelPicker] = useState(false);

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], [key]: value } }));

  const tabs = [
    { id: "analysis", label: "大脑 (LLM)", icon: Brain, desc: "剧本分析", color: "blue" },
    { id: "image", label: "画师 (Image)", icon: Palette, desc: "绘图生成", color: "purple" },
    { id: "video", label: "摄像 (Video)", icon: Film, desc: "视频生成", color: "orange" },
    { id: "audio", label: "录音 (Audio)", icon: Mic, desc: "语音合成", color: "green" },
  ];
  const currentConfig = config[activeTab];
  const currentTabInfo = tabs.find(t => t.id === activeTab);

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[80vh] rounded-2xl shadow-2xl flex overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
          <div className="p-6 border-b border-slate-800"><h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="text-blue-500"/> 设置中心</h2><p className="text-xs text-slate-500 mt-2">API 供应商与模型管理</p></div>
          <div className="flex-1 py-4 space-y-1 px-2">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all", activeTab === t.id ? "bg-blue-900/30 text-white border border-blue-800/50" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200")}>
                <t.icon size={18}/><div><div className="text-sm font-medium">{t.label}</div><div className="text-[10px] opacity-60">{t.desc}</div></div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col bg-slate-900 overflow-y-auto">
          <div className="p-8 border-b border-slate-800 flex justify-between items-center"><div><h3 className="text-2xl font-bold text-white flex items-center gap-2">{currentTabInfo.label} 配置</h3></div><button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium">完成</button></div>
          <div className="p-8 space-y-8">
            <div className="space-y-4"><h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2"><Server size={14}/> 连接参数</h4><div className="space-y-2"><label className="text-xs font-medium text-slate-400">Base URL</label><input value={currentConfig.baseUrl} onChange={(e) => updateConfig('baseUrl', e.target.value)} placeholder="https://api.openai.com" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 outline-none focus:border-blue-500 font-mono"/><p className="text-[10px] text-slate-500">支持 OpenAI 格式的中转地址 (OneAPI/NewAPI) 或官方地址</p></div><div className="space-y-2"><label className="text-xs font-medium text-slate-400">API Key</label><input type="password" value={currentConfig.key} onChange={(e) => updateConfig('key', e.target.value)} placeholder="sk-..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 outline-none focus:border-blue-500 font-mono"/></div></div>
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex justify-between items-end"><h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2"><LayoutGrid size={14}/> 默认模型</h4><button onClick={() => fetchModels(activeTab)} disabled={isLoadingModels} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 border border-blue-900/50 px-2 py-1 rounded bg-blue-900/10">{isLoadingModels ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} 测试连接并更新列表</button></div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400">Model ID (点击右侧图标选择，或点击铅笔手动输入)</label>
                <ModelTrigger label="当前模型" icon={currentTabInfo.icon} value={currentConfig.model} onOpenPicker={() => { fetchModels(activeTab); setShowModelPicker(true); }} onManualChange={(v) => updateConfig('model', v)} variant="horizontal" colorTheme={currentTabInfo.color} />
                {/* 恢复：推荐模型文字 */}
                <p className="text-[10px] text-slate-500 mt-2">
                  {activeTab === 'analysis' && "推荐: gpt-5.2-pro, gemini-3-pro, claude-3.7-opus"}
                  {activeTab === 'image' && "推荐: nanobanana-2-pro, flux-2-pro, jimeng-4.5"}
                  {activeTab === 'video' && "推荐: kling-v2.6, wan-2.6, luma-ray-2"}
                  {activeTab === 'audio' && "推荐: tts-1-hd, elevenlabs-v3, fish-speech-1.5"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ModelSelectionModal isOpen={showModelPicker} title={`${currentTabInfo.label} 模型列表`} models={availableModels} onClose={() => setShowModelPicker(false)} onSelect={(m) => updateConfig('model', m)}/>
    </div>
  );
};

// D. 图片预览灯箱 (Lightbox)
const ImagePreviewModal = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  useEffect(() => { const h = (e) => { e.preventDefault(); setScale(s => Math.max(0.5, Math.min(5, s - e.deltaY * 0.001))); }; document.addEventListener('wheel', h, { passive: false }); return () => document.removeEventListener('wheel', h); }, []);
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center overflow-hidden" onClick={onClose}>
      <div className="absolute top-4 right-4 flex gap-4 z-50"><div className="bg-slate-800/80 px-3 py-1 rounded-full text-xs text-slate-300">{(scale * 100).toFixed(0)}%</div><button onClick={onClose} className="p-2 bg-slate-800/80 hover:bg-red-600 rounded-full text-white"><X size={20}/></button></div>
      <img src={url} className="max-w-full max-h-full object-contain transition-transform duration-75 cursor-move" style={{ transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)` }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => { if (scale > 1) { setIsDragging(true); startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y }; } }} onMouseMove={(e) => { if (isDragging) { setPosition({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y }); } }} onMouseUp={() => setIsDragging(false)} />
    </div>
  );
};
// E. 灵感老虎机 (Creative Engine)
const InspirationSlotMachine = ({ onClose }) => {
  const { setScript, setDirection } = useProject(); // 直接注入全局状态
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

  const slots = {
    genre: ["赛博朋克", "废土末日", "维多利亚蒸汽", "现代悬疑", "吉卜力治愈", "克苏鲁神话", "太空歌剧", "中式武侠"],
    theme: ["时间循环", "人工智能觉醒", "跨物种友谊", "寻找失落文明", "最后的晚餐", "梦境入侵", "平行宇宙"],
    visual: ["霓虹雨夜", "荒漠夕阳", "迷雾伦敦", "极简几何", "水彩手绘", "生物机械", "胶片颗粒", "黑白高对比"]
  };

  const spin = () => {
    setSpinning(true); setResult(null);
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
    const newScript = `(开场) 这是一个关于${result.theme}的故事，背景设定在${result.genre}的世界...`;
    const newDir = `视觉风格：${result.visual}；\n核心基调：${result.genre}；\n镜头语言：强调氛围感与光影对比。`;
    setScript(newScript); setDirection(newDir);
    onClose();
    alert("✨ 灵感已注入到【自动分镜】工作台！请切换过去查看。");
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
              <div className="text-sm font-bold text-white h-6 flex items-center justify-center">{result ? Object.values(result)[idx] : "---"}</div>
            </div>
          ))}
        </div>
        <button onClick={spin} disabled={spinning} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-lg rounded-xl shadow-lg shadow-yellow-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 mb-4">
          <Dices size={24}/> {spinning ? "抽取中..." : "摇一摇"}
        </button>
        {result && !spinning && <button onClick={apply} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors animate-in fade-in slide-in-from-bottom-2">使用此灵感 (填入分镜台)</button>}
      </div>
    </div>
  );
};

// F. 动态分镜播放器 (Animatic Player - Fixed Logic & Smooth)
const AnimaticPlayer = ({ isOpen, onClose, shots, images }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const playlist = useMemo(() => {
    return shots.map(s => {
      const history = images[s.id] || [];
      const lastItem = history.length > 0 ? history[history.length - 1] : null;
      // 兼容逻辑：处理纯字符串 URL 或 对象结构
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
        if (currentIndex < playlist.length - 1) { setCurrentIndex(prev => prev + 1); setProgress(0); currentStep = 0; } 
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
          <div className="flex items-center gap-2 text-white/80 font-bold"><Film size={18}/> 动态预览 (Animatic)</div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur"><X size={20}/></button>
        </div>
      </div>
      <div className="w-full max-w-5xl h-1 bg-slate-800 mt-0 relative"><div className="h-full bg-blue-500 transition-all duration-75 ease-linear" style={{ width: `${((currentIndex + (progress/100)) / playlist.length) * 100}%` }} /></div>
      <div className="h-20 w-full flex items-center justify-center gap-6 bg-slate-900 border-t border-slate-800">
         <button onClick={() => { setCurrentIndex(0); setIsPlaying(true); }} className="p-3 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors"><Undo2 size={20}/></button>
         <button onClick={() => setIsPlaying(!isPlaying)} className="p-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg scale-110 transition-transform">
           {isPlaying ? <div className="w-4 h-4 bg-white rounded-sm" /> : <div className="w-0 h-0 border-t-8 border-t-transparent border-l-[16px] border-l-white border-b-8 border-b-transparent ml-1" />}
         </button>
         <div className="text-xs text-slate-500 font-mono">{currentIndex + 1} / {playlist.length}</div>
      </div>
      <style>{`@keyframes kenburns { 0% { transform: scale(1); } 100% { transform: scale(1.05); } }`}</style>
    </div>
  );
};
// ==========================================
// 模块 2：角色工坊 (CharacterLab - Fully Loaded)
// ==========================================
const CharacterLab = ({ onPreview }) => {
  // 接入中央厨房
  const { clPrompts, setClPrompts, clImages, setClImages, callApi } = useProject();
  
  // 本地状态
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [referenceImage, setReferenceImage] = useState(() => { try { return localStorage.getItem('cl_ref') || null; } catch(e) { return null; } });
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('cl_ar') || "16:9");
  const [imgStrength, setImgStrength] = useState(0.8);
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [localPrompts, setLocalPrompts] = useState(clPrompts);

  useEffect(() => { setLocalPrompts(clPrompts); }, [clPrompts]);
  
  // 持久化辅助
  const safeSave = (key, val) => { try { localStorage.setItem(key, val); } catch (e) {} };
  useEffect(() => { safeSave('cl_desc', description); }, [description]);
  useEffect(() => { if(referenceImage) safeSave('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { safeSave('cl_lang', targetLang); }, [targetLang]);
  useEffect(() => { safeSave('cl_ar', aspectRatio); }, [aspectRatio]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) { 
      const reader = new FileReader(); 
      reader.onloadend = () => { setReferenceImage(reader.result); safeSave('cl_ref', reader.result); }; 
      reader.readAsDataURL(file); 
    }
  };

  const clearProject = () => {
    if(confirm("确定清空角色设定吗？")) { 
      setDescription(""); setReferenceImage(null); setClPrompts([]); 
      localStorage.removeItem('cl_desc'); localStorage.removeItem('cl_ref'); 
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true); setClPrompts([]); setClImages({});
    
    // 逻辑修复：中英文指令切换
    const langInstruction = targetLang === "Chinese" 
      ? "2. 提示词内容(prompt)请**严格使用中文**，以便于中文绘图模型理解。但需包含 '景深, 电影质感' 等词汇。" 
      : "2. 提示词内容(prompt)保持英文以便于绘图模型理解，但需包含 'Bokeh, depth of field'。";

    // 逻辑修复：强制 9 大视角
    const angleRequirements = "正面视图, 侧面视图, 背影, 面部特写, 俯视, 仰视, 动态姿势, 电影广角, 自然抓拍";

    const system = `你是一个专家级角色概念设计师。请生成 9 组标准电影镜头视角提示词。
    要求：
    1. 必须包含这9种视角，并**强制使用中文作为标题(title)**：${angleRequirements}。
    ${langInstruction}
    3. 严格返回 JSON 数组。
    格式示例：[{"title": "正面视图", "prompt": "Full body shot..."}]`;

    try {
      const res = await callApi('analysis', { system, user: `描述内容: ${description}`, asset: referenceImage });
      
      // 增强型 JSON 提取
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
      alert("生成失败: " + e.message); 
    } finally { 
      setIsGenerating(false); 
    }
  };

  const handleImageGen = async (idx, prompt, ar, useImg, ref, str) => {
    setClImages(prev => ({ ...prev, [idx]: [...(prev[idx] || []), { loading: true }] }));
    try {
      const url = await callApi('image', { prompt, aspectRatio: ar, useImg2Img: useImg, refImg: ref, strength: str });
      setClImages(prev => { 
        const history = [...(prev[idx] || [])].filter(img => !img.loading); 
        return { ...prev, [idx]: [...history, { url, loading: false }] }; 
      });
    } catch(e) { 
      setClImages(prev => { 
        const history = [...(prev[idx] || [])].filter(img => !img.loading); 
        return { ...prev, [idx]: [...history, { error: e.message, loading: false }] }; 
      }); 
    }
  };

  const downloadAll = async () => {
    const zip = new JSZip(); const folder = zip.folder("character_design");
    folder.file("prompts.txt", localPrompts.map(p => `[${p.title}]\n${p.prompt}`).join("\n\n"));
    Object.entries(clImages).forEach(([index, history]) => {
      const current = history[history.length - 1]; 
      if (current && current.url && !current.error) { try { folder.file(`view_${index}.png`, fetch(current.url).then(r => r.blob())); } catch (e) {} }
    });
    saveAs(await zip.generateAsync({ type: "blob" }), "character_design.zip");
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
          
          {/* 修复：导航按钮提至最外层，确保报错时也能翻页 */}
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
            {localPrompts.map((item, idx) => (
              <CharCard 
                key={idx} 
                item={item} 
                index={idx} 
                currentAr={aspectRatio}
                currentRef={referenceImage}
                currentUseImg={useImg2Img}
                currentStrength={imgStrength}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 3：自动分镜工作台 (StoryboardStudio - Logic Part)
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
    if (file.size > 10 * 1024 * 1024) return alert("文件过大 (>10MB)");
    const reader = new FileReader();
    reader.onloadend = () => setMediaAsset({ type, data: reader.result, name: file.name });
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const clearAsset = (e) => { if(e) e.stopPropagation(); setMediaAsset(null); };

  const handleAnalyzeScript = async () => {
    if (!script && !direction && !mediaAsset) return alert("请填写内容或上传素材");
    setIsAnalyzing(true);
    
    const system = `Role: Expert Film Director. Task: Create a Shot List for Video Generation.
    Requirements: 
    1. Break down script into key shots.
    2. **Camera Lingo**: You MUST use professional camera terms like 'Truck Left', 'Dolly Zoom', 'Pan Right', 'Tilt Up', 'Extreme Close-up'.
    3. **Consistency**: Use the character reference if provided.
    Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "image_prompt":"..."}]. 
    Language: ${sbTargetLang}.`;

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
        system: "Role: Co-Director. Task: Modify storyboard based on feedback. IMPORTANT: You MUST update 'visual', 'audio', 'sora_prompt' AND 'image_prompt' TOGETHER. Return JSON array ONLY for modified shots.", 
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
  const ShotCard = ({ shot, currentAr, currentUseImg, currentAsset, currentStrength }) => {
    const history = shotImages[shot.id] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [loading, setLoading] = useState(false);
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    const currentUrl = history[verIndex];
    
    const gen = async () => { 
      setLoading(true); 
      try { 
        const url = await callApi('image', { prompt: shot.image_prompt, aspectRatio: currentAr, useImg2Img: currentUseImg, refImg: currentAsset?.type === 'image' ? currentAsset.data : null, strength: currentStrength }); 
        addImageToShot(shot.id, url); 
      } catch(e) { alert(e.message); } finally { setLoading(false); } 
    };
    
    const handlePreview = () => { if(currentUrl) onPreview(currentUrl); };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group hover:border-purple-500/50 transition-all">
        <div className={cn("bg-black relative shrink-0 md:w-72", currentAr === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video")}>
          {loading ? <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div> 
          : currentUrl ? <div className="relative w-full h-full group/img cursor-zoom-in" onClick={handlePreview}>
              <img src={currentUrl} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"><button onClick={(e)=>{e.stopPropagation();saveAs(currentUrl, `shot_${shot.id}.png`)}} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><Download size={12}/></button><button onClick={(e)=>{e.stopPropagation();gen()}} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><RefreshCw size={12}/></button></div>
            </div> 
          : <div className="absolute inset-0 flex items-center justify-center"><button onClick={gen} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"><Camera size={14}/> 生成画面</button></div>}
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur">Shot {shot.id}</div><div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1"><Clock size={10}/> {shot.duration}</div>
          
          {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity z-20"><button disabled={verIndex<=0} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v-1)}} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v+1)}} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
        </div>
        <div className="p-4 flex-1 space-y-3 min-w-0 flex flex-col justify-center"><div className="flex items-start justify-between gap-4"><div className="text-sm text-slate-200 font-medium leading-relaxed">{shot.visual}</div><div className="flex gap-1 shrink-0"><button onClick={() => navigator.clipboard.writeText(shot.sora_prompt)} className="p-1.5 text-slate-500 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors"><Copy size={14}/></button></div></div><div className="flex gap-2 text-xs"><div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400"><Mic size={12} className="text-purple-400"/> {shot.audio || "No Audio"}</div></div><div className="bg-purple-900/10 border border-purple-900/30 p-2.5 rounded text-[10px] font-mono text-purple-200/70 break-all select-all hover:border-purple-500/50 transition-colors"><span className="text-purple-500 font-bold select-none">Sora: </span>{shot.sora_prompt}</div></div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* 挂载播放器 */}
      <AnimaticPlayer isOpen={showAnimatic} onClose={() => setShowAnimatic(false)} shots={shots} images={shotImages} />

      <div className="w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
        <div className="p-4 border-b border-slate-800 sticky top-0 bg-slate-900/80 backdrop-blur flex justify-between items-center"><h2 className="text-sm font-bold text-slate-200 flex items-center gap-2"><Clapperboard size={16} className="text-purple-500"/> 导演控制台</h2><button onClick={clearAll} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><FileText size={12}/> 剧本 / 台词</label><textarea value={script} onChange={e => setScript(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600" placeholder="例如：(旁白) 2077年，霓虹灯下的雨夜。主角从阴影中走出，点了一支烟..."/></div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Video size={12}/> 导演意图</label><textarea value={direction} onChange={e => setDirection(e.target.value)} className="w-full h-20 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600" placeholder="例如：赛博朋克风格，压抑的氛围，多用低角度广角镜头，色调以蓝紫为主..."/></div>
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 分镜生成设置</div>
             <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={sbAspectRatio} onChange={(e) => setSbAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="2.35:1">2.35:1</option></select></div><div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={sbTargetLang} onChange={(e) => setSbTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="English">English</option><option value="Chinese">中文</option></select></div></div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2"><div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考图权重</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>{useImg2Img && mediaAsset?.type === 'image' && (<div className="space-y-1 animate-in fade-in"><div className="flex justify-between text-[10px] text-slate-500"><span>Weight: {imgStrength}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/><div className="text-[9px] text-slate-500 leading-tight mt-1">1.0: 强一致 (像原图)<br/>0.1: 弱一致 (自由发挥)</div></div>)}</div>
          </div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Upload size={12}/> 多模态素材</label><div className="grid grid-cols-3 gap-2 h-20">
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='image'?"border-purple-500 bg-purple-900/20":"border-slate-600 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="image/*" onChange={(e)=>handleAssetUpload(e,'image')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 {mediaAsset?.type==='image' ? <><img src={mediaAsset.data} className="w-full h-full object-cover opacity-80"/><button onClick={(e)=>clearAsset(e)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500 z-10"><X size={10}/></button></> : <><ImageIcon size={16} className="mb-1"/><span className="text-[10px]">图片</span></>}
              </div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='audio'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="audio/*" onChange={(e)=>handleAssetUpload(e,'audio')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 {mediaAsset?.type==='audio' ? <><Mic size={16} className="text-purple-400 mb-1"/><span className="text-[10px] truncate w-16 text-center">{mediaAsset.name}</span><button onClick={(e)=>clearAsset(e)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500 z-10"><X size={10}/></button></> : <><Mic size={16} className="text-slate-500 mb-1"/><span className="text-[10px]">音频</span></>}
              </div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='video'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="video/*" onChange={(e)=>handleAssetUpload(e,'video')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 {mediaAsset?.type==='video' ? <><Film size={16} className="text-purple-400 mb-1"/><span className="text-[10px] truncate w-16 text-center">{mediaAsset.name}</span><button onClick={(e)=>clearAsset(e)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500 z-10"><X size={10}/></button></> : <><Film size={16} className="text-slate-500 mb-1"/><span className="text-[10px]">视频</span></>}
              </div>
          </div></div>
          <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} {isAnalyzing ? '分析中...' : '生成分镜表'}</button>
        </div>
        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4"><span className="flex items-center gap-2 font-medium text-slate-400"><MessageSquare size={12}/> AI 导演助手</span></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.map((m, i) => <div key={i} className={cn("flex", m.role==='user'?"justify-end":"justify-start")}><div className={cn("max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed shadow-sm", m.role==='user'?"bg-purple-600 text-white":"bg-slate-800 text-slate-300 border border-slate-700")}>{m.content}</div></div>)}
            <ChangePreview />
            <div ref={chatEndRef}/>
          </div>
          <div className="p-3 border-t border-slate-800 flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 transition-colors" placeholder="输入修改建议..."/><button onClick={handleSendMessage} className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors shadow-lg shadow-purple-900/20"><Send size={14}/></button></div>
        </div>
      </div>
      <div className="flex-1 bg-slate-950 p-6 overflow-y-auto">
        {shots.length > 0 ? (
          <div className="max-w-4xl mx-auto pb-20 space-y-4">
            <div className="flex items-center justify-between mb-4 px-1 sticky top-0 z-20 bg-slate-950/80 backdrop-blur py-2">
               <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2>
               <button onClick={()=>setShowAnimatic(true)} className="ml-4 flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg shadow-indigo-500/30 transition-all animate-in fade-in zoom-in"><Film size={12}/> 播放动态预览</button>
               <div className="flex gap-1 ml-4 border-l border-slate-700 pl-4"><button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800" title="撤销"><Undo2 size={14}/></button><button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800" title="重做"><Redo2 size={14}/></button></div></div>
               <div className="flex gap-2"><button onClick={() => handleDownload('csv')} className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1 transition-colors"><FileSpreadsheet size={12}/> 导出 CSV</button><button onClick={() => handleDownload('all')} className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors"><Download size={12}/> 打包全部</button></div>
            </div>
            {shots.map(s => (
                <ShotCard 
                    key={s.id} 
                    shot={s} 
                    currentAr={sbAspectRatio}
                    currentUseImg={useImg2Img}
                    currentAsset={mediaAsset}
                    currentStrength={imgStrength}
                />
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4"><div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800"><Clapperboard size={32} className="opacity-20 text-purple-500"/></div><div className="text-center"><p className="text-sm font-medium text-slate-500">分镜白板为空</p><p className="text-xs text-slate-600 mt-1">请上传素材并生成</p></div></div>
        )}
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

