import React, { useState, useMemo, useRef, useEffect, useContext, createContext } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2, Sparkles, Dices, Layers, PlusCircle, Play, UserCircle2, GripHorizontal, Users } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) { return twMerge(clsx(inputs)); }

// --- 1. 全局项目上下文 (Project Context - V6.0: Blob Architecture & Smart Compression) ---
const ProjectContext = createContext();

export const useProject = () => {
  return useContext(ProjectContext);
};

const ProjectProvider = ({ children }) => {
  // 核心工具：安全 JSON 解析 (防止读取坏数据导致白屏)
  const safeJsonParse = (key, fallback) => {
    try {
      const item = localStorage.getItem(key);
      if (item) {
        return JSON.parse(item);
      }
      return fallback;
    } catch (e) {
      console.warn(`Data corrupted for ${key}, using default.`);
      return fallback;
    }
  };

  // 核心工具：Base64 转 Blob URL (工业级内存管理)
  const base64ToBlobUrl = (base64, type = 'image/png') => {
    if (!base64 || typeof base64 !== 'string') {
        return null;
    }
    if (base64.startsWith('http') || base64.startsWith('blob:')) {
        return base64;
    }
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

  // 核心工具：Blob 转 Base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // 核心工具：智能图片压缩器
  const compressImage = (base64Str, maxWidth = 1024) => {
    return new Promise((resolve) => {
      if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image')) {
        resolve(base64Str);
        return;
      }
      const timer = setTimeout(() => {
          console.warn("Image compression timed out, sending original.");
          resolve(base64Str);
      }, 3000);

      const img = new Image();
      img.src = base64Str;
      
      img.onload = () => {
        clearTimeout(timer);
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressedData = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressedData);
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(base64Str);
      };
    });
  };

  // A. 配置中心
  const [config, setConfig] = useState(() => {
    const v3 = safeJsonParse('app_config_v3', null);
    if (v3) {
        return v3;
    }
    return {
      analysis: { baseUrl: '', key: '', model: 'gemini-2.0-flash-exp' },
      image: { baseUrl: '', key: '', model: 'nanobanana-2-pro' },
      video: { baseUrl: '', key: '', model: 'kling-v1.6' },
      audio: { baseUrl: '', key: '', model: 'tts-1' }
    };
  });

  const [availableModels, setAvailableModels] = useState([]); 
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // B. 核心资产数据 
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  const [clPrompts, setClPrompts] = useState(() => safeJsonParse('cl_prompts', []));
  const [clImages, setClImages] = useState({}); 
  const [shots, setShots] = useState(() => safeJsonParse('sb_shots', []));
  const [shotImages, setShotImages] = useState({}); 
  const [timeline, setTimeline] = useState(() => safeJsonParse('studio_timeline', []));
  const [actors, setActors] = useState(() => safeJsonParse('studio_actors_v2', []));
  const [scenes, setScenes] = useState(() => safeJsonParse('sb_scenes', []));

  // C. 智能持久化
  const safeSetItem = (key, value) => {
      try {
          const str = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, str);
      } catch (e) {
          console.warn(`Storage Limit Exceeded for ${key}. Data kept in memory only.`);
      }
  };

  useEffect(() => { safeSetItem('app_config_v3', config); }, [config]);
  useEffect(() => { safeSetItem('sb_script', script); }, [script]);
  useEffect(() => { safeSetItem('sb_direction', direction); }, [direction]);
  useEffect(() => { safeSetItem('cl_prompts', clPrompts); }, [clPrompts]);
  useEffect(() => { safeSetItem('sb_shots', shots); }, [shots]);
  useEffect(() => { safeSetItem('studio_timeline', timeline); }, [timeline]);
  useEffect(() => { safeSetItem('studio_actors_v2', actors); }, [actors]);
  useEffect(() => { safeSetItem('sb_scenes', scenes); }, [scenes]);

  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!baseUrl || !key) {
        return alert(`请先在设置中配置 [${type}] 的 Base URL 和 API Key`);
    }
    setIsLoadingModels(true); 
    setAvailableModels([]);
    try {
      let found = [];
      try { 
        const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } }); 
        const d = await r.json(); 
        if (d.data) found = d.data.map(m => m.id);
      } catch(e) {}
      
      if (!found.length && baseUrl.includes('google')) { 
        const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); 
        const d = await r.json(); 
        if (d.models) found = d.models.map(m => m.name.replace('models/', ''));
      }
      
      if (found.length) { 
          setAvailableModels([...new Set(found)].sort()); 
          alert(`成功获取 ${found.length} 个模型`); 
      } else { 
          alert("连接成功，但未自动获取到模型列表。"); 
      }
    } catch(e) { alert("连接失败: " + e.message); } finally { setIsLoadingModels(false); }
  };

  const assembleSoraPrompt = (targetShots, globalStyle, assignedActorId) => {
    const styleHeader = `\n# Global Context\nStyle: ${globalStyle || "Cinematic, high fidelity, 8k resolution"}.`;
    let actorContext = "";
    let mainActor = null;
    if (assignedActorId) {
        mainActor = actors.find(a => a.id.toString() === assignedActorId.toString());
        if (mainActor) {
            actorContext = `\nCharacter: ${mainActor.desc || mainActor.name}. (Maintain consistency).`;
        }
    }
    let currentTime = 0;
    const scriptBody = targetShots.map((s, idx) => {
        let dur = 5; 
        if (s.duration && s.duration.match(/\d+/)) dur = parseInt(s.duration.match(/\d+/)[0]);
        if (s.duration && s.duration.includes('ms')) dur = dur / 1000;
        const start = currentTime; const end = currentTime + dur;
        currentTime = end;
        let action = s.visual || s.sora_prompt;
        if (mainActor && !action.toLowerCase().includes('character') && !action.toLowerCase().includes(mainActor.name.toLowerCase())) {
            action = `(Character) ${action}`;
        }
        const camera = s.camera_movement ? ` Camera: ${s.camera_movement}.` : "";
        const audio = s.audio ? (s.audio.includes('"') ? ` [Dialogue: "${s.audio}"]` : ` [SFX: ${s.audio}]`) : "";
        return `[${start}s-${end}s] Shot ${idx+1}: ${action}.${camera}${audio}`;
    }).join("\nCUT TO:\n");
    const finalDuration = Math.ceil(currentTime / 5) * 5; 
    const specs = `\n\n# Technical Specs\n--duration ${finalDuration}s --quality high`;
    return {
        prompt: `${styleHeader}${actorContext}\n\n# Timeline Script\n${scriptBody}${specs}`,
        duration: finalDuration,
        actorRef: mainActor ? (mainActor.images?.portrait || mainActor.images?.sheet) : null 
    };
  };

  const sanitizePrompt = (text) => text ? text.replace(/[\{\}\[\]"]/g, "").trim() : "";

  // --- 关键升级：callApi 支持多图数组 ---
  const callApi = async (type, payload) => {
    const { baseUrl, key, model: configModel } = config[type];
    const activeModel = payload.model || configModel; 
    if (!baseUrl || !key) throw new Error(`请先在设置中配置 [${type}] 的 Base URL 和 API Key`);

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

    // 1. 文本分析 (LLM) - 支持单图(asset) 和 多图(assets)
    if (type === 'analysis') {
        const { system, user, asset, assets } = payload;
        
        // 准备图片列表 (Unified Image List)
        let imagesToProcess = [];
        if (assets && Array.isArray(assets)) {
            imagesToProcess = assets; // 已经是数组
        } else if (asset) {
            imagesToProcess = [asset]; // 单图转数组
        }

        // Google Native Format
        if (baseUrl.includes('google') && !baseUrl.includes('openai') && !baseUrl.includes('v1')) {
            const parts = [{ text: system + "\n" + user }];
            // 遍历并添加多张图片
            imagesToProcess.forEach(imgData => {
                if (typeof imgData === 'string' && imgData.includes(';base64,')) {
                    const partsSplit = imgData.split(';base64,');
                    const mimeType = partsSplit[0].split(':')[1];
                    const base64Data = partsSplit[1];
                    parts.push({ inlineData: { mimeType, data: base64Data } });
                }
            });
            
            let targetModel = activeModel;
            if (payload.useFallback && activeModel.includes('2.0')) targetModel = 'gemini-1.5-flash';

            const r = await fetchWithTimeout(`${baseUrl}/v1beta/models/${targetModel}:generateContent?key=${key}`, { 
              method: 'POST', 
              headers: {'Content-Type': 'application/json'}, 
              body: JSON.stringify({ contents: [{ parts }] }) 
            });
            if (!r.ok) {
              const err = await r.json();
              throw new Error(err.error?.message || "Analysis API Error");
            }
            return (await r.json()).candidates[0].content.parts[0].text;
        }

        // OpenAI Compatible Format
        const content = [{ type: "text", text: user }];
        // 遍历并添加多张图片
        imagesToProcess.forEach(imgData => {
             if (typeof imgData === 'string' && imgData.includes(';base64,')) {
                 content.push({ type: "image_url", image_url: { url: imgData } });
             }
        });
        
        const r = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
          body: JSON.stringify({
            model: activeModel,
            messages: [
              { role: "system", content: system },
              { role: "user", content: content }
            ]
          }) 
        });
        
        if (!r.ok) {
           try { const err = await r.json(); throw new Error(err.error?.message || "LLM API Error"); } 
           catch (e) { throw new Error(`LLM API Failed: ${r.status} ${r.statusText}`); }
        }
        return (await r.json()).choices[0].message.content;
    }

    // 2. 绘图 (Image)
    if (type === 'image') {
        let { prompt, aspectRatio, useImg2Img, refImg, refImages, strength, actorId } = payload;
        
        if (useImg2Img) {
            const hasSingle = refImg && refImg.length > 100;
            const hasMulti = refImages && refImages.length > 0;
            if (!hasSingle && !hasMulti) {
                console.warn("⚠️ 检测到未上传参考图，已自动降级为纯文字生成模式。");
                useImg2Img = false;
            }
        }

        let finalPrompt = prompt;
        if (actorId) {
            const actor = actors.find(a => a.id.toString() === actorId.toString());
            if (actor) {
                finalPrompt = `(Character: ${actor.desc}), ${finalPrompt}`;
                if (!refImg && !refImages && actor.images?.portrait) {
                    refImg = actor.images.portrait;
                    useImg2Img = true;
                    if (!strength) strength = 0.65; 
                }
            }
        }
        finalPrompt = sanitizePrompt(finalPrompt);

        let size = "1024x1024";
        if (aspectRatio === "16:9") size = "1280x720";
        else if (aspectRatio === "9:16") size = "720x1280";
        else if (aspectRatio === "2.35:1") size = "1536x640"; 
        else if (aspectRatio === "3:4") size = "768x1024";
        else if (aspectRatio === "1:1") size = "1024x1024";
        
        const body = { model: activeModel, prompt: finalPrompt, n: 1, size };
        const cleanBase64 = (str) => str && str.includes('base64,') ? str.split('base64,')[1] : str;

        const performRequest = async (requestBody) => {
            const r = await fetchWithTimeout(`${baseUrl}/v1/images/generations`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
                body: JSON.stringify(requestBody) 
            });
            if (!r.ok) {
                try { const d = await r.json(); throw new Error(d.error?.message || "Image Generation Failed"); } 
                catch (e) { throw new Error(`Image API Error: Status ${r.status}`); }
            }
            const d = await r.json();
            if (d.data && d.data.length > 0) {
                const rawUrl = d.data[0].url;
                if (rawUrl.startsWith('http')) return rawUrl;
                return base64ToBlobUrl(d.data[0].b64_json || rawUrl);
            }
            throw new Error("API returned empty data");
        };

        if (useImg2Img) {
            body.strength = parseFloat(strength || 0.7);
            if (refImages && Array.isArray(refImages) && refImages.length > 0) {
                try {
                    const compressedImages = await Promise.all(refImages.map(img => compressImage(img)));
                    const cleanArr = compressedImages.map(cleanBase64).filter(Boolean);
                    if (cleanArr.length > 0) {
                        body.image = cleanArr[0]; 
                        body.images = cleanArr;   
                        return await performRequest(body);
                    }
                } catch (e) {
                    const fallbackImg = await compressImage(refImages[0]);
                    body.image = cleanBase64(fallbackImg);
                    delete body.images;
                    return await performRequest(body);
                }
            } else if (refImg) {
                const compressedImg = await compressImage(refImg);
                body.image = cleanBase64(compressedImg);
                return await performRequest(body);
            }
        }
        return await performRequest(body);
    }

    if (type === 'audio') {
        let { input, voice, speed, actorId } = payload;
        if (actorId && !voice) {
            const actor = actors.find(a => a.id.toString() === actorId.toString());
            if (actor?.voice_tone) {
                const tone = actor.voice_tone.toLowerCase();
                if (tone.includes('male')) voice = 'onyx';
                else if (tone.includes('female')) voice = 'nova';
            }
        }
        const r = await fetchWithTimeout(`${baseUrl}/v1/audio/speech`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: activeModel, input, voice: voice || 'alloy', speed: speed || 1.0 })
        });
        if (!r.ok) throw new Error(`TTS API Error: ${r.status}`);
        return await blobToBase64(await r.blob());
    }

    if (type === 'sfx') {
        const { prompt, duration } = payload;
        const isEleven = baseUrl.includes('elevenlabs');
        const endpoint = isEleven ? '/v1/sound-generation' : '/v1/audio/sound-effects'; 
        const body = { text: prompt, duration_seconds: duration || 5, prompt_influence: 0.3 };
        if (!isEleven) body.model = activeModel || 'eleven-sound-effects';
        const r = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error("SFX Error");
        return await blobToBase64(await r.blob());
    }

    if (type === 'video') {
        const { prompt, startImg, duration, aspectRatio } = payload; 
        let optimizedStartImg = startImg;
        if (startImg && startImg.length > 500000) optimizedStartImg = await compressImage(startImg, 1024);
        const body = { model: activeModel, prompt: prompt, image: optimizedStartImg, duration: duration || 5, aspectRatio: aspectRatio || "16:9", size: "1080p" };
        const submitRes = await fetchWithTimeout(`${baseUrl}/v1/videos/generations`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        if (!submitRes.ok) throw new Error(`Video API Error: ${submitRes.status}`);
        const submitData = await submitRes.json();
        const taskId = submitData.id || submitData.data?.id;
        if (!taskId) { if (submitData.data && submitData.data[0].url) return submitData.data[0].url; throw new Error("No Task ID"); }
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

  const value = {
    config, setConfig,
    script, setScript, direction, setDirection,
    clPrompts, setClPrompts, clImages, setClImages,
    shots, setShots, shotImages, setShotImages,
    timeline, setTimeline,
    actors, setActors, scenes, setScenes,
    callApi, fetchModels, availableModels, isLoadingModels,
    assembleSoraPrompt
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
// 模块 2：角色工坊 (CharacterLab - V9.0: Final Logic)
// ==========================================
const CharacterLab = ({ onPreview }) => {
  const { config, clPrompts, setClPrompts, clImages, setClImages, actors, setActors, callApi } = useProject();

  // --- 0. 核心常量：12 视角定义 ---
  const FIXED_VIEWS = [
    { title: "正面全身 (Front Full)", prompt: "Full body shot, front view, standing straight, neutral expression, detailed outfit, looking at camera. (Depth of Field, Bokeh)" },
    { title: "背面全身 (Back Full)", prompt: "Full body shot, back view, standing straight, detailed back design of outfit. (Depth of Field, Bokeh)" },
    { title: "侧面半身 (Side Half)", prompt: "Upper body shot, side profile view, looking forward, sharp features. (Depth of Field, Bokeh)" },
    { title: "面部特写-正 (Face Front)", prompt: "Extreme close-up on face, front view, detailed eyes, detailed skin texture, emotions. (Depth of Field, Bokeh)" },
    { title: "面部特写-侧 (Face Side)", prompt: "Extreme close-up on face, side profile, jawline focus, cinematic lighting. (Depth of Field, Bokeh)" },
    { title: "背面特写 (Back Close)", prompt: "Close-up from behind, focus on hair texture and neck/collar details. (Depth of Field, Bokeh)" },
    { title: "俯视视角 (High Angle)", prompt: "High angle shot, looking down at character, cinematic composition. (Depth of Field, Bokeh)" },
    { title: "仰视视角 (Low Angle)", prompt: "Low angle shot, looking up at character, imposing presence, dramatic sky. (Depth of Field, Bokeh)" },
    { title: "动态姿势 (Action Pose)", prompt: "Dynamic action pose, fighting stance or running, motion blur on limbs, high energy. (Depth of Field, Bokeh)" },
    { title: "电影广角 (Cinematic Wide)", prompt: "Wide angle cinematic shot, character in environment, rule of thirds, atmospheric lighting. (Depth of Field, Bokeh)" },
    { title: "自然抓拍-喜 (Candid Joy)", prompt: "Candid shot, laughing or smiling naturally, sparkles in eyes, warm lighting. (Depth of Field, Bokeh)" },
    { title: "自然抓拍-怒 (Candid Anger)", prompt: "Candid shot, angry expression, intense stare, dramatic shadows, cold lighting. (Depth of Field, Bokeh)" }
  ];
  
  // 1. 基础状态
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [referenceImage, setReferenceImage] = useState(() => {
    try { return localStorage.getItem('cl_ref') || null; } catch(e) { return null; }
  });
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('cl_ar') || "16:9");
  const [imgStrength, setImgStrength] = useState(0.65);
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false); // AI 识图状态
  
  // 2. 设定卡高级状态
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [sheetParams, setSheetParams] = useState({ 
      name: "", voice: "", 
      visual_head: "", visual_upper: "", visual_lower: "", visual_access: "", 
      style: "" 
  }); 
  const [suggestedVoices, setSuggestedVoices] = useState([]); 
  const [isRegeneratingVoices, setIsRegeneratingVoices] = useState(false);
  const [selectedRefIndices, setSelectedRefIndices] = useState([]); // 手动选择的参考图 (用于生成)
  const [sheetConsistency, setSheetConsistency] = useState(1.0);
  
  // 3. 双图生成状态
  const [genStatus, setGenStatus] = useState('idle'); 
  const [portraitHistory, setPortraitHistory] = useState([]); 
  const [sheetHistory, setSheetHistory] = useState([]);       
  const [portraitIdx, setPortraitIdx] = useState(0);
  const [sheetIdx, setSheetIdx] = useState(0);

  const [viewingActor, setViewingActor] = useState(null);

  // 初始化强制重置 & 自动加载默认 12 视角
  useEffect(() => {
      setGenStatus('idle');
      setIsGenerating(false);
      
      if (!clPrompts || clPrompts.length === 0) {
          setClPrompts(FIXED_VIEWS);
      }

      setPortraitHistory(prev => prev.map(item => item.loading ? { ...item, loading: false, error: "系统重置" } : item));
      setSheetHistory(prev => prev.map(item => item.loading ? { ...item, loading: false, error: "系统重置" } : item));

      return () => {
          portraitHistory.forEach(i => i.url && URL.revokeObjectURL(i.url));
          sheetHistory.forEach(i => i.url && URL.revokeObjectURL(i.url));
      };
  }, []);

  const safeSave = (key, val) => { try { localStorage.setItem(key, val); } catch (e) {} };
  useEffect(() => { safeSave('cl_desc', description); }, [description]);
  useEffect(() => { if(referenceImage) safeSave('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { safeSave('cl_lang', targetLang); }, [targetLang]);
  useEffect(() => { safeSave('cl_ar', aspectRatio); }, [aspectRatio]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 3 * 1024 * 1024) alert("⚠️ 图片过大，建议压缩");
        const reader = new FileReader();
        reader.onloadend = () => { setReferenceImage(reader.result); safeSave('cl_ref', reader.result); };
        reader.readAsDataURL(file); 
    }
  };

  const forceText = (val) => {
      if (!val) return "";
      if (typeof val === 'string') return val;
      if (typeof val === 'object') return Object.values(val).join(', ');
      return String(val);
  };

  // --- 辅助工具：Blob URL 转 Base64 (前端必须转码后才能发给 API) ---
  const blobUrlToBase64 = async (blobUrl) => {
      if (!blobUrl || typeof blobUrl !== 'string') return null;
      if (blobUrl.startsWith('data:')) return blobUrl; // 已经是 Base64
      
      try {
          const response = await fetch(blobUrl);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          });
      } catch (e) {
          console.warn("Blob conversion failed:", e);
          return null; 
      }
  };
  // --- 新增功能：AI 视觉反推 (Image-to-Text) ---
  const handleAnalyzeImage = async () => {
    if (!referenceImage) return alert("请先上传参考图");
    setIsAnalyzingImage(true);
    try {
        // 1. 转 Base64
        let refData = referenceImage;
        if (refData.startsWith('blob:')) refData = await blobUrlToBase64(refData);

        // 2. 动态语言指令
        const langInstruction = targetLang === "Chinese" ? "用中文回答" : "Answer in English";
        const system = `Role: Visual Director.
        Task: Analyze the image and describe the character for an AI image generator.
        Requirements: Describe appearance (hair, eyes, face), outfit (top, bottom, shoes), and art style.
        Output: A detailed paragraph. ${langInstruction}.`;

        // 3. 调用分析
        const text = await callApi('analysis', { system, user: "Describe this character details.", asset: refData });
        setDescription(text);
    } catch(e) {
        alert("识别失败: " + e.message);
    } finally {
        setIsAnalyzingImage(false);
    }
  };

  // --- 新增功能：全局重置 (垃圾桶) ---
  const handleClearAll = () => {
      if (!confirm("确定要清空所有内容吗？此操作无法撤销。")) return;
      setDescription("");
      setReferenceImage(null);
      setClPrompts([]);
      setClImages({});
      // 同步清除 LocalStorage
      localStorage.removeItem('cl_desc');
      localStorage.removeItem('cl_ref');
      localStorage.removeItem('cl_prompts');
      // 重置参数
      setSheetParams({ name: "", voice: "", visual_head: "", visual_upper: "", visual_lower: "", visual_access: "", style: "" });
      setUseImg2Img(true);
  };

  // --- 新增功能：移除参考图 (红叉) ---
  const handleRemoveRef = (e) => {
      e.preventDefault(); // 防止触发上传点击
      e.stopPropagation();
      setReferenceImage(null);
      localStorage.removeItem('cl_ref');
      setUseImg2Img(false); // 移除图片后自动切回纯文模式
  };

  // --- 1. 12视角生成逻辑 (强制覆盖刷新) ---
  const handleGenerateViews = async () => {
    if (!description) return alert("请先填写角色描述");
    
    // 强制刷新：使用标准模板 + 当前描述覆盖
    const newPrompts = FIXED_VIEWS.map(view => ({
        title: view.title,
        prompt: `(View: ${view.title}). ${description}. ${view.prompt}` 
    }));
    setClPrompts(newPrompts);
    setClImages({}); // 清空旧图
    // 强制更新缓存
    localStorage.setItem('cl_prompts', JSON.stringify(newPrompts));
  };

  // 提示词更新函数 (支持手动编辑)
  const updatePrompt = (idx, newText) => {
      setClPrompts(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], prompt: newText };
          return next;
      });
  };

  // 单图生成逻辑 (12宫格)
  const handleImageGen = async (idx, item, ar, useImg, ref, str) => {
    setClImages(p => ({ ...p, [idx]: [...(p[idx]||[]), {loading:true}] }));
    
    try {
      // 预处理参考图：如果是 Blob，必须转 Base64，否则 API 也就是看看
      let finalRef = ref;
      if (useImg && ref && ref.startsWith('blob:')) {
          finalRef = await blobUrlToBase64(ref);
      }

      // 增加 ActionID 防止 API 缓存旧图
      const promptWithAction = `${item.prompt} --ar ${ar} (ActionID: ${Date.now()})`;

      const url = await callApi('image', { 
          prompt: promptWithAction, 
          aspectRatio: ar, 
          useImg2Img: useImg, 
          refImg: finalRef, 
          strength: str 
      });
      
      setClImages(p => { 
          const list = p[idx] || [];
          const lastIdx = list.length - 1;
          const newList = [...list];
          newList[lastIdx] = { url, loading: false, timestamp: Date.now() };
          return { ...p, [idx]: newList }; 
      });
    } catch(e) { 
      setClImages(p => { 
          const list = p[idx] || [];
          const lastIdx = list.length - 1;
          const newList = [...list];
          newList[lastIdx] = { error: e.message, loading: false };
          return { ...p, [idx]: newList }; 
      }); 
    }
  };
  // --- 2. 设定卡高级流程 (核心：多图分析 & 差异化生成) ---
  
  // [核心算法 A] 获取分析用参考图组 (自动抓取 + 降级策略)
  // 用于：openSheetModal (LLM 分析左侧文案)
  const getAnalysisAssets = async () => {
      const candidates = [];
      
      // 1. 尝试抓取核心视角 (Index 0:正面, 3:特写, 2:侧面, 5:背面)
      const targetIndices = [0, 3, 2, 5];
      for (let idx of targetIndices) {
          const img = clImages[idx]?.[clImages[idx].length-1]?.url;
          if (img && !img.error) candidates.push(img);
      }

      // 2. 尝试抓取原上传图
      if (referenceImage) candidates.push(referenceImage);

      // 3. 如果一张图都没有，返回空
      if (candidates.length === 0) return null;

      // 4. 统一转 Base64 (API 要求)
      return Promise.all(candidates.map(url => blobUrlToBase64(url)));
  };

  // [核心算法 B] 获取生图用参考图组 (手动选择)
  // 用于：handleGenPortrait, handleGenSheet (绘图模型)
  const getGenerationAssets = async () => {
      // 如果用户没有勾选任何图，尝试降级使用原参考图
      if (selectedRefIndices.length === 0) {
          return referenceImage ? [await blobUrlToBase64(referenceImage)] : null;
      }
      // 获取用户勾选的视角图
      const assets = selectedRefIndices
          .map(idx => clImages[idx]?.[clImages[idx].length-1]?.url)
          .filter(url => url && !url.error);
      
      if (assets.length === 0) return null;
      return Promise.all(assets.map(url => blobUrlToBase64(url)));
  };

  const openSheetModal = async () => {
    // 阻断检查
    const hasGenerated = Object.keys(clImages).some(k => clImages[k]?.length > 0 && !clImages[k][0].error);
    if (!description && !referenceImage && !hasGenerated) {
        return alert("请先创造角色：上传参考图或生成视角图。");
    }

    setShowSheetModal(true); 
    setGenStatus('analyzing'); 
    setPortraitHistory([]); 
    setSheetHistory([]); 
    setSelectedRefIndices([]); 
    setSuggestedVoices([]); 
    setSheetConsistency(1.0); 

    try {
        // 1. 获取多图参考组
        const assets = await getAnalysisAssets(); // 自动抓取多图
        
        // 2. 动态语言指令
        const langInstruction = targetLang === "Chinese" ? "Language: Simplified Chinese." : "Language: English.";
        
        // 3. 构建系统指令 (创意总监模式)
        const system = `Role: Senior Concept Artist & Casting Director.
        Task: Analyze the provided character images (Multi-View Reference) and synthesize a complete profile.
        CRITICAL RULES:
        1. **Combine Information**: Merge details from all images (face, outfit, body type).
        2. **Hallucinate Missing Parts**: If the images are crop/half-body and shoes/pants are missing, YOU MUST LOGICALLY INVENT THEM to match the style. Do NOT leave blank.
        3. **Style Detection**: Detect the ACTUAL art style (e.g., "Photorealistic, 8k" or "Anime, Flat Color"). Do not assume.
        4. **Voice Deduction**: Analyze facial structure/vibe to suggest voice timbre adjectives.
        
        Output JSON Format:
        {
          "visual_head": "Detailed description of face, hair, eyes, makeup...",
          "visual_upper": "Detailed description of top clothing, layers, neckwear...",
          "visual_lower": "Detailed description of pants/skirt, shoes, legwear (INVENT IF MISSING)...",
          "visual_access": "Accessories, weapons, held items...",
          "style": "The detected art style keywords...",
          "voice_tags": ["Adjective1", "Adjective2", ...]
        }
        ${langInstruction}`;
        
        // 4. 发送请求 (支持 assets 数组)
        const res = await callApi('analysis', { 
            system, 
            user: "Analyze these images and generate a full character profile.", 
            assets: assets // 传入图片数组
        });
        
        const d = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
        
        setSheetParams({
            name: "", 
            voice: "",
            visual_head: forceText(d.visual_head),
            visual_upper: forceText(d.visual_upper),
            visual_lower: forceText(d.visual_lower), // 这里现在会有 AI 脑补的内容
            visual_access: forceText(d.visual_access),
            style: forceText(d.style) // 真实的风格
        });
        setSuggestedVoices(Array.isArray(d.voice_tags) ? d.voice_tags : ["Standard"]);

    } catch(e) { 
        console.error("Analysis failed:", e);
        // 即使失败也不关闭窗口，允许用户手填
    } finally { 
        setGenStatus('idle'); 
    }
  };

  const handleRegenVoices = async () => {
      setIsRegeneratingVoices(true);
      try {
          const langInstruction = targetLang === "Chinese" ? "Language: Simplified Chinese." : "Language: English.";
          const assets = await getAnalysisAssets(); // 同样使用多图分析声线
          
          const res = await callApi('analysis', { 
              system: `Role: Voice Director. Analyze the character visual vibe. Return JSON: { "voice_tags": [4-6 vivid adjectives describing voice timbre] }. ${langInstruction}`,
              user: "Suggest voice types.",
              assets: assets
          });
          const data = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
          if(data.voice_tags) setSuggestedVoices(data.voice_tags);
      } catch(e) { 
          alert("音色联想失败: " + e.message); 
      } finally { 
          setIsRegeneratingVoices(false); 
      }
  };

  const toggleRefSelection = (idx) => { 
      setSelectedRefIndices(prev => {
          if (prev.includes(idx)) return prev.filter(i => i !== idx);
          if (prev.length >= 5) {
              alert("最多只能选择 5 张参考图");
              return prev;
          }
          return [...prev, idx];
      }); 
  };
  const toggleVoiceTag = (tag) => { setSheetParams(p => ({ ...p, voice: p.voice.includes(tag) ? p.voice.replace(tag, '').replace(',,', ',') : p.voice ? p.voice + ', ' + tag : tag })); };

  // --- 3. 核心定妆照生成 (半身逻辑) ---
  const handleGenPortrait = async () => {
    if (genStatus !== 'idle') return; 
    setGenStatus('gen_portrait'); 

    setPortraitHistory(prev => {
        const newHistory = [...prev, { loading: true }];
        setPortraitIdx(newHistory.length - 1);
        return newHistory;
    });

    try {
        // 1. 获取手动选择的参考图
        const finalRefs = await getGenerationAssets();

        // 2. 组装 Prompt (半身像公式：剔除 Lower)
        const safeHead = forceText(sheetParams.visual_head).replace(/[\{\}\[\]"]/g, "");
        const safeUpper = forceText(sheetParams.visual_upper).replace(/[\{\}\[\]"]/g, "");
        const safeStyle = forceText(sheetParams.style).replace(/[\{\}\[\]"]/g, "");
        const safeAccess = forceText(sheetParams.visual_access).replace(/[\{\}\[\]"]/g, "");

        const portraitPrompt = `(${safeStyle}), (Best Quality), (Front View), (Waist-Up Portrait). 
        Character: Head[${safeHead}], Upper[${safeUpper}], Access[${safeAccess}]. 
        Background: (Clean Solid Background), (Professional Lighting). 
        Negative: (Lower body), (Legs), (Shoes), (Microphone), (Text), (Watermark), (Multiple people), (Side view). 
        --ar 3:4 (ActionID: ${Date.now()})`; 

        // 3. 调用 API (支持多图 + 权重无锁)
        const dynamicStrength = finalRefs ? sheetConsistency : 0.65;

        const url = await callApi('image', { 
            prompt: portraitPrompt, 
            aspectRatio: "9:16", 
            useImg2Img: !!finalRefs, 
            refImages: finalRefs, 
            strength: dynamicStrength
        });
        
        setPortraitHistory(prev => { const n = [...prev]; n[n.length - 1] = { url, loading: false }; return n; });

    } catch(e){ 
        setPortraitHistory(prev => { const n = [...prev]; n[n.length - 1] = { error: e.message, loading: false }; return n; });
    } finally { 
        setGenStatus('idle'); 
    }
  };

  // --- 4. 角色设定图生成 (全身逻辑) ---
  const handleGenSheet = async () => {
    if (genStatus !== 'idle') return;
    setGenStatus('gen_sheet'); 

    setSheetHistory(prev => {
        const n = [...prev, { loading: true }];
        setSheetIdx(n.length - 1);
        return n;
    });

    try {
        const finalRefs = await getGenerationAssets();

        // 2. 组装 Prompt (全量公式：包含 Lower)
        const safeHead = forceText(sheetParams.visual_head).replace(/[\{\}\[\]"]/g, "");
        const safeUpper = forceText(sheetParams.visual_upper).replace(/[\{\}\[\]"]/g, "");
        const safeLower = forceText(sheetParams.visual_lower).replace(/[\{\}\[\]"]/g, ""); // 包含 AI 脑补的鞋子
        const safeAccess = forceText(sheetParams.visual_access).replace(/[\{\}\[\]"]/g, "");
        const safeStyle = forceText(sheetParams.style).replace(/[\{\}\[\]"]/g, "");

        const sheetPrompt = `(Character Design Sheet), (${safeStyle}), (Split View Layout).
        LEFT SIDE: (Three Views: Front View, Side View, Back View), (Full Body including shoes).
        CENTER: (Four different facial expressions), (Close-up headshots).
        RIGHT SIDE: (Outfit Breakdown), (Accessories details).
        Character Details: Head[${safeHead}], Upper[${safeUpper}], Lower[${safeLower}], Access[${safeAccess}].
        Background: (White Background), (Clean). 
        --ar 16:9 (ActionID: ${Date.now()})`;
        
        const dynamicStrength = finalRefs ? sheetConsistency : 0.65;

        const url = await callApi('image', { 
            prompt: sheetPrompt, 
            aspectRatio: "16:9", 
            useImg2Img: !!finalRefs, 
            refImages: finalRefs, 
            strength: dynamicStrength
        });

        setSheetHistory(prev => { const n = [...prev]; n[n.length - 1] = { url, loading: false }; return n; });
    } catch(e){ 
        setSheetHistory(prev => { const n = [...prev]; n[n.length - 1] = { error: e.message, loading: false }; return n; });
    } finally { 
        setGenStatus('idle'); 
    }
  };

  const handleGenAll = async () => {
      if (!sheetParams.visual_head) return alert("请先等待分析");
      if (genStatus !== 'idle') return;
      try {
          alert("即将开始生成：先生成定妆照，完成后请手动点击生成设定图，或再次点击此按钮。");
          await handleGenPortrait();
      } catch(e) { setGenStatus('idle'); }
  };

  const handleRegister = () => {
      const p = portraitHistory[portraitIdx], s = sheetHistory[sheetIdx];
      if(!p?.url || !s?.url) return alert("请确保当前显示的定妆照和设定图都已生成成功");
      setActors(prev => [...prev, { id: Date.now(), name: sheetParams.name, desc: JSON.stringify(sheetParams), voice_tone: sheetParams.voice, images: { sheet: s.url, portrait: p.url } }]);
      setShowSheetModal(false); 
      alert("签约成功");
  };

  const handleSlotUpload = (idx, e) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setClImages(prev => ({ ...prev, [idx]: [...(prev[idx] || []), { url: reader.result, loading: false }] }));
          reader.readAsDataURL(file);
      }
  };

  const downloadPack = async () => { 
      const zip = new JSZip(); const folder = zip.folder("character_pack"); let txt = "=== Prompts ===\n\n"; 
      for (let i = 0; i < clPrompts.length; i++) { 
          const item = clPrompts[i]; txt += `[${item.title}]\n${item.prompt}\n\n`; 
          const hist = clImages[i]; 
          if (hist && hist.length > 0) { const img = hist[hist.length-1]; if (img.url && !img.error) folder.file(`view_${i+1}.png`, await fetch(img.url).then(r=>r.blob())); } 
      } 
      folder.file("prompts.txt", txt); saveAs(await zip.generateAsync({type:"blob"}), "character_assets.zip"); 
  };
  // --- UI 组件：媒体预览 (修复高度对齐与错误显形) ---
  const MediaPreview = ({ history, idx, setIdx, onGen, label }) => {
      const current = history[idx] || {};
      const max = history.length - 1;
      
      return (
        <div className="flex flex-col gap-2 h-full">
            <div className="flex justify-between items-center px-1 shrink-0">
                <span className="text-xs font-bold text-slate-400">{label}</span>
                {history.length > 0 && <span className="text-[10px] text-slate-500">{idx+1}/{history.length}</span>}
            </div>
            {/* 核心修复：h-full 确保高度撑满父容器(h-[500px])，实现视觉对齐 */}
            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden relative group min-h-0 flex items-center justify-center">
                {current.loading ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="animate-spin text-blue-500"/>
                        <span className="text-xs text-slate-400">AI 绘制中...</span>
                    </div>
                ) : current.error ? (
                    <div className="p-4 text-center max-w-full">
                        <div className="text-red-500 font-bold text-xs mb-1">生成失败</div>
                        <div className="text-[10px] text-red-400/80 leading-tight border border-red-900/50 p-2 rounded bg-red-900/10 break-words whitespace-normal">{current.error}</div>
                        <button onClick={onGen} className="mt-2 text-[10px] text-slate-400 underline hover:text-white">重试</button>
                    </div>
                ) : current.url ? (
                   <>
                      <img src={current.url} className="w-full h-full object-contain cursor-zoom-in bg-black" onClick={()=>onPreview(current.url)}/>
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button onClick={()=>saveAs(current.url, "img.png")} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600 shadow"><Download size={14}/></button>
                          <button onClick={onGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600 shadow"><RefreshCw size={14}/></button>
                      </div>
                      {history.length > 1 && (<div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur z-10 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={idx<=0} onClick={()=>setIdx(i=>i-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={16}/></button><span className="text-[10px] text-white font-mono">{idx+1}/{history.length}</span><button disabled={idx>=max} onClick={()=>setIdx(i=>i+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={16}/></button></div>)}
                   </>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-600 text-xs text-center px-4">
                        <ImageIcon size={24} className="opacity-20"/>
                        <span>{label.includes("Portrait") ? "等待生成定妆照" : "等待生成设定图"}</span>
                    </div>
                )}
            </div>
            <button onClick={onGen} disabled={current.loading || genStatus !== 'idle'} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 flex items-center justify-center gap-2 text-xs transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                {current.loading ? <Loader2 className="animate-spin" size={12}/> : <RefreshCw size={12}/>} 
                {history.length>0 ? "重绘 (Regen)" : "生成 (Generate)"}
            </button>
        </div>
      );
  };

  // --- UI 组件：12宫格卡片 (支持编辑) ---
  const GridCard = ({ item, index }) => {
      const history = clImages[index] || [];
      const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
      const [isEditing, setIsEditing] = useState(false);
      const [localPrompt, setLocalPrompt] = useState(item.prompt);

      useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
      const current = history[verIndex] || {};
      const arClass = aspectRatio === "16:9" ? "aspect-video" : aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-square";
      
      const saveEdit = () => {
          updatePrompt(index, localPrompt);
          setIsEditing(false);
      };

      return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col relative shadow-lg">
              {/* 图片区域 */}
              <div className={cn("bg-black relative w-full shrink-0", arClass)}>
                  {current.loading ? (
                      <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
                          <Loader2 className="animate-spin text-blue-500"/>
                          <span className="text-[10px] text-slate-500">绘制中...</span>
                      </div>
                  ) : current.error ? (
                      <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 p-2">
                          <span className="text-red-500 text-xs font-bold">Error</span>
                          <span className="text-[9px] text-red-400 text-center leading-tight">{current.error}</span>
                          <button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-slate-800 text-white px-2 py-1 rounded text-[9px] mt-1 border border-slate-700">重试</button>
                      </div>
                  ) : current.url ? (
                      <div className="relative w-full h-full group/img">
                          <img src={current.url} className="w-full h-full object-cover cursor-zoom-in" onClick={()=>onPreview(current.url)}/>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={()=>saveAs(current.url, `${item.title}.png`)} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={12}/></button>
                              <button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600"><RefreshCw size={12}/></button>
                          </div>
                      </div>
                  ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[1px] gap-2">
                          <button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1"><Camera size={12}/> 生成</button>
                          <label className="bg-slate-700 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1 cursor-pointer hover:bg-slate-600"><Upload size={12}/> 上传<input type="file" className="hidden" accept="image/*" onChange={(e)=>handleSlotUpload(index, e)}/></label>
                      </div>
                  )}
                  {/* 标题 */}
                  <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white backdrop-blur pointer-events-none border border-white/10">{item.title}</div>
                  {/* 历史翻页 */}
                  {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur z-20 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={verIndex<=0} onClick={()=>setVerIndex(v=>v-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={()=>setVerIndex(v=>v+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
              </div>
              
              {/* Prompt 区域 (支持编辑) */}
              <div className="flex-1 bg-slate-900/50 border-t border-slate-800 p-2 relative min-h-[60px]">
                  {isEditing ? (
                      <div className="absolute inset-0 bg-slate-800 z-10 flex flex-col">
                          <textarea autoFocus value={localPrompt} onChange={e=>setLocalPrompt(e.target.value)} className="flex-1 w-full bg-slate-900 text-[10px] text-slate-200 p-2 resize-none outline-none border-b border-blue-500"/>
                          <div className="flex justify-end bg-slate-900 p-1 gap-2 border-t border-slate-700">
                              <button onClick={()=>setIsEditing(false)} className="text-[10px] text-slate-400 hover:text-white">取消</button>
                              <button onClick={saveEdit} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-500">确认</button>
                          </div>
                      </div>
                  ) : (
                    <>
                        <p className="text-[10px] text-slate-500 font-mono line-clamp-3 select-all hover:text-slate-300 transition-colors cursor-text pr-4" title={item.prompt}>{item.prompt}</p>
                        <button onClick={()=>setIsEditing(true)} className="absolute bottom-2 right-2 text-slate-600 hover:text-blue-400 transition-colors"><Pencil size={12}/></button>
                    </>
                  )}
              </div>
          </div>
      );
  };

  // --- 主界面渲染 ---
  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      {/* 左侧参数栏 */}
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 shrink-0 z-10">
         <div className="p-4 overflow-y-auto flex-1 scrollbar-thin space-y-6">
            <div className="flex items-center justify-between font-bold text-slate-200">
                <span className="flex items-center gap-2"><UserCircle2 size={18} className="text-blue-400"/> 角色工坊</span>
                {/* 新增：全局重置按钮 */}
                <button onClick={handleClearAll} title="清空当前项目" className="p-1.5 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded transition-colors"><Trash2 size={14}/></button>
            </div>
            
            {/* 参考图区域 (含移除 & AI识别) */}
            <div className="relative group">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" />
                <label htmlFor="ref-img" className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 overflow-hidden transition-all relative">
                    {referenceImage ? (
                        <>
                            <img src={referenceImage} className="w-full h-full object-cover opacity-80" />
                            {/* 移除按钮 */}
                            <button onClick={handleRemoveRef} className="absolute top-1 right-1 bg-red-600/80 text-white p-1 rounded-full hover:bg-red-500 z-20"><X size={12}/></button>
                            {/* AI 识别按钮 */}
                            <button onClick={(e)=>{e.preventDefault();handleAnalyzeImage()}} disabled={isAnalyzingImage} className="absolute bottom-2 bg-blue-600/90 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg z-20 backdrop-blur-sm transition-all">
                                {isAnalyzingImage ? <Loader2 className="animate-spin" size={12}/> : <Sparkles size={12}/>} AI 识别并填写描述
                            </button>
                        </>
                    ) : (
                        <div className="text-slate-500 flex flex-col items-center"><Upload size={20} className="mb-2"/><span className="text-xs">上传参考图 (可选)</span></div>
                    )}
                </label>
            </div>
            
            <div className="space-y-2"><label className="text-sm font-medium text-slate-300">角色描述</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-600" placeholder="描述你的角色..."/></div>
            
            <div className="grid grid-cols-2 gap-2 bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                <div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="Chinese">中文</option><option value="English">English</option></select></div>
                
                <div className="col-span-2 pt-2 border-t border-slate-700/50">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-slate-400">参考图权重 (Strength)</span>
                        <input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} disabled={!referenceImage} className="accent-blue-600 disabled:opacity-50"/>
                    </div>
                    {useImg2Img && referenceImage && (
                        <div className="flex items-center gap-2">
                             <input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="flex-1 h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/>
                             <span className="text-[10px] text-slate-300 font-mono w-8 text-right">{imgStrength}</span>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="space-y-2">
                <button onClick={handleGenerateViews} disabled={isGenerating} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin" size={16}/> : <LayoutGrid size={16}/>} ⚡ 生成/刷新 12 标准视角</button>
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

      {/* 右侧：12宫格视图区 */}
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
             {clPrompts.length === 0 && <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50"><Users size={64}/><p className="mt-4">请点击左侧“生成/刷新 12 标准视角”开始工作</p></div>}
          </div>
      </div>

      {/* 弹窗：角色定妆与签约中心 (V9.0 最终版) */}
      {showSheetModal && (
        <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setShowSheetModal(false)}>
           {/* 高度限制修复：h-[85vh] */}
           <div className="bg-slate-900 border border-purple-500/30 w-full max-w-6xl h-[85vh] max-h-[800px] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e=>e.stopPropagation()}>
              <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950 shrink-0">
                 <h3 className="text-base font-bold text-white flex items-center gap-2"><FileText className="text-purple-400" size={18}/> 角色定妆与签约中心</h3>
                 <button onClick={()=>setShowSheetModal(false)}><X size={18} className="text-slate-500 hover:text-white"/></button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                 {/* 左侧分析栏 */}
                 <div className="w-80 border-r border-slate-800 p-5 bg-slate-900/50 flex flex-col overflow-y-auto scrollbar-thin">
                    {genStatus === 'analyzing' ? (
                       <div className="flex-1 flex flex-col items-center justify-center gap-4 text-purple-400"><Brain className="animate-pulse" size={48}/><p className="text-xs text-center px-4 leading-relaxed">AI 正在综合多图分析角色特征 (Auto-Analyze)...</p></div>
                    ) : (
                      <div className="space-y-4 animate-in slide-in-from-left-4">
                         <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase">角色真名</label><input value={sheetParams.name} onChange={e=>setSheetParams({...sheetParams, name:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-bold" placeholder="例如：Neo"/></div>
                         <div className="space-y-2">
                             <div className="flex justify-between items-center"><label className="text-[10px] text-slate-400 font-bold uppercase">声线 (AI推导)</label><button onClick={handleRegenVoices} disabled={isRegeneratingVoices} className="text-[10px] text-purple-400 hover:text-white flex gap-1 items-center">{isRegeneratingVoices?<Loader2 size={10} className="animate-spin"/>:<RefreshCw size={10}/>} 重组</button></div>
                             <input value={sheetParams.voice} onChange={e=>setSheetParams({...sheetParams, voice:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" placeholder="点击下方标签或输入"/>
                             <div className="flex flex-wrap gap-1.5">{suggestedVoices.map(tag => <button key={tag} onClick={()=>toggleVoiceTag(tag)} className={cn("px-2 py-0.5 border text-[10px] rounded-full transition-colors", sheetParams.voice.includes(tag) ? "bg-purple-600 border-purple-500 text-white" : "bg-purple-900/30 border-purple-800 text-purple-200 hover:bg-purple-800")}>{tag}</button>)}</div>
                         </div>
                         <div className="grid grid-cols-1 gap-3 pt-2">
                             <div className="space-y-1"><label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><Brain size={10}/> 头部 / 五官 / 发型</label><textarea value={sheetParams.visual_head} onChange={e=>setSheetParams({...sheetParams, visual_head:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/></div>
                             <div className="space-y-1"><label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><UserCircle2 size={10}/> 上身穿着</label><textarea value={sheetParams.visual_upper} onChange={e=>setSheetParams({...sheetParams, visual_upper:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/></div>
                             <div className="space-y-1"><label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><GripHorizontal size={10}/> 下身 / 鞋子 (AI脑补)</label><textarea value={sheetParams.visual_lower} onChange={e=>setSheetParams({...sheetParams, visual_lower:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/></div>
                             <div className="space-y-1"><label className="text-[10px] text-pink-400 font-bold uppercase flex items-center gap-1"><Palette size={10}/> 艺术风格 (真实检测)</label><textarea value={sheetParams.style} onChange={e=>setSheetParams({...sheetParams, style:e.target.value})} className="w-full h-12 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-pink-500"/></div>
                         </div>
                         <div className="pt-2 border-t border-slate-800">
                             <div className="flex justify-between items-center mb-1"><label className="text-[10px] text-slate-400 font-bold">参考素材 (手动干预, Max 5)</label><span className="text-[9px] text-green-400">Consistency: {sheetConsistency}</span></div>
                             <input type="range" min="0.1" max="1.0" step="0.05" value={sheetConsistency} onChange={(e) => setSheetConsistency(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-green-500 cursor-pointer mb-2"/>
                             <div className="grid grid-cols-3 gap-2 max-h-24 overflow-y-auto scrollbar-none">{Object.entries(clImages).map(([idx, hist]) => { const img = hist && hist.length>0 ? hist[hist.length-1] : null; if(!img || !img.url) return null; const isSelected = selectedRefIndices.includes(parseInt(idx)); return <div key={idx} onClick={()=>toggleRefSelection(parseInt(idx))} className={cn("aspect-square rounded border-2 overflow-hidden relative cursor-pointer transition-all", isSelected ? "border-green-500 opacity-100" : "border-transparent opacity-40 hover:opacity-100")}><img src={img.url} className="w-full h-full object-cover"/>{isSelected && <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center"><CheckCircle2 size={16} className="text-white"/></div>}</div>; })}</div>
                         </div>
                      </div>
                    )}
                 </div>
                 {/* 右侧预览区 (修复对齐) */}
                 <div className="flex-1 p-6 bg-black flex flex-col min-w-0">
                    <div className="flex gap-6 h-[500px] min-h-0 mb-4 shrink-0">
                        <div className="w-1/3 h-full"><MediaPreview label="核心定妆照 (Half-Body)" history={portraitHistory} idx={portraitIdx} setIdx={setPortraitIdx} onGen={handleGenPortrait} /></div>
                        <div className="flex-1 h-full"><MediaPreview label="角色设定图 (Sheet)" history={sheetHistory} idx={sheetIdx} setIdx={setSheetIdx} onGen={handleGenSheet} /></div>
                    </div>
                    {/* 底部按钮 */}
                    <div className="h-16 shrink-0 flex gap-4 items-center justify-end border-t border-slate-800 pt-4">
                        <button onClick={handleGenAll} disabled={genStatus!=='idle'} className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg h-12 font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all cursor-pointer">
                            {genStatus!=='idle' ? <Loader2 className="animate-spin"/> : <Wand2 size={18}/>} 
                            <span>✨ 一键制作定妆照 & 设定图</span>
                        </button>
                        {portraitHistory[portraitIdx]?.url && sheetHistory[sheetIdx]?.url && <button onClick={handleRegister} className="w-64 bg-green-600 hover:bg-green-500 text-white rounded-lg h-12 font-bold shadow-lg flex items-center justify-center gap-2 animate-in slide-in-from-right-4"><CheckCircle2 size={18}/> 确认签约 (Register)</button>}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* --- 弹窗：已签约演员查看 --- */}
      {viewingActor && (
         <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setViewingActor(null)}>
            <div className="bg-slate-900 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex" onClick={e=>e.stopPropagation()}>
               <div className="w-1/2 bg-black relative"><img src={viewingActor.images.portrait} className="w-full h-full object-cover"/><div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4"><h3 className="text-2xl font-bold text-white">{viewingActor.name}</h3><span className="text-xs bg-purple-900 text-purple-200 px-2 py-0.5 rounded ml-2">{viewingActor.voice_tone}</span></div></div>
               <div className="w-1/2 p-6 bg-slate-900 flex flex-col">
                   <div className="mb-4"><h4 className="text-xs font-bold text-slate-500 mb-2">设定图</h4><img src={viewingActor.images.sheet} className="w-full h-24 object-cover rounded border border-slate-700 cursor-zoom-in" onClick={()=>onPreview(viewingActor.images.sheet)}/></div>
                   <div className="flex-1 overflow-y-auto mb-4"><h4 className="text-xs font-bold text-slate-500 mb-1">描述参数</h4><p className="text-[10px] text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800 leading-relaxed">{viewingActor.desc}</p></div>
                   <button onClick={()=>{setActors(p=>p.filter(a=>a.id!==viewingActor.id));setViewingActor(null)}} className="w-full py-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-white border border-red-900 rounded flex items-center justify-center gap-2 text-xs transition-colors"><Trash2 size={14}/> 解除签约</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
// ==========================================
// 新增组件：大分镜编译弹窗
// ==========================================
const SceneCompilerModal = ({ isOpen, onClose, selectedIds, allShots, onCompile }) => {
  const [shotOrder, setShotOrder] = useState([]);
  const [sceneName, setSceneName] = useState("");

  useEffect(
    () => {
      if (isOpen) {
        const sorted = selectedIds.sort(
          (a, b) => {
            return a - b;
          }
        );
        setShotOrder(sorted);
        setSceneName("");
      }
    },
    [isOpen, selectedIds]
  );

  const handleRemoveShot = (shotId) => {
    setShotOrder(
      (prevOrder) => {
        return prevOrder.filter(
          (id) => {
            return id !== shotId;
          }
        );
      }
    );
  };

  const handleCompile = () => {
    if (!sceneName.trim()) {
      return alert("请输入大分镜名称");
    }

    if (shotOrder.length === 0) {
      return alert("至少选择 1 个镜头");
    }

    const selectedShots = allShots.filter(
      (s) => {
        return shotOrder.includes(s.id);
      }
    );

    onCompile({
      title: sceneName,
      shotIds: shotOrder,
      selectedShots: selectedShots,
    });

    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[170] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-orange-500/50 w-full max-w-2xl rounded-2xl p-6 shadow-2xl animate-in zoom-in-95"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* 弹窗标题 */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="text-orange-500" size={20} />
            组装大分镜
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="space-y-4">
          {/* 大分镜名称输入 */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">
              大分镜名称
            </label>
            <input
              autoFocus
              type="text"
              value={sceneName}
              onChange={(e) => {
                setSceneName(e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white outline-none focus:border-orange-500 transition-colors"
              placeholder="例如：Opening Scene"
            />
          </div>

          {/* 镜头顺序列表 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400">
              镜头顺序
            </label>
            <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto scrollbar-thin">
              {shotOrder.length > 0 ? (
                shotOrder.map((shotId, idx) => {
                  const shot = allShots.find(
                    (s) => {
                      return s.id === shotId;
                    }
                  );

                  if (!shot) {
                    return null;
                  }

                  return (
                    <div
                      key={shotId}
                      className="flex items-center gap-3 p-3 border-b border-slate-800 last:border-b-0 hover:bg-slate-900/50 transition-colors group"
                    >
                      {/* 序号和把手 */}
                      <div className="flex items-center gap-2 text-slate-600 group-hover:text-orange-400">
                        <span className="text-xs font-bold w-6 text-right">
                          {idx + 1}
                        </span>
                        <GripHorizontal size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                      </div>

                      {/* 镜头信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">
                          Shot {shot.id}
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-1">
                          {shot.visual}
                        </div>
                      </div>

                      {/* 移除按钮 */}
                      <button
                        onClick={() => {
                          handleRemoveShot(shotId);
                        }}
                        className="p-1.5 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-slate-500 text-xs">
                  暂无选中的镜头
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">
              共 {shotOrder.length} 个镜头 / 总时长约 {shotOrder.length * 5}s
            </p>
          </div>

          {/* 确认组装按钮 */}
          <button
            onClick={handleCompile}
            disabled={shotOrder.length === 0}
            className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:from-slate-700 disabled:to-slate-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 transition-all"
          >
            <Wand2 size={18} />
            确认组装大分镜
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 模块 3：自动分镜工作台 (StoryboardStudio - Fully Restored)
// ==========================================
const StoryboardStudio = ({ onPreview }) => {
  const {
    script,
    setScript,
    direction,
    setDirection,
    shots,
    setShots,
    shotImages,
    setShotImages,
    scenes,
    setScenes,
    actors,
    callApi,
    config,
  } = useProject();

  // ========== 状态声明 ==========

  const [messages, setMessages] = useState(() => {
    const stored = localStorage.getItem("sb_messages");
    if (stored) {
      try {
        return JSON.parse(stored);
      }
      catch (e) {
        return [{ role: "assistant", content: "我是您的 AI 分镜导演。" }];
      }
    }
    return [{ role: "assistant", content: "我是您的 AI 分镜导演。" }];
  });

  const [mediaAsset, setMediaAsset] = useState(null);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const [sbAspectRatio, setSbAspectRatio] = useState(() => {
    const stored = localStorage.getItem("sb_ar");
    if (stored) {
      return stored;
    }
    return "16:9";
  });

  const [sbTargetLang, setSbTargetLang] = useState(() => {
    const stored = localStorage.getItem("sb_lang");
    if (stored) {
      return stored;
    }
    return "English";
  });

  const [imgStrength, setImgStrength] = useState(0.8);
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [showAnimatic, setShowAnimatic] = useState(false);

  // ✅ 新增状态：大分镜编译相关
  const [selectedShotIds, setSelectedShotIds] = useState([]);
  const [showSceneCompiler, setShowSceneCompiler] = useState(false);
  const [compiledScene, setCompiledScene] = useState(null);

  const chatEndRef = useRef(null);

  // ========== 副作用钩子 ==========

  useEffect(
    () => {
      localStorage.setItem("sb_messages", JSON.stringify(messages));
    },
    [messages]
  );

  useEffect(
    () => {
      localStorage.setItem("sb_ar", sbAspectRatio);
    },
    [sbAspectRatio]
  );

  useEffect(
    () => {
      localStorage.setItem("sb_lang", sbTargetLang);
    },
    [sbTargetLang]
  );

  useEffect(
    () => {
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    },
    [messages, pendingUpdate]
  );

  // ========== 辅助函数 ==========

  const pushHistory = (newShots) => {
    setShots(newShots);
  };

  const handleUndo = () => {
    // 暂时为空，可后续实现
  };

  const handleRedo = () => {
    // 暂时为空，可后续实现
  };

  const addImageToShot = (id, url) => {
    setShotImages((prevImages) => {
      const shotImagesList = prevImages[id] || [];
      const newShotImagesList = [...shotImagesList];
      newShotImagesList.push(url);
      return {
        ...prevImages,
        [id]: newShotImagesList,
      };
    });
  };

  const handleAssetUpload = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      alert("⚠️ 文件过大，建议压缩");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setMediaAsset({
        type: type || "image",
        data: reader.result,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const clearAsset = (e) => {
    if (e) {
      e.stopPropagation();
    }
    setMediaAsset(null);
  };

  const toggleShotSelection = (id) => {
    setSelectedShotIds((prevIds) => {
      const isSelected = prevIds.includes(id);
      if (isSelected) {
        return prevIds.filter((shotId) => {
          return shotId !== id;
        });
      }
      else {
        return [...prevIds, id];
      }
    });
  };

  const handleAnalyzeScript = async () => {
    if (!script && !direction && !mediaAsset) {
      return alert("请填写内容或上传素材");
    }

    setIsAnalyzing(true);

    const system = `Role: Expert Film Director. Task: Create a Shot List for Video Generation.
    Requirements: 
    1. Break down script into key shots.
    2. Use professional camera terms like 'Truck Left', 'Dolly Zoom', 'Pan Right', 'Tilt Up'.
    3. Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "image_prompt":"..."}]. 
    Language: ${sbTargetLang}.`;

    try {
      const res = await callApi("analysis", {
        system: system,
        user: `Script: ${script}\nDirection: ${direction}`,
        asset: mediaAsset,
      });

      let jsonStr = res.match(/```json([\s\S]*?)```/)?.[1];
      if (!jsonStr) {
        const startIdx = res.indexOf("[");
        const endIdx = res.lastIndexOf("]");
        if (startIdx !== -1 && endIdx !== -1) {
          jsonStr = res.substring(startIdx, endIdx + 1);
        }
      }

      if (!jsonStr) {
        throw new Error("无法解析返回的 JSON");
      }

      const json = JSON.parse(jsonStr.trim());

      if (Array.isArray(json)) {
        pushHistory(json);
        setMessages((prevMessages) => {
          return [
            ...prevMessages,
            {
              role: "assistant",
              content: `分析完成！设计了 ${json.length} 个镜头。`,
            },
          ];
        });
      }
      else {
        throw new Error("返回数据不是数组");
      }
    }
    catch (e) {
      alert("分析失败: " + e.message);
    }
    finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) {
      return;
    }

    const msg = chatInput;
    setChatInput("");
    setMessages((prevMessages) => {
      return [
        ...prevMessages,
        {
          role: "user",
          content: msg,
        },
      ];
    });

    try {
      const currentContext = shots.map((s) => {
        return {
          id: s.id,
          visual: s.visual,
          audio: s.audio,
          sora_prompt: s.sora_prompt,
        };
      });

      const res = await callApi("analysis", {
        system:
          "Role: Co-Director. Task: Modify storyboard. Update visual/audio/sora_prompt/image_prompt. Return JSON array ONLY.",
        user: `Context: ${JSON.stringify(currentContext)}\nFeedback: ${msg}\nResponse: Wrap JSON in \`\`\`json ... \`\`\`.`,
      });

      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      const reply = jsonMatch ? res.replace(jsonMatch[0], "") : res;

      setMessages((prevMessages) => {
        return [
          ...prevMessages,
          {
            role: "assistant",
            content: reply || "修改建议如下：",
          },
        ];
      });

      if (jsonMatch) {
        setPendingUpdate(JSON.parse(jsonMatch[1]));
      }
    }
    catch (e) {
      setMessages((prevMessages) => {
        return [
          ...prevMessages,
          {
            role: "assistant",
            content: "Error: " + e.message,
          },
        ];
      });
    }
  };

  const applyUpdate = () => {
    if (!pendingUpdate) {
      return;
    }

    let newShots = [...shots];
    const updates = Array.isArray(pendingUpdate)
      ? pendingUpdate
      : [pendingUpdate];

    updates.forEach((upd) => {
      const idx = newShots.findIndex((s) => {
        return s.id === upd.id;
      });
      if (idx !== -1) {
        newShots[idx] = {
          ...newShots[idx],
          ...upd,
          image_prompt: upd.image_prompt || upd.sora_prompt,
        };
      }
      else {
        newShots.push(upd);
      }
    });

    setShots(
      newShots.sort((a, b) => {
        return a.id - b.id;
      })
    );
    setPendingUpdate(null);
    setMessages((prevMessages) => {
      return [
        ...prevMessages,
        {
          role: "assistant",
          content: "✅ 修改已应用。",
        },
      ];
    });
  };

  const handleCompileFromModal = ({ title, shotIds, selectedShots }) => {
    let currentTime = 0;

    const scriptParts = selectedShots.map((s) => {
      let dur = 5;
      if (s.duration && s.duration.match(/\d+/)) {
        dur = parseInt(s.duration.match(/\d+/)[0]);
      }
      if (s.duration && s.duration.includes("ms")) {
        dur = dur / 1000;
      }

      const start = currentTime;
      const end = currentTime + dur;
      currentTime = end;

      let audioTag = "";
      if (s.audio) {
        if (s.audio.includes('"')) {
          audioTag = `[Dialogue: "${s.audio}"]`;
        }
        else {
          audioTag = `[SFX: ${s.audio}]`;
        }
      }

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

    const firstShotId = selectedShots[0].id;
    const startImg = shotImages[firstShotId]?.slice(-1)[0] || null;

    const newScene = {
      id: Date.now(),
      title: title,
      prompt: masterPrompt,
      duration: currentTime,
      startImg: startImg,
      video_url: null,
      shots: shotIds,
      created_at: new Date().toISOString(),
    };

    setScenes((prevScenes) => {
      return [...prevScenes, newScene];
    });

    setSelectedShotIds([]);
    setShowSceneCompiler(false);

    alert(
      `✨ 大分镜 "${title}" 已创建！\n总时长：${currentTime}s，包含 ${selectedShots.length} 个镜头`
    );
  };

  const handleGenSceneVideo = async (scene) => {
    const arMatch = scene.prompt.match(/--ar\s+(\d+:\d+)/);
    const ar = arMatch ? arMatch[1] : sbAspectRatio;

    try {
      const url = await callApi("video", {
        model: config.video.model,
        prompt: scene.prompt,
        startImg:
          typeof scene.startImg === "string"
            ? scene.startImg
            : scene.startImg?.url,
        aspectRatio: ar,
        duration: scene.duration,
      });

      setScenes((prevScenes) => {
        return prevScenes.map((s) => {
          if (s.id === scene.id) {
            return {
              ...s,
              video_url: url,
            };
          }
          return s;
        });
      });

      alert("🎬 大分镜视频生成成功！");
    }
    catch (e) {
      alert("生成失败: " + e.message);
    }
  };

  const handleDownload = async (type) => {
    if (type === "csv") {
      const headerRow = ["Shot", "Visual", "Prompt"];
      const dataRows = shots.map((s) => {
        return [s.id, `"${s.visual}"`, `"${s.sora_prompt}"`];
      });
      const allRows = [headerRow, ...dataRows];
      const csv = "\uFEFF" + allRows.map((row) => row.join(",")).join("\n");
      saveAs(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
        "storyboard.csv"
      );
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder("storyboard");

    const promises = Object.entries(shotImages).map(async (entry) => {
      const id = entry[0];
      const urls = entry[1];

      if (urls && urls.length > 0) {
        try {
          const lastUrl = urls[urls.length - 1];
          const response = await fetch(lastUrl);
          const blob = await response.blob();
          folder.file(`shot_${id}.png`, blob);
        }
        catch (e) {
          console.warn(`Failed to download shot ${id}`);
        }
      }
    });

    await Promise.all(promises);
    saveAs(
      await zip.generateAsync({ type: "blob" }),
      "storyboard_pack.zip"
    );
  };

  const clearAll = () => {
    const confirmed = confirm("确定要清空所有内容吗？此操作无法撤销。");
    if (!confirmed) {
      return;
    }

    setShots([]);
    setMessages([]);
    setShotImages({});
    setScript("");
    setDirection("");
    setMediaAsset(null);
    setSelectedShotIds([]);
    localStorage.clear();
  };

  const ChangePreview = () => {
    if (!pendingUpdate) {
      return null;
    }

    const updates = Array.isArray(pendingUpdate)
      ? pendingUpdate
      : [pendingUpdate];

    return (
      <div className="bg-slate-800/90 border border-purple-500/50 rounded-lg p-3 my-2 text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <div className="flex justify-between items-center mb-2 pb-2 border-b border-purple-500/20">
          <span className="font-bold text-purple-300 flex items-center gap-2">
            <Settings size={12} />
            修改方案 ({updates.length})
          </span>
          <button
            onClick={applyUpdate}
            className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded flex items-center gap-1 shadow transition-colors"
          >
            <CheckCircle2 size={10} />
            应用
          </button>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-1">
          {updates.map((u, i) => {
            return (
              <div
                key={i}
                className="bg-slate-900/50 p-2.5 rounded border-l-2 border-purple-500"
              >
                <div className="font-mono text-slate-400 mb-1 font-bold">
                  Shot {u.id}
                </div>
                <div className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {u.visual && (
                    <div className="mb-2">
                      <span className="text-purple-400 font-bold">
                        Visual:
                      </span>
                      {" "}
                      {u.visual}
                    </div>
                  )}
                  {u.sora_prompt && (
                    <div>
                      <span className="text-purple-400 font-bold">
                        Prompt:
                      </span>
                      {" "}
                      {u.sora_prompt}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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

// ==========================================
// 修改后的 ShotCard 组件
// ==========================================
const ShotCard = ({
  shot,
  isSelected,
  onToggleSelect,
  currentAr,
  currentUseImg,
  currentAsset,
  currentStrength,
  onPreview,
}) => {
  const history = shotImages[shot.id] || [];
  const [verIndex, setVerIndex] = useState(
    history.length > 0 ? history.length - 1 : 0
  );
  const [loading, setLoading] = useState(false);
  const [selectedActorId, setSelectedActorId] = useState("");

  useEffect(
    () => {
      if (history.length > 0) {
        setVerIndex(history.length - 1);
      }
    },
    [history.length]
  );

  const currentUrl = history[verIndex];

  const gen = async () => {
    setLoading(true);

    try {
      let refImgData = null;

      if (selectedActorId) {
        const actor = actors.find((a) => {
          return a.id.toString() === selectedActorId;
        });

        if (actor) {
          try {
            const response = await fetch(actor.images.portrait);
            const blob = await response.blob();
            const reader = new FileReader();

            refImgData = await new Promise((resolve, reject) => {
              reader.onloadend = () => {
                resolve(reader.result);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
          catch (e) {
            console.warn("Failed to convert actor image:", e);
          }
        }
      }
      else if (currentAsset?.type === "image") {
        refImgData = currentAsset.data;
      }

      const finalPrompt = shot.image_prompt || shot.sora_prompt;

      const url = await callApi("image", {
        prompt: finalPrompt,
        aspectRatio: currentAr,
        useImg2Img: !!refImgData,
        refImg: refImgData,
        strength: currentStrength,
      });

      addImageToShot(shot.id, url);
    }
    catch (e) {
      alert("生成失败: " + e.message);
    }
    finally {
      setLoading(false);
    }
  };

  const handlePreviewClick = () => {
    if (currentUrl) {
      onPreview(currentUrl);
    }
  };

  const handleImageDownload = (e) => {
    e.stopPropagation();
    if (currentUrl) {
      saveAs(currentUrl, `shot_${shot.id}.png`);
    }
  };

  const handleImageRegenerate = (e) => {
    e.stopPropagation();
    gen();
  };

  const handleVersionPrev = (e) => {
    e.stopPropagation();
    if (verIndex > 0) {
      setVerIndex(verIndex - 1);
    }
  };

  const handleVersionNext = (e) => {
    e.stopPropagation();
    if (verIndex < history.length - 1) {
      setVerIndex(verIndex + 1);
    }
  };

  const handleCheckboxChange = (e) => {
    e.stopPropagation();
    onToggleSelect();
  };

  return (
    <div
      className={cn(
        "bg-slate-900 border-2 rounded-xl overflow-hidden flex flex-col md:flex-row mb-3 group transition-all hover:border-purple-500/50",
        isSelected
          ? "border-orange-500 bg-orange-900/10 ring-1 ring-orange-500"
          : "border-slate-800"
      )}
    >
      {/* ===== 左侧：图片预览区域 ===== */}
      <div className="relative md:w-72 shrink-0 group/media">
        {/* 选择框（Checkbox） */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          className="absolute top-3 left-3 z-10 w-5 h-5 accent-orange-500 cursor-pointer rounded"
          title="选择此镜头用于组装大分镜"
        />

        {/* 图片容器 */}
        <div
          className={cn(
            "bg-black relative w-full md:w-auto",
            currentAr === "9:16"
              ? "aspect-[9/16]"
              : currentAr === "1:1"
                ? "aspect-square"
                : "aspect-video"
          )}
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-[10px]">
                AI 绘制中...
              </span>
            </div>
          ) : currentUrl ? (
            <div
              className="relative w-full h-full cursor-zoom-in group/img"
              onClick={handlePreviewClick}
            >
              <img
                src={currentUrl}
                alt={`Shot ${shot.id}`}
                className="w-full h-full object-cover"
              />

              {/* 悬浮按钮（下载 + 重绘） */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity">
                <button
                  onClick={handleImageDownload}
                  className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600 transition-colors"
                  title="下载图片"
                >
                  <Download size={12} />
                </button>
                <button
                  onClick={handleImageRegenerate}
                  className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600 transition-colors"
                  title="重新生成"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={gen}
                className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <Camera size={14} />
                生成画面
              </button>
            </div>
          )}

          {/* 左上：镜头编号标签 */}
          <div className="absolute top-2 left-10 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur pointer-events-none">
            Shot {shot.id}
          </div>

          {/* 右下：时长标签 */}
          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 flex items-center gap-1 pointer-events-none">
            <Clock size={10} />
            {shot.duration || "5s"}
          </div>

          {/* 版本翻页控制（底部中央） */}
          {history.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/media:opacity-100 transition-opacity z-20">
              <button
                onClick={handleVersionPrev}
                disabled={verIndex <= 0}
                className="text-white hover:text-purple-400 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={12} />
              </button>
              <span className="text-[10px] text-white font-mono">
                {verIndex + 1}/{history.length}
              </span>
              <button
                onClick={handleVersionNext}
                disabled={verIndex >= history.length - 1}
                className="text-white hover:text-purple-400 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== 右侧：信息 & 控制区域 ===== */}
      <div className="p-4 flex-1 space-y-3 flex flex-col justify-between">
        {/* 上部：镜头视觉描述 */}
        <div>
          <div className="text-sm text-slate-200 font-medium leading-relaxed mb-2">
            {shot.visual}
          </div>

          {/* Sora 提示词 */}
          <div className="bg-purple-900/10 border border-purple-900/30 p-2 rounded text-[10px] font-mono text-purple-200/70 break-all select-all hover:border-purple-500/50 transition-colors">
            <span className="text-purple-500 font-bold select-none">
              Sora:{" "}
            </span>
            {shot.sora_prompt}
          </div>
        </div>

        {/* 下部：演员选择 + 音频 */}
        <div className="space-y-2">
          {/* 演员选择下拉框 */}
          <div className="flex items-center gap-2">
            <select
              value={selectedActorId}
              onChange={(e) => {
                setSelectedActorId(e.target.value);
              }}
              className="bg-slate-950 border border-slate-700 rounded text-[10px] text-slate-300 p-1 outline-none focus:border-purple-500 max-w-[120px] transition-colors"
            >
              <option value="">
                (无指定演员)
              </option>
              {actors.map((a) => {
                return (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                );
              })}
            </select>

            {selectedActorId && (
              <span className="text-[10px] text-green-400 flex items-center gap-1">
                <CheckCircle2 size={10} />
                锁定
              </span>
            )}
          </div>

          {/* 音频信息展示 */}
          {shot.audio && (
            <div className="flex gap-2 text-xs">
              <div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400 flex-1">
                <Mic size={12} className="text-purple-400 shrink-0" />
                <span className="truncate text-[10px]">
                  {shot.audio}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


  return (
    <div className="flex h-full overflow-hidden">
      {/* ===== 动画播放器 ===== */}
      <AnimaticPlayer
        isOpen={showAnimatic}
        onClose={() => {
          setShowAnimatic(false);
        }}
        shots={shots}
        images={shotImages}
      />

      {/* ===== 大分镜编译弹窗 ===== */}
      <SceneCompilerModal
        isOpen={showSceneCompiler}
        onClose={() => {
          setShowSceneCompiler(false);
        }}
        selectedIds={selectedShotIds}
        allShots={shots}
        onCompile={handleCompileFromModal}
      />

      {/* ===== 左侧：导演控制台 & AI 助手 ===== */}
      <div className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
        {/* 标题栏 */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-200 flex gap-2">
            <Clapperboard size={16} className="text-purple-400" />
            导演控制台
          </h2>
          <button
            onClick={clearAll}
            className="text-slate-500 hover:text-red-400 transition-colors"
            title="清空所有内容"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* 左侧内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
          {/* 剧本/台词输入框 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <FileText size={12} />
              剧本 / 台词
            </label>
            <textarea
              value={script}
              onChange={(e) => {
                setScript(e.target.value);
              }}
              className="w-full h-24 bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600 transition-colors"
              placeholder="例如：(旁白) 2077年，霓虹灯下的雨夜..."
            />
          </div>

          {/* 导演意图输入框 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <Video size={12} />
              导演意图
            </label>
            <textarea
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
              }}
              className="w-full h-20 bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600 transition-colors"
              placeholder="例如：赛博朋克风格，高对比度光影..."
            />
          </div>

          {/* 分镜生成设置卡片 */}
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
              <Settings size={12} />
              分镜生成设置
            </div>

            {/* 画面比例和语言选择 */}
            <div className="grid grid-cols-2 gap-2">
              {/* 画面比例下拉框 */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">
                  画面比例
                </label>
                <select
                  value={sbAspectRatio}
                  onChange={(e) => {
                    setSbAspectRatio(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="16:9">
                    16:9
                  </option>
                  <option value="9:16">
                    9:16
                  </option>
                  <option value="2.35:1">
                    2.35:1
                  </option>
                  <option value="1:1">
                    1:1
                  </option>
                </select>
              </div>

              {/* 语言下拉框 */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">
                  语言
                </label>
                <select
                  value={sbTargetLang}
                  onChange={(e) => {
                    setSbTargetLang(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="English">
                    English
                  </option>
                  <option value="Chinese">
                    中文
                  </option>
                </select>
              </div>
            </div>

            {/* 参考图权重滑块 */}
            <div className="pt-2 border-t border-slate-700/50 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Sliders size={10} />
                  参考图权重
                </label>
                <input
                  type="checkbox"
                  checked={useImg2Img}
                  onChange={(e) => {
                    setUseImg2Img(e.target.checked);
                  }}
                  className="accent-blue-600"
                />
              </div>

              {useImg2Img && mediaAsset?.type === "image" && (
                <div className="space-y-1 animate-in fade-in">
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>
                      Weight: {imgStrength}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={imgStrength}
                    onChange={(e) => {
                      setImgStrength(parseFloat(e.target.value));
                    }}
                    className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 多模态素材上传区域 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <Upload size={12} />
              多模态素材
            </label>
            <div className="grid grid-cols-3 gap-2 h-20">
              {/* 图片上传区 */}
              <div
                className={cn(
                  "relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors",
                  mediaAsset?.type === "image"
                    ? "border-purple-500 bg-purple-900/20"
                    : "border-slate-600 hover:border-purple-500 bg-slate-800/30"
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    handleAssetUpload(e, "image");
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                {mediaAsset?.type === "image" ? (
                  <>
                    <img
                      src={mediaAsset.data}
                      alt="上传的图片"
                      className="w-full h-full object-cover opacity-80"
                    />
                    <button
                      onClick={clearAsset}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500 z-10 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </>
                ) : (
                  <>
                    <ImageIcon size={16} className="mb-1" />
                    <span className="text-[10px]">
                      图片
                    </span>
                  </>
                )}
              </div>

              {/* 音频上传区 */}
              <div
                className={cn(
                  "relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors",
                  mediaAsset?.type === "audio"
                    ? "border-purple-500 bg-purple-900/20"
                    : "border-slate-700 hover:border-purple-500 bg-slate-800/30"
                )}
              >
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    handleAssetUpload(e, "audio");
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                {mediaAsset?.type === "audio" ? (
                  <Mic size={16} className="text-purple-400" />
                ) : (
                  <>
                    <Mic size={16} className="text-slate-500 mb-1" />
                    <span className="text-[10px]">
                      音频
                    </span>
                  </>
                )}
              </div>

              {/* 视频上传区 */}
              <div
                className={cn(
                  "relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 transition-colors",
                  mediaAsset?.type === "video"
                    ? "border-purple-500 bg-purple-900/20"
                    : "border-slate-700 hover:border-purple-500 bg-slate-800/30"
                )}
              >
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    handleAssetUpload(e, "video");
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                {mediaAsset?.type === "video" ? (
                  <Film size={16} className="text-purple-400" />
                ) : (
                  <>
                    <Film size={16} className="text-slate-500 mb-1" />
                    <span className="text-[10px]">
                      视频
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 生成分镜表按钮 */}
          <button
            onClick={handleAnalyzeScript}
            disabled={isAnalyzing}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 disabled:opacity-50 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            {isAnalyzing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Clapperboard size={16} />
            )}
            {isAnalyzing ? "分析中..." : "生成分镜表"}
          </button>
        </div>

        {/* 下部：AI 导演助手面板 */}
        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          {/* AI 助手标题栏 */}
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4">
            <span className="flex items-center gap-2 font-medium text-slate-400">
              <MessageSquare size={12} />
              AI 导演助手
            </span>
          </div>

          {/* 聊天消息区 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.map((m, i) => {
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg p-2.5 text-xs shadow-sm max-w-[85%]",
                    m.role === "user"
                      ? "bg-purple-600 text-white ml-auto"
                      : "bg-slate-800 text-slate-300 border border-slate-700"
                  )}
                >
                  {m.content}
                </div>
              );
            })}

            {/* 修改方案预览 */}
            <ChangePreview />

            {/* 聊天滚动锚点 */}
            <div ref={chatEndRef} />
          </div>

          {/* 聊天输入框 */}
          <div className="p-3 border-t border-slate-800 flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => {
                setChatInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSendMessage();
                }
              }}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 transition-colors placeholder:text-slate-600"
              placeholder="输入修改建议..."
            />
            <button
              onClick={handleSendMessage}
              className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors shadow-lg shadow-purple-900/20 active:scale-95"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
      {/* ===== 右侧：两列布局（小分镜 + 大分镜） ===== */}
      <div className="flex-1 bg-slate-950 overflow-hidden flex gap-6 p-6">
        {/* ===== 右侧左列：小分镜列表 ===== */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800 pr-6">
          {/* 小分镜列表标题栏 */}
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h2 className="text-lg font-bold text-slate-200">
              小分镜 ({shots.length})
            </h2>
            <button
              onClick={() => {
                setShowAnimatic(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg transition-all active:scale-95"
            >
              <Film size={12} />
              播放预览
            </button>
          </div>

          {/* 小分镜卡片滚动区域 */}
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3">
            {shots.length > 0 ? (
              shots.map((shot) => {
                return (
                  <ShotCard
                    key={shot.id}
                    shot={shot}
                    isSelected={selectedShotIds.includes(shot.id)}
                    onToggleSelect={() => {
                      toggleShotSelection(shot.id);
                    }}
                    currentAr={sbAspectRatio}
                    currentUseImg={useImg2Img}
                    currentAsset={mediaAsset}
                    currentStrength={imgStrength}
                    onPreview={onPreview}
                  />
                );
              })
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Clapperboard size={48} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">
                    暂无分镜，请点击左侧"生成分镜表"
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 选中提示和组装按钮 */}
          {selectedShotIds.length > 0 && (
            <div className="mt-4 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
              <span className="text-sm text-orange-200 font-medium">
                已选择 {selectedShotIds.length} 个镜头
              </span>
              <button
                onClick={() => {
                  setShowSceneCompiler(true);
                }}
                className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded-full font-bold shadow-lg flex items-center gap-1 transition-all active:scale-95"
              >
                <Layers size={12} />
                组装为大分镜
              </button>
            </div>
          )}
        </div>

        {/* ===== 右侧右列：大分镜列表 ===== */}
        <div className="w-1/3 flex flex-col min-w-0 border-l border-slate-800 pl-6">
          {/* 大分镜列表标题栏 */}
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h2 className="text-lg font-bold text-slate-200">
              大分镜 ({scenes.length})
            </h2>
            {shots.length > 0 && (
              <button
                onClick={() => {
                  handleDownload("csv");
                }}
                className="text-xs bg-green-900/30 text-green-200 px-2 py-1 rounded border border-green-800 hover:bg-green-900/50 hover:text-white transition-colors flex items-center gap-1"
              >
                <FileSpreadsheet size={10} />
                CSV
              </button>
            )}
          </div>

          {/* 大分镜卡片滚动区域 */}
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3">
            {scenes.length > 0 ? (
              scenes.map((scene) => {
                return (
                  <div
                    key={scene.id}
                    className="bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-orange-500/50 transition-all cursor-pointer group"
                    onClick={() => {
                      setCompiledScene(scene);
                    }}
                  >
                    {/* 大分镜首帧预览 */}
                    <div className="aspect-video bg-black rounded overflow-hidden mb-2 relative">
                      {scene.startImg && (
                        <>
                          <img
                            src={scene.startImg}
                            alt={`Scene ${scene.id}`}
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                          />
                          <div className="absolute inset-0 bg-black/60" />
                        </>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Film size={24} className="text-orange-400" />
                      </div>
                    </div>

                    {/* 大分镜信息 */}
                    <div className="space-y-1.5 min-h-0">
                      <h4 className="text-xs font-bold text-white truncate">
                        {scene.title}
                      </h4>
                      <div className="text-[10px] text-slate-400 flex justify-between">
                        <span>
                          ⏱️ {scene.duration}s
                        </span>
                        <span>
                          📹 {scene.shots.length} shots
                        </span>
                      </div>
                    </div>

                    {/* 生成视频按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenSceneVideo(scene);
                      }}
                      disabled={scene.video_url !== null}
                      className="w-full mt-2 py-1 text-xs bg-purple-600/30 hover:bg-purple-600/50 disabled:bg-slate-700/50 text-purple-200 disabled:text-slate-400 rounded border border-purple-700 disabled:border-slate-700 disabled:cursor-not-allowed transition-colors"
                    >
                      {scene.video_url ? "✅ 已生成" : "🎬 生成视频"}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-center">
                <div>
                  <Layers size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">
                    左侧选中镜头后，
                    <br />
                    点击"组装为大分镜"
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

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
