import React, { useState, useMemo, useRef, useEffect, useContext, createContext } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2, Sparkles, Dices, Layers, PlusCircle, Play, UserCircle2, GripHorizontal, Users } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) { return twMerge(clsx(inputs)); }

// --- 1. 全局项目上下文 (Project Context - Phase 2: Sora V2 Protocol & Actor System) ---
const ProjectContext = createContext();
export const useProject = () => useContext(ProjectContext);

const ProjectProvider = ({ children }) => {
  // 核心工具：安全 JSON 解析
  const safeJsonParse = (key, fallback) => {
    try { 
      const item = localStorage.getItem(key); 
      return item ? JSON.parse(item) : fallback; 
    } catch (e) { 
      console.warn(`Data corrupted for ${key}, resetting to default.`); 
      return fallback; 
    }
  };

  // 核心工具：Blob 转 Base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // A. 配置中心
  const [config, setConfig] = useState(() => {
    const v3 = safeJsonParse('app_config_v3', null);
    if (v3) return v3;
    const oldKey = localStorage.getItem('gemini_key');
    return {
      analysis: { baseUrl: 'https://generativelanguage.googleapis.com', key: oldKey||'', model: 'gemini-2.0-flash-exp' }, // 升级为更快的 2.0
      image: { baseUrl: '', key: oldKey||'', model: 'nanobanana-2-pro' },
      video: { baseUrl: '', key: '', model: 'kling-v1.6' }, // 修正为稳定版
      audio: { baseUrl: 'https://api.openai.com', key: '', model: 'tts-1' }
    };
  });

  const [availableModels, setAvailableModels] = useState([]); 
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // B. 核心资产数据
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  
  // 角色工坊数据 (V2 Upgrade)
  const [clPrompts, setClPrompts] = useState(() => safeJsonParse('cl_prompts', []));
  const [clImages, setClImages] = useState(() => safeJsonParse('cl_images', {}));
  
  // 自动分镜数据
  const [shots, setShots] = useState(() => safeJsonParse('sb_shots', []));
  const [shotImages, setShotImages] = useState(() => safeJsonParse('sb_shot_images', {}));
  
  // 制片台数据
  const [timeline, setTimeline] = useState(() => safeJsonParse('studio_timeline', []));
  
  // [Upgraded] 演员库 V2
  // 结构更新: 
  // { 
  //   id: timestamp, 
  //   name: "Name", 
  //   desc: "核心提示词(外貌/服装)", 
  //   voice_tone: "Deep Male", 
  //   images: { 
  //      sheet: "设定卡URL", 
  //      portrait: "全身正面大图URL" (用于生图参考)
  //   }
  // }
  const [actors, setActors] = useState(() => safeJsonParse('studio_actors_v2', []));
  
  // [Upgraded] 大分镜 Scenes
  const [scenes, setScenes] = useState(() => safeJsonParse('sb_scenes', []));

  // 持久化监听
  useEffect(() => { localStorage.setItem('app_config_v3', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('sb_script', script); }, [script]);
  useEffect(() => { localStorage.setItem('sb_direction', direction); }, [direction]);
  useEffect(() => { localStorage.setItem('cl_prompts', JSON.stringify(clPrompts)); }, [clPrompts]);
  useEffect(() => { localStorage.setItem('cl_images', JSON.stringify(clImages)); }, [clImages]);
  useEffect(() => { localStorage.setItem('sb_shots', JSON.stringify(shots)); }, [shots]);
  useEffect(() => { localStorage.setItem('sb_shot_images', JSON.stringify(shotImages)); }, [shotImages]);
  useEffect(() => { localStorage.setItem('studio_timeline', JSON.stringify(timeline)); }, [timeline]);
  useEffect(() => { localStorage.setItem('studio_actors_v2', JSON.stringify(actors)); }, [actors]);
  useEffect(() => { localStorage.setItem('sb_scenes', JSON.stringify(scenes)); }, [scenes]);

  // 功能：获取模型列表
  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!key) return alert(`请先在设置中配置 [${type}] 的 API Key`);
    setIsLoadingModels(true); setAvailableModels([]);
    try {
      let found = [];
      try { 
        const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } }); 
        const d = await r.json(); 
        if(d.data) found = d.data.map(m=>m.id); 
      } catch(e){}
      
      if(!found.length && baseUrl.includes('google')) { 
        const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); 
        const d = await r.json(); 
        if(d.models) found = d.models.map(m=>m.name.replace('models/','')); 
      }
      
      if(found.length) { setAvailableModels([...new Set(found)].sort()); alert(`成功获取 ${found.length} 个模型`); } 
      else { alert("连接成功，但未自动获取到模型列表。请确认 API 格式。"); }
    } catch(e) { alert("连接失败: " + e.message); } 
    finally { setIsLoadingModels(false); }
  };

  // --- 核心算法：Sora V2 提示词组装器 ---
  const assembleSoraPrompt = (targetShots, globalStyle, assignedActorId) => {
    // 1. 获取全局背景与风格
    const styleHeader = `\n# Global Context\nStyle: ${globalStyle || "Cinematic, high fidelity, 8k resolution"}.`;
    
    // 2. 获取演员信息 (如果指定了)
    let actorContext = "";
    let mainActor = null;
    if (assignedActorId) {
        mainActor = actors.find(a => a.id.toString() === assignedActorId.toString());
        if (mainActor) {
            actorContext = `\nCharacter: ${mainActor.desc || mainActor.name}. (Maintain consistency based on reference).`;
        }
    }

    // 3. 构建时间轴脚本 (Script)
    let currentTime = 0;
    const scriptBody = targetShots.map((s, idx) => {
        let dur = 5; // 默认 5s
        if (s.duration && s.duration.match(/\d+/)) dur = parseInt(s.duration.match(/\d+/)[0]);
        if (s.duration && s.duration.includes('ms')) dur = dur / 1000;
        
        const start = currentTime; 
        const end = currentTime + dur;
        currentTime = end;

        // 动作描述
        let action = s.visual || s.sora_prompt;
        // 确保动作描述包含"Who"
        if (mainActor && !action.toLowerCase().includes(mainActor.name.toLowerCase())) {
            action = `(Character) ${action}`;
        }
        
        // 摄像机运动
        const camera = s.camera_movement ? ` Camera: ${s.camera_movement}.` : "";
        // 对话/音效标记
        const audio = s.audio ? (s.audio.includes('"') ? ` [Dialogue: "${s.audio}"]` : ` [SFX: ${s.audio}]`) : "";

        return `[${start}s-${end}s] Shot ${idx+1}: ${action}.${camera}${audio}`;
    }).join("\nCUT TO:\n");

    // 4. 技术参数 (Footer)
    // 凑整到 5s/10s (Sora/Kling 偏好)
    const finalDuration = Math.ceil(currentTime / 5) * 5; 
    const specs = `\n\n# Technical Specs\n--duration ${finalDuration}s --quality high`;

    return {
        prompt: `${styleHeader}${actorContext}\n\n# Timeline Script\n${scriptBody}${specs}`,
        duration: finalDuration,
        actorRef: mainActor ? mainActor.images.portrait : null // 返回正面照作为视频生成的 startImg 参考
    };
  };

  // 功能：通用 API 调用器
  const callApi = async (type, payload) => {
    const { baseUrl, key, model: configModel } = config[type];
    const activeModel = payload.model || configModel; 
    
    if (!key) throw new Error(`请先配置 [${type}] 的 API Key`);

    // 1. 文本分析 (LLM)
    if (type === 'analysis') {
        const { system, user, asset } = payload;
        
        let mimeType = null, base64Data = null;
        if (asset) { 
          const d = asset.data || asset; 
          if (typeof d === 'string' && d.includes(';base64,')) {
             const parts = d.split(';base64,');
             mimeType = parts[0].split(':')[1]; 
             base64Data = parts[1]; 
          } else if (typeof d === 'string' && d.startsWith('http')) {
              // 处理 URL 情况 (简单跳过或需要后端代理，这里假设直接传URL给支持的模型)
              // 注意：大部分前端直接调 LLM 传 URL 会跨域或不支持，最好是 Base64
          }
        }

        // Google Native
        if (baseUrl.includes('google') && !baseUrl.includes('openai')) {
            const parts = [{ text: system + "\n" + user }];
            if (base64Data) parts.push({ inlineData: { mimeType, data: base64Data } });
            
            const r = await fetch(`${baseUrl}/v1beta/models/${activeModel}:generateContent?key=${key}`, { 
              method: 'POST', 
              headers: {'Content-Type': 'application/json'}, 
              body: JSON.stringify({ contents: [{ parts }] }) 
            });
            if(!r.ok) throw new Error((await r.json()).error?.message || "Gemini Error");
            return (await r.json()).candidates[0].content.parts[0].text;
        }

        // OpenAI Compatible
        const content = [{ type: "text", text: user }];
        if (base64Data) {
           content.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } });
        }
        
        const r = await fetch(`${baseUrl}/v1/chat/completions`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
          body: JSON.stringify({
            model: activeModel,
            messages: [{ role: "system", content: system }, { role: "user", content }]
          }) 
        });
        if(!r.ok) throw new Error((await r.json()).error?.message || "LLM API Error");
        return (await r.json()).choices[0].message.content;
    }

    // 2. 绘图 (Image) - 增强版，支持 Actor 注入
    if (type === 'image') {
        let { prompt, aspectRatio, useImg2Img, refImg, strength, actorId } = payload;
        
        // --- 核心逻辑：如果指定了演员，强制注入 Prompt 和 Reference ---
        if (actorId) {
            const actor = actors.find(a => a.id.toString() === actorId.toString());
            if (actor) {
                // 1. 提示词前置注入
                prompt = `(Character: ${actor.desc}), ${prompt}`;
                // 2. 参考图强制替换 (如果没有手动指定其他参考图)
                if (!refImg && actor.images?.portrait) {
                    refImg = actor.images.portrait;
                    useImg2Img = true;
                    // 演员参考通常需要较高的一致性，但不能完全覆盖动作
                    if (!strength) strength = 0.65; 
                }
            }
        }

        let size = "1024x1024";
        if (aspectRatio === "16:9") size = "1280x720";
        else if (aspectRatio === "9:16") size = "720x1280";
        else if (aspectRatio === "2.35:1") size = "1536x640"; 
        
        const body = { model: activeModel, prompt, n: 1, size };

        if (useImg2Img && refImg) { 
          const imgData = refImg.includes('base64,') ? refImg.split('base64,')[1] : refImg;
          body.image = imgData; 
          body.strength = parseFloat(strength || 0.7); 
        }
        
        const r = await fetch(`${baseUrl}/v1/images/generations`, { 
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
          body: JSON.stringify(body) 
        });
        
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || "Image Gen Error");
        return data.data?.[0]?.url;
    }

    // 3. 配音 (Audio) - 增强版，支持 Actor 音色
    if (type === 'audio') {
        let { input, voice, speed, actorId } = payload;
        
        // 自动应用演员音色 (如果 API 支持 voice cloning，这里可以扩展，目前以预设 voice 映射为例)
        if (actorId && !voice) {
            const actor = actors.find(a => a.id.toString() === actorId.toString());
            // 简单的关键词映射，实际可改为 ElevenLabs 的 Voice ID
            if (actor?.voice_tone?.toLowerCase().includes('male')) voice = 'onyx';
            else if (actor?.voice_tone?.toLowerCase().includes('female')) voice = 'nova';
        }

        const r = await fetch(`${baseUrl}/v1/audio/speech`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: activeModel, input, voice: voice || 'alloy', speed: speed || 1.0 })
        });
        if (!r.ok) throw new Error((await r.json()).error?.message || "TTS Error");
        return await blobToBase64(await r.blob());
    }

    // 4. 音效 (SFX)
    if (type === 'sfx') {
        const { prompt, duration } = payload;
        const isEleven = baseUrl.includes('elevenlabs');
        const endpoint = isEleven ? '/v1/sound-generation' : '/v1/audio/sound-effects'; 
        const body = { text: prompt, duration_seconds: duration || 5 };
        if (!isEleven) body.model = activeModel || 'eleven-sound-effects'; 
        const r = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error("SFX Error");
        return await blobToBase64(await r.blob());
    }

    // 5. 视频 (Video) - 增强版，支持长轮询
    if (type === 'video') {
        const { prompt, startImg, duration, aspectRatio } = payload; 
        const body = {
            model: activeModel, prompt, image: startImg, duration: duration || 5, 
            aspect_ratio: aspectRatio || "16:9", size: "1080p" 
        };

        const submitRes = await fetch(`${baseUrl}/v1/videos/generations`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        
        if (!submitRes.ok) throw new Error((await submitRes.json()).error?.message || "Video Submit Failed");
        const submitData = await submitRes.json();
        const taskId = submitData.id || submitData.data?.id;
        
        if (!taskId && submitData.data?.[0]?.url) return submitData.data[0].url; // 同步返回
        if (!taskId) throw new Error("No Task ID");

        // Polling
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
        throw new Error("Video Timeout");
    }
  };

  const value = {
    config, setConfig,
    script, setScript, direction, setDirection,
    clPrompts, setClPrompts, clImages, setClImages,
    shots, setShots, shotImages, setShotImages,
    timeline, setTimeline,
    actors, setActors, scenes, setScenes,
    callApi, fetchModels, availableModels, isLoadingModels,
    assembleSoraPrompt // 导出这个新功能给 Storyboard 用
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

// --- 组件库 (UI Components) ---

// A. 模型选择器 (支持滚轮、分类)
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
      "OpenAI": all.filter(m => m.includes('gpt')||m.includes('o1')||m.includes('dall')||m.includes('tts')), 
      "Google": all.filter(m => m.includes('gemini')||m.includes('banana')||m.includes('imagen')), 
      "Image": all.filter(m => ['flux','midjourney','banana','sd','recraft'].some(k=>m.includes(k))), 
      "Video": all.filter(m => ['kling','luma','runway','sora','hailuo'].some(k=>m.includes(k))) 
    };
  }, [models, search]);
  
  const tabs = ["All", "OpenAI", "Google", "Image", "Video"];
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4 shrink-0">
          <div className="flex justify-between items-center"><h3 className="text-white font-bold flex gap-2"><LayoutGrid size={20} className="text-blue-500"/> 选择模型: <span className="text-blue-400">{title}</span></h3><button onClick={onClose}><X size={20}/></button></div>
          <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索模型 ID..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-blue-500"/>
        </div>
        <div ref={scrollRef} onWheel={handleWheel} className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 shrink-0 overflow-x-auto scrollbar-none"><div className="flex gap-2 pb-3 min-w-max">{tabs.map(tab=><button key={tab} onClick={()=>setActiveTab(tab)} className={cn("px-4 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap", activeTab===tab?"bg-blue-600 border-blue-500 text-white":"bg-slate-800 border-slate-700 text-slate-400")}>{tab}</button>)}</div></div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {categorizedModels[activeTab]?.map(m=><button key={m} onClick={()=>{onSelect(m);onClose()}} className="group flex justify-between items-center p-3 rounded border border-slate-800 bg-slate-900 hover:border-blue-500 text-left transition-all"><span className="text-sm text-slate-300 group-hover:text-white truncate font-mono">{m}</span><ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-blue-400"/></button>)}
        </div>
      </div>
    </div>
  );
};

