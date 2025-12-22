import React, { useState, useMemo, useRef, useEffect, useContext, createContext } from 'react';
import { 
  Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, 
  Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, 
  Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, 
  CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2, 
  Sparkles, Dices, Layers, PlusCircle, Play, UserCircle2, GripHorizontal, Users, Link, Unlink 
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- 样式合并工具 ---
function cn(...inputs) { return twMerge(clsx(inputs)); }

// ==========================================
// 模块 1：全局项目上下文 (Project Context - V2025.12.22)
// 核心职责：数据持久化、API 通信、Sora 2 提示词引擎、角色资产管理
// ==========================================
const ProjectContext = createContext();

export const useProject = () => {
  return useContext(ProjectContext);
};

const ProjectProvider = ({ children }) => {
  
  // 1. 安全解析与存储工具
  const safeJsonParse = (key, fallback) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      console.warn(`Data corrupted for ${key}, using fallback.`);
      return fallback;
    }
  };

  const safeSetItem = (key, value) => {
    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, str);
    } catch (e) {
      console.warn(`Storage Limit Exceeded for ${key}.`);
    }
  };

  // 2. 核心状态管理
  // A. 全局配置
  const [config, setConfig] = useState(() => safeJsonParse('app_config_v4', {
    analysis: { baseUrl: '', key: '', model: 'gemini-2.0-flash-exp' },
    image: { baseUrl: '', key: '', model: 'nanobanana-2-pro' },
    video: { baseUrl: '', key: '', model: 'kling-v1.6' }, // 或 sora-v2
    audio: { baseUrl: '', key: '', model: 'tts-1-hd' }
  }));

  // B. 角色工坊资产 (Character Lab)
  const [clPrompts, setClPrompts] = useState(() => safeJsonParse('cl_prompts_v2', []));
  const [clImages, setClImages] = useState({}); // 运行时缓存，不存 LocalStorage 避免爆满，实际应依赖 actors
  const [actors, setActors] = useState(() => safeJsonParse('studio_actors_v3', [])); // V3结构：包含结构化 visuals

  // C. 自动分镜资产 (Storyboard Studio)
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  const [shots, setShots] = useState(() => safeJsonParse('sb_shots_v2', []));
  const [shotImages, setShotImages] = useState({}); // 运行时图片缓存
  const [scenes, setScenes] = useState(() => safeJsonParse('sb_scenes_v2', [])); // 大分镜 (Big Board)

  // D. 制片台资产 (Studio Board)
  const [timeline, setTimeline] = useState(() => safeJsonParse('studio_timeline_v2', []));

  // E. 状态持久化监听
  useEffect(() => { safeSetItem('app_config_v4', config); }, [config]);
  useEffect(() => { safeSetItem('sb_script', script); }, [script]);
  useEffect(() => { safeSetItem('sb_direction', direction); }, [direction]);
  useEffect(() => { safeSetItem('cl_prompts_v2', clPrompts); }, [clPrompts]);
  useEffect(() => { safeSetItem('sb_shots_v2', shots); }, [shots]);
  useEffect(() => { safeSetItem('sb_scenes_v2', scenes); }, [scenes]);
  useEffect(() => { safeSetItem('studio_actors_v3', actors); }, [actors]);
  useEffect(() => { safeSetItem('studio_timeline_v2', timeline); }, [timeline]);

  // 3. 辅助工具：Base64/Blob 处理 (2025版 工业级优化)
  const base64ToBlobUrl = (base64, type = 'image/png') => {
    if (!base64 || typeof base64 !== 'string') return null;
    if (base64.startsWith('http') || base64.startsWith('blob:')) return base64;
    try {
      const clean = base64.includes(',') ? base64.split(',')[1] : base64;
      const byteChars = atob(clean);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type });
      return URL.createObjectURL(blob);
    } catch (e) { return base64; }
  };

  const blobUrlToBase64 = async (blobUrl) => {
    if (!blobUrl || typeof blobUrl !== 'string') return null;
    if (blobUrl.startsWith('data:')) return blobUrl;
    try {
      const r = await fetch(blobUrl);
      const b = await r.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(b);
      });
    } catch (e) { return null; }
  };

  const compressImage = (base64Str, maxWidth = 1024) => {
    return new Promise((resolve) => {
      if (!base64Str || !base64Str.startsWith('data:image')) { resolve(base64Str); return; }
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } } 
        else { if (h > maxWidth) { w *= maxWidth / h; h = maxWidth; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  // 4. API 通信层 (LLM / Image / Video / Audio)
  const [availableModels, setAvailableModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!baseUrl || !key) return alert(`请先在设置中配置 [${type}] API`);
    setIsLoadingModels(true);
    try {
      // 兼容 OpenAI 标准格式与 Google 格式
      let found = [];
      try {
          const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } });
          const d = await r.json();
          if (d.data) found = d.data.map(m => m.id);
      } catch (e) {}
      
      if (!found.length && baseUrl.includes('google')) {
          const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`);
          const d = await r.json();
          if (d.models) found = d.models.map(m => m.name.replace('models/', ''));
      }
      setAvailableModels(found.length ? [...new Set(found)].sort() : []);
      if(found.length) alert(`获取到 ${found.length} 个模型`);
    } catch (e) { alert("获取模型列表失败: " + e.message); } 
    finally { setIsLoadingModels(false); }
  };

  // 通用 API 调用函数
  const callApi = async (type, payload) => {
    const { baseUrl, key, model: configModel } = config[type];
    const activeModel = payload.model || configModel;
    if (!baseUrl || !key) throw new Error(`请先配置 [${type}] 的 API Key`);

    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
    const fetchWithTimeout = async (url, opts) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 120000); // 2分钟超时
        try { const r = await fetch(url, { ...opts, signal: controller.signal }); clearTimeout(id); return r; }
        catch (e) { clearTimeout(id); throw e; }
    };

    // --- 分析 (LLM) ---
    if (type === 'analysis') {
        const { system, user, assets } = payload;
        // 构造多模态内容
        let content = typeof user === 'string' ? [{ type: "text", text: user }] : user;
        if (assets && Array.isArray(assets)) {
             assets.forEach(a => { if(a) content.push({ type: "image_url", image_url: { url: a } }); });
        }

        // Google Native
        if (baseUrl.includes('google') && !baseUrl.includes('openai')) {
            const parts = [{ text: system + "\n" + (typeof user === 'string' ? user : JSON.stringify(user)) }];
            if (assets) assets.forEach(a => {
                if(a.includes('base64,')) parts.push({ inlineData: { mimeType: 'image/jpeg', data: a.split('base64,')[1] } });
            });
            const r = await fetchWithTimeout(`${baseUrl}/v1beta/models/${activeModel}:generateContent?key=${key}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts }] })
            });
            const d = await r.json();
            if(!r.ok) throw new Error(d.error?.message || "Gemini API Error");
            return d.candidates[0].content.parts[0].text;
        }
        
        // OpenAI Compatible
        const r = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, {
            method: 'POST', headers,
            body: JSON.stringify({
                model: activeModel,
                messages: [{ role: "system", content: system }, { role: "user", content: content }]
            })
        });
        const d = await r.json();
        if(!r.ok) throw new Error(d.error?.message || "LLM API Error");
        return d.choices[0].message.content;
    }

    // --- 绘图 (Image) ---
    if (type === 'image') {
        let { prompt, aspectRatio, useImg2Img, refImages, strength } = payload;
        let size = aspectRatio === "16:9" ? "1280x720" : aspectRatio === "9:16" ? "720x1280" : "1024x1024";
        
        // 压缩参考图
        let processedImages = [];
        if (useImg2Img && refImages?.length) {
             processedImages = await Promise.all(refImages.map(img => compressImage(img)));
        }

        const body = { model: activeModel, prompt, n: 1, size };
        if (processedImages.length > 0) {
            body.image = processedImages[0].split('base64,')[1]; // 单图兼容
            body.images = processedImages.map(i => i.split('base64,')[1]); // 多图扩展
            body.strength = strength || 0.65;
        }

        const r = await fetchWithTimeout(`${baseUrl}/v1/images/generations`, {
            method: 'POST', headers, body: JSON.stringify(body)
        });
        const d = await r.json();
        if(!r.ok) throw new Error(d.error?.message || "Image API Error");
        const url = d.data[0].url;
        return url.startsWith('http') ? url : base64ToBlobUrl(d.data[0].b64_json || url);
    }

    // --- 视频 (Video - Sora 2 / Kling) ---
    if (type === 'video') {
        const { prompt, startImg, duration, aspectRatio } = payload;
        // Kling/Sora 通常需要首帧 (startImg) 
        let optimizedStartImg = startImg;
        if (startImg && startImg.length > 500000) optimizedStartImg = await compressImage(startImg, 1024);
        
        const body = { 
            model: activeModel, 
            prompt, 
            image: optimizedStartImg, // 首帧
            duration: duration || 5, 
            aspectRatio: aspectRatio || "16:9" 
        };

        const submitRes = await fetchWithTimeout(`${baseUrl}/v1/videos/generations`, {
            method: 'POST', headers, body: JSON.stringify(body)
        });
        const submitData = await submitRes.json();
        if(!submitRes.ok) throw new Error(submitData.error?.message || "Video Submit Error");
        
        const taskId = submitData.id || submitData.data?.id;
        // 轮询逻辑
        for (let i = 0; i < 60; i++) { // 最多等待 5 分钟
            await new Promise(r => setTimeout(r, 5000));
            const checkRes = await fetch(`${baseUrl}/v1/videos/generations/${taskId}`, { headers });
            const checkData = await checkRes.json();
            const status = checkData.status || checkData.data?.status;
            if (status === 'SUCCEEDED' || status === 'completed') return checkData.data?.[0]?.url || checkData.url;
            if (status === 'FAILED') throw new Error("Video Generation Failed");
        }
        throw new Error("Video Timeout");
    }

    // --- 音频 (Audio) ---
    if (type === 'audio' || type === 'sfx') {
        const endpoint = type === 'sfx' ? '/v1/audio/sound-effects' : '/v1/audio/speech';
        // 简易处理，ElevenLabs 兼容
        const body = type === 'sfx' 
            ? { text: payload.text, duration_seconds: 5 }
            : { model: activeModel, input: payload.input, voice: payload.voice || 'alloy', speed: payload.speed || 1.0 };
        
        const r = await fetchWithTimeout(`${baseUrl}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if(!r.ok) throw new Error("Audio API Error");
        return await blobUrlToBase64(URL.createObjectURL(await r.blob()));
    }
  };

  // 5. 核心逻辑：Sora 2 提示词构建器 (The Engine)
  // 严格遵循：[主体] + [环境] + [镜头] + [风格] + [时间戳]
  const assembleSoraPrompt = (targetShots, globalStyle, assignedActorId) => {
    // A. 全局风格头
    const styleHeader = `\n# Global Context\nStyle: ${globalStyle || "Cinematic, photorealistic, 8k, high fidelity"}.`;
    
    // B. 演员注入 (Actor Injection)
    let mainActor = null;
    let actorContext = "";
    if (assignedActorId) {
        mainActor = actors.find(a => a.id.toString() === assignedActorId.toString());
        if (mainActor) {
            // 解析结构化数据，如果老数据没有visuals，降级使用desc
            const visuals = mainActor.visuals || {}; 
            const head = visuals.visual_head || "Detailed face";
            const upper = visuals.visual_upper || "Detailed outfit";
            // 组装 Prompt
            actorContext = `\nCharacter Reference (${mainActor.name}): [${head}], [${upper}]. (Maintain consistency).`;
        }
    }

    // C. 时间轴脚本 (Timeline Script)
    let currentTime = 0;
    const scriptBody = targetShots.map((s, idx) => {
        // 计算时长
        let dur = 5;
        if (s.duration) {
            const match = s.duration.toString().match(/(\d+)/);
            if (match) dur = parseInt(match[0]);
        }
        if (dur < 3) dur = 3; // 最小限制
        
        const start = currentTime;
        const end = currentTime + dur;
        currentTime = end;

        // 动作描述
        let action = s.visual || s.sora_prompt;
        // 如果有演员，替换人名或通用指代
        if (mainActor && !action.toLowerCase().includes(mainActor.name.toLowerCase())) {
            action = `(Character: ${mainActor.name}) ${action}`;
        }

        // 镜头语言
        const camera = s.camera_movement ? ` Camera: ${s.camera_movement}.` : "";
        
        // 音效/对话标记 (Sora 2 剧本格式)
        const audio = s.audio ? (s.audio.includes('"') ? ` [Dialogue: "${s.audio}"]` : ` [SFX: ${s.audio}]`) : "";
        
        return `[${start}s-${end}s] Shot ${idx + 1}: ${action}.${camera}${audio}`;
    }).join("\nCUT TO:\n");

    // D. 物理与技术参数
    // 计算总时长 (向上取整到 5 的倍数，适配 Kling/Sora)
    const finalDuration = Math.ceil(currentTime / 5) * 5;
    const specs = `\n\n# Technical Specs\n--duration ${finalDuration}s --quality high --ar 16:9`;

    return {
        prompt: `${styleHeader}${actorContext}\n\n# Timeline Script\n${scriptBody}${specs}`,
        duration: finalDuration,
        // 返回首帧参考图 (用于视频生成的一致性)
        startImg: targetShots[0]?.imgUrl || null 
    };
  };

  const value = {
    config, setConfig,
    script, setScript, direction, setDirection,
    clPrompts, setClPrompts, clImages, setClImages,
    shots, setShots, shotImages, setShotImages, scenes, setScenes,
    timeline, setTimeline, actors, setActors,
    callApi, fetchModels, availableModels, isLoadingModels,
    assembleSoraPrompt,
    base64ToBlobUrl, blobUrlToBase64
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
// ==========================================
// 模块 2：通用 UI 组件库 (Common Components)
// ==========================================

// A. 模型选择器组件 (支持分类与搜索)
const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const scrollRef = useRef(null);
  
  // 支持横向滚轮
  const handleWheel = (e) => { 
    if (scrollRef.current) { e.preventDefault(); scrollRef.current.scrollLeft += e.deltaY; } 
  };
  
  // 智能分类
  const categorizedModels = useMemo(() => {
    const lower = search.toLowerCase();
    const all = models.filter(m => m.toLowerCase().includes(lower));
    return { 
      "All": all, 
      "OpenAI": all.filter(m => m.includes('gpt') || m.includes('o1') || m.includes('dall') || m.includes('tts')), 
      "Google": all.filter(m => m.includes('gemini') || m.includes('banana') || m.includes('imagen')), 
      "Image": all.filter(m => ['flux', 'midjourney', 'banana', 'sd', 'recraft'].some(k => m.includes(k))), 
      "Video": all.filter(m => ['kling', 'luma', 'runway', 'sora', 'hailuo'].some(k => m.includes(k))) 
    };
  }, [models, search]);
  
  const tabs = ["All", "OpenAI", "Google", "Image", "Video"];
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* 头部搜索 */}
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="text-white font-bold flex gap-2 items-center">
              <LayoutGrid size={20} className="text-blue-500"/> 
              选择模型: <span className="text-blue-400">{title}</span>
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-full transition-colors"><X size={20}/></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={16}/>
            <input 
              autoFocus 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="搜索模型 ID (例如: gpt-4, kling)..." 
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>

        {/* 分类 Tabs */}
        <div ref={scrollRef} onWheel={handleWheel} className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 shrink-0 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 pb-3 min-w-max">
            {tabs.map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)} 
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap", 
                  activeTab === tab 
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20" 
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* 模型列表 */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-900">
          {categorizedModels[activeTab]?.length > 0 ? (
            categorizedModels[activeTab].map(m => (
              <button 
                key={m} 
                onClick={() => { onSelect(m); onClose(); }} 
                className="group flex justify-between items-center p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-blue-900/10 hover:border-blue-500 text-left transition-all"
              >
                <span className="text-sm text-slate-300 group-hover:text-blue-200 truncate font-mono">{m}</span>
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-blue-400 -translate-x-2 group-hover:translate-x-0 transition-all"/>
              </button>
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center text-slate-500 py-10">
              <Search size={32} className="opacity-20 mb-2"/>
              <p>未找到匹配的模型</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// B. 模型触发器 (输入框+选择器组合)
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, colorTheme = "slate", className, variant = "default" }) => {
  const [isManual, setIsManual] = useState(false);
  const themes = { 
    slate: { border: "border-slate-700", icon: "text-slate-400", bg: "bg-slate-900", hover: "hover:border-slate-500" }, 
    blue: { border: "border-blue-900/50", icon: "text-blue-400", bg: "bg-blue-950/20", hover: "hover:border-blue-500" }, 
    purple: { border: "border-purple-900/50", icon: "text-purple-400", bg: "bg-purple-950/20", hover: "hover:border-purple-500" } 
  };
  const t = themes[colorTheme] || themes.slate;

  return (
    <div className={cn("flex items-center rounded-lg border transition-all h-9 group overflow-hidden", t.bg, t.border, t.hover, className)}>
      <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full shrink-0 select-none bg-black/10">
        <Icon size={14} className={t.icon}/>
        <span className={cn("text-xs font-medium hidden lg:inline", t.icon)}>{label}</span>
      </div>
      <div className="flex-1 px-2 h-full flex items-center min-w-0 cursor-pointer relative" onClick={!isManual ? onOpenPicker : undefined}>
        {isManual ? (
          <input 
            value={value} 
            onChange={e => onManualChange(e.target.value)} 
            className="w-full bg-transparent text-xs text-white outline-none font-mono placeholder:text-slate-600" 
            placeholder="输入模型ID..."
            autoFocus 
            onBlur={() => setIsManual(false)}
          />
        ) : (
          <div className="w-full flex justify-between items-center text-xs text-slate-300 font-mono group-hover:text-white transition-colors">
            <span className="truncate mr-1">{value || "Default Model"}</span>
            <ChevronDown size={12} className="opacity-50 group-hover:opacity-100"/>
          </div>
        )}
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); setIsManual(!isManual); }} 
        className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50 shrink-0 hover:bg-white/10 transition-colors"
        title="手动编辑"
      >
        <Pencil size={12}/>
      </button>
    </div>
  );
};