// B. 模型触发器 (带颜色、铅笔)
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, colorTheme = "slate", className }) => {
  const [isManual, setIsManual] = useState(false);
  const themes = { slate: { border: "border-slate-700", icon: "text-slate-400", bg: "bg-slate-900" }, blue: { border: "border-blue-900/50", icon: "text-blue-400", bg: "bg-blue-950/20 hover:border-blue-700" }, purple: { border: "border-purple-900/50", icon: "text-purple-400", bg: "bg-purple-950/20 hover:border-purple-700" } };
  const t = themes[colorTheme] || themes.slate;
  return (
    <div className={cn("flex items-center rounded-lg border transition-all h-9 group", t.bg, t.border, className || "w-40 md:w-56")}>
      <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full shrink-0 select-none"><Icon size={14} className={t.icon}/><span className={cn("text-xs font-medium hidden lg:inline", t.icon)}>{label}</span></div>
      <div className="flex-1 px-2 h-full flex items-center min-w-0 cursor-pointer" onClick={!isManual?onOpenPicker:undefined}>{isManual?<input value={value} onChange={e=>onManualChange(e.target.value)} className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono" autoFocus onBlur={()=>setIsManual(false)}/>:<div className="w-full flex justify-between items-center text-xs text-slate-300 font-mono"><span className="truncate mr-1">{value||"Default"}</span><ChevronDown size={12} className="opacity-50"/></div>}</div>
      <button onClick={e=>{e.stopPropagation();setIsManual(!isManual)}} className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50 shrink-0 hover:bg-white/5"><Pencil size={12}/></button>
    </div>
  );
};

// C. 配置中心 (全功能)
const ConfigCenter = ({ onClose, fetchModels, availableModels, isLoadingModels }) => {
  const { config, setConfig } = useProject();
  const [activeTab, setActiveTab] = useState("analysis");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], [key]: value } }));
  const tabs = [{id:"analysis",label:"大脑 (LLM)",icon:Brain,color:"text-blue-400"},{id:"image",label:"画师 (Image)",icon:Palette,color:"text-purple-400"},{id:"video",label:"摄像 (Video)",icon:Film,color:"text-orange-400"},{id:"audio",label:"录音 (Audio)",icon:Mic,color:"text-green-400"}];
  const cur = config[activeTab];
  return (
    <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4 md:p-8" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[80vh] rounded-2xl flex overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="w-64 bg-slate-950 border-r border-slate-800 p-4 space-y-2 flex flex-col">
          <div className="mb-4"><h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="text-blue-500"/> 设置中心</h2></div>
          {tabs.map(t=><button key={t.id} onClick={()=>setActiveTab(t.id)} className={cn("w-full flex gap-3 px-4 py-3 rounded-lg transition-all text-left", activeTab===t.id?"bg-slate-800 text-white border border-slate-700":"text-slate-400 hover:bg-slate-900")}><t.icon size={18} className={activeTab===t.id?t.color:""}/><span>{t.label}</span></button>)}
        </div>
        <div className="flex-1 p-8 space-y-6 overflow-y-auto bg-slate-900">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
             <h3 className="text-2xl font-bold text-white">{tabs.find(t=>t.id===activeTab).label} 配置</h3>
             <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg transition-transform active:scale-95">完成设定</button>
          </div>
          <div className="space-y-4">
             <h4 className="text-sm font-bold text-slate-300 uppercase flex gap-2"><Server size={14}/> 连接参数</h4>
             <div className="space-y-2"><label className="text-xs text-slate-400">Base URL</label><input value={cur.baseUrl} onChange={e=>updateConfig('baseUrl',e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white outline-none focus:border-blue-500"/></div>
             <div className="space-y-2"><label className="text-xs text-slate-400">API Key</label><input type="password" value={cur.key} onChange={e=>updateConfig('key',e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white outline-none focus:border-blue-500"/></div>
          </div>
          <div className="space-y-4 pt-4 border-t border-slate-800">
             <div className="flex justify-between"><label className="text-xs text-slate-400">Model ID</label><button onClick={()=>fetchModels(activeTab)} className="text-xs text-blue-400 flex gap-1"><RefreshCw size={12}/> 获取列表</button></div>
             <ModelTrigger label="当前模型" icon={LayoutGrid} value={cur.model} onOpenPicker={()=>{fetchModels(activeTab);setShowModelPicker(true)}} onManualChange={v=>updateConfig('model',v)} className="w-full" variant="horizontal" colorTheme={tabs.find(t=>t.id===activeTab).color.split('-')[1]}/>
             <p className="text-[10px] text-slate-500 mt-2">推荐: gpt-5.2-pro, gemini-3-pro, nanobanana-2-pro, kling-v2.6, tts-1-hd</p>
          </div>
        </div>
      </div>
      <ModelSelectionModal isOpen={showModelPicker} models={availableModels} onClose={()=>setShowModelPicker(false)} onSelect={m=>updateConfig('model',m)} title={activeTab}/>
    </div>
  );
};

// D. 图片预览 (Zoom & Pan)
const ImagePreviewModal = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({x:0,y:0});
  const [drag, setDrag] = useState(false);
  const start = useRef({x:0,y:0});
  useEffect(()=>{const h=e=>{e.preventDefault();setScale(s=>Math.max(0.5,Math.min(5,s-e.deltaY*0.001)))};document.addEventListener('wheel',h,{passive:false});return()=>document.removeEventListener('wheel',h)},[]);
  if(!url) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center overflow-hidden" onClick={onClose}>
      <img src={url} className="max-w-full max-h-full object-contain cursor-move transition-transform duration-75" style={{transform:`scale(${scale}) translate(${pos.x/scale}px,${pos.y/scale}px)`}} onMouseDown={e=>{if(scale>1){setDrag(true);start.current={x:e.clientX-pos.x,y:e.clientY-pos.y}}}} onMouseMove={e=>{if(drag)setPos({x:e.clientX-start.current.x,y:e.clientY-start.current.y})}} onMouseUp={()=>setDrag(false)} onClick={e=>e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-red-600"><X size={24}/></button>
      <div className="absolute top-4 right-16 bg-slate-800/80 px-3 py-1 rounded-full text-xs text-white">{(scale*100).toFixed(0)}%</div>
    </div>
  );
};

// E. 真·AI 灵感老虎机 (True AI - Phase 1 Updated)
const InspirationSlotMachine = ({ onClose }) => {
  const { setScript, setDirection, callApi } = useProject();
  const [spinning, setSpinning] = useState(false);
  const [aiResult, setAiResult] = useState(null); // AI 返回的真实灵感

  const handleAiSpin = async () => {
    setSpinning(true); setAiResult(null);
    try {
      // 使用 LLM 生成独特创意
      const prompt = `Brainstorm 3 unique, high-concept film ideas. For ONE of them, return valid JSON: {"genre": "...", "theme": "...", "visual_style": "...", "logline": "..."}. Make it creative and avant-garde.`;
      const res = await callApi('analysis', { system: "Creative Director. JSON output only.", user: prompt });
      const jsonStr = res.match(/\{[\s\S]*\}/)?.[0];
      if (jsonStr) {
        const data = JSON.parse(jsonStr);
        setAiResult(data);
      } else { throw new Error("Format Error"); }
    } catch(e) {
      // 降级方案：随机预设
      setAiResult({ genre: "赛博朋克", theme: "AI觉醒", visual_style: "霓虹雨夜", logline: "降级模式：网络连接失败，请检查 API。" });
    } finally { setSpinning(false); }
  };

  const apply = () => {
    if (!aiResult) return;
    setScript(`(创意概念：${aiResult.logline})\n\n[开场]...`);
    setDirection(`类型：${aiResult.genre}\n主题：${aiResult.theme}\n视觉：${aiResult.visual_style}`);
    onClose(); alert("✨ AI 灵感已注入！");
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gradient-to-br from-indigo-900 to-purple-900 border border-purple-500/50 w-full max-w-md rounded-2xl p-8 shadow-2xl text-center" onClick={e=>e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-white mb-2 flex justify-center gap-2"><Sparkles className="text-yellow-400"/> AI 灵感风暴</h2>
        <p className="text-xs text-purple-200 mb-6">由大语言模型实时生成的绝妙点子</p>
        
        {spinning ? (
          <div className="h-32 flex flex-col items-center justify-center space-y-4 animate-pulse">
            <Loader2 size={48} className="text-yellow-400 animate-spin"/>
            <div className="text-sm text-purple-200">正在连接宇宙脑波...</div>
          </div>
        ) : aiResult ? (
          <div className="mb-6 space-y-3 animate-in fade-in zoom-in">
             <div className="grid grid-cols-2 gap-3 text-left">
                <div className="bg-black/30 p-2 rounded"><div className="text-[10px] text-purple-400">Genre</div><div className="text-sm text-white font-bold">{aiResult.genre}</div></div>
                <div className="bg-black/30 p-2 rounded"><div className="text-[10px] text-purple-400">Visual</div><div className="text-sm text-white font-bold">{aiResult.visual_style}</div></div>
             </div>
             <div className="bg-black/30 p-3 rounded text-left"><div className="text-[10px] text-purple-400 mb-1">Logline</div><div className="text-xs text-slate-200 leading-relaxed">{aiResult.logline}</div></div>
          </div>
        ) : <div className="h-32 flex items-center justify-center text-purple-300/50">点击下方按钮开始探索</div>}

        <button onClick={handleAiSpin} disabled={spinning} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-lg rounded-xl mb-3 shadow-lg flex items-center justify-center gap-2"><Brain size={20}/> {spinning?"构思中...":"生成 AI 创意"}</button>
        {aiResult && <button onClick={apply} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm">采用此方案</button>}
      </div>
    </div>
  );
};

// F. 配音与视频弹窗 (Modals)
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
// --- 组件：动态分镜播放器 (Animatic Player - Video/Audio Mixed) ---
const AnimaticPlayer = ({ isOpen, onClose, shots, images, customPlaylist }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(new Audio()); 
  const videoRef = useRef(null);

  // 1. 构建播放列表
  const playlist = useMemo(() => {
    if (customPlaylist) return customPlaylist;
    // 降级兼容：从自动分镜数据构建
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

  // 2. 媒体同步播放逻辑
  useEffect(() => {
    if (!isOpen || !playlist[currentIndex]) return;
    const item = playlist[currentIndex];
    
    // 音频处理
    if (item.audio_url) {
      audioRef.current.src = item.audio_url;
      audioRef.current.volume = 1.0;
      audioRef.current.play().catch(e=>{});
    } else { audioRef.current.pause(); }

    // 视频处理
    if (item.video_url && videoRef.current) {
        videoRef.current.src = item.video_url;
        videoRef.current.play().catch(e=>{});
    }
  }, [currentIndex, isOpen, playlist]);

  // 3. 计时器与进度条
  useEffect(() => {
    if (!isPlaying || playlist.length === 0) return;
    const item = playlist[currentIndex];
    // 如果是视频，优先使用视频时长(但这里为了简单统一使用 duration)
    const stepTime = 50; 
    const totalSteps = item.duration / stepTime;
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
               {/* 区分视频和图片渲染 */}
               {currentShot.video_url ? (
                 <video ref={videoRef} src={currentShot.video_url} className="w-full h-full object-contain" muted={false} />
               ) : (
                 <img src={currentShot.url} className="w-full h-full object-contain animate-[kenburns_10s_ease-out_forwards]" style={{ transformOrigin: 'center center', animationDuration: `${currentShot.duration + 2000}ms` }} />
               )}
            </div>
            {/* 字幕遮罩 */}
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
      
      {/* 底部控制 */}
      <div className="h-20 w-full flex items-center justify-center gap-6 bg-slate-900 border-t border-slate-800">
         <button onClick={() => { setCurrentIndex(0); setIsPlaying(true); }} className="p-3 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors"><Undo2 size={20}/></button>
         <button onClick={() => { if(isPlaying){setIsPlaying(false);audioRef.current.pause();if(videoRef.current)videoRef.current.pause();} else {setIsPlaying(true);if(playlist[currentIndex].audio_url)audioRef.current.play();if(playlist[currentIndex].video_url)videoRef.current.play();} }} className="p-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg scale-110 transition-transform">
           {isPlaying ? <div className="w-4 h-4 bg-white rounded-sm" /> : <div className="w-0 h-0 border-t-8 border-t-transparent border-l-[16px] border-l-white border-b-8 border-b-transparent ml-1" />}
         </button>
         <div className="text-xs text-slate-500 font-mono">{currentIndex + 1} / {playlist.length}</div>
      </div>
      <style>{`@keyframes kenburns { 0% { transform: scale(1); } 100% { transform: scale(1.05); } }`}</style>
    </div>
  );
};

// ==========================================
// 模块 2：角色工坊 (CharacterLab - V4.4: Final Polish)
// ==========================================
const CharacterLab = ({ onPreview }) => {
  const { clPrompts, setClPrompts, clImages, setClImages, actors, setActors, callApi } = useProject();
  
  // 基础状态
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [referenceImage, setReferenceImage] = useState(() => { try { return localStorage.getItem('cl_ref') || null; } catch(e) { return null; } });
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('cl_ar') || "16:9");
  const [imgStrength, setImgStrength] = useState(0.65);
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 设定卡高级状态
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [sheetParams, setSheetParams] = useState({ name: "", voice: "", visual: "", style: "" }); 
  const [suggestedVoices, setSuggestedVoices] = useState([]); 
  const [selectedRefIndices, setSelectedRefIndices] = useState([]); 
  
  // 双图生成状态
  const [genStatus, setGenStatus] = useState('idle'); 
  const [generatedAssets, setGeneratedAssets] = useState({ portrait: null, sheet: null });

  // 详情查看
  const [viewingActor, setViewingActor] = useState(null);

  // 本地存储
  const safeSave = (key, val) => { try { localStorage.setItem(key, val); } catch (e) {} };
  useEffect(() => { safeSave('cl_desc', description); }, [description]);
  useEffect(() => { if(referenceImage) safeSave('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { safeSave('cl_lang', targetLang); }, [targetLang]);
  useEffect(() => { safeSave('cl_ar', aspectRatio); }, [aspectRatio]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 3 * 1024 * 1024) alert("⚠️ 图片过大，建议压缩后上传。");
        const reader = new FileReader();
        reader.onloadend = () => { setReferenceImage(reader.result); try{localStorage.setItem('cl_ref', reader.result)}catch(e){} };
        reader.readAsDataURL(file); 
    }
  };

  // --- 1. 核心：9视角生成 ---
  const handleGenerateViews = async () => {
    setIsGenerating(true); setClPrompts([]); setClImages({});
    const angleRequirements = "Face Close-up (Front), Face Close-up (Side), Full Body (Front), Full Body (Back), Full Body (Side), Dynamic Action Pose, Wide Angle Cinematic, Expression (Joy), Expression (Anger)";
    const langTip = targetLang === "Chinese" ? "Output prompts in Chinese." : "Output prompts in English.";
    
    const system = `Role: Character Concept Artist.
    Task: Create 9 distinct camera view prompts.
    Requirements:
    1. STRICTLY return a JSON Array: [{"title": "...", "prompt": "..."}].
    2. Titles MUST be: ${angleRequirements}.
    3. Analyze the uploaded reference image (if any) for style and visual details.
    4. ${langTip}`;

    try {
      const res = await callApi('analysis', { system, user: `Description: ${description}`, asset: referenceImage });
      let jsonStr = res.match(/\[[\s\S]*\]/)?.[0] || res;
      setClPrompts(JSON.parse(jsonStr));
    } catch(e) { alert("构思失败: " + e.message); } finally { setIsGenerating(false); }
  };

  const handleImageGen = async (idx, item, ar, useImg, ref, str) => {
    setClImages(prev => ({ ...prev, [idx]: [...(prev[idx] || []), { loading: true }] }));
    try {
      const fullPrompt = `(Character View: ${item.title}), ${item.prompt} --ar ${ar}`;
      const url = await callApi('image', { prompt: fullPrompt, aspectRatio: ar, useImg2Img: useImg, refImg: ref, strength: str });
      setClImages(prev => { 
          const h = [...(prev[idx]||[])].filter(i => !i.loading); 
          return { ...prev, [idx]: [...h, { url, loading: false, timestamp: Date.now() }] }; 
      });
    } catch(e) { 
      setClImages(prev => { 
          const h = [...(prev[idx]||[])].filter(i => !i.loading); 
          return { ...prev, [idx]: [...h, { error: e.message, loading: false }] }; 
      });
    }
  };

  // --- 2. 设定卡高级流程 (AI 深度分析 V2) ---
  const openSheetModal = async () => {
    setShowSheetModal(true); 
    setGenStatus('analyzing');
    setGeneratedAssets({ portrait: null, sheet: null });
    setSelectedRefIndices([]);
    setSuggestedVoices([]);

    try {
        const refContext = clImages[0]?.[0]?.url || referenceImage;
        // Prompt 升级：强调服装细节提取
        const system = `Role: Senior Art Director & Casting Director.
        Task: Analyze the character input and return a JSON object (NO Markdown).
        Fields:
        1. "visual": Detailed Appearance, specific Outfit breakdown (Top, Bottom, Shoes, Accessories, Colors), Hair, Eyes. (NO actions, NO background).
        2. "style": Art style description (e.g., Cyberpunk, 3D Disney, Ink Painting).
        3. "personality": Brief personality traits.
        4. "voice_tags": Array of 4-6 strings. Specific voice descriptions in Chinese (e.g., ["清冷御姐", "慵懒烟嗓"]).
        
        Language: Chinese (Simplified).`;
        
        const res = await callApi('analysis', { system, user: `Input: ${description}`, asset: refContext });
        const data = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
        
        setSheetParams({
            name: "",
            voice: "",
            visual: data.visual || description,
            style: data.style || "Cinematic"
        });
        setSuggestedVoices(data.voice_tags || ["标准中性", "活力少年", "温柔女声"]);
    } catch(e) { console.error(e); } finally { setGenStatus('idle'); }
  };

  const toggleRefSelection = (idx) => {
      setSelectedRefIndices(prev => {
          if (prev.includes(idx)) return prev.filter(i => i !== idx);
          if (prev.length >= 5) return prev; 
          return [...prev, idx];
      });
  };

  // --- 3. 双图生成核心逻辑 (V4.4 结构化优化) ---
  const handleGenAllAssets = async () => {
    setGenStatus('gen_portrait');
    
    let mainRefImg = null;
    if (selectedRefIndices.length > 0) {
        const idx = selectedRefIndices[0];
        const hist = clImages[idx];
        if (hist && hist.length > 0) mainRefImg = hist[hist.length-1].url;
    } else {
        mainRefImg = referenceImage;
    }

    try {
        // A. 生成定妆照 (Half-Body for Face ID)
        const portraitPrompt = `
(Best Quality Character Portrait, Half-Body Close-up).
${sheetParams.visual}
${sheetParams.style}
(Composition: Half-body shot, focus on face and upper outfit, looking at camera, neutral or slight smile).
(Environment: Clean studio lighting, solid neutral background).
--ar 3:4
        `.trim();
        
        const portraitUrl = await callApi('image', { 
            prompt: portraitPrompt, aspectRatio: "9:16", 
            useImg2Img: !!mainRefImg, refImg: mainRefImg, strength: 0.50 // 略微降低权重以保证半身构图准确
        });
        setGeneratedAssets(prev => ({ ...prev, portrait: portraitUrl }));

        // B. 生成设定图 (Strict Layout)
        setGenStatus('gen_sheet');
        const sheetMasterPrompt = `
(Professional Character Design Sheet for ${sheetParams.name || "Character"}).
${sheetParams.visual}
${sheetParams.style}

## Layout Requirements (Strict 16:9 Composition)
1. [LEFT SIDE]: Full Body Views. (Front View, Side View, Back View). Standing pose.
2. [CENTER]: Large Headshots. (Neutral, Happy, Angry/Serious). Focus on facial features.
3. [RIGHT SIDE]: Outfit Breakdown & Accessories close-up.

(Background: Simple white or grey technical background).
--ar 16:9
        `.trim();

        const sheetUrl = await callApi('image', { 
            prompt: sheetMasterPrompt, aspectRatio: "16:9",
            useImg2Img: !!mainRefImg, refImg: mainRefImg, strength: 0.55
        });
        setGeneratedAssets(prev => ({ ...prev, sheet: sheetUrl }));

        setGenStatus('done');

    } catch(e) { 
        alert("生成中断: " + e.message); 
        setGenStatus('idle'); 
    }
  };

  const handleRegister = () => {
      if(!sheetParams.name || !generatedAssets.portrait || !generatedAssets.sheet) return alert("请补全信息并等待图片生成完毕");
      
      const newActor = {
          id: Date.now(),
          name: sheetParams.name,
          desc: `${sheetParams.visual}, ${sheetParams.style}`, 
          voice_tone: sheetParams.voice || "Neutral",
          images: { sheet: generatedAssets.sheet, portrait: generatedAssets.portrait }
      };
      setActors(prev => [...prev, newActor]);
      setShowSheetModal(false);
      alert(`✅ 演员【${sheetParams.name}】已签约！\n定妆照(半身)与设定卡(横版)已归档。`);
  };

  // --- 4. 下载修复 (含提示词文本) ---
  const downloadPack = async () => {
      const zip = new JSZip();
      const folder = zip.folder("character_pack");
      
      let promptsText = "=== Character Prompts ===\n\n";

      // 9视角
      for (let i = 0; i < clPrompts.length; i++) {
          const item = clPrompts[i];
          promptsText += `[${item.title}]\n${item.prompt}\n-------------------\n\n`;

          const hist = clImages[i];
          if (hist && hist.length > 0) {
              const img = hist[hist.length-1];
              if (img.url && !img.error) folder.file(`view_${i+1}_${item.title.replace(/\s+/g,'_')}.png`, await fetch(img.url).then(r=>r.blob()));
          }
      }
      // 添加文本文件
      folder.file("all_prompts.txt", promptsText);
      
      saveAs(await zip.generateAsync({type:"blob"}), "character_views.zip");
  };

  // --- 子组件：GridCard ---
  const GridCard = ({ item, index }) => {
      const history = clImages[index] || [];
      const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
      useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
      const current = history[verIndex] || {};
      const arClass = aspectRatio === "16:9" ? "aspect-video" : aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-square";
      return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col relative">
              <div className={cn("bg-black relative w-full shrink-0", arClass)}>
                  {current.loading ? <div className="absolute inset-0 flex items-center justify-center flex-col gap-2"><Loader2 className="animate-spin text-blue-500"/><span className="text-[10px] text-slate-500">绘制中...</span></div>
                  : current.url ? (
                      <div className="relative w-full h-full group/img">
                          <img src={current.url} className="w-full h-full object-cover cursor-zoom-in" onClick={()=>onPreview(current.url)}/>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                              <button onClick={()=>saveAs(current.url, `${item.title}.png`)} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={12}/></button>
                              <button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600"><RefreshCw size={12}/></button>
                          </div>
                      </div>
                  ) : (<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[1px]"><button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1"><Camera size={12}/> 生成</button></div>)}
                  <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white backdrop-blur pointer-events-none">{item.title}</div>
                  {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur z-20 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={verIndex<=0} onClick={()=>setVerIndex(v=>v-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={()=>setVerIndex(v=>v+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
              </div>
              <div className="p-2 bg-slate-900/50 border-t border-slate-800"><p className="text-[10px] text-slate-500 font-mono line-clamp-2 select-all hover:text-slate-300 transition-colors" title={item.prompt}>{item.prompt}</p></div>
          </div>
      );
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      {/* 左侧控制区 */}
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 shrink-0 z-10">
         <div className="p-4 overflow-y-auto flex-1 scrollbar-thin space-y-6">
            <div className="flex items-center gap-2 font-bold text-slate-200"><UserCircle2 size={18} className="text-blue-400"/> 角色工坊</div>
            <div className="relative group"><input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" /><label htmlFor="ref-img" className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 overflow-hidden transition-all">{referenceImage ? (<img src={referenceImage} className="w-full h-full object-cover opacity-80" />) : (<div className="text-slate-500 flex flex-col items-center"><Upload size={20} className="mb-2"/><span className="text-xs">上传参考图</span></div>)}</label></div>
            <div className="space-y-2"><label className="text-sm font-medium text-slate-300">角色描述</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="描述你的角色，例如：一位穿着赛博朋克夹克的银发少女..."/></div>
            
            <div className="grid grid-cols-2 gap-2 bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                <div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="Chinese">中文</option><option value="English">English</option></select></div>
                <div className="col-span-2 pt-2 border-t border-slate-700/50 flex items-center justify-between"><span className="text-[10px] text-slate-400">参考权重</span>{useImg2Img && referenceImage && <input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-24 h-1 bg-slate-700 rounded-lg accent-blue-500"/>}<input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>
            </div>

            <div className="space-y-2">
                <button onClick={handleGenerateViews} disabled={isGenerating} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin" size={16}/> : <LayoutGrid size={16}/>} 生成 9 大视角</button>
                <button onClick={openSheetModal} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2"><FileText size={16}/> 制作设定卡 & 签约</button>
            </div>

            {actors.length > 0 && (
                <div className="pt-4 border-t border-slate-800">
                    <div className="flex justify-between items-center mb-2"><h4 className="text-xs font-bold text-slate-400">已签约演员 ({actors.length})</h4><button onClick={()=>saveAs(new Blob([JSON.stringify(actors)], {type: "application/json"}), "actors.json")} title="备份"><Download size={12} className="text-slate-500 hover:text-white"/></button></div>
                    <div className="grid grid-cols-4 gap-2">
                        {actors.map(actor => (
                            <div key={actor.id} onClick={()=>setViewingActor(actor)} className="aspect-square rounded-lg border border-slate-700 bg-slate-800 overflow-hidden relative cursor-pointer hover:border-blue-500 group">
                                <img src={actor.images.portrait} className="w-full h-full object-cover"/>
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] text-white p-1 text-center">{actor.name}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
         </div>
      </div>

      {/* 右侧：9 宫格 */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-950">
          <div className="h-12 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm shrink-0">
             <h2 className="text-slate-400 text-sm font-bold">视角预览 ({clPrompts.length})</h2>
             <div className="flex items-center gap-2">
                {clPrompts.length > 0 && <button onClick={downloadPack} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-colors"><Download size={12}/> 打包全部</button>}
                {clPrompts.length > 0 && <button onClick={() => clPrompts.forEach((p, idx) => handleImageGen(idx, p, aspectRatio, useImg2Img, referenceImage, imgStrength))} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold shadow transition-colors"><Camera size={12}/> 全部渲染</button>}
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
                {clPrompts.map((item, idx) => <GridCard key={idx} item={item} index={idx} />)}
             </div>
             {clPrompts.length === 0 && <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50"><Users size={64}/><p className="mt-4">暂无内容，请先在左侧开始生成</p></div>}
          </div>
      </div>

      {/* 弹窗：设定卡与定妆照工坊 (V4.4) */}
      {showSheetModal && (
        <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setShowSheetModal(false)}>
           <div className="bg-slate-900 border border-purple-500/30 w-full max-w-6xl h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e=>e.stopPropagation()}>
              <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950 shrink-0">
                 <h3 className="text-base font-bold text-white flex items-center gap-2"><FileText className="text-purple-400" size={18}/> 角色定妆与签约中心</h3>
                 <button onClick={()=>setShowSheetModal(false)}><X size={18} className="text-slate-500 hover:text-white"/></button>
              </div>
              
              <div className="flex-1 flex overflow-hidden">
                 {/* 左侧：智能分析与输入 */}
                 <div className="w-80 border-r border-slate-800 p-5 bg-slate-900/50 flex flex-col overflow-y-auto scrollbar-thin">
                    {genStatus === 'analyzing' ? (
                       <div className="flex-1 flex flex-col items-center justify-center gap-4 text-purple-400">
                          <Brain className="animate-pulse" size={48}/>
                          <p className="text-xs text-center px-4 leading-relaxed">AI 正在深度分析角色特征...<br/>提取外貌 / 丰富穿搭细节 / 匹配声线</p>
                       </div>
                    ) : (
                      <div className="space-y-5 animate-in slide-in-from-left-4">
                         <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase">角色真名 (Name)</label><input value={sheetParams.name} onChange={e=>setSheetParams({...sheetParams, name:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-bold placeholder:font-normal" placeholder="✨ 给 TA 起个好听的名字"/></div>
                         
                         <div className="space-y-2">
                             <label className="text-[10px] text-slate-400 font-bold uppercase">声线 / 性格 (Voice)</label>
                             <input value={sheetParams.voice} onChange={e=>setSheetParams({...sheetParams, voice:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" placeholder="🎧 点击下方标签或手动输入"/>
                             <div className="flex flex-wrap gap-1.5">
                                 {suggestedVoices.map(tag => (
                                     <button key={tag} onClick={()=>setSheetParams(p=>({...p, voice:tag}))} className="px-2 py-0.5 bg-purple-900/30 border border-purple-800 text-purple-200 text-[10px] rounded-full hover:bg-purple-800 transition-colors">{tag}</button>
                                 ))}
                             </div>
                         </div>
                         
                         <div className="space-y-1"><label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><Eye size={10}/> 外貌特征 (Visual)</label><textarea value={sheetParams.visual} onChange={e=>setSheetParams({...sheetParams, visual:e.target.value})} className="w-full h-32 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500" placeholder="包含五官、发型、详细的服饰材质颜色..."/></div>
                         <div className="space-y-1"><label className="text-[10px] text-pink-400 font-bold uppercase flex items-center gap-1"><Palette size={10}/> 艺术风格 (Style)</label><textarea value={sheetParams.style} onChange={e=>setSheetParams({...sheetParams, style:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-pink-500" placeholder="例如：赛博朋克、吉卜力风格、写实电影感..."/></div>

                         <div className="pt-4 border-t border-slate-800">
                             <label className="text-[10px] text-slate-400 font-bold mb-2 block">参考素材 (最多选5张)</label>
                             <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto scrollbar-none">
                                 {Object.entries(clImages).map(([idx, hist]) => {
                                     const img = hist && hist.length>0 ? hist[hist.length-1] : null;
                                     if(!img || !img.url) return null;
                                     const isSelected = selectedRefIndices.includes(parseInt(idx));
                                     return (
                                         <div key={idx} onClick={()=>toggleRefSelection(parseInt(idx))} className={cn("aspect-square rounded border-2 overflow-hidden relative cursor-pointer transition-all", isSelected ? "border-green-500 opacity-100" : "border-transparent opacity-40 hover:opacity-100")}>
                                             <img src={img.url} className="w-full h-full object-cover"/>
                                             {isSelected && <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center"><CheckCircle2 size={16} className="text-white"/></div>}
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                      </div>
                    )}
                 </div>

                 {/* 右侧：双图生成结果 */}
                 <div className="flex-1 p-6 bg-black flex flex-col">
                    <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
                        {/* 左：半身定妆照 */}
                        <div className="flex flex-col gap-2">
                             <div className="text-xs font-bold text-slate-400 flex items-center gap-2"><Camera size={14}/> 核心定妆照 (Half-Body Portrait)</div>
                             <div className="flex-1 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30 flex items-center justify-center relative group">
                                 {genStatus === 'gen_portrait' ? <div className="text-blue-400 flex flex-col items-center gap-2"><Loader2 size={32} className="animate-spin"/><span className="text-xs">正在拍摄半身定妆照...</span></div>
                                 : generatedAssets.portrait ? <img src={generatedAssets.portrait} className="w-full h-full object-contain cursor-zoom-in" onClick={()=>onPreview(generatedAssets.portrait)}/>
                                 : <div className="text-slate-600 text-xs">等待生成</div>}
                             </div>
                             <div className="text-[10px] text-slate-500 text-center">用于后续分镜的 Face ID 锁定</div>
                        </div>
                        {/* 右：结构化设定图 */}
                        <div className="flex flex-col gap-2">
                             <div className="text-xs font-bold text-slate-400 flex items-center gap-2"><LayoutGrid size={14}/> 角色设定图 (Layout Sheet)</div>
                             <div className="flex-1 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30 flex items-center justify-center relative group">
                                 {genStatus === 'gen_sheet' ? <div className="text-pink-400 flex flex-col items-center gap-2"><Loader2 size={32} className="animate-spin"/><span className="text-xs">正在绘制左中右结构设定...</span></div>
                                 : generatedAssets.sheet ? <img src={generatedAssets.sheet} className="w-full h-full object-contain cursor-zoom-in" onClick={()=>onPreview(generatedAssets.sheet)}/>
                                 : <div className="text-slate-600 text-xs">等待生成</div>}
                             </div>
                             <div className="text-[10px] text-slate-500 text-center">左:全身 | 中:表情特写 | 右:穿搭</div>
                        </div>
                    </div>

                    <div className="h-16 mt-6 flex gap-4 shrink-0">
                        <button onClick={handleGenAllAssets} disabled={genStatus !== 'idle' && genStatus !== 'done'} className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                           {genStatus !== 'idle' && genStatus !== 'done' ? <Loader2 className="animate-spin"/> : <Wand2 size={18}/>} 
                           {genStatus === 'done' ? "重新生成素材" : "开始制作 (定妆照 + 设定卡)"}
                        </button>
                        {generatedAssets.portrait && generatedAssets.sheet && (
                             <button onClick={handleRegister} className="w-64 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 animate-in slide-in-from-right-4">
                                <CheckCircle2 size={18}/> 确认签约入驻
                             </button>
                        )}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 弹窗：演员详情 */}
      {viewingActor && (
         <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setViewingActor(null)}>
            <div className="bg-slate-900 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex" onClick={e=>e.stopPropagation()}>
               <div className="w-1/2 bg-black relative">
                   <img src={viewingActor.images.portrait} className="w-full h-full object-cover"/>
                   <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4"><h3 className="text-2xl font-bold text-white">{viewingActor.name}</h3><span className="text-xs bg-purple-900 text-purple-200 px-2 py-0.5 rounded ml-2">{viewingActor.voice_tone}</span></div>
               </div>
               <div className="w-1/2 p-6 bg-slate-900 flex flex-col">
                   <div className="mb-4">
                       <h4 className="text-xs font-bold text-slate-500 mb-2">设定图 (Sheet)</h4>
                       <img src={viewingActor.images.sheet} className="w-full h-24 object-cover rounded border border-slate-700 cursor-zoom-in" onClick={()=>onPreview(viewingActor.images.sheet)}/>
                   </div>
                   <div className="flex-1 overflow-y-auto mb-4">
                       <h4 className="text-xs font-bold text-slate-500 mb-1">核心描述 (Prompt)</h4>
                       <p className="text-xs text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800">{viewingActor.desc}</p>
                   </div>
                   <button onClick={()=>{setActors(p=>p.filter(a=>a.id!==viewingActor.id));setViewingActor(null)}} className="w-full py-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-white border border-red-900 rounded flex items-center justify-center gap-2 text-xs transition-colors"><Trash2 size={14}/> 解除签约</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
// ==========================================
// 模块 3：自动分镜工作台 (StoryboardStudio - Fully Restored)
// ==========================================
const StoryboardStudio = ({ onPreview }) => {
  const { script, setScript, direction, setDirection, shots, setShots, shotImages, setShotImages, scenes, setScenes, actors, callApi } = useProject();
  
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
  
  // 多选与场景模式状态
  const [selectedShotIds, setSelectedShotIds] = useState([]); 
  const [activeTab, setActiveTab] = useState("shots"); // shots | scenes
  
  const chatEndRef = useRef(null);

  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem('sb_ar', sbAspectRatio); }, [sbAspectRatio]);
  useEffect(() => { localStorage.setItem('sb_lang', sbTargetLang); }, [sbTargetLang]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pendingUpdate]);

  // 简化的历史记录占位 (实际逻辑在 ProjectProvider)
  const pushHistory = (newShots) => setShots(newShots);
  const handleUndo = () => {}; 
  const handleRedo = () => {}; 

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
    // 恢复：专业导演 Prompt + 运镜术语
    const system = `Role: Expert Film Director. Task: Create a Shot List for Video Generation.
    Requirements: 
    1. Break down script into key shots.
    2. **Camera Lingo**: You MUST use professional camera terms like 'Truck Left', 'Dolly Zoom', 'Pan Right', 'Tilt Up', 'Extreme Close-up'.
    3. Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "image_prompt":"..."}]. 
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
        system: "Role: Co-Director. Task: Modify storyboard. Update visual/audio/sora_prompt/image_prompt. Return JSON array ONLY.", 
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

  const toggleShotSelection = (id) => setSelectedShotIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const compileScene = () => {
    if (selectedShotIds.length < 1) return alert("请至少选择 1 个镜头");
    const selectedShots = shots.filter(s => selectedShotIds.includes(s.id)).sort((a,b) => a.id - b.id);
    
    // 1. 计算时间戳脚本
    let currentTime = 0;
    const scriptParts = selectedShots.map(s => {
        let dur = 5; if (s.duration && s.duration.match(/\d+/)) dur = parseInt(s.duration.match(/\d+/)[0]);
        if (s.duration && s.duration.includes('ms')) dur = dur / 1000;
        
        const start = currentTime; const end = currentTime + dur;
        currentTime = end;
        
        let audioTag = s.audio ? (s.audio.includes('"') ? `[Dialogue: "${s.audio}"]` : `[SFX: ${s.audio}]`) : "";
        return `[${start}s-${end}s] Shot ${s.id}: ${s.visual}. Camera: ${s.sora_prompt}. ${audioTag}`;
    });

    const masterPrompt = `
# Global Context
Style: Cinematic, high fidelity, 8k resolution.
Environment: ${direction || "Consistent with script"}.

# Timeline Script
${scriptParts.join("\nCUT TO:\n")}

# Technical Specs
--ar ${sbAspectRatio} --duration ${currentTime}s --quality high
    `.trim();

    // 2. 生成 Scene 对象
    const newScene = {
        id: Date.now(),
        title: `Scene ${scenes.length + 1} (Shots ${selectedShotIds.join(',')})`,
        prompt: masterPrompt,
        duration: currentTime,
        startImg: shotImages[selectedShots[0].id]?.slice(-1)[0] || null, 
        video_url: null,
        shots: selectedShotIds
    };

    setScenes([...scenes, newScene]);
    setSelectedShotIds([]);
    setActiveTab("scenes");
    alert("✨ 大分镜组装完成！");
  };

  const handleGenSceneVideo = async (scene) => {
    const arMatch = scene.prompt.match(/--ar\s+(\d+:\d+)/); const ar = arMatch ? arMatch[1] : sbAspectRatio;
    try {
        const url = await callApi('video', { model: 'kling-v2.6', prompt: scene.prompt, startImg: typeof scene.startImg === 'string' ? scene.startImg : scene.startImg?.url, aspectRatio: ar, duration: scene.duration });
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, video_url: url } : s)); alert("🎬 大分镜视频生成成功！");
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
        if (selectedActorId) {
            const actor = actors.find(a => a.id.toString() === selectedActorId);
            if (actor) {
                try { const r = await fetch(actor.url); const b = await r.blob(); const reader = new FileReader(); refImgData = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(b); }); } catch(e) {}
            }
        } else if (currentAsset?.type === 'image') { refImgData = currentAsset.data; }
        const url = await callApi('image', { prompt: shot.image_prompt, aspectRatio: currentAr, useImg2Img: !!refImgData, refImg: refImgData, strength: currentStrength }); 
        addImageToShot(shot.id, url); 
      } catch(e) { alert(e.message); } finally { setLoading(false); } 
    };
    
    const handlePreview = () => { if(currentUrl) onPreview(currentUrl); };

    return (
      <div className={cn("bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group transition-all hover:border-purple-500/50", selectedShotIds.includes(shot.id) ? "border-orange-500 bg-orange-900/10 ring-1 ring-orange-500" : "")}>
        {/* 修复：group/media 用于悬浮显示 */}
        <div className={cn("bg-black relative shrink-0 md:w-72 group/media", currentAr === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video")}>
          {loading ? <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div> 
          : currentUrl ? <div className="relative w-full h-full cursor-zoom-in" onClick={handlePreview}>
              <img src={currentUrl} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity"><button onClick={(e)=>{e.stopPropagation();saveAs(currentUrl, `shot_${shot.id}.png`)}} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><Download size={12}/></button><button onClick={(e)=>{e.stopPropagation();gen()}} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><RefreshCw size={12}/></button></div>
            </div> 
          : <div className="absolute inset-0 flex items-center justify-center"><button onClick={gen} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"><Camera size={14}/> 生成画面</button></div>}
          
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur pointer-events-none">Shot {shot.id}</div>
          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1 pointer-events-none"><Clock size={10}/> {shot.duration}</div>
          
          {/* 修复：悬浮翻页 */}
          {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/media:opacity-100 transition-opacity z-20"><button disabled={verIndex<=0} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v-1)}} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v+1)}} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
        </div>

        {/* 右侧区域 */}
        <div className="p-4 flex-1 space-y-3 min-w-0 flex flex-col justify-center relative" onClick={()=>toggleShotSelection(shot.id)}>
          {/* 防误触 Checkbox */}
          <button onClick={(e)=>{e.stopPropagation();toggleShotSelection(shot.id)}} className={cn("absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center transition-all", selectedShotIds.includes(shot.id)?"bg-orange-500 border-orange-500 text-white":"border-slate-600 text-transparent hover:border-orange-500")}><CheckCircle2 size={14}/></button>

          <div className="flex items-start justify-between gap-8 pr-6"><div className="text-sm text-slate-200 font-medium leading-relaxed">{shot.visual}</div></div>
          <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
             <select value={selectedActorId} onChange={(e) => setSelectedActorId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded text-[10px] text-slate-300 p-1 outline-none focus:border-purple-500 max-w-[120px]"><option value="">(无指定演员)</option>{actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
             {selectedActorId && <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 size={10}/> 角色锁定</span>}
          </div>
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
             <div className="pt-2 border-t border-slate-700/50 space-y-2"><div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考图权重</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>{useImg2Img && mediaAsset?.type === 'image' && (<div className="space-y-1 animate-in fade-in"><div className="flex justify-between text-[10px] text-slate-500"><span>Weight: {imgStrength}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/></div>)}</div>
          </div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Upload size={12}/> 多模态素材</label><div className="grid grid-cols-3 gap-2 h-20">
              {/* 恢复：文字标签 */}
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors", mediaAsset?.type==='image'?"border-purple-500 bg-purple-900/20":"border-slate-600 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="image/*" onChange={(e)=>handleAssetUpload(e,'image')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='image' ? <><img src={mediaAsset.data} className="w-full h-full object-cover opacity-80"/><button onClick={(e)=>clearAsset(e)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500 z-10"><X size={10}/></button></> : <><ImageIcon size={16} className="mb-1"/><span className="text-[10px]">图片</span></>}</div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors", mediaAsset?.type==='audio'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="audio/*" onChange={(e)=>handleAssetUpload(e,'audio')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='audio' ? <Mic size={16} className="text-purple-400"/> : <><Mic size={16} className="text-slate-500 mb-1"/><span className="text-[10px]">音频</span></>}</div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors", mediaAsset?.type==='video'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}><input type="file" accept="video/*" onChange={(e)=>handleAssetUpload(e,'video')} className="absolute inset-0 opacity-0 cursor-pointer"/>{mediaAsset?.type==='video' ? <Film size={16} className="text-purple-400"/> : <><Film size={16} className="text-slate-500 mb-1"/><span className="text-[10px]">视频</span></>}</div>
          </div></div>
          <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} {isAnalyzing ? '分析中...' : '生成分镜表'}</button>
          <button onClick={compileScene} disabled={selectedShotIds.length < 2} className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"><Layers size={16}/> 组合为大分镜 ({selectedShotIds.length})</button>
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
                <div className="flex justify-between items-center mb-4 px-1 sticky top-0 z-20 bg-slate-950/80 backdrop-blur py-2">
                   <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2><button onClick={()=>setShowAnimatic(true)} className="ml-4 flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg"><Film size={12}/> 播放预览</button></div>
                   <div className="flex gap-2">
                       {/* 恢复：CSV 下载按钮 */}
                       <button onClick={() => handleDownload('csv')} className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1 transition-colors"><FileSpreadsheet size={12}/> 导出 CSV</button>
                       <button onClick={() => handleDownload('all')} className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors"><Download size={12}/> 打包全部</button>
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
                            {/* 修复：语法错误修正 */}
                            {scene.video_url ? <video src={scene.video_url} controls className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center relative">{scene.startImg && <><img src={typeof scene.startImg==='string'?scene.startImg:scene.startImg.url} className="w-full h-full object-cover opacity-50"/><div className="absolute inset-0 bg-black/60"/></>}<div className="absolute inset-0 flex items-center justify-center z-10"><button onClick={()=>handleGenSceneVideo(scene)} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"><Film size={18}/> 生成长视频 ({scene.duration}s)</button></div></div>}
                            <div className="absolute top-2 left-2 bg-orange-600 text-white text-[10px] px-2 py-1 rounded font-bold shadow">{scene.title}</div>
                        </div>
                        <div className="p-4 space-y-2">
                            <div className="text-xs text-slate-500 font-mono bg-black/30 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap select-all">{scene.prompt}</div>
                            <div className="flex justify-between items-center text-xs text-slate-400"><span>包含 {scene.shots.length} 个镜头</span><button onClick={()=>navigator.clipboard.writeText(scene.prompt)} className="hover:text-white"><Copy size={12}/></button></div>
                        </div>
                    </div>
                ))}
                {scenes.length === 0 && <div className="col-span-full text-center text-slate-600 mt-20">暂无大分镜。请在“分镜 Shot”标签页选中多个镜头进行组合。</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 4：制片台 (StudioBoard - Final Phase: Timeline & Video Production)
// ==========================================
const StudioBoard = ({ onPreview }) => {
  const { config, shots, shotImages, timeline, setTimeline, callApi } = useProject();
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [activeClipId, setActiveClipId] = useState(null); 
  const [showPlayer, setShowPlayer] = useState(false);
  const [loadingVideoId, setLoadingVideoId] = useState(null);

  const addToTimeline = (shot) => {
    const history = shotImages[shot.id] || [];
    const lastImg = history.length > 0 ? (history[history.length - 1].url || history[history.length - 1]) : null;
    if (!lastImg) return alert("该镜头还未生成图片。");
    const newClip = {
      uuid: Date.now(), shotId: shot.id, visual: shot.visual, audio_prompt: shot.audio, 
      audio_url: null, video_url: null, url: lastImg, duration: 3000, type: 'image'
    };
    setTimeline([...timeline, newClip]);
  };

  const removeFromTimeline = (uuid) => setTimeline(timeline.filter(clip => clip.uuid !== uuid));
  
  const openAudioModal = (clip) => { setActiveClipId(clip.uuid); setShowAudioModal(true); };
  const openVideoModal = (clip) => { setActiveClipId(clip.uuid); setShowVideoModal(true); };

  const handleAudioGen = async (params) => {
    if (!activeClipId) return;
    let audioData = params.audioData ? params.audioData : await callApi(params.isSFX ? 'sfx' : 'audio', { input: params.text, voice: params.voice, speed: params.speed, prompt: params.text, model: params.model });
    let labelText = params.isSFX ? `[SFX] ${params.text}` : params.text;
    setTimeline(prev => prev.map(clip => clip.uuid === activeClipId ? { ...clip, audio_url: audioData, audio_prompt: labelText } : clip));
  };

  // [核心] 视频生成逻辑 - 动态参数版
  const handleVideoGen = async (params) => {
    if (!activeClipId) return;
    setLoadingVideoId(activeClipId);
    
    const clip = timeline.find(c => c.uuid === activeClipId);
    if(!clip) { setLoadingVideoId(null); return; }

    try {
      // 1. 智能提示词拼装
      const visualPart = clip.visual || "Cinematic shot";
      const cameraPart = clip.sora_prompt ? `. Camera movement: ${clip.sora_prompt}` : "";
      
      let audioPart = "";
      if (clip.audio_prompt) {
          audioPart = clip.audio_prompt.includes('"') ? `. Dialogue context: ${clip.audio_prompt}` : `. Audio atmosphere: ${clip.audio_prompt}`;
      }

      const userMotion = params.prompt ? `. Action: ${params.prompt}` : "";
      
      // --- [动态参数获取] ---
      // 从 LocalStorage 读取 Storyboard 设置的画幅 (默认16:9)
      const projectAr = localStorage.getItem('sb_ar') || "16:9";
      
      // 获取分镜时长 (向上取整到 5s 以适配 Kling 限制)
      const clipSeconds = Math.ceil(clip.duration / 1000);
      const targetDuration = Math.max(5, clipSeconds); 

      // 3. 构建动态规格指令
      const specsPart = `--ar ${projectAr} --duration ${targetDuration}s --quality high`;
      const fullPrompt = `${visualPart}${cameraPart}${userMotion}${audioPart}. ${specsPart}`;

      // 4. 调用 API
      const videoUrl = await callApi('video', { 
        model: params.model, 
        prompt: fullPrompt, 
        startImg: clip.url,
        duration: targetDuration, 
        aspectRatio: projectAr
      });
      
      // 5. 更新时间轴 (将时长更新为视频的实际时长)
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

  const handlePlayAll = () => { if (timeline.length === 0) return alert("时间轴为空"); setShowPlayer(true); };
  const activeClip = activeClipId ? timeline.find(c => c.uuid === activeClipId) : null;

  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      <AudioGeneratorModal isOpen={showAudioModal} onClose={() => setShowAudioModal(false)} initialText={activeClip?.audio_prompt} onGenerate={handleAudioGen} />
      <VideoGeneratorModal isOpen={showVideoModal} onClose={() => setShowVideoModal(false)} initialPrompt={activeClip?.visual} initialModel={config.video.model} onGenerate={handleVideoGen} />
      <AnimaticPlayer isOpen={showPlayer} onClose={() => setShowPlayer(false)} shots={[]} images={{}} customPlaylist={timeline} />

      <div className="w-72 flex flex-col border-r border-slate-800 bg-slate-900/50">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center"><h2 className="text-sm font-bold text-slate-200 flex gap-2"><LayoutGrid size={16} className="text-orange-500"/> 素材箱</h2><span className="text-xs text-slate-500">{shots.length} 个镜头</span></div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
          {shots.map(s => {
            const hasImg = shotImages[s.id]?.length > 0;
            const thumb = hasImg ? (shotImages[s.id].slice(-1)[0].url || shotImages[s.id].slice(-1)[0]) : null;
            return (
              <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-orange-500/50 transition-all group flex gap-2 cursor-pointer" onClick={() => addToTimeline(s)}>
                <div className="w-16 h-16 bg-black rounded shrink-0 overflow-hidden relative">
                  {thumb ? <img src={thumb} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">No Img</div>}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"><PlusCircle size={16}/></div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center"><div className="text-xs text-slate-300 font-bold mb-1 truncate">Shot {s.id}</div><div className="text-[10px] text-slate-500 line-clamp-2 leading-tight">{s.visual}</div></div>
              </div>
            );
          })}
          {shots.length === 0 && <div className="text-xs text-slate-500 text-center mt-10">请先在【自动分镜】生成镜头</div>}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 bg-black flex items-center justify-center relative border-b border-slate-800">
          <div className="text-slate-600 flex flex-col items-center gap-2"><Film size={48} className="opacity-20"/><span className="text-sm">点击底部“全片预览”查看效果</span></div>
        </div>
        <div className="h-64 bg-slate-900 border-t border-slate-800 flex flex-col">
          <div className="h-10 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950">
            <div className="flex items-center gap-4"><span className="text-xs font-bold text-slate-400 flex items-center gap-2"><Clock size={12}/> 时间轴 ({timeline.length} clips)</span><button onClick={() => setTimeline([])} className="text-[10px] text-slate-500 hover:text-red-400">清空</button></div>
            <button onClick={handlePlayAll} className="flex items-center gap-1.5 px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded-full font-bold transition-all"><Play size={12}/> 全片预览</button>
          </div>
          <div className="flex-1 overflow-x-auto p-4 whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700 space-x-2 flex items-center">
            {timeline.length === 0 ? (<div className="w-full text-center text-slate-600 text-xs">👈 从左侧素材箱点击镜头添加到此处</div>) : (
              timeline.map((clip, idx) => (
                <div key={clip.uuid} className={cn("inline-block w-40 h-44 bg-slate-800 border rounded-lg overflow-hidden relative group shrink-0 transition-all flex flex-col", loadingVideoId===clip.uuid ? "border-purple-500 animate-pulse" : "border-slate-700 hover:border-orange-500")}>
                  <div className="h-24 bg-black relative shrink-0">
                    {clip.video_url ? <video src={clip.video_url} className="w-full h-full object-cover" muted loop onMouseOver={e=>e.target.play()} onMouseOut={e=>e.target.pause()}/> : <img src={clip.url} className="w-full h-full object-cover"/>}
                    {clip.audio_url && <div className="absolute bottom-1 right-1 bg-green-600 p-1 rounded-full text-white shadow"><Volume2 size={8}/></div>}
                    {clip.video_url && <div className="absolute top-1 left-1 bg-purple-600 px-1.5 rounded text-[8px] text-white flex items-center gap-1"><Film size={8}/> Video</div>}
                    <div className="absolute top-1 right-1 bg-black/60 px-1.5 rounded text-[9px] text-white">{clip.duration/1000}s</div>
                    {loadingVideoId===clip.uuid && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-purple-400 gap-1 text-[10px]"><Loader2 size={12} className="animate-spin"/> 生成中...</div>}
                  </div>
                  <div className="p-2 flex-1 flex flex-col justify-between min-h-0">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-orange-400 truncate w-20">#{idx+1} Shot {clip.shotId}</span><button onClick={() => removeFromTimeline(clip.uuid)} className="text-slate-500 hover:text-red-400"><X size={10}/></button></div>
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
// 主应用入口 (App - The Final Architecture)
// ==========================================
const AppContent = () => {
  const [activeTab, setActiveTab] = useState('character'); 
  const [showSettings, setShowSettings] = useState(false);
  const [showSlotMachine, setShowSlotMachine] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  // 新增：用于顶部快捷选择的状态
  const [activeModalType, setActiveModalType] = useState(null); 

  const { config, setConfig, fetchModels, availableModels, isLoadingModels } = useProject();

  // 快捷切换处理
  const handleQuickModelChange = (type, val) => {
    setConfig(prev => ({ ...prev, [type]: { ...prev[type], model: val } }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      
      {/* 快捷选择弹窗 */}
      <ModelSelectionModal isOpen={activeModalType !== null} title={activeModalType === 'analysis' ? "分析模型" : "绘图模型"} models={availableModels} onClose={() => setActiveModalType(null)} onSelect={(m) => handleQuickModelChange(activeModalType, m)} />

      {showSettings && <ConfigCenter onClose={() => setShowSettings(false)} fetchModels={fetchModels} availableModels={availableModels} isLoadingModels={isLoadingModels}/>}
      {showSlotMachine && <InspirationSlotMachine onClose={() => setShowSlotMachine(false)} />}

      {/* Top Navigation */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20"><Wand2 size={18} className="text-white" /></div><h1 className="font-bold text-lg hidden lg:block tracking-tight text-white">AI 导演工坊</h1></div>
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <button onClick={()=>setActiveTab('character')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='character'?"bg-slate-700 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><ImageIcon size={14}/> 角色工坊</button>
            <button onClick={()=>setActiveTab('storyboard')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='storyboard'?"bg-purple-600 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><Clapperboard size={14}/> 自动分镜</button>
            {/* 新增：制片台 Tab */}
            <button onClick={()=>setActiveTab('studio')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='studio'?"bg-orange-600 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><Layers size={14}/> 制片台</button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:flex gap-3">
            <ModelTrigger label="分析" icon={Server} value={config.analysis.model} onOpenPicker={() => { setActiveModalType('analysis'); fetchModels('analysis'); }} onManualChange={(v) => handleQuickModelChange('analysis', v)} colorTheme="blue" />
            <ModelTrigger label="绘图" icon={Palette} value={config.image.model} onOpenPicker={() => { setActiveModalType('image'); fetchModels('image'); }} onManualChange={(v) => handleQuickModelChange('image', v)} colorTheme="purple" />
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
        {/* 新增：制片台视图 */}
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