// C. 配置中心 (Config Center)
const ConfigCenter = ({ onClose, fetchModels, availableModels, isLoadingModels }) => {
  const { config, setConfig } = useProject();
  const [activeTab, setActiveTab] = useState("analysis");
  const [showModelPicker, setShowModelPicker] = useState(false);
  
  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], [key]: value } }));
  };

  const tabs = [
    { id: "analysis", label: "大脑 (LLM)", desc: "剧本拆解与提示词润色", icon: Brain, color: "text-blue-400" },
    { id: "image", label: "画师 (Image)", desc: "角色设计与分镜绘图", icon: Palette, color: "text-purple-400" },
    { id: "video", label: "摄像 (Video)", desc: "Sora 2 / Kling 视频生成", icon: Film, color: "text-orange-400" },
    { id: "audio", label: "录音 (Audio)", desc: "TTS配音与AI音效", icon: Mic, color: "text-green-400" }
  ];
  
  const cur = config[activeTab];

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4 md:p-8 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[80vh] rounded-2xl flex overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* 左侧导航 */}
        <div className="w-72 bg-slate-950 border-r border-slate-800 p-4 flex flex-col">
          <div className="mb-6 px-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="text-blue-500"/> 设置中心
            </h2>
            <p className="text-xs text-slate-500 mt-1">配置 API 连接与模型参数</p>
          </div>
          <div className="space-y-1">
            {tabs.map(t => (
              <button 
                key={t.id} 
                onClick={() => setActiveTab(t.id)} 
                className={cn(
                  "w-full flex gap-3 px-4 py-3 rounded-xl transition-all text-left items-center group", 
                  activeTab === t.id 
                    ? "bg-slate-800 text-white border border-slate-700 shadow-md" 
                    : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
                )}
              >
                <div className={cn("p-2 rounded-lg bg-slate-900 border border-slate-800 group-hover:border-slate-700 transition-colors", activeTab === t.id ? "bg-black/30" : "")}>
                  <t.icon size={18} className={activeTab === t.id ? t.color : "text-slate-500"}/>
                </div>
                <div>
                  <div className="text-sm font-bold">{t.label}</div>
                  <div className="text-[10px] text-slate-500 opacity-80">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 p-8 overflow-y-auto bg-slate-900 flex flex-col">
          <div className="flex justify-between items-center border-b border-slate-800 pb-6 mb-6">
             <div>
               <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                 {tabs.find(t => t.id === activeTab).label} 配置
               </h3>
               <p className="text-sm text-slate-500 mt-1">配置 Base URL 与 Key 以启用 {activeTab} 能力</p>
             </div>
             <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg transition-transform active:scale-95">
               完成设定
             </button>
          </div>
          
          <div className="space-y-6 max-w-3xl">
             <div className="space-y-4">
               <h4 className="text-sm font-bold text-slate-300 uppercase flex gap-2 items-center tracking-wider">
                 <Server size={14}/> 连接参数
               </h4>
               <div className="space-y-2">
                 <label className="text-xs text-slate-400 font-medium">Base URL (API Endpoint)</label>
                 <input 
                    value={cur.baseUrl} 
                    onChange={e => updateConfig('baseUrl', e.target.value)} 
                    placeholder="https://api.example.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                 />
               </div>
               <div className="space-y-2">
                 <label className="text-xs text-slate-400 font-medium">API Key (令牌)</label>
                 <input 
                    type="password" 
                    value={cur.key} 
                    onChange={e => updateConfig('key', e.target.value)} 
                    placeholder="sk-..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                 />
               </div>
             </div>

             <div className="space-y-4 pt-6 border-t border-slate-800">
               <div className="flex justify-between items-end">
                 <h4 className="text-sm font-bold text-slate-300 uppercase flex gap-2 items-center tracking-wider">
                   <LayoutGrid size={14}/> 模型选择
                 </h4>
                 <button 
                    onClick={() => fetchModels(activeTab)} 
                    disabled={isLoadingModels}
                    className="text-xs text-blue-400 hover:text-blue-300 flex gap-1 items-center px-2 py-1 hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50"
                 >
                   {isLoadingModels ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} 
                   获取列表
                 </button>
               </div>
               
               <ModelTrigger 
                  label="当前模型" 
                  icon={LayoutGrid} 
                  value={cur.model} 
                  onOpenPicker={() => { fetchModels(activeTab); setShowModelPicker(true); }} 
                  onManualChange={v => updateConfig('model', v)} 
                  className="w-full h-12" 
                  variant="horizontal" 
                  colorTheme={tabs.find(t => t.id === activeTab).color.split('-')[1]}
               />
               
               <div className="bg-blue-900/10 border border-blue-900/30 rounded-lg p-3">
                 <p className="text-[10px] text-blue-200/70 flex gap-2">
                   <span className="font-bold">推荐配置:</span>
                   <span>文本: gemini-2.0-flash / gpt-4o</span>
                   <span>|</span>
                   <span>图片: nanobanana-2-pro / flux-pro</span>
                   <span>|</span>
                   <span>视频: kling-v1.6 / sora-v2</span>
                 </p>
               </div>
             </div>
          </div>
        </div>
      </div>
      
      {/* 嵌套的模型选择器 */}
      <ModelSelectionModal 
        isOpen={showModelPicker} 
        models={availableModels} 
        onClose={() => setShowModelPicker(false)} 
        onSelect={m => updateConfig('model', m)} 
        title={tabs.find(t => t.id === activeTab).label}
      />
    </div>
  );
};

// D. 图片预览 (支持缩放与平移 - Pro版)
const ImagePreviewModal = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(false);
  const start = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();
      setScale(s => Math.max(0.5, Math.min(5, s - e.deltaY * 0.001)));
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  if (!url) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center overflow-hidden animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="relative w-full h-full flex items-center justify-center"
        onMouseDown={e => { if (scale > 1) { setDrag(true); start.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; } }}
        onMouseMove={e => { if (drag) setPos({ x: e.clientX - start.current.x, y: e.clientY - start.current.y }); }}
        onMouseUp={() => setDrag(false)}
        onMouseLeave={() => setDrag(false)}
      >
        <img 
          src={url} 
          className={cn("max-w-full max-h-full object-contain transition-transform duration-75 select-none", scale > 1 ? "cursor-move" : "cursor-default")} 
          style={{ transform: `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)` }} 
          onClick={e => e.stopPropagation()}
          draggable={false}
        />
      </div>
      
      {/* 顶部控制栏 */}
      <div className="absolute top-4 right-4 flex gap-2">
        <div className="bg-slate-800/80 px-3 py-2 rounded-lg text-xs text-white backdrop-blur font-mono border border-slate-700">
          {(scale * 100).toFixed(0)}%
        </div>
        <button onClick={onClose} className="p-2 bg-white/10 rounded-lg text-white hover:bg-red-600 backdrop-blur transition-colors">
          <X size={20}/>
        </button>
      </div>
      
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/80 px-4 py-2 rounded-full text-xs text-slate-400 backdrop-blur pointer-events-none">
        滚轮缩放 · 拖拽移动 · 点击背景关闭
      </div>
    </div>
  );
};

// E. 灵感老虎机 (Inspiration Machine)
const InspirationSlotMachine = ({ onClose }) => {
  const { setScript, setDirection, callApi } = useProject();
  const [spinning, setSpinning] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const handleAiSpin = async () => {
    setSpinning(true); 
    setAiResult(null);
    try {
      // Prompt 优化：要求返回 JSON 格式的电影创意
      const prompt = `Brainstorm 1 unique, avant-garde film concept. Return strict JSON format: {"genre": "Type", "theme": "Core Theme", "visual_style": "Visuals", "logline": "One sentence summary"}. Make it creative.`;
      const res = await callApi('analysis', { system: "You are a Creative Director. Output JSON only.", user: prompt });
      
      const jsonStr = res.match(/\{[\s\S]*\}/)?.[0];
      if (jsonStr) {
        setAiResult(JSON.parse(jsonStr));
      } else {
        throw new Error("Format Error");
      }
    } catch(e) {
      // 降级方案
      setAiResult({ genre: "赛博朋克 (降级)", theme: "系统故障", visual_style: "故障艺术", logline: "AI 连接失败，这是本地生成的随机灵感。" });
    } finally { 
      setSpinning(false); 
    }
  };

  const apply = () => {
    if (!aiResult) return;
    setScript(`(创意概念：${aiResult.logline})\n\n[开场]...`);
    setDirection(`类型：${aiResult.genre}\n主题：${aiResult.theme}\n视觉：${aiResult.visual_style}`);
    onClose(); 
    alert("✨ AI 灵感已注入导演控制台！");
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gradient-to-br from-indigo-900 to-purple-900 border border-purple-500/50 w-full max-w-md rounded-2xl p-8 shadow-2xl text-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 背景光效 */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500"/>
        
        <h2 className="text-2xl font-bold text-white mb-2 flex justify-center gap-2 items-center">
          <Sparkles className="text-yellow-400"/> AI 灵感风暴
        </h2>
        <p className="text-xs text-purple-200 mb-6">由大语言模型实时生成的绝妙点子</p>
        
        {spinning ? (
          <div className="h-40 flex flex-col items-center justify-center space-y-4 animate-pulse">
            <Loader2 size={48} className="text-yellow-400 animate-spin"/>
            <div className="text-sm text-purple-200 font-mono">正在连接宇宙脑波...</div>
          </div>
        ) : aiResult ? (
          <div className="mb-6 space-y-3 animate-in fade-in zoom-in duration-300">
             <div className="grid grid-cols-2 gap-3 text-left">
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <div className="text-[10px] text-purple-400 uppercase font-bold tracking-wider">Genre</div>
                  <div className="text-sm text-white font-bold">{aiResult.genre}</div>
                </div>
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <div className="text-[10px] text-purple-400 uppercase font-bold tracking-wider">Visual</div>
                  <div className="text-sm text-white font-bold">{aiResult.visual_style}</div>
                </div>
             </div>
             <div className="bg-black/30 p-4 rounded-lg text-left border border-white/5">
               <div className="text-[10px] text-purple-400 mb-1 uppercase font-bold tracking-wider">Logline</div>
               <div className="text-sm text-slate-200 leading-relaxed font-serif italic">"{aiResult.logline}"</div>
             </div>
          </div>
        ) : (
          <div className="h-40 flex flex-col items-center justify-center text-purple-300/30 gap-2 border-2 border-dashed border-purple-500/30 rounded-lg mb-6">
            <Brain size={32}/>
            <span>点击下方按钮开始探索</span>
          </div>
        )}

        <div className="space-y-3">
          <button 
            onClick={handleAiSpin} 
            disabled={spinning} 
            className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-lg rounded-xl shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <Dices size={24}/> {spinning ? "构思中..." : "生成 AI 创意"}
          </button>
          
          {aiResult && (
            <button 
              onClick={apply} 
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold backdrop-blur transition-all"
            >
              采用此方案
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// F. 视频生成弹窗 (Studio Board 通用)
const VideoGeneratorModal = ({ isOpen, onClose, initialPrompt, initialModel, onGenerate }) => {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [model, setModel] = useState(initialModel || "kling-v1.6");
  const [loading, setLoading] = useState(false);
  
  useEffect(() => { 
    setPrompt(initialPrompt || ""); 
    setModel(initialModel || "kling-v1.6"); 
  }, [initialPrompt, initialModel, isOpen]);

  const handleGen = async () => { 
    if (!prompt) return alert("请输入提示词");
    setLoading(true); 
    try { 
      await onGenerate({ prompt, model }); 
      onClose(); 
    } catch(e) {
      alert(e.message);
    } finally { 
      setLoading(false); 
    } 
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-purple-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-4">
          <h3 className="font-bold text-white flex gap-2 items-center">
            <Film className="text-purple-400"/> 生成视频
          </h3>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-white"/></button>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-1">
             <label className="text-xs text-slate-400">视频模型</label>
             <div className="flex gap-2">
               <input 
                 value={model} 
                 onChange={e => setModel(e.target.value)} 
                 className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"
               />
               <button onClick={() => setModel('kling-v1.6')} className="px-2 bg-slate-800 rounded text-xs text-slate-300 hover:text-white border border-slate-700">Kling</button>
               <button onClick={() => setModel('sora-v2')} className="px-2 bg-slate-800 rounded text-xs text-slate-300 hover:text-white border border-slate-700">Sora</button>
             </div>
          </div>
          
          <div className="space-y-1">
             <label className="text-xs text-slate-400">运动提示词 (Motion Prompt)</label>
             <textarea 
               value={prompt} 
               onChange={e => setPrompt(e.target.value)} 
               className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white resize-none focus:border-purple-500 outline-none" 
               placeholder="描述镜头运动或动作..."
             />
          </div>

          <button 
            onClick={handleGen} 
            disabled={loading} 
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold shadow-lg flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin"/> : <Wand2 size={16}/>} 确认生成
          </button>
        </div>
      </div>
    </div>
  );
};

// G. 音频生成弹窗 (Studio Board 通用)
const AudioGeneratorModal = ({ isOpen, onClose, initialText, onGenerate }) => {
  const [activeTab, setActiveTab] = useState("tts");
  const [text, setText] = useState(initialText || "");
  const [voice, setVoice] = useState("alloy");
  const [speed, setSpeed] = useState(1.0);
  const [sfxModel, setSfxModel] = useState("eleven-sound-effects");
  const [loading, setLoading] = useState(false);
  
  const voices = [
    { id: 'alloy', label: 'Alloy (通用中性)' },
    { id: 'echo', label: 'Echo (男声)' },
    { id: 'fable', label: 'Fable (英式)' },
    { id: 'onyx', label: 'Onyx (深沉男)' },
    { id: 'nova', label: 'Nova (温柔女)' },
    { id: 'shimmer', label: 'Shimmer (清脆女)' }
  ];

  useEffect(() => { setText(initialText || ""); }, [initialText, isOpen]);

  const handleGen = async () => { 
    if (!text) return; 
    setLoading(true); 
    try { 
      if (activeTab === 'tts') await onGenerate({ text, voice, speed, isTTS: true }); 
      else if (activeTab === 'sfx') await onGenerate({ text, isSFX: true, model: sfxModel }); 
      onClose(); 
    } catch(e) {
      alert(e.message);
    } finally { 
      setLoading(false); 
    } 
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-green-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-4">
           <h3 className="font-bold text-white flex gap-2 items-center"><Mic className="text-green-400"/> 添加声音</h3>
           <div className="flex bg-slate-800 rounded p-1">
             <button onClick={() => setActiveTab("tts")} className={cn("px-3 py-1 text-xs rounded transition-all", activeTab === "tts" ? "bg-green-600 text-white" : "text-slate-400")}>配音</button>
             <button onClick={() => setActiveTab("sfx")} className={cn("px-3 py-1 text-xs rounded transition-all", activeTab === "sfx" ? "bg-orange-600 text-white" : "text-slate-400")}>AI音效</button>
           </div>
        </div>

        {activeTab === "tts" && (
          <div className="space-y-4 animate-in fade-in">
            <textarea value={text} onChange={e => setText(e.target.value)} className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white resize-none" placeholder="输入台词..."/>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                 <label className="text-[10px] text-slate-500">音色</label>
                 <select value={voice} onChange={e => setVoice(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white outline-none">
                   {voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                 </select>
              </div>
              <div className="space-y-1">
                 <label className="text-[10px] text-slate-500">语速 ({speed}x)</label>
                 <input type="range" min="0.5" max="2.0" step="0.1" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg accent-green-500 cursor-pointer mt-2"/>
              </div>
            </div>
            <button onClick={handleGen} disabled={loading} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded font-bold shadow">{loading ? <Loader2 className="animate-spin"/> : "生成配音"}</button>
          </div>
        )}

        {activeTab === "sfx" && (
          <div className="space-y-4 animate-in fade-in">
            <textarea value={text} onChange={e => setText(e.target.value)} className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white resize-none" placeholder="描述音效 (例如: 雨夜脚步声)..."/>
            <button onClick={handleGen} disabled={loading} className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white rounded font-bold shadow">{loading ? <Loader2 className="animate-spin"/> : "生成音效"}</button>
          </div>
        )}
      </div>
    </div>
  );
};
// ==========================================
// 模块 3：角色工坊 - 签约中心 (Sub-Component)
// 核心职责：多视角分析、结构化设定生成、演员注册
// ==========================================

// A. 12 视角标准定义 (Standard 12 Views)
const FIXED_VIEWS = [
  { title: "正面全身 (Front Full)", prompt: "Full body shot, front view, standing straight, neutral expression, detailed outfit, looking at camera. (Depth of Field)" },
  { title: "背面全身 (Back Full)", prompt: "Full body shot, back view, standing straight, detailed back design of outfit." },
  { title: "侧面半身 (Side Half)", prompt: "Upper body shot, side profile view, looking forward, sharp features." },
  { title: "面部特写-正 (Face Front)", prompt: "Extreme close-up on face, front view, detailed eyes, detailed skin texture, emotions." },
  { title: "面部特写-侧 (Face Side)", prompt: "Extreme close-up on face, side profile, jawline focus, cinematic lighting." },
  { title: "背面特写 (Back Close)", prompt: "Close-up from behind, focus on hair texture and neck/collar details." },
  { title: "俯视视角 (High Angle)", prompt: "High angle shot, looking down at character, cinematic composition." },
  { title: "仰视视角 (Low Angle)", prompt: "Low angle shot, looking up at character, imposing presence, dramatic sky." },
  { title: "动态姿势 (Action Pose)", prompt: "Dynamic action pose, fighting stance or running, motion blur on limbs, high energy." },
  { title: "电影广角 (Cinematic Wide)", prompt: "Wide angle cinematic shot, character in environment, rule of thirds, atmospheric lighting." },
  { title: "自然抓拍-喜 (Candid Joy)", prompt: "Candid shot, laughing or smiling naturally, sparkles in eyes, warm lighting." },
  { title: "自然抓拍-怒 (Candid Anger)", prompt: "Candid shot, angry expression, intense stare, dramatic shadows, cold lighting." }
];

// B. 媒体预览组件 (用于签约中心)
const MediaPreview = ({ history, idx, setIdx, onGen, label, onPreview }) => {
  const current = history[idx] || {};
  const max = history.length - 1;
  
  return (
    <div className="flex flex-col gap-2 h-full">
        <div className="flex justify-between items-center px-1 shrink-0">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-2">
              {label.includes("Portrait") ? <UserCircle2 size={12}/> : <FileText size={12}/>} {label}
            </span>
            {history.length > 0 && <span className="text-[10px] text-slate-500 font-mono">{idx+1}/{history.length}</span>}
        </div>
        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden relative group min-h-0 flex items-center justify-center">
            {current.loading ? (
                <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="animate-spin text-blue-500"/>
                    <span className="text-xs text-slate-400 animate-pulse">AI 绘制中...</span>
                </div>
            ) : current.error ? (
                <div className="p-4 text-center max-w-full">
                    <div className="text-red-500 font-bold text-xs mb-1">生成失败</div>
                    <div className="text-[10px] text-red-400/80 leading-tight border border-red-900/50 p-2 rounded bg-red-900/10 break-words whitespace-normal">{current.error}</div>
                    <button onClick={onGen} className="mt-2 text-[10px] text-slate-400 underline hover:text-white">重试</button>
                </div>
            ) : current.url ? (
               <>
                  <img src={current.url} className="w-full h-full object-contain cursor-zoom-in bg-black/40" onClick={() => onPreview(current.url)}/>
                  {/* 悬浮操作栏 */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button onClick={() => saveAs(current.url, "img.png")} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600 shadow backdrop-blur"><Download size={14}/></button>
                      <button onClick={onGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600 shadow backdrop-blur"><RefreshCw size={14}/></button>
                  </div>
                  {/* 翻页器 */}
                  {history.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button disabled={idx<=0} onClick={() => setIdx(i => i-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={16}/></button>
                      <span className="text-[10px] text-white font-mono">{idx+1}/{history.length}</span>
                      <button disabled={idx>=max} onClick={() => setIdx(i => i+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={16}/></button>
                    </div>
                  )}
               </>
            ) : (
                <div className="flex flex-col items-center gap-2 text-slate-600 text-xs text-center px-4">
                    <ImageIcon size={32} className="opacity-10"/>
                    <span className="opacity-50">{label.includes("Portrait") ? "等待生成半身定妆照" : "等待生成角色设定图"}</span>
                </div>
            )}
        </div>
        <button 
          onClick={onGen} 
          disabled={current.loading} 
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center justify-center gap-2 text-xs transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
        >
            {current.loading ? <Loader2 className="animate-spin" size={12}/> : <RefreshCw size={12}/>} 
            {history.length > 0 ? "重绘 (Regen)" : "开始生成 (Generate)"}
        </button>
    </div>
  );
};

// C. 角色签约中心 (Modal)
const CharacterSigningModal = ({ isOpen, onClose, initialData, onRegister, onPreview }) => {
  const { callApi, blobUrlToBase64 } = useProject();
  
  // 核心数据状态
  const [params, setParams] = useState({ 
      name: "", voice: "", 
      visual_head: "", visual_upper: "", visual_lower: "", visual_access: "", 
      style: "" 
  });
  const [suggestedVoices, setSuggestedVoices] = useState([]);
  const [isRegeneratingVoices, setIsRegeneratingVoices] = useState(false);
  
  // 选图状态
  const [selectedRefIndices, setSelectedRefIndices] = useState([]); // 用户手动勾选的素材
  const [consistency, setConsistency] = useState(0.65); // 相似度
  
  // 生成状态
  const [status, setStatus] = useState('idle'); // idle, analyzing, gen_portrait, gen_sheet
  const [portraitHistory, setPortraitHistory] = useState([]);
  const [sheetHistory, setSheetHistory] = useState([]);
  const [portraitIdx, setPortraitIdx] = useState(0);
  const [sheetIdx, setSheetIdx] = useState(0);

  // 初始化：自动触发分析
  useEffect(() => {
    if (isOpen && initialData) {
        setPortraitHistory([]);
        setSheetHistory([]);
        setSelectedRefIndices([]);
        setConsistency(0.65);
        runAutoAnalysis();
    }
  }, [isOpen]);

  // [核心算法 1]：获取分析用素材 (降级策略)
  // 策略：4张(正/特/侧/背) -> 1张(正面) -> 参考图 -> 报错
  const getAnalysisAssets = async () => {
    const { images, refImage } = initialData;
    const candidates = [];
    
    // 尝试抓取核心视角 (Index 0:正面, 3:特写, 2:侧面, 5:背面)
    const targetIndices = [0, 3, 2, 5];
    for (let idx of targetIndices) {
        const img = images[idx]?.[images[idx].length-1]?.url;
        if (img && !img.error) candidates.push(img);
    }
    
    // 如果一张都没有，尝试只取第一张
    if (candidates.length === 0 && images[0]?.length > 0) {
        candidates.push(images[0][images[0].length-1].url);
    }

    // 还没图，用原参考图
    if (candidates.length === 0 && refImage) {
        candidates.push(refImage);
    }

    if (candidates.length === 0) return null; // 阻断

    // 转 Base64
    return Promise.all(candidates.map(url => blobUrlToBase64(url)));
  };

  // [核心算法 2]：LLM 自动分析
  const runAutoAnalysis = async () => {
    setStatus('analyzing');
    try {
        const assets = await getAnalysisAssets();
        if (!assets) {
            alert("请先创造角色：至少上传参考图或生成视角图。");
            setStatus('idle');
            return;
        }

        const lang = initialData.lang === "Chinese" ? "Simplified Chinese" : "English";
        const system = `Role: Senior Character Concept Artist.
        Task: Analyze character images and generate a structured profile.
        CRITICAL RULES:
        1. **Hallucinate Missing Parts**: If shoes/legs are missing, invent them logically.
        2. **Style Detection**: Accurately describe the art style (e.g., Photorealistic, Anime, Cyberpunk).
        3. **Output JSON**:
        {
          "visual_head": "Face, hair, eyes, makeup...",
          "visual_upper": "Top clothing, layers, neckwear...",
          "visual_lower": "Pants/skirt, shoes, legwear (INVENT IF MISSING)...",
          "visual_access": "Accessories, weapons...",
          "style": "Art style keywords...",
          "voice_tags": ["Adjective1", "Adjective2", ...]
        }
        Language: ${lang}.`;

        const res = await callApi('analysis', { 
            system, 
            user: "Analyze images and extract character details.", 
            assets 
        });

        const d = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
        setParams({
            name: "", // 留白给用户填
            voice: "",
            visual_head: d.visual_head || "",
            visual_upper: d.visual_upper || "",
            visual_lower: d.visual_lower || "",
            visual_access: d.visual_access || "",
            style: d.style || ""
        });
        setSuggestedVoices(d.voice_tags || ["Standard"]);

    } catch(e) {
        console.error(e);
        // 失败允许手填
    } finally {
        setStatus('idle');
    }
  };

  // [核心算法 3]：获取生成用素材 (手动勾选)
  const getGenerationAssets = async () => {
      // 优先用勾选的
      if (selectedRefIndices.length > 0) {
          const urls = selectedRefIndices.map(i => initialData.images[i]?.[initialData.images[i].length-1]?.url).filter(Boolean);
          return Promise.all(urls.map(u => blobUrlToBase64(u)));
      }
      // 没勾选，降级用原参考图
      if (initialData.refImage) {
          return [await blobUrlToBase64(initialData.refImage)];
      }
      return null;
  };

  // 辅助：生成定妆照 (Portrait)
  const handleGenPortrait = async () => {
    if (status !== 'idle') return;
    setStatus('gen_portrait');
    setPortraitHistory(p => [...p, { loading: true }]);
    setPortraitIdx(prev => prev + 1); // Point to new loading slot (simplified logic)

    try {
        const refs = await getGenerationAssets();
        // 提示词组装 (半身)
        const prompt = `(${params.style}), (Waist-Up Portrait), (Front View). 
        Character: [${params.visual_head}], [${params.visual_upper}], [${params.visual_access}].
        Background: (Clean Solid Background), (Studio Lighting). 
        Negative: (Lower body), (Legs), (Shoes). --ar 3:4`;

        const url = await callApi('image', {
            prompt, aspectRatio: "3:4", 
            useImg2Img: !!refs, refImages: refs, strength: consistency
        });
        
        setPortraitHistory(p => {
             const n = [...p]; 
             n[n.length-1] = { url, loading: false }; 
             return n; 
        });
    } catch(e) {
        setPortraitHistory(p => { 
            const n = [...p]; 
            n[n.length-1] = { error: e.message, loading: false }; 
            return n; 
        });
    } finally {
        setStatus('idle');
    }
  };

  // 辅助：生成设定图 (Sheet)
  const handleGenSheet = async () => {
    if (status !== 'idle') return;
    setStatus('gen_sheet');
    setSheetHistory(p => [...p, { loading: true }]);
    setSheetIdx(prev => prev + 1);

    try {
        const refs = await getGenerationAssets();
        // 提示词组装 (全身三视图 + 表情)
        const prompt = `(Character Design Sheet), (${params.style}), (Split View Layout).
        LEFT: (Three Views: Front, Side, Back), (Full Body).
        CENTER: (Facial Expressions x4).
        RIGHT: (Outfit Breakdown).
        Character: [${params.visual_head}], [${params.visual_upper}], [${params.visual_lower}], [${params.visual_access}].
        Background: (White Background). --ar 16:9`;

        const url = await callApi('image', {
            prompt, aspectRatio: "16:9", 
            useImg2Img: !!refs, refImages: refs, strength: consistency
        });

        setSheetHistory(p => { const n = [...p]; n[n.length-1] = { url, loading: false }; return n; });
    } catch(e) {
        setSheetHistory(p => { const n = [...p]; n[n.length-1] = { error: e.message, loading: false }; return n; });
    } finally {
        setStatus('idle');
    }
  };

  const handleFinalRegister = () => {
      const p = portraitHistory[portraitHistory.length - 1]; // 取最新生成的
      const s = sheetHistory[sheetHistory.length - 1];
      
      if (!params.name) return alert("请输入演员名称");
      if (!p?.url || !s?.url) return alert("请确保定妆照和设定图都已生成成功");
      
      // 结构化数据保存
      const newActor = {
          id: Date.now(),
          name: params.name,
          voice_tone: params.voice,
          desc: JSON.stringify(params), // 兼容老逻辑
          visuals: params, // 新逻辑：结构化数据
          images: { portrait: p.url, sheet: s.url }
      };
      
      onRegister(newActor);
  };

  // UI 渲染
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-slate-900 border border-purple-500/30 w-full max-w-6xl h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950 shrink-0">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <UserCircle2 className="text-purple-400" size={18}/> 角色定妆与签约中心
                </h3>
                <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full transition-colors"><X size={18} className="text-slate-500 hover:text-white"/></button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Params & Analysis */}
                <div className="w-80 border-r border-slate-800 p-5 bg-slate-900/50 flex flex-col overflow-y-auto scrollbar-thin shrink-0">
                    {status === 'analyzing' ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-purple-400">
                            <Brain className="animate-pulse" size={48}/>
                            <div className="space-y-1 text-center">
                                <p className="text-sm font-bold text-white">AI 正在深度分析...</p>
                                <p className="text-xs text-slate-400 px-4">正在提取多视角特征、推导缺失部位并识别艺术风格</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5 animate-in slide-in-from-left-4">
                            {/* 1. Name & Voice */}
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">演员真名 (Name)</label>
                                    <input 
                                        value={params.name} 
                                        onChange={e => setParams({...params, name: e.target.value})} 
                                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-bold focus:border-purple-500 outline-none" 
                                        placeholder="例如：Neo"
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">声线 (Voice)</label>
                                        <button onClick={() => setSuggestedVoices(["Rough", "Soft", "Deep"])} className="text-[10px] text-purple-400 hover:text-white flex gap-1 items-center">
                                            <RefreshCw size={10}/> 重组
                                        </button>
                                    </div>
                                    <input 
                                        value={params.voice} 
                                        onChange={e => setParams({...params, voice: e.target.value})} 
                                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white outline-none" 
                                        placeholder="点击下方标签..."
                                    />
                                    <div className="flex flex-wrap gap-1.5">
                                        {suggestedVoices.map(tag => (
                                            <button 
                                                key={tag} 
                                                onClick={() => setParams(p => ({...p, voice: p.voice ? `${p.voice}, ${tag}` : tag}))} 
                                                className="px-2 py-0.5 border border-purple-800 bg-purple-900/20 text-[10px] text-purple-200 rounded-full hover:bg-purple-800 transition-colors"
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 2. Visual Details */}
                            <div className="space-y-3 pt-2 border-t border-slate-800">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><Brain size={10}/> 头部细节 (Head)</label>
                                    <textarea value={params.visual_head} onChange={e => setParams({...params, visual_head: e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><UserCircle2 size={10}/> 上身穿着 (Upper)</label>
                                    <textarea value={params.visual_upper} onChange={e => setParams({...params, visual_upper: e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><GripHorizontal size={10}/> 下身/鞋子 (Lower)</label>
                                    <textarea value={params.visual_lower} onChange={e => setParams({...params, visual_lower: e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-pink-400 font-bold uppercase flex items-center gap-1"><Palette size={10}/> 艺术风格 (Style)</label>
                                    <textarea value={params.style} onChange={e => setParams({...params, style: e.target.value})} className="w-full h-12 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-pink-500"/>
                                </div>
                            </div>

                            {/* 3. Ref Assets */}
                            <div className="pt-2 border-t border-slate-800 space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] text-slate-400 font-bold">参考素材 (最多选5张)</label>
                                    <span className="text-[9px] text-green-400 font-mono">Sim: {consistency}</span>
                                </div>
                                <input type="range" min="0.1" max="1.0" step="0.05" value={consistency} onChange={(e) => setConsistency(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-green-500 cursor-pointer"/>
                                <div className="grid grid-cols-4 gap-2 max-h-24 overflow-y-auto scrollbar-none">
                                    {/* 遍历 12 宫格的缓存图 */}
                                    {Object.entries(initialData.images).map(([idx, hist]) => {
                                        const img = hist?.[hist.length-1];
                                        if (!img?.url) return null;
                                        const isSelected = selectedRefIndices.includes(parseInt(idx));
                                        return (
                                            <div 
                                                key={idx} 
                                                onClick={() => {
                                                    if (isSelected) setSelectedRefIndices(p => p.filter(i => i !== parseInt(idx)));
                                                    else {
                                                        if (selectedRefIndices.length >= 5) return alert("最多选5张");
                                                        setSelectedRefIndices(p => [...p, parseInt(idx)]);
                                                    }
                                                }} 
                                                className={cn("aspect-square rounded border-2 overflow-hidden relative cursor-pointer transition-all", isSelected ? "border-green-500 opacity-100" : "border-transparent opacity-40 hover:opacity-100")}
                                            >
                                                <img src={img.url} className="w-full h-full object-cover"/>
                                                {isSelected && <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center"><CheckCircle2 size={12} className="text-white"/></div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Generation Preview */}
                <div className="flex-1 p-6 bg-black flex flex-col min-w-0">
                    <div className="flex gap-6 h-[500px] min-h-0 mb-4 shrink-0">
                        <div className="w-1/3 h-full">
                            <MediaPreview 
                                label="定妆照 (Portrait - Half Body)" 
                                history={portraitHistory} 
                                idx={portraitHistory.length > 0 ? portraitHistory.length - 1 : 0} 
                                setIdx={() => {}} 
                                onGen={handleGenPortrait} 
                                onPreview={onPreview}
                            />
                        </div>
                        <div className="flex-1 h-full">
                            <MediaPreview 
                                label="角色设定图 (Character Sheet)" 
                                history={sheetHistory} 
                                idx={sheetHistory.length > 0 ? sheetHistory.length - 1 : 0} 
                                setIdx={() => {}} 
                                onGen={handleGenSheet} 
                                onPreview={onPreview}
                            />
                        </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="h-16 shrink-0 flex gap-4 items-center justify-end border-t border-slate-800 pt-4">
                        <div className="flex-1 text-xs text-slate-500 flex flex-col justify-center">
                            <p>👉 请先确认左侧参数，再依次生成「定妆照」和「设定图」。</p>
                            <p>👉 只有两者都生成成功后，才可点击签约。</p>
                        </div>
                        
                        <button 
                            onClick={() => { handleGenPortrait(); setTimeout(handleGenSheet, 2000); }} 
                            disabled={status !== 'idle'} 
                            className="bg-slate-800 hover:bg-slate-700 text-white px-6 h-12 rounded-lg font-bold border border-slate-600 disabled:opacity-50 transition-all"
                        >
                            一键双开生成
                        </button>
                        
                        <button 
                            onClick={handleFinalRegister} 
                            disabled={!portraitHistory.some(i=>i.url) || !sheetHistory.some(i=>i.url)}
                            className={cn(
                                "w-64 h-12 rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 transition-all",
                                (!portraitHistory.some(i=>i.url) || !sheetHistory.some(i=>i.url)) 
                                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                                    : "bg-green-600 hover:bg-green-500 text-white animate-pulse"
                            )}
                        >
                            <CheckCircle2 size={18}/> 确认签约 (Register)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
// ==========================================
// 模块 4：角色工坊 (Character Lab) 主界面
// 核心职责：参考图管理、12宫格生成、调用签约中心
// ==========================================

const CharacterLab = ({ onPreview, aspectRatio, setAspectRatio }) => {
  const { 
    clPrompts, setClPrompts, clImages, setClImages, 
    actors, setActors, callApi, base64ToBlobUrl, blobUrlToBase64 
  } = useProject();

  // 1. 本地状态
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [referenceImage, setReferenceImage] = useState(() => localStorage.getItem('cl_ref') || null);
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  const [localAr, setLocalAr] = useState(() => localStorage.getItem('cl_ar') || "16:9");
  const [imgStrength, setImgStrength] = useState(0.65);
  const [useImg2Img, setUseImg2Img] = useState(true);
  
  // 状态标识
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzingRef, setIsAnalyzingRef] = useState(false);
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [viewingActor, setViewingActor] = useState(null); // 查看已签约演员详情

  // 2. 持久化监听
  useEffect(() => { localStorage.setItem('cl_desc', description); }, [description]);
  useEffect(() => { if(referenceImage) localStorage.setItem('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { localStorage.setItem('cl_lang', targetLang); }, [targetLang]);
  useEffect(() => { localStorage.setItem('cl_ar', localAr); }, [localAr]);

  // 3. 核心逻辑
  // A. 图片上传与处理
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) alert("⚠️ 图片过大，建议压缩");
        const reader = new FileReader();
        reader.onloadend = () => { 
            setReferenceImage(reader.result); 
            setUseImg2Img(true);
        };
        reader.readAsDataURL(file); 
    }
  };

  const handleRemoveRef = (e) => {
      e.preventDefault(); e.stopPropagation();
      setReferenceImage(null);
      localStorage.removeItem('cl_ref');
      setUseImg2Img(false);
  };

  // B. AI 智能识图 (Vision Analysis)
  const handleAnalyzeRef = async () => {
      if (!referenceImage) return alert("请先上传参考图");
      setIsAnalyzingRef(true);
      try {
          // 准备数据
          let refData = referenceImage;
          if (refData.startsWith('blob:')) refData = await blobUrlToBase64(refData);
          
          const langInstruction = targetLang === "Chinese" ? "Output in Simplified Chinese." : "Output in English.";
          const system = `Role: Visual Director. 
          Task: Describe the character in the image for AI image generation. 
          Focus on: Appearance, Outfit, and Art Style. 
          Length: Concise paragraph. ${langInstruction}`;
          
          const text = await callApi('analysis', { 
              system, 
              user: "Describe this character.", 
              assets: [refData] 
          });
          setDescription(text);
      } catch(e) {
          alert("识别失败: " + e.message);
      } finally {
          setIsAnalyzingRef(false);
      }
  };

  // C. 12 视角生成 (Prompt Generation)
  const handleGenerateViews = () => {
      if (!description) return alert("请先填写角色描述");
      
      // 这里的 FIXED_VIEWS 来自 Part 3 的全局定义
      // 如果未定义，请检查 Part 3 是否正确粘贴
      const newPrompts = FIXED_VIEWS.map(view => ({
          title: view.title,
          // 组合逻辑: [视角描述] + [角色描述] + [视角细节]
          prompt: `(View: ${view.title}). ${description}. ${view.prompt}`
      }));
      
      setClPrompts(newPrompts);
      // 注意：不强制清空旧图，允许保留以便对比，除非用户手动重置
  };

  // D. 单图绘制 (Image Gen)
  const handleGridGen = async (idx, item) => {
      setClImages(p => ({ ...p, [idx]: [...(p[idx]||[]), { loading: true }] }));
      try {
          let finalRef = null;
          if (useImg2Img && referenceImage) {
               finalRef = referenceImage.startsWith('blob:') ? await blobUrlToBase64(referenceImage) : referenceImage;
          }
          
          // ActionID 防止 API 缓存
          const promptWithId = `${item.prompt} --ar ${localAr} (ActionID: ${Date.now()})`;
          
          const url = await callApi('image', {
              prompt: promptWithId,
              aspectRatio: localAr,
              useImg2Img: !!finalRef,
              refImages: finalRef ? [finalRef] : null,
              strength: imgStrength
          });

          setClImages(p => {
              const list = p[idx] || [];
              const newList = [...list];
              newList[newList.length-1] = { url, loading: false, timestamp: Date.now() };
              return { ...p, [idx]: newList };
          });
      } catch(e) {
          setClImages(p => {
              const list = p[idx] || [];
              const newList = [...list];
              newList[newList.length-1] = { error: e.message, loading: false };
              return { ...p, [idx]: newList };
          });
      }
  };

  const handleGridUpload = (idx, e) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setClImages(p => ({ ...p, [idx]: [...(p[idx]||[]), { url: reader.result, loading: false }] }));
          reader.readAsDataURL(file);
      }
  };

  // E. 全局重置
  const handleClearAll = () => {
      if(!confirm("确定清空当前角色的所有工作区内容吗？")) return;
      setDescription("");
      setReferenceImage(null);
      setClPrompts([]);
      setClImages({});
      localStorage.removeItem('cl_desc');
      localStorage.removeItem('cl_ref');
  };

  // F. 签约逻辑
  const handleRegisterActor = (newActor) => {
      setActors(prev => [...prev, newActor]);
      setShowSheetModal(false);
      alert(`🎉 签约成功！演员 [${newActor.name}] 已入库。`);
  };

  // 4. UI 渲染 - 12宫格卡片 (Grid Card)
  const GridCard = ({ item, index }) => {
      const history = clImages[index] || [];
      const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
      const [isEditing, setIsEditing] = useState(false);
      const [localPrompt, setLocalPrompt] = useState(item.prompt);

      useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
      
      const current = history[verIndex] || {};
      const arClass = localAr === "16:9" ? "aspect-video" : localAr === "9:16" ? "aspect-[9/16]" : "aspect-square";

      const saveEdit = () => {
          setClPrompts(prev => {
              const n = [...prev];
              n[index] = { ...n[index], prompt: localPrompt };
              return n;
          });
          setIsEditing(false);
      };

      return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col relative shadow-lg">
              {/* 图片显示区 */}
              <div className={cn("bg-black relative w-full shrink-0", arClass)}>
                  {current.loading ? (
                      <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
                          <Loader2 className="animate-spin text-blue-500"/>
                          <span className="text-[10px] text-slate-500">绘制中...</span>
                      </div>
                  ) : current.error ? (
                      <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 p-2 bg-red-900/10">
                          <span className="text-red-500 text-xs font-bold">生成失败</span>
                          <span className="text-[9px] text-red-400 text-center leading-tight break-all">{current.error}</span>
                          <button onClick={() => handleGridGen(index, item)} className="px-2 py-1 bg-slate-800 rounded text-[9px] text-white border border-slate-700 hover:bg-slate-700">重试</button>
                      </div>
                  ) : current.url ? (
                      <div className="relative w-full h-full group/img">
                          <img src={current.url} className="w-full h-full object-cover cursor-zoom-in" onClick={() => onPreview(current.url)}/>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <button onClick={() => saveAs(current.url, `view_${index}.png`)} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600 backdrop-blur"><Download size={12}/></button>
                              <button onClick={() => handleGridGen(index, item)} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600 backdrop-blur"><RefreshCw size={12}/></button>
                          </div>
                          {/* 历史版本切换 */}
                          {history.length > 1 && (
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button disabled={verIndex<=0} onClick={() => setVerIndex(v => v-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button>
                                  <span className="text-[10px] text-white font-mono">{verIndex+1}/{history.length}</span>
                                  <button disabled={verIndex>=history.length-1} onClick={() => setVerIndex(v => v+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button>
                              </div>
                          )}
                      </div>
                  ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleGridGen(index, item)} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1 hover:bg-blue-500 transform hover:scale-105 transition-all"><Camera size={12}/> 生成</button>
                          <label className="bg-slate-700 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1 cursor-pointer hover:bg-slate-600"><Upload size={12}/> 上传<input type="file" className="hidden" accept="image/*" onChange={(e) => handleGridUpload(index, e)}/></label>
                      </div>
                  )}
                  {/* Title Badge */}
                  <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white backdrop-blur pointer-events-none border border-white/10 shadow-sm">{item.title}</div>
              </div>

              {/* Prompt Editor */}
              <div className="flex-1 bg-slate-900/50 border-t border-slate-800 p-2 relative min-h-[60px]">
                  {isEditing ? (
                      <div className="absolute inset-0 bg-slate-800 z-10 flex flex-col animate-in fade-in">
                          <textarea autoFocus value={localPrompt} onChange={e => setLocalPrompt(e.target.value)} className="flex-1 w-full bg-slate-900 text-[10px] text-slate-200 p-2 resize-none outline-none border-b border-blue-500"/>
                          <div className="flex justify-end bg-slate-900 p-1 gap-2 border-t border-slate-700">
                              <button onClick={() => setIsEditing(false)} className="text-[10px] text-slate-400 hover:text-white">取消</button>
                              <button onClick={saveEdit} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-500">确认</button>
                          </div>
                      </div>
                  ) : (
                    <>
                        <p className="text-[10px] text-slate-500 font-mono line-clamp-3 select-all hover:text-slate-300 transition-colors cursor-text pr-4" title={item.prompt}>{item.prompt}</p>
                        <button onClick={() => setIsEditing(true)} className="absolute bottom-2 right-2 text-slate-600 hover:text-blue-400 transition-colors p-1"><Pencil size={12}/></button>
                    </>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      <CharacterSigningModal 
        isOpen={showSheetModal} 
        onClose={() => setShowSheetModal(false)}
        initialData={{
            images: clImages,
            refImage: referenceImage,
            lang: targetLang
        }}
        onRegister={handleRegisterActor}
        onPreview={onPreview}
      />

      {/* 左侧：参数控制区 */}
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 shrink-0 z-10 shadow-xl">
         <div className="p-4 overflow-y-auto flex-1 scrollbar-thin space-y-6">
            <div className="flex items-center justify-between font-bold text-slate-200">
                <span className="flex items-center gap-2"><UserCircle2 size={18} className="text-blue-400"/> 角色工坊</span>
                <button onClick={handleClearAll} title="清空当前工作台" className="p-1.5 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded transition-colors"><Trash2 size={14}/></button>
            </div>
            
            {/* 1. 上传参考图 */}
            <div className="relative group">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" />
                <label htmlFor="ref-img" className={cn("flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer overflow-hidden transition-all relative", referenceImage ? "border-blue-500/50 bg-slate-900" : "border-slate-700 hover:border-blue-500 hover:bg-slate-800/50")}>
                    {referenceImage ? (
                        <>
                            <img src={referenceImage} className="w-full h-full object-cover opacity-80" />
                            <button onClick={handleRemoveRef} className="absolute top-1 right-1 bg-red-600/80 text-white p-1 rounded-full hover:bg-red-500 z-20"><X size={12}/></button>
                            <button onClick={(e) => { e.preventDefault(); handleAnalyzeRef(); }} disabled={isAnalyzingRef} className="absolute bottom-2 bg-blue-600/90 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg z-20 backdrop-blur-sm transition-all border border-white/20">
                                {isAnalyzingRef ? <Loader2 className="animate-spin" size={12}/> : <Sparkles size={12}/>} 
                                {isAnalyzingRef ? "分析中..." : "AI 识别描述"}
                            </button>
                        </>
                    ) : (
                        <div className="text-slate-500 flex flex-col items-center gap-2">
                            <Upload size={24} className="opacity-50"/>
                            <span className="text-xs">上传参考图 (可选)</span>
                        </div>
                    )}
                </label>
            </div>
            
            {/* 2. 角色描述 */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex justify-between">
                    角色描述 (Prompt)
                    <span className="text-[10px] text-slate-500 font-normal">越详细越好</span>
                </label>
                <textarea 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    className="w-full h-28 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-600 leading-relaxed" 
                    placeholder="例如：一位赛博朋克风格的女黑客，银色短发，戴着发光的护目镜，身穿黑色皮夹克，霓虹背景..."
                />
            </div>
            
            {/* 3. 参数控制 */}
            <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/50 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500">画面比例</label>
                        <select value={localAr} onChange={(e) => setLocalAr(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                            <option value="16:9">16:9 (Video)</option>
                            <option value="9:16">9:16 (Shorts)</option>
                            <option value="1:1">1:1 (Square)</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500">提示词语言</label>
                        <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                            <option value="Chinese">中文 (Auto Trans)</option>
                            <option value="English">English</option>
                        </select>
                    </div>
                </div>
                
                <div className="pt-2 border-t border-slate-700/50">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Sliders size={10}/> 参考图权重 (Img2Img)
                        </label>
                        <input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} disabled={!referenceImage} className="accent-blue-600 disabled:opacity-50"/>
                    </div>
                    {useImg2Img && referenceImage && (
                        <div className="flex items-center gap-2 animate-in fade-in">
                             <input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="flex-1 h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/>
                             <span className="text-[10px] text-slate-300 font-mono w-8 text-right">{imgStrength}</span>
                        </div>
                    )}
                    <p className="text-[9px] text-slate-600 mt-1">权重 1.0 = 严格参考原图；权重 0.5 = 允许 AI 自由发挥</p>
                </div>
            </div>
            
            {/* 4. 操作按钮 */}
            <div className="space-y-3 pt-2">
                <button 
                    onClick={handleGenerateViews} 
                    disabled={isGenerating} 
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                >
                    {isGenerating ? <Loader2 className="animate-spin" size={16}/> : <LayoutGrid size={16}/>} 
                    生成 / 刷新 12 标准视角
                </button>
                <button 
                    onClick={() => {
                        const hasImages = Object.keys(clImages).length > 0;
                        if (!description && !referenceImage && !hasImages) return alert("请先生成一些内容再签约");
                        setShowSheetModal(true);
                    }} 
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                    <FileText size={16}/> 制作设定卡 & 签约入库
                </button>
            </div>

            {/* 5. 演员库 (Mini List) */}
            {actors.length > 0 && (
                <div className="pt-4 border-t border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-xs font-bold text-slate-400 flex gap-1 items-center"><Users size={12}/> 已签约演员 ({actors.length})</h4>
                        <button onClick={() => saveAs(new Blob([JSON.stringify(actors)], {type: "application/json"}), "actors_backup.json")} title="备份数据" className="text-slate-500 hover:text-white"><Download size={12}/></button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {actors.map(actor => (
                            <div key={actor.id} onClick={() => setViewingActor(actor)} className="aspect-square rounded-lg border border-slate-700 bg-slate-800 overflow-hidden relative cursor-pointer hover:border-blue-500 group transition-all">
                                <img src={actor.images.portrait} className="w-full h-full object-cover"/>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 flex items-end justify-center p-1 transition-opacity">
                                    <span className="text-[8px] text-white truncate w-full text-center font-bold">{actor.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
         </div>
      </div>

      {/* 右侧：12宫格视图区 */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-950/50">
          <div className="h-12 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm shrink-0">
             <h2 className="text-slate-400 text-sm font-bold flex items-center gap-2"><Eye size={16}/> 视角预览 ({clPrompts.length})</h2>
             {clPrompts.length > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in">
                    <button 
                        onClick={() => {
                           const zip = new JSZip();
                           clPrompts.forEach((p, i) => {
                               const img = clImages[i]?.[clImages[i].length-1];
                               if(img?.url) zip.file(`${p.title}.png`, fetch(img.url).then(r=>r.blob()));
                           });
                           zip.generateAsync({type:"blob"}).then(b => saveAs(b, "character_pack.zip"));
                        }} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-colors"
                    >
                        <Download size={12}/> 打包全部
                    </button>
                    <button 
                        onClick={() => {
                            if(!confirm(`即将消耗 ${clPrompts.length} 次绘图额度，确定吗？`)) return;
                            clPrompts.forEach((p, idx) => handleGridGen(idx, p));
                        }} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold shadow transition-colors"
                    >
                        <Camera size={12}/> 全部渲染
                    </button>
                </div>
             )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                {clPrompts.map((item, idx) => <GridCard key={idx} item={item} index={idx} />)}
             </div>
             
             {clPrompts.length === 0 && (
                 <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50 gap-4">
                     <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center">
                         <LayoutGrid size={40}/>
                     </div>
                     <p>请在左侧填写描述并点击“生成 12 标准视角”</p>
                 </div>
             )}
          </div>
      </div>
      
      {/* 演员详情弹窗 */}
      {viewingActor && (
         <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewingActor(null)}>
            <div className="bg-slate-900 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
               <div className="w-1/2 bg-black relative">
                   <img src={viewingActor.images.portrait} className="w-full h-full object-cover"/>
                   <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 pt-12">
                       <h3 className="text-3xl font-bold text-white font-serif">{viewingActor.name}</h3>
                       <div className="flex flex-wrap gap-1mt-2">
                           <span className="text-xs bg-purple-900/80 text-purple-200 px-2 py-0.5 rounded border border-purple-500/30">{viewingActor.voice_tone}</span>
                       </div>
                   </div>
               </div>
               <div className="w-1/2 p-6 bg-slate-900 flex flex-col border-l border-slate-800">
                   <div className="mb-4 space-y-2">
                       <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">设定图 (Sheet)</h4>
                       <div className="aspect-video bg-black rounded border border-slate-700 overflow-hidden cursor-zoom-in" onClick={() => onPreview(viewingActor.images.sheet)}>
                           <img src={viewingActor.images.sheet} className="w-full h-full object-contain"/>
                       </div>
                   </div>
                   <div className="flex-1 overflow-y-auto mb-4 scrollbar-thin">
                       <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">视觉特征 (Visuals)</h4>
                       <div className="text-[10px] text-slate-300 font-mono bg-slate-950 p-3 rounded border border-slate-800 leading-relaxed whitespace-pre-wrap">
                           {JSON.stringify(viewingActor.visuals, null, 2)}
                       </div>
                   </div>
                   <button 
                       onClick={() => {
                           if(confirm(`确定解约 ${viewingActor.name} 吗？`)) {
                               setActors(p => p.filter(a => a.id !== viewingActor.id));
                               setViewingActor(null);
                           }
                       }} 
                       className="w-full py-2 bg-red-900/20 text-red-400 hover:bg-red-900/50 hover:text-white border border-red-900/50 rounded flex items-center justify-center gap-2 text-xs transition-colors"
                   >
                       <Trash2 size={14}/> 解除签约 (Delete)
                   </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
// ==========================================
// 模块 5：自动分镜 - 核心逻辑与组件 (Storyboard Core)
// 核心职责：剧本分析、Sora提示词组装、播放器
// ==========================================

// A. 动态分镜播放器 (支持视频/图片混合混剪预览)
const AnimaticPlayer = ({ isOpen, onClose, playlist }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(new Audio()); 
  const videoRef = useRef(null);

  // 1. 初始化
  useEffect(() => {
    if (isOpen && playlist.length > 0) { 
        setIsPlaying(true); 
        setCurrentIndex(0); 
        setProgress(0); 
    } else { 
        audioRef.current.pause(); 
        audioRef.current.src = ""; 
    }
  }, [isOpen, playlist]);

  // 2. 媒体同步与自动播放
  useEffect(() => {
    if (!isOpen || !playlist[currentIndex]) return;
    const item = playlist[currentIndex];
    
    // 音频轨道
    if (item.audio_url) {
      audioRef.current.src = item.audio_url;
      audioRef.current.volume = 1.0;
      audioRef.current.play().catch(e => console.warn("Audio play blocked", e));
    } else { 
      audioRef.current.pause(); 
    }

    // 视频轨道 (如果有已生成的视频)
    if (item.video_url && videoRef.current) {
        videoRef.current.src = item.video_url;
        videoRef.current.play().catch(e => console.warn("Video play blocked", e));
    }
  }, [currentIndex, isOpen, playlist]);

  // 3. 计时器逻辑 (模拟非线性编辑 NLE)
  useEffect(() => {
    if (!isPlaying || playlist.length === 0) return;
    const item = playlist[currentIndex];
    
    // 优先使用视频真实时长，否则使用预设时长
    const duration = item.video_url ? (item.realDuration || 5000) : (item.duration || 3000);
    const stepTime = 50; 
    const totalSteps = duration / stepTime;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++; 
      setProgress((currentStep / totalSteps) * 100);
      
      if (currentStep >= totalSteps) {
        if (currentIndex < playlist.length - 1) { 
            setCurrentIndex(p => p + 1); 
            setProgress(0); 
            currentStep = 0; 
        } else { 
            setIsPlaying(false); 
            clearInterval(timer); 
            audioRef.current.pause(); 
        }
      }
    }, stepTime);
    return () => clearInterval(timer);
  }, [currentIndex, isPlaying, playlist]);

  if (!isOpen) return null;
  const currentShot = playlist[currentIndex];

  return (
    <div className="fixed inset-0 z-[210] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* 播放视窗 */}
      <div className="relative w-full h-full max-w-6xl max-h-[85vh] bg-black overflow-hidden flex items-center justify-center border-b border-slate-800">
        {playlist.length > 0 && currentShot ? (
          <>
            <div key={currentIndex} className="absolute inset-0 animate-in fade-in duration-500">
               {currentShot.video_url ? (
                 <video ref={videoRef} src={currentShot.video_url} className="w-full h-full object-contain" muted={false} />
               ) : (
                 <img 
                    src={currentShot.url} 
                    className="w-full h-full object-contain animate-[kenburns_10s_ease-out_forwards]" 
                    style={{ transformOrigin: 'center center' }} 
                 />
               )}
            </div>
            
            {/* 动态字幕层 */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-12 pb-20">
              <div className="text-yellow-400 font-mono text-xs mb-2 tracking-widest uppercase">
                  Shot {currentShot.id} • {((currentShot.duration||3000)/1000).toFixed(1)}s
              </div>
              <div className="text-white text-2xl md:text-3xl font-bold font-serif leading-relaxed drop-shadow-lg max-w-4xl">
                  {currentShot.visual}
              </div>
              {currentShot.audio_url && (
                  <div className="text-green-400 text-sm mt-3 flex items-center gap-2 animate-pulse font-mono">
                      <Volume2 size={16}/> {currentShot.audio_prompt || "Audio Playing..."}
                  </div>
              )}
            </div>
          </>
        ) : (<div className="text-slate-500 font-mono">Playlist is empty</div>)}
        
        <button onClick={() => { onClose(); audioRef.current.pause(); }} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur transition-colors"><X size={24}/></button>
      </div>
      
      {/* 进度条 */}
      <div className="w-full max-w-6xl h-1.5 bg-slate-800 relative">
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-75 ease-linear shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${((currentIndex + (progress/100)) / playlist.length) * 100}%` }} />
      </div>
      
      {/* 控制台 */}
      <div className="h-24 w-full flex items-center justify-center gap-8 bg-slate-950">
         <button onClick={() => { setCurrentIndex(0); setIsPlaying(true); }} className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"><Undo2 size={20}/></button>
         <button onClick={() => { 
             if(isPlaying){ setIsPlaying(false); audioRef.current.pause(); if(videoRef.current) videoRef.current.pause(); } 
             else { setIsPlaying(true); if(playlist[currentIndex].audio_url) audioRef.current.play(); if(playlist[currentIndex].video_url) videoRef.current.play(); } 
         }} className="p-5 rounded-full bg-white text-black hover:scale-105 transition-all shadow-xl shadow-white/20">
           {isPlaying ? <div className="w-4 h-4 bg-black rounded-sm" /> : <Play size={24} className="ml-1 fill-black"/>}
         </button>
         <div className="text-sm text-slate-500 font-mono tracking-widest">{currentIndex + 1} / {playlist.length}</div>
      </div>
      <style>{`@keyframes kenburns { 0% { transform: scale(1); } 100% { transform: scale(1.1); } }`}</style>
    </div>
  );
};

// B. 自动分镜工作台 (Storyboard Studio Main)
const StoryboardStudio = ({ onPreview }) => {
  const { 
    script, setScript, direction, setDirection, 
    shots, setShots, shotImages, setShotImages, 
    scenes, setScenes, actors, callApi, 
    assembleSoraPrompt, config 
  } = useProject();
  
  // 1. 本地状态
  const [messages, setMessages] = useState(() => JSON.parse(localStorage.getItem('sb_messages')) || [{ role: 'assistant', content: '我是您的 AI 分镜导演。请在左侧输入剧本，我来为您拆解镜头。' }]);
  const [mediaAsset, setMediaAsset] = useState(null); 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  
  // 设置参数
  const [sbAspectRatio, setSbAspectRatio] = useState(() => localStorage.getItem('sb_ar') || "16:9");
  const [sbTargetLang, setSbTargetLang] = useState(() => localStorage.getItem('sb_lang') || "English");
  const [imgStrength, setImgStrength] = useState(0.8); 
  const [useImg2Img, setUseImg2Img] = useState(true);
  
  // 交互状态 (无 Tab 模式)
  const [selectedShotIds, setSelectedShotIds] = useState([]); 
  const [showAnimatic, setShowAnimatic] = useState(false);
  const [animaticData, setAnimaticData] = useState([]); // 播放列表
  
  const chatEndRef = useRef(null);

  // 持久化
  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem('sb_ar', sbAspectRatio); }, [sbAspectRatio]);
  useEffect(() => { localStorage.setItem('sb_lang', sbTargetLang); }, [sbTargetLang]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // 2. 核心功能
  // A. 剧本分析 (Script Analysis)
  const handleAnalyzeScript = async () => {
    if (!script && !direction) return alert("请至少填写剧本或导演意图");
    setIsAnalyzing(true);
    
    // Sora 2 规范提示词
    const system = `Role: Expert Film Director & Cinematographer.
    Task: Break down the script into a professional Shot List for AI Video Generation (Sora/Kling).
    
    Rules:
    1. **Structure**: Break down into key shots (3-5 seconds each).
    2. **Camera Lingo**: Use terms like 'Truck Left', 'Dolly Zoom', 'Pan Right', 'Low Angle', 'Close-up'.
    3. **Visuals**: Describe the scene, lighting, and action vividly.
    4. **Audio**: Separate dialogue and SFX.
    5. **Format**: Return strictly a JSON Array of objects.
    
    JSON Object Structure:
    {
      "id": number,
      "duration": "5s",
      "visual": "Detailed visual description...",
      "camera_movement": "Specific camera term...",
      "audio": "Dialogue or SFX...",
      "sora_prompt": "Highly detailed prompt optimized for AI video generation..."
    }
    
    Target Language for Prompts: ${sbTargetLang} (Output visuals in ${sbTargetLang}).`;

    try {
      const res = await callApi('analysis', { 
          system, 
          user: `Script: ${script}\nDirector's Note: ${direction}`, 
          asset: mediaAsset?.data // 支持多模态输入
      });
      
      const jsonStr = res.match(/```json([\s\S]*?)```/)?.[1] || res.substring(res.indexOf('['), res.lastIndexOf(']')+1);
      const json = JSON.parse(jsonStr.trim());
      
      if (Array.isArray(json)) { 
          setShots(json); 
          setMessages(prev => [...prev, { role: 'assistant', content: `✅ 分析完成！已拆解为 ${json.length} 个标准镜头。请在中间列表查看。` }]); 
      }
    } catch (e) { 
        alert("分析失败: " + e.message); 
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ 分析出错: ${e.message}` }]);
    } finally { 
        setIsAnalyzing(false); 
    }
  };

  // B. AI 助手对话
  const handleSendMessage = async () => {
    if(!chatInput.trim()) return;
    const msg = chatInput; 
    setChatInput(""); 
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    
    try {
      const currentContext = shots.map(s => ({id: s.id, visual: s.visual}));
      const res = await callApi('analysis', {
        system: "Role: Co-Director. Task: Modify storyboard based on feedback. Return the UPDATED JSON Array ONLY if changes are made, otherwise answer normally.", 
        user: `Context: ${JSON.stringify(currentContext)}\nUser Feedback: ${msg}`
      });
      
      // 检测是否包含 JSON 更新
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      if (jsonMatch) {
          const updates = JSON.parse(jsonMatch[1]);
          setShots(updates); // 直接应用更新 (简化逻辑)
          setMessages(prev => [...prev, { role: 'assistant', content: "✅ 已根据您的意见更新了分镜表。" }]);
      } else {
          setMessages(prev => [...prev, { role: 'assistant', content: res }]);
      }
    } catch (e) { 
        setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + e.message }]); 
    }
  };

  // C. 场景组装 (Scene Assembly - Sora 2 Logic)
  // 这是你最关心的逻辑：将多个小分镜组装为大分镜
  const handleCompileScene = () => {
    if (selectedShotIds.length < 1) return alert("请至少在中间列表中勾选 1 个镜头来组装场景。");
    
    // 1. 获取选中的镜头对象 (保持 ID 顺序)
    const selectedShots = shots
        .filter(s => selectedShotIds.includes(s.id))
        .sort((a,b) => a.id - b.id);
    
    // 2. 补全镜头图片信息 (从 shotImages 缓存中取最新一张)
    const shotsWithImages = selectedShots.map(s => {
        const history = shotImages[s.id] || [];
        const imgUrl = history.length > 0 ? history[history.length-1] : null; // 可能是 url string 或 object
        return { ...s, imgUrl: (typeof imgUrl === 'object' ? imgUrl.url : imgUrl) };
    });

    // 3. 调用 Part 1 的核心引擎组装 Prompt
    // 假设第一个镜头的演员是主要演员 (简化逻辑，后续可扩展为手动指定)
    const assignedActorId = actors.length > 0 ? actors[0].id : null; 
    
    const { prompt, duration, startImg } = assembleSoraPrompt(
        shotsWithImages, 
        direction || "Cinematic", 
        assignedActorId
    );

    // 4. 生成新的 Scene 对象
    const newScene = {
        id: Date.now(),
        title: `Scene ${scenes.length + 1} (Shots ${selectedShotIds.join(',')})`,
        prompt: prompt, // 完整的 Sora Prompt
        duration: duration,
        startImg: startImg, // 首帧参考图
        shots: selectedShotIds,
        video_url: null,
        status: 'ready'
    };

    setScenes(prev => [...prev, newScene]);
    setSelectedShotIds([]); // 清空选择
    
    // 滚动到底部或提示
    setMessages(prev => [...prev, { role: 'assistant', content: `🎬 大分镜 [${newScene.title}] 组装完成！已添加到右侧列表。` }]);
  };

  // 3. 辅助函数
  const handleAssetUpload = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setMediaAsset({ type, data: reader.result, name: file.name });
    reader.readAsDataURL(file);
  };

  const playPreview = (playlistOverride) => {
      // 构建播放列表
      const list = playlistOverride || shots.map(s => {
          const history = shotImages[s.id] || [];
          const url = history.length > 0 ? (history[history.length-1].url || history[history.length-1]) : null;
          if(!url) return null;
          
          let dur = 3000;
          if (s.duration) {
             const match = s.duration.toString().match(/\d+/);
             if(match) dur = parseInt(match[0]) * 1000;
          }
          
          return {
              ...s,
              url,
              duration: dur,
              audio_url: null, // 暂未绑定音频
              video_url: null
          };
      }).filter(Boolean);

      if(list.length === 0) return alert("没有可播放的画面，请先生成镜头图片。");
      setAnimaticData(list);
      setShowAnimatic(true);
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      <AnimaticPlayer isOpen={showAnimatic} onClose={() => setShowAnimatic(false)} playlist={animaticData} />
      
      {/* 左侧：导演控制台 (Director Console) */}
      <div className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0 shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
            <h2 className="text-sm font-bold text-slate-200 flex gap-2 items-center">
                <Clapperboard size={16} className="text-purple-500"/> 导演控制台
            </h2>
            <div className="flex gap-2">
                <button onClick={() => setMediaAsset(null)} title="清空素材" className="text-slate-500 hover:text-white"><Trash2 size={14}/></button>
            </div>
        </div>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
            {/* 1. 剧本输入 */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1"><FileText size={12}/> 剧本 / 台词</span>
                    {/* 灵感按钮移到这里 */}
                    <button onClick={() => setScript(s => s + "\n(AI Idea)...")} className="text-[10px] text-yellow-500 hover:text-yellow-400 flex items-center gap-1"><Sparkles size={10}/> 灵感</button>
                </label>
                <textarea 
                    value={script} 
                    onChange={e => setScript(e.target.value)} 
                    className="w-full h-32 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-1 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600 leading-relaxed" 
                    placeholder="输入故事剧本..."
                />
            </div>
            
            {/* 2. 导演意图 */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 flex items-center gap-1"><Video size={12}/> 导演意图 / 风格</label>
                <textarea 
                    value={direction} 
                    onChange={e => setDirection(e.target.value)} 
                    className="w-full h-20 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-1 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600" 
                    placeholder="例如：赛博朋克风格，压抑的氛围，蓝紫色调..."
                />
            </div>
            
            {/* 3. 参数与多模态 */}
            <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
                 <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 全局设置</div>
                 <div className="grid grid-cols-2 gap-2">
                     <div className="space-y-1">
                         <label className="text-[10px] text-slate-500">画面比例</label>
                         <select value={sbAspectRatio} onChange={(e) => setSbAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                             <option value="16:9">16:9</option>
                             <option value="9:16">9:16</option>
                             <option value="2.35:1">2.35:1</option>
                         </select>
                     </div>
                     <div className="space-y-1">
                         <label className="text-[10px] text-slate-500">提示词语言</label>
                         <select value={sbTargetLang} onChange={(e) => setSbTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                             <option value="English">English</option>
                             <option value="Chinese">中文</option>
                         </select>
                     </div>
                 </div>
                 
                 {/* 参考素材区 */}
                 <div className="space-y-2 pt-2 border-t border-slate-700/50">
                     <label className="text-[10px] text-slate-400 flex items-center gap-1"><Upload size={10}/> 参考素材 (可选)</label>
                     <div className="flex gap-2 h-16">
                        <div className={cn("flex-1 border border-dashed rounded flex flex-col items-center justify-center cursor-pointer relative transition-all", mediaAsset?.type==='image' ? "border-purple-500 bg-slate-900" : "border-slate-700 hover:bg-slate-800")}>
                            <input type="file" accept="image/*" onChange={(e)=>handleAssetUpload(e,'image')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                            {mediaAsset?.type==='image' ? <img src={mediaAsset.data} className="w-full h-full object-cover opacity-80 rounded"/> : <ImageIcon size={16} className="text-slate-600"/>}
                        </div>
                        {/* 暂未实装 Audio/Video Upload UI 逻辑，保持 UI 简洁 */}
                     </div>
                 </div>
            </div>
            
            {/* 4. Action Button */}
            <button 
                onClick={handleAnalyzeScript} 
                disabled={isAnalyzing} 
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95"
            >
                {isAnalyzing ? <Loader2 className="animate-spin" size={18}/> : <Wand2 size={18}/>} 
                {isAnalyzing ? 'AI 分析剧本中...' : '生成分镜列表'}
            </button>
        </div>

        {/* AI 助手对话区 (Bottom) */}
        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900">
            <div className="p-2 px-4 border-b border-slate-800 text-xs font-bold text-slate-400 flex items-center gap-2">
                <MessageSquare size={12}/> AI 导演助手
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                {messages.map((m, i) => (
                    <div key={i} className={cn("rounded-lg p-2.5 text-xs shadow-sm max-w-[90%] leading-relaxed", m.role==='user'?"bg-purple-600 text-white ml-auto":"bg-slate-800 text-slate-300 border border-slate-700")}>
                        {m.content}
                    </div>
                ))}
                <div ref={chatEndRef}/>
            </div>
            <div className="p-3 border-t border-slate-800 flex gap-2">
                <input 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 transition-colors placeholder:text-slate-600" 
                    placeholder="输入修改意见 (如: 把第3镜改成特写)..."
                />
                <button onClick={handleSendMessage} className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white shadow-lg"><Send size={14}/></button>
            </div>
        </div>
      </div>
{/* 中栏：分镜列表 (Shot List) */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 border-r border-slate-800 relative">
        {/* Header */}
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/80 backdrop-blur z-20 sticky top-0">
            <div className="flex items-center gap-4">
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <LayoutGrid size={16} className="text-blue-500"/> 分镜列表 ({shots.length})
                </h2>
                {shots.length > 0 && (
                    <button 
                        onClick={() => playPreview()} 
                        className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg transition-transform active:scale-95"
                    >
                        <Play size={10} fill="currentColor"/> 播放动态分镜 (Animatic)
                    </button>
                )}
            </div>
            <div className="flex gap-2">
                <button onClick={() => {
                    const csv = "\uFEFF" + [["ID","Visual","Audio","Prompt"], ...shots.map(s => [s.id, `"${s.visual}"`, `"${s.audio}"`, `"${s.sora_prompt}"`])].map(e => e.join(",")).join("\n");
                    saveAs(new Blob([csv], {type:'text/csv;charset=utf-8;'}), "shotlist.csv");
                }} className="text-xs text-slate-500 hover:text-white flex items-center gap-1"><FileSpreadsheet size={14}/> 导出CSV</button>
            </div>
        </div>

        {/* Content - Waterfall List */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin pb-32">
            {shots.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50 gap-4">
                    <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
                        <Clapperboard size={32}/>
                    </div>
                    <p>请在左侧输入剧本并点击生成</p>
                </div>
            ) : (
                <div className="space-y-4 max-w-4xl mx-auto">
                    {shots.map((shot, idx) => {
                        // ShotCard Logic
                        const history = shotImages[shot.id] || [];
                        const currentImg = history.length > 0 ? history[history.length-1] : null;
                        const isSelected = selectedShotIds.includes(shot.id);
                        
                        // Internal Gen Handler
                        const handleShotGen = async (e) => {
                            e.stopPropagation();
                            // Set loading state locally (simulated via global update)
                            setShotImages(p => ({ ...p, [shot.id]: [...(p[shot.id]||[]), { loading: true }] }));
                            
                            try {
                                // 1. Determine Ref Image
                                let refImgData = null;
                                let refStrength = imgStrength;
                                
                                // Priority: Media Asset -> Default
                                if (mediaAsset?.type === 'image') refImgData = mediaAsset.data;
                                
                                // 2. Call Image API
                                const url = await callApi('image', {
                                    prompt: `${shot.image_prompt || shot.visual} --ar ${sbAspectRatio}`,
                                    aspectRatio: sbAspectRatio,
                                    useImg2Img: useImg2Img && !!refImgData,
                                    refImages: refImgData ? [refImgData] : null,
                                    strength: refStrength
                                });
                                
                                setShotImages(p => {
                                    const list = p[shot.id] || [];
                                    const n = [...list];
                                    n[n.length-1] = { url, loading: false };
                                    return { ...p, [shot.id]: n };
                                });
                            } catch(err) {
                                alert(err.message);
                                setShotImages(p => {
                                    const list = p[shot.id] || [];
                                    // Remove loading placeholder on error
                                    return { ...p, [shot.id]: list.filter(i => !i.loading) };
                                });
                            }
                        };

                        return (
                            <div 
                                key={shot.id} 
                                onClick={() => setSelectedShotIds(p => p.includes(shot.id) ? p.filter(i => i !== shot.id) : [...p, shot.id])}
                                className={cn(
                                    "bg-slate-900 border rounded-xl overflow-hidden flex flex-col md:flex-row group transition-all cursor-pointer relative", 
                                    isSelected ? "border-orange-500 ring-1 ring-orange-500 bg-orange-900/10" : "border-slate-800 hover:border-slate-600"
                                )}
                            >
                                {/* 左侧：图像区域 */}
                                <div className={cn("bg-black relative shrink-0 md:w-64 flex items-center justify-center", sbAspectRatio === "9:16" ? "aspect-[9/16] w-40" : "aspect-video")}>
                                    {currentImg?.loading ? (
                                        <div className="flex flex-col items-center gap-2 text-slate-500">
                                            <Loader2 className="animate-spin text-purple-500"/>
                                            <span className="text-[10px]">Rendering...</span>
                                        </div>
                                    ) : currentImg?.url ? (
                                        <div className="relative w-full h-full group/img">
                                            <img src={currentImg.url} className="w-full h-full object-cover"/>
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                <button onClick={(e) => { e.stopPropagation(); onPreview(currentImg.url); }} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Eye size={12}/></button>
                                                <button onClick={handleShotGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600"><RefreshCw size={12}/></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={handleShotGen}
                                            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-full text-xs text-slate-300 hover:text-white hover:border-purple-500 flex items-center gap-2 transition-all shadow-lg"
                                        >
                                            <Camera size={14}/> 生成画面
                                        </button>
                                    )}
                                    
                                    {/* Shot Badge */}
                                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur border border-white/10">
                                        Shot {shot.id}
                                    </div>
                                    <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1">
                                        <Clock size={10}/> {shot.duration}
                                    </div>
                                </div>

                                {/* 右侧：信息区域 */}
                                <div className="p-4 flex-1 min-w-0 flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-start">
                                            <p className="text-sm text-slate-200 font-medium leading-relaxed line-clamp-2">{shot.visual}</p>
                                            {/* 勾选框 */}
                                            <div className={cn("w-5 h-5 rounded border flex items-center justify-center transition-colors ml-4 shrink-0", isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-slate-600")}>
                                                {isSelected && <CheckCircle2 size={14}/>}
                                            </div>
                                        </div>
                                        
                                        {/* 演员选择 (解决痛点4) */}
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                            <div className="px-2 py-1 bg-slate-950 border border-slate-700 rounded flex items-center gap-2">
                                                <UserCircle2 size={12} className="text-slate-500"/>
                                                <select className="bg-transparent text-[10px] text-slate-300 outline-none w-24">
                                                    <option value="">(默认演员)</option>
                                                    {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                            </div>
                                            {shot.camera_movement && <span className="text-[10px] text-purple-400 bg-purple-900/20 px-2 py-1 rounded border border-purple-900/30">{shot.camera_movement}</span>}
                                        </div>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                        <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800">
                                            <Mic size={12} className={shot.audio?.includes('"') ? "text-blue-400" : "text-orange-400"}/>
                                            <span className="truncate">{shot.audio || "No Audio"}</span>
                                        </div>
                                        <div className="text-[9px] font-mono text-slate-500 truncate opacity-50">
                                            Prompt: {shot.sora_prompt}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* 底部悬浮操作栏 (当有选中时显示) */}
        {selectedShotIds.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-orange-500/50 shadow-2xl shadow-orange-900/20 rounded-full px-6 py-3 flex items-center gap-4 backdrop-blur animate-in slide-in-from-bottom-4 z-30">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-orange-500"/> 已选 {selectedShotIds.length} 个镜头
                </span>
                <div className="h-4 w-px bg-slate-700"/>
                <button 
                    onClick={handleCompileScene} 
                    className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow transition-all active:scale-95"
                >
                    <Layers size={14}/> 组合为大分镜 (Scene)
                </button>
                <button 
                    onClick={() => setSelectedShotIds([])} 
                    className="p-1 hover:bg-slate-700 rounded-full text-slate-400 transition-colors"
                >
                    <X size={14}/>
                </button>
            </div>
        )}
      </div>

      {/* 右栏：大分镜 / 场景 (Scene Board) */}
      <div className="w-80 md:w-96 bg-slate-900/30 flex flex-col border-l border-slate-800 shrink-0">
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Layers size={16} className="text-orange-500"/> 场景大分镜 ({scenes.length})
            </h2>
            <button onClick={() => setScenes([])} className="text-[10px] text-slate-500 hover:text-red-400">清空</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
            {scenes.length === 0 ? (
                <div className="text-center text-slate-600 text-xs mt-20 px-6 leading-relaxed">
                    <Film size={32} className="mx-auto mb-2 opacity-20"/>
                    <p>在中间列表勾选多个镜头，点击底部“组合”按钮，生成的场景卡片将出现在这里。</p>
                </div>
            ) : (
                scenes.map(scene => (
                    <div key={scene.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg group hover:border-orange-500/50 transition-all">
                        {/* 场景预览区 */}
                        <div className="aspect-video bg-black relative">
                            {scene.video_url ? (
                                <video src={scene.video_url} controls className="w-full h-full object-cover"/>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center relative">
                                    {/* 首帧背景 */}
                                    {scene.startImg && <img src={typeof scene.startImg === 'string' ? scene.startImg : scene.startImg.url} className="w-full h-full object-cover opacity-40 blur-sm"/>}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"/>
                                    
                                    {/* 生成按钮 */}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                                        <button 
                                            onClick={async () => {
                                                if(!config.video.key) return alert("请先在设置中配置视频模型 API");
                                                if(!confirm(`即将生成 ${scene.duration}秒 视频，确定吗？`)) return;
                                                
                                                // Local Loading State (Simplified)
                                                const btn = document.getElementById(`gen-btn-${scene.id}`);
                                                if(btn) { btn.innerText = "提交中..."; btn.disabled = true; }

                                                try {
                                                    const url = await callApi('video', { 
                                                        prompt: scene.prompt,
                                                        startImg: typeof scene.startImg === 'string' ? scene.startImg : scene.startImg?.url,
                                                        duration: scene.duration, // 5s or 10s
                                                        aspectRatio: sbAspectRatio
                                                    });
                                                    setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, video_url: url } : s));
                                                } catch(e) {
                                                    alert("生成失败: " + e.message);
                                                    if(btn) { btn.innerText = "生成长视频"; btn.disabled = false; }
                                                }
                                            }}
                                            id={`gen-btn-${scene.id}`}
                                            className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 text-xs transition-transform active:scale-95"
                                        >
                                            <Film size={14}/> 生成长视频 ({scene.duration}s)
                                        </button>
                                        <span className="text-[9px] text-slate-400">基于 Sora 2 / Kling</span>
                                    </div>
                                </div>
                            )}
                            
                            {/* Title Overlay */}
                            <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none">
                                <span className="bg-orange-600 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow">{scene.title}</span>
                                {scene.video_url && <span className="bg-green-600 text-white text-[10px] px-2 py-0.5 rounded shadow flex items-center gap-1"><CheckCircle2 size={10}/> 完成</span>}
                            </div>
                        </div>

                        {/* Info & Prompt */}
                        <div className="p-3 space-y-2">
                            <div className="flex justify-between text-[10px] text-slate-400">
                                <span>包含镜头: {scene.shots.join(', ')}</span>
                                <span>时长: {scene.duration}s</span>
                            </div>
                            
                            {/* Prompt Box */}
                            <div className="relative group/prompt">
                                <div className="text-[10px] text-slate-500 font-mono bg-black/30 p-2 rounded max-h-24 overflow-y-auto whitespace-pre-wrap border border-slate-800">
                                    {scene.prompt}
                                </div>
                                <button 
                                    onClick={() => { navigator.clipboard.writeText(scene.prompt); alert("提示词已复制"); }}
                                    className="absolute top-1 right-1 p-1 bg-slate-700 text-white rounded opacity-0 group-hover/prompt:opacity-100 transition-opacity"
                                    title="复制 Prompt"
                                >
                                    <Copy size={10}/>
                                </button>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 6：制片台 (Studio Board) - 剪辑与合成
// 核心职责：时间轴管理、音视频合成、全片预览
// ==========================================

const StudioBoard = ({ onPreview }) => {
  const { 
    config, shots, shotImages, scenes, 
    timeline, setTimeline, callApi 
  } = useProject();

  // 1. 本地状态
  const [activeBinTab, setActiveBinTab] = useState("shots"); // shots | scenes
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [activeClipId, setActiveClipId] = useState(null); 
  const [showPlayer, setShowPlayer] = useState(false);
  const [loadingVideoId, setLoadingVideoId] = useState(null);

  // 2. 核心逻辑
  // A. 添加到时间轴
  const addToTimeline = (item, type = 'shot') => {
    let newItem = {
        uuid: Date.now(),
        type: type === 'scene' ? 'video' : 'image',
        duration: 3000,
        audio_url: null,
        audio_prompt: "",
        video_url: null,
        visual: "",
        prompt: "" // 用于视频生成的 prompt
    };

    if (type === 'shot') {
        const history = shotImages[item.id] || [];
        const lastImg = history.length > 0 ? (history[history.length - 1].url || history[history.length - 1]) : null;
        
        if (!lastImg) return alert("该镜头还未生成图片，无法添加到时间轴。");
        
        newItem = {
            ...newItem,
            shotId: item.id,
            url: lastImg, // 首帧图
            visual: item.visual,
            audio_prompt: item.audio,
            prompt: item.sora_prompt, // 继承 Prompt
            // 如果分镜阶段没生成视频，这里暂时为空
            video_url: null 
        };
        // 尝试解析时长
        if(item.duration) {
            const match = item.duration.toString().match(/\d+/);
            if(match) newItem.duration = parseInt(match[0]) * 1000;
        }
    } else if (type === 'scene') {
        // 大分镜逻辑
        newItem = {
            ...newItem,
            sceneId: item.id,
            url: typeof item.startImg === 'string' ? item.startImg : item.startImg?.url,
            visual: item.title,
            prompt: item.prompt,
            video_url: item.video_url, // 如果已经有了视频，直接带过来
            duration: item.duration * 1000
        };
    }

    setTimeline(prev => [...prev, newItem]);
  };

  const removeFromTimeline = (uuid) => setTimeline(prev => prev.filter(c => c.uuid !== uuid));
  
  // B. 模态框控制
  const openAudioModal = (clip) => { setActiveClipId(clip.uuid); setShowAudioModal(true); };
  const openVideoModal = (clip) => { setActiveClipId(clip.uuid); setShowVideoModal(true); };

  // C. 处理音频生成回调
  const handleAudioGen = async (params) => {
    if (!activeClipId) return;
    
    // 如果没有传 audioData (即不是本地上传)，则调用 API
    let audioData = params.audioData;
    if (!audioData) {
        try {
            audioData = await callApi(params.isSFX ? 'sfx' : 'audio', { 
                text: params.text,
                input: params.text, // TTS input
                voice: params.voice, 
                speed: params.speed, 
                model: params.model 
            });
        } catch(e) {
            return alert("音频生成失败: " + e.message);
        }
    }

    const labelText = params.isSFX ? `[SFX] ${params.text}` : params.text;
    
    setTimeline(prev => prev.map(clip => 
        clip.uuid === activeClipId 
            ? { ...clip, audio_url: audioData, audio_prompt: labelText } 
            : clip
    ));
  };

  // D. 处理视频生成回调 (在时间轴上补全视频)
  const handleVideoGen = async (params) => {
    if (!activeClipId) return;
    setLoadingVideoId(activeClipId);
    
    const clip = timeline.find(c => c.uuid === activeClipId);
    if(!clip) { setLoadingVideoId(null); return; }

    try {
      // 1. 智能 Prompt 拼接
      // 如果用户在弹窗输入了 Prompt，则附加到原有 Visual 后
      const basePrompt = clip.visual || "Cinematic shot";
      const userMotion = params.prompt ? `. Action details: ${params.prompt}` : "";
      
      // 读取全局设置
      const projectAr = localStorage.getItem('sb_ar') || "16:9";
      const clipSeconds = Math.ceil(clip.duration / 1000);
      const targetDuration = Math.max(5, clipSeconds); // 最小 5s

      // 2. 组装
      const fullPrompt = `${basePrompt}${userMotion}. --ar ${projectAr} --duration ${targetDuration}s`;

      // 3. 调用 API
      const videoUrl = await callApi('video', { 
        model: params.model, 
        prompt: fullPrompt, 
        startImg: clip.url,
        duration: targetDuration, 
        aspectRatio: projectAr
      });
      
      // 4. 更新 Timeline
      setTimeline(prev => prev.map(c => {
        if (c.uuid === activeClipId) {
          return { 
              ...c, 
              video_url: videoUrl, 
              type: 'video', 
              duration: targetDuration * 1000,
              realDuration: targetDuration * 1000 // 标记真实时长
          };
        }
        return c;
      }));
      
      alert(`🎬 视频补全成功！(${targetDuration}s)`);
    } catch (e) {
      alert("视频生成失败: " + e.message);
    } finally {
      setLoadingVideoId(null);
    }
  };

  const activeClip = activeClipId ? timeline.find(c => c.uuid === activeClipId) : null;

  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      {/* 全局播放器 */}
      <AnimaticPlayer 
        isOpen={showPlayer} 
        onClose={() => setShowPlayer(false)} 
        playlist={timeline} // 直接传入 timeline
      />
      
      {/* 功能弹窗 */}
      <AudioGeneratorModal 
        isOpen={showAudioModal} 
        onClose={() => setShowAudioModal(false)} 
        initialText={activeClip?.audio_prompt} 
        onGenerate={handleAudioGen} 
      />
      <VideoGeneratorModal 
        isOpen={showVideoModal} 
        onClose={() => setShowVideoModal(false)} 
        initialPrompt={activeClip?.visual} 
        initialModel={config.video.model} 
        onGenerate={handleVideoGen} 
      />

      {/* 左侧：素材箱 (Asset Bin) */}
      <div className="w-72 flex flex-col border-r border-slate-800 bg-slate-900/50">
        <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
                <LayoutGrid size={16} className="text-orange-500"/> 素材箱
            </h2>
            {/* 分栏 Tab */}
            <div className="flex bg-slate-950 rounded p-1 border border-slate-800">
                <button 
                    onClick={() => setActiveBinTab("shots")}
                    className={cn("flex-1 py-1.5 text-xs rounded font-medium transition-all", activeBinTab==="shots"?"bg-slate-800 text-white shadow":"text-slate-500 hover:text-slate-300")}
                >
                    镜头 Shots ({shots.length})
                </button>
                <button 
                    onClick={() => setActiveBinTab("scenes")}
                    className={cn("flex-1 py-1.5 text-xs rounded font-medium transition-all", activeBinTab==="scenes"?"bg-slate-800 text-white shadow":"text-slate-500 hover:text-slate-300")}
                >
                    场景 Scenes ({scenes.length})
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
          {activeBinTab === "shots" ? (
              // 镜头列表
              shots.map(s => {
                const hasImg = shotImages[s.id]?.length > 0;
                const thumb = hasImg ? (shotImages[s.id].slice(-1)[0].url || shotImages[s.id].slice(-1)[0]) : null;
                return (
                  <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-orange-500/50 transition-all group flex gap-2 cursor-pointer relative" onClick={() => addToTimeline(s, 'shot')}>
                    <div className="w-16 h-16 bg-black rounded shrink-0 overflow-hidden relative border border-slate-800">
                      {thumb ? <img src={thumb} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">No Img</div>}
                      <div className="absolute inset-0 bg-orange-600/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity backdrop-blur-sm">
                          <PlusCircle size={20}/>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="text-xs text-slate-300 font-bold mb-1 truncate">Shot {s.id}</div>
                        <div className="text-[10px] text-slate-500 line-clamp-2 leading-tight">{s.visual}</div>
                    </div>
                  </div>
                );
              })
          ) : (
              // 场景列表 (新增需求：将大分镜加入素材箱)
              scenes.map(s => (
                  <div key={s.id} className="bg-slate-900 border border-slate-700 rounded-lg p-2 hover:border-orange-500/50 transition-all group flex gap-2 cursor-pointer relative" onClick={() => addToTimeline(s, 'scene')}>
                    <div className="w-24 h-14 bg-black rounded shrink-0 overflow-hidden relative border border-slate-800">
                      {(s.video_url || s.startImg) ? (
                          s.video_url ? <video src={s.video_url} className="w-full h-full object-cover"/> : <img src={typeof s.startImg==='string'?s.startImg:s.startImg.url} className="w-full h-full object-cover"/>
                      ) : <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">No Media</div>}
                      <div className="absolute top-0 right-0 bg-green-600 text-white text-[8px] px-1 rounded-bl shadow">Scene</div>
                      <div className="absolute inset-0 bg-orange-600/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity backdrop-blur-sm">
                          <PlusCircle size={20}/>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="text-xs text-slate-300 font-bold mb-1 truncate">{s.title}</div>
                        <div className="text-[10px] text-slate-500">{s.duration}s • {s.shots.length} shots</div>
                    </div>
                  </div>
              ))
          )}
          
          {((activeBinTab==="shots" && shots.length===0) || (activeBinTab==="scenes" && scenes.length===0)) && (
              <div className="text-xs text-slate-500 text-center mt-10 px-4">
                  暂无内容。<br/>请前往【自动分镜】生成{activeBinTab==="shots"?"镜头":"场景"}。
              </div>
          )}
        </div>
      </div>

      {/* 右侧：预览与时间轴 */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
        {/* 上部：空闲区 (未来可做成大播放器) */}
        <div className="flex-1 bg-black flex items-center justify-center relative border-b border-slate-800 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
          <div className="text-slate-600 flex flex-col items-center gap-4 animate-pulse">
              <Film size={64} className="opacity-20"/>
              <span className="text-sm font-mono opacity-50">Studio Workspace</span>
          </div>
          <div className="absolute bottom-4 text-xs text-slate-500">
              提示：点击下方时间轴片段可生成视频或配音。完成后点击“全片预览”查看效果。
          </div>
        </div>

        {/* 下部：时间轴 (Timeline) */}
        <div className="h-72 bg-slate-900 border-t border-slate-800 flex flex-col shadow-[0_-5px_20px_rgba(0,0,0,0.5)] z-20">
          {/* Timeline Toolbar */}
          <div className="h-10 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950">
            <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-slate-400 flex items-center gap-2">
                    <Clock size={12}/> Timeline ({timeline.length} clips)
                </span>
                <span className="text-[10px] text-slate-600 border-l border-slate-800 pl-4">
                    Total Duration: {(timeline.reduce((acc,cur)=>acc+(cur.duration||3000),0)/1000).toFixed(1)}s
                </span>
                <button onClick={() => { if(confirm("确定清空时间轴吗？")) setTimeline([]); }} className="text-[10px] text-slate-500 hover:text-red-400 ml-2">清空</button>
            </div>
            <button 
                onClick={() => { if(timeline.length===0) return alert("时间轴为空"); setShowPlayer(true); }} 
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-xs rounded-full font-bold transition-all shadow-lg active:scale-95"
            >
                <Play size={12} fill="currentColor"/> 全片预览 (Play All)
            </button>
          </div>

          {/* Timeline Strip */}
          <div className="flex-1 overflow-x-auto p-4 whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700 space-x-2 flex items-center bg-slate-900/50">
            {timeline.length === 0 ? (
                <div className="w-full flex items-center justify-center opacity-30 gap-2 select-none pointer-events-none">
                    <ChevronLeft size={24}/>
                    <span className="text-sm font-mono">Drag or Click clips from the Left Bin</span>
                </div>
            ) : (
              timeline.map((clip, idx) => (
                <div 
                    key={clip.uuid} 
                    className={cn(
                        "inline-block w-48 h-52 bg-slate-800 border rounded-xl overflow-hidden relative group shrink-0 transition-all flex flex-col hover:scale-[1.02] shadow-lg", 
                        loadingVideoId === clip.uuid ? "border-purple-500 ring-2 ring-purple-500/50" : "border-slate-700 hover:border-orange-500"
                    )}
                >
                  {/* Clip Preview */}
                  <div className="h-28 bg-black relative shrink-0 border-b border-slate-700">
                    {clip.video_url ? (
                        <video src={clip.video_url} className="w-full h-full object-cover" muted loop onMouseOver={e => e.target.play()} onMouseOut={e => e.target.pause()}/>
                    ) : (
                        <img src={clip.url} className="w-full h-full object-cover"/>
                    )}
                    
                    {/* Status Badges */}
                    <div className="absolute top-1 right-1 bg-black/60 px-1.5 rounded text-[9px] text-white font-mono backdrop-blur">
                        {(clip.duration/1000).toFixed(1)}s
                    </div>
                    {clip.audio_url && <div className="absolute bottom-1 right-1 bg-green-600 p-1 rounded-full text-white shadow animate-pulse"><Volume2 size={8}/></div>}
                    {clip.video_url && <div className="absolute top-1 left-1 bg-purple-600 px-1.5 rounded text-[8px] text-white flex items-center gap-1 shadow"><Film size={8}/> Video</div>}
                    
                    {/* Loading Overlay */}
                    {loadingVideoId === clip.uuid && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-purple-400 gap-1 text-[10px] flex-col backdrop-blur-sm z-20">
                            <Loader2 size={16} className="animate-spin"/>
                            <span>AI 生成中...</span>
                        </div>
                    )}
                  </div>
                  
                  {/* Clip Actions */}
                  <div className="p-2 flex-1 flex flex-col justify-between min-h-0 bg-slate-800">
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-slate-300 truncate w-24" title={clip.visual}>#{idx+1} {clip.visual || "Untitled"}</span>
                        <button onClick={() => removeFromTimeline(clip.uuid)} className="text-slate-500 hover:text-red-400 p-0.5 hover:bg-slate-700 rounded"><X size={12}/></button>
                    </div>
                    
                    <div className="space-y-1.5">
                        <button 
                            onClick={() => openVideoModal(clip)} 
                            disabled={loadingVideoId !== null || !!clip.video_url} 
                            className={cn(
                                "w-full py-1.5 text-[9px] rounded flex items-center justify-center gap-1 border transition-all font-medium", 
                                clip.video_url 
                                    ? "bg-purple-900/20 text-purple-400 border-purple-900/50 cursor-default" 
                                    : "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                            )}
                        >
                          {clip.video_url ? <><CheckCircle2 size={8}/> 视频就绪</> : loadingVideoId === clip.uuid ? "⏳ 等待中..." : <><Film size={8}/> 补全视频</>}
                        </button>
                        
                        <button 
                            onClick={() => openAudioModal(clip)} 
                            className={cn(
                                "w-full py-1.5 text-[9px] rounded flex items-center justify-center gap-1 border transition-all font-medium", 
                                clip.audio_url 
                                    ? "bg-green-900/20 text-green-400 border-green-900/50 hover:bg-green-900/30" 
                                    : "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                            )}
                        >
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
// 模块 7：主应用入口 (App Architecture)
// 核心职责：路由导航、全局弹窗管理、布局整合
// ==========================================

const AppContent = () => {
  // 1. 全局 UI 状态
  const [activeTab, setActiveTab] = useState('character'); // character | storyboard | studio
  const [showSettings, setShowSettings] = useState(false);
  const [showSlotMachine, setShowSlotMachine] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [activeModalType, setActiveModalType] = useState(null); // 'analysis' | 'image' (用于顶部快捷切换)

  // 2. 项目上下文
  const { config, setConfig, fetchModels, availableModels, isLoadingModels } = useProject();

  // 3. 快捷模型切换逻辑
  const handleQuickModelChange = (type, val) => {
    setConfig(prev => ({ 
        ...prev, 
        [type]: { ...prev[type], model: val } 
    }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-purple-500/30">
      {/* --- 全局模态框层 --- */}
      
      {/* 图片放大预览 */}
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      
      {/* 快捷模型选择器 */}
      <ModelSelectionModal 
          isOpen={activeModalType !== null} 
          title={activeModalType === 'analysis' ? "AI 分析大脑" : "AI 绘图画师"} 
          models={availableModels} 
          onClose={() => setActiveModalType(null)} 
          onSelect={(m) => handleQuickModelChange(activeModalType, m)} 
      />

      {/* 设置中心 */}
      {showSettings && (
          <ConfigCenter 
              onClose={() => setShowSettings(false)} 
              fetchModels={fetchModels} 
              availableModels={availableModels} 
              isLoadingModels={isLoadingModels}
          />
      )}
      
      {/* 灵感老虎机 */}
      {showSlotMachine && <InspirationSlotMachine onClose={() => setShowSlotMachine(false)} />}

      {/* --- 顶部导航栏 (Top Navigation) --- */}
      <div className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 z-50 shrink-0 shadow-sm">
        {/* Left: Logo & Tabs */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3 select-none">
             <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
                <Wand2 size={20} className="text-white" />
             </div>
             <div>
                <h1 className="font-bold text-lg leading-none text-white tracking-tight">AI Director</h1>
                <span className="text-[10px] text-slate-400 font-mono">v2025.12.Pro</span>
             </div>
          </div>
          
          <div className="flex bg-slate-950/50 rounded-lg p-1 border border-slate-800/50">
            <button 
                onClick={() => setActiveTab('character')} 
                className={cn(
                    "px-4 py-2 text-xs font-bold rounded-md flex items-center gap-2 transition-all", 
                    activeTab === 'character' ? "bg-slate-800 text-white shadow-md ring-1 ring-slate-700" : "text-slate-500 hover:text-slate-300"
                )}
            >
                <UserCircle2 size={14}/> 角色工坊
            </button>
            <button 
                onClick={() => setActiveTab('storyboard')} 
                className={cn(
                    "px-4 py-2 text-xs font-bold rounded-md flex items-center gap-2 transition-all", 
                    activeTab === 'storyboard' ? "bg-purple-600 text-white shadow-md shadow-purple-900/20" : "text-slate-500 hover:text-slate-300"
                )}
            >
                <LayoutGrid size={14}/> 自动分镜
            </button>
            <button 
                onClick={() => setActiveTab('studio')} 
                className={cn(
                    "px-4 py-2 text-xs font-bold rounded-md flex items-center gap-2 transition-all", 
                    activeTab === 'studio' ? "bg-orange-600 text-white shadow-md shadow-orange-900/20" : "text-slate-500 hover:text-slate-300"
                )}
            >
                <Film size={14}/> 制片台
            </button>
          </div>
        </div>
        
        {/* Right: Quick Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-3 pr-4 border-r border-slate-800">
            <ModelTrigger 
                label="分析" 
                icon={Brain} 
                value={config.analysis.model} 
                onOpenPicker={() => { setActiveModalType('analysis'); fetchModels('analysis'); }} 
                onManualChange={(v) => handleQuickModelChange('analysis', v)} 
                colorTheme="blue" 
                className="w-48"
            />
            <ModelTrigger 
                label="绘图" 
                icon={Palette} 
                value={config.image.model} 
                onOpenPicker={() => { setActiveModalType('image'); fetchModels('image'); }} 
                onManualChange={(v) => handleQuickModelChange('image', v)} 
                colorTheme="purple" 
                className="w-48"
            />
          </div>
          
          <button 
             onClick={() => setShowSlotMachine(true)} 
             className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white text-xs font-bold rounded-full shadow-lg shadow-orange-500/20 transition-all active:scale-95"
          >
             <Sparkles size={14}/> 灵感
          </button>
          
          <button 
             onClick={() => setShowSettings(true)} 
             className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-all border border-slate-800 hover:border-slate-700" 
             title="设置中心"
          >
             <Settings size={20}/>
          </button>
        </div>
      </div>

      {/* --- 主工作区 (Main Workspace) --- */}
      <div className="flex-1 overflow-hidden relative bg-slate-950">
        {/* 
            使用 display: none 而不是条件渲染 
            以保持各工作台的状态 (State Preservation) 
        */}
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

// 最终根组件：包裹 Context Provider
export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}
