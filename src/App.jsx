import React, { useState, useMemo, useRef, useEffect, useContext, createContext } from 'react';
import { 
  Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, 
  Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, 
  Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, 
  CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2, 
  Sparkles, Dices, Layers, PlusCircle, Play, UserCircle2, GripHorizontal, Users, Music, 
  Scissors, Save, FolderOpen
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 样式合并工具
 */
function cn(...inputs) { 
  return twMerge(clsx(inputs)); 
}

// ==========================================
// 核心模块 0：工具函数库 & Sora v2 编译器
// ==========================================

/**
 * Blob 转 Base64 (用于 API 传输)
 */
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * URL (Blob/Http) 转 Base64 字符串
 */
const urlToBase64 = async (url) => {
  if (!url || typeof url !== 'string') {
    return null;
  }
  if (url.startsWith('data:')) {
    return url; 
  }
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await blobToBase64(blob);
  } catch (e) {
    console.warn("Base64 conversion failed:", e);
    return null;
  }
};

/**
 * 智能图片压缩器 (防止 API Payload 过大)
 */
const compressImage = (base64Str, maxWidth = 1024) => {
  return new Promise((resolve) => {
    if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      // 保持长宽比缩放
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
      ctx.fillStyle = '#FFFFFF'; // 防止透明背景变黑
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      // 压缩质量 0.85
      const compressedData = canvas.toDataURL('image/jpeg', 0.85);
      resolve(compressedData);
    };

    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

/**
 * 核心逻辑：Sora v2 提示词编译器 (Prompt Compiler)
 * 根据用户提供的规范文档严格编写
 */
const compileSoraPrompt = (shots, actorsInScene, globalParams) => {
  const { direction, style, physics } = globalParams || {};

  // 1. 构建全局头文件 (Global Context)
  let promptHeader = `# Global Context\n`;
  if (style) {
    promptHeader += `Style: ${style}.\n`;
  } else {
    promptHeader += `Style: Cinematic, High fidelity, Photorealistic, 8k resolution.\n`;
  }
  
  if (direction) {
    promptHeader += `Environment/Mood: ${direction}.\n`;
  }
  
  if (physics) {
    promptHeader += `Physics: ${physics}.\n`;
  }
  
  // 2. 角色锚定 (ID Mapping) - 对应规范第3点
  let characterBlock = "";
  if (actorsInScene && actorsInScene.length > 0) {
    characterBlock = `\n# Character Definitions (ID Mapping)\n`;
    actorsInScene.forEach(actor => {
      // 提取核心视觉特征，避免过长
      const visualDesc = `${actor.desc.visual_upper}, ${actor.desc.visual_lower}`;
      // 规范语法
      characterBlock += `Let "${actor.name}" be the character wearing: ${visualDesc}.\n`;
    });
  }

  // 3. 时间轴脚本 (Timeline Script) - 对应规范第2、4点
  let scriptBlock = `\n# Timeline Script\n`;
  let currentTime = 0;

  const scriptParts = shots.map((shot, index) => {
    // 强制转换为秒
    let duration = 5; 
    if (shot.duration) {
        if (typeof shot.duration === 'string' && shot.duration.includes('ms')) {
            duration = parseInt(shot.duration) / 1000;
        } else if (typeof shot.duration === 'string') {
             const match = shot.duration.match(/\d+/);
             if (match) duration = parseInt(match[0]);
        } else if (typeof shot.duration === 'number') {
            duration = shot.duration / 1000;
        }
    }
    
    // 限制单镜头最长 10s (Sora 建议)
    duration = Math.min(duration, 10);
    
    const startTime = currentTime;
    const endTime = currentTime + duration;
    currentTime = endTime;

    // 格式化时间戳 [00s-05s]
    const timeTag = `[${startTime}s-${endTime}s]`;
    
    // 核心动作描述 (如果使用了演员，此时应已在 visual 中包含演员名字)
    let content = `${timeTag} Shot ${index + 1}: ${shot.visual}.`;

    // 运镜 (Camera)
    if (shot.camera) {
      content += ` Camera Movement: ${shot.camera}.`;
    }

    // 音效 (SFX)
    if (shot.sfx) {
      content += ` [SFX: ${shot.sfx}]`;
    }

    // 对话 (Dialogue)
    if (shot.audio && shot.audio.length > 0) {
      // 简单判断是否是对话
      content += ` [Dialogue: "${shot.audio}"]`;
    }

    return content;
  });

  scriptBlock += scriptParts.join("\n\nCUT TO:\n\n");

  // 4. 技术参数 (Technical Specs)
  const totalDuration = Math.ceil(currentTime);
  const specsBlock = `\n\n# Technical Specs\n--duration ${totalDuration}s --quality high --ar 16:9`;

  return promptHeader + characterBlock + scriptBlock + specsBlock;
};

// ==========================================
// 核心模块 1: ProjectContext (全局状态管理)
// ==========================================

const ProjectContext = createContext();

export const useProject = () => {
  return useContext(ProjectContext);
};

export const ProjectProvider = ({ children }) => {
  // --- A. 配置中心 (Config) ---
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('app_config_v7');
      return saved ? JSON.parse(saved) : {
        analysis: { baseUrl: '', key: '', model: 'gemini-2.0-flash-exp' }, // 默认 Gemini
        image: { baseUrl: '', key: '', model: 'nanobanana-2-pro' }, 
        video: { baseUrl: '', key: '', model: 'kling-v1.6' },
        audio: { baseUrl: '', key: '', model: 'tts-1' }
      };
    } catch (e) {
      return { analysis: {}, image: {}, video: {}, audio: {} };
    }
  });

  // --- B. 核心资产 (Assets) ---
  // 注意：不再试图将大文件存入 localStorage，仅存 ID 和 文本信息。
  // 图片数据尽量保持在内存中 (Blob URL)，并提示用户导出 Project 包。
  
  // 1. 角色工坊
  const [actors, setActors] = useState([]); // Array of Actor Objects
  const [clPrompts, setClPrompts] = useState([]); // 12宫格 Prompt 列表
  
  // 2. 自动分镜
  const [shots, setShots] = useState([]); // 小分镜列表 (Shot List)
  const [scenes, setScenes] = useState([]); // 大分镜列表 (Scene List)
  const [scriptContext, setScriptContext] = useState({ script: "", direction: "", style: "", physics: "" }); // 剧本上下文
  
  // 3. 制片台
  const [timeline, setTimeline] = useState([]); // 剪辑时间轴

  // 4. 运行时状态
  const [availableModels, setAvailableModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // --- 持久化配置 ---
  useEffect(() => {
    localStorage.setItem('app_config_v7', JSON.stringify(config));
  }, [config]);

  // --- API 交互层 (Call API) ---
  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!baseUrl || !key) {
        return alert(`请先在设置中配置 [${type}] 的 Base URL 和 API Key`);
    }
    setIsLoadingModels(true); 
    setAvailableModels([]);
    try {
      let found = [];
      // 尝试 OpenAI 格式
      try { 
        const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } }); 
        const d = await r.json(); 
        if (d.data) found = d.data.map(m => m.id);
      } catch(e) {}
      
      // 尝试 Google 格式
      if (!found.length && baseUrl.includes('google')) { 
        const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); 
        const d = await r.json(); 
        if (d.models) found = d.models.map(m => m.name.replace('models/', ''));
      }
      
      if (found.length) { 
          setAvailableModels([...new Set(found)].sort()); 
          alert(`成功获取 ${found.length} 个模型`); 
      } else { 
          alert("连接成功，但未自动获取到模型列表。请手动输入。"); 
      }
    } catch(e) { 
        alert("连接失败: " + e.message); 
    } finally { 
        setIsLoadingModels(false); 
    }
  };

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

    // --- 1. LLM (分析/文本生成) ---
    if (type === 'analysis') {
        const { system, user, assets } = payload; // assets 必须是 base64 数组
        
        // Google Gemini Native
        if (baseUrl.includes('google') && !baseUrl.includes('openai') && !baseUrl.includes('v1')) {
            const parts = [{ text: system + "\n\n" + user }];
            if (assets && Array.isArray(assets)) {
                assets.forEach(b64 => {
                    if (b64 && b64.includes(';base64,')) {
                        const [mimePart, dataPart] = b64.split(';base64,');
                        const mimeType = mimePart.split(':')[1];
                        parts.push({ inlineData: { mimeType, data: dataPart } });
                    }
                });
            }
            
            // 降级策略
            let targetModel = activeModel;
            if (payload.useFallback && activeModel.includes('2.0')) targetModel = 'gemini-1.5-flash';

            const r = await fetchWithTimeout(`${baseUrl}/v1beta/models/${targetModel}:generateContent?key=${key}`, { 
              method: 'POST', headers: {'Content-Type': 'application/json'}, 
              body: JSON.stringify({ contents: [{ parts }] }) 
            });
            if (!r.ok) {
              const err = await r.json();
              throw new Error(err.error?.message || "Analysis API Error");
            }
            return (await r.json()).candidates[0].content.parts[0].text;
        }

        // OpenAI Compatible
        const messages = [{ role: "system", content: system }];
        const userContent = [{ type: "text", text: user }];
        
        if (assets && Array.isArray(assets)) {
             assets.forEach(b64 => {
                 if (b64) userContent.push({ type: "image_url", image_url: { url: b64 } });
             });
        }
        messages.push({ role: "user", content: userContent });
        
        const r = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
          body: JSON.stringify({ model: activeModel, messages, temperature: 0.7 }) 
        });
        
        if (!r.ok) {
           try { const err = await r.json(); throw new Error(err.error?.message || "LLM API Error"); } 
           catch (e) { throw new Error(`LLM API Failed: ${r.status}`); }
        }
        return (await r.json()).choices[0].message.content;
    }

    // --- 2. Image Generation (支持多图参考) ---
    if (type === 'image') {
        let { prompt, aspectRatio, refImages, strength } = payload;
        
        // 尺寸处理
        let size = "1024x1024";
        if (aspectRatio === "16:9") size = "1280x720";
        else if (aspectRatio === "9:16") size = "720x1280";
        else if (aspectRatio === "3:4") size = "768x1024"; 

        const body = { model: activeModel, prompt, n: 1, size };
        
        // 关键升级：多图处理
        if (refImages && refImages.length > 0) {
            // 1. 压缩所有图片
            const compressed = await Promise.all(refImages.map(img => compressImage(img)));
            // 2. 清洗 base64 头
            const cleanArr = compressed.map(str => str.includes('base64,') ? str.split('base64,')[1] : str);
            
            // 3. 构建参数 (适配常见 MJ-Proxy 或 Flux API 格式)
            // 部分 API 仅支持单图，部分支持数组。这里做兼容性处理。
            body.image = cleanArr[0]; // 兼容单图接口
            body.images = cleanArr;   // 兼容多图接口
            
            // 权重控制
            if (strength) body.strength = parseFloat(strength);
        }

        const r = await fetchWithTimeout(`${baseUrl}/v1/images/generations`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
            body: JSON.stringify(body) 
        });
        
        if (!r.ok) throw new Error(`Image API Error: ${r.status}`);
        const d = await r.json();
        
        // 统一返回 Blob URL
        if (d.data && d.data.length > 0) {
            const raw = d.data[0].url || d.data[0].b64_json;
            return await urlToBase64(raw); // 确保最后拿到的是 Base64 以便于保存
        }
        throw new Error("No image data returned");
    }

    // --- 3. Video Generation (Sora/Kling) ---
    if (type === 'video') {
        const { prompt, startImg, duration, aspectRatio } = payload; 
        
        // 1. 首帧处理
        let optimizedStartImg = null;
        if (startImg) {
            const b64 = await urlToBase64(startImg);
            optimizedStartImg = await compressImage(b64, 1024); // 视频模型通常限制 1024
            optimizedStartImg = optimizedStartImg.includes('base64,') ? optimizedStartImg.split('base64,')[1] : optimizedStartImg;
        }

        const body = { 
            model: activeModel, 
            prompt: prompt, 
            image: optimizedStartImg, // 首帧
            image_tail: null, // 暂不支持尾帧
            duration: duration || 5, 
            aspectRatio: aspectRatio || "16:9",
            size: "1080p"
        };

        // 提交任务
        const submitRes = await fetchWithTimeout(`${baseUrl}/v1/videos/generations`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        
        if (!submitRes.ok) throw new Error(`Video Task Failed: ${submitRes.status}`);
        const submitData = await submitRes.json();
        const taskId = submitData.id || submitData.data?.id;
        
        if (!taskId) return submitData.data?.[0]?.url; // 如果是同步返回
        
        // 轮询任务
        for (let i = 0; i < 60; i++) { // 最多 5 分钟
            await new Promise(r => setTimeout(r, 5000)); 
            const checkRes = await fetch(`${baseUrl}/v1/videos/generations/${taskId}`, { headers: { 'Authorization': `Bearer ${key}` } });
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                const status = checkData.status || checkData.data?.status;
                if (['SUCCEEDED', 'completed'].includes(status)) {
                    return checkData.data?.[0]?.url || checkData.url;
                }
                if (['FAILED', 'failed'].includes(status)) {
                    throw new Error("Video Gen Failed: Server reported failure");
                }
            }
        }
        throw new Error("Video Gen Timeout");
    }

    // --- 4. Audio (TTS/SFX) ---
    if (type === 'audio' || type === 'sfx') {
        const { input, voice, speed } = payload;
        const endpoint = type === 'sfx' ? '/v1/audio/sound-effects' : '/v1/audio/speech';
        
        const body = { model: activeModel, input, voice: voice || 'alloy', speed: speed || 1.0 };
        if (type === 'sfx') {
            body.text = input; // SFX 常用 text 字段
            delete body.input;
        }

        const r = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        
        if (!r.ok) throw new Error(`Audio API Error: ${r.status}`);
        const blob = await r.blob();
        return await blobToBase64(blob);
    }
  };

  // 暴露 Context
  const value = {
    config, setConfig,
    actors, setActors,
    clPrompts, setClPrompts,
    shots, setShots,
    scenes, setScenes,
    scriptContext, setScriptContext,
    timeline, setTimeline,
    availableModels, isLoadingModels,
    callApi, fetchModels
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
// ==========================================
// 核心模块 2: 通用 UI 组件库 (Common UI)
// ==========================================

// --- A. 模型选择器弹窗 ---
const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  
  // 分类逻辑
  const categorizedModels = useMemo(() => {
    const lower = search.toLowerCase();
    const all = models.filter(m => m.toLowerCase().includes(lower));
    return { 
      "All": all, 
      "OpenAI": all.filter(m => m.includes('gpt') || m.includes('o1') || m.includes('dall') || m.includes('tts')), 
      "Google": all.filter(m => m.includes('gemini') || m.includes('banana') || m.includes('imagen')), 
      "Image": all.filter(m => ['flux','midjourney','banana','sd','recraft'].some(k => m.includes(k))), 
      "Video": all.filter(m => ['kling','luma','runway','sora','hailuo'].some(k => m.includes(k))) 
    };
  }, [models, search]);
  
  const tabs = ["All", "OpenAI", "Google", "Image", "Video"];
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4 shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="text-white font-bold flex gap-2 items-center">
              <LayoutGrid size={20} className="text-blue-500"/> 
              选择模型: <span className="text-blue-400">{title}</span>
            </h3>
            <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-white"/></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={16}/>
            <input 
              autoFocus 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="搜索模型 ID (例如: gemini, kling)..." 
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        
        <div className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 shrink-0 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 pb-3 min-w-max">
            {tabs.map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)} 
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap", 
                  activeTab === tab 
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50" 
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-900 scrollbar-thin scrollbar-thumb-slate-700">
          {categorizedModels[activeTab]?.length === 0 ? (
            <div className="col-span-full text-center text-slate-500 py-10">未找到相关模型</div>
          ) : (
            categorizedModels[activeTab]?.map(m => (
              <button 
                key={m} 
                onClick={() => { onSelect(m); onClose(); }} 
                className="group flex justify-between items-center p-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:border-blue-500 hover:bg-blue-900/10 text-left transition-all"
              >
                <span className="text-xs text-slate-300 group-hover:text-white truncate font-mono">{m}</span>
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity"/>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// --- B. 模型触发按钮 (顶部快捷栏使用) ---
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, colorTheme = "slate", className }) => {
  const [isManual, setIsManual] = useState(false);
  
  const themes = { 
    slate: { border: "border-slate-700", icon: "text-slate-400", bg: "bg-slate-900", hover: "hover:border-slate-500" }, 
    blue: { border: "border-blue-900/50", icon: "text-blue-400", bg: "bg-blue-950/20", hover: "hover:border-blue-500" }, 
    purple: { border: "border-purple-900/50", icon: "text-purple-400", bg: "bg-purple-950/20", hover: "hover:border-purple-500" } 
  };
  const t = themes[colorTheme] || themes.slate;
  
  return (
    <div className={cn("flex items-center rounded-lg border transition-all h-9 group overflow-hidden", t.bg, t.border, t.hover, className || "w-40 md:w-56")}>
      <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full shrink-0 select-none bg-black/10">
        <Icon size={14} className={t.icon}/>
        <span className={cn("text-xs font-medium hidden lg:inline", t.icon)}>{label}</span>
      </div>
      <div className="flex-1 px-2 h-full flex items-center min-w-0 cursor-pointer" onClick={!isManual ? onOpenPicker : undefined}>
        {isManual ? (
          <input 
            value={value} 
            onChange={e => onManualChange(e.target.value)} 
            className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono" 
            autoFocus 
            onBlur={() => setIsManual(false)}
            placeholder="Input ID..."
          />
        ) : (
          <div className="w-full flex justify-between items-center text-xs text-slate-300 font-mono group-hover:text-white transition-colors">
            <span className="truncate mr-1" title={value}>{value || "Default"}</span>
            <ChevronDown size={12} className="opacity-50 group-hover:opacity-100"/>
          </div>
        )}
      </div>
      <button 
        onClick={e => { e.stopPropagation(); setIsManual(!isManual); }} 
        className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50 shrink-0 hover:bg-white/5 transition-colors"
        title="手动输入"
      >
        <Pencil size={12}/>
      </button>
    </div>
  );
};

// --- C. 配置中心 (Settings) ---
const ConfigCenter = ({ onClose, fetchModels, availableModels, isLoadingModels }) => {
  const { config, setConfig } = useProject();
  const [activeTab, setActiveTab] = useState("analysis");
  const [showModelPicker, setShowModelPicker] = useState(false);
  
  const updateConfig = (key, value) => {
    setConfig(prev => ({ 
      ...prev, 
      [activeTab]: { ...prev[activeTab], [key]: value } 
    }));
  };
  
  const tabs = [
    {id:"analysis", label:"大脑 (LLM)", icon:Brain, color:"text-blue-400"},
    {id:"image", label:"画师 (Image)", icon:Palette, color:"text-purple-400"},
    {id:"video", label:"摄像 (Video)", icon:Film, color:"text-orange-400"},
    {id:"audio", label:"录音 (Audio)", icon:Mic, color:"text-green-400"}
  ];
  
  const cur = config[activeTab];
  const curTabInfo = tabs.find(t => t.id === activeTab);

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4 md:p-8 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[80vh] rounded-2xl flex overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 左侧导航 */}
        <div className="w-64 bg-slate-950 border-r border-slate-800 p-4 space-y-2 flex flex-col shrink-0">
          <div className="mb-6 px-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="text-blue-500"/> 设置中心
            </h2>
            <p className="text-[10px] text-slate-500 mt-1">配置各模块的 AI 引擎</p>
          </div>
          {tabs.map(t => (
            <button 
              key={t.id} 
              onClick={() => setActiveTab(t.id)} 
              className={cn(
                "w-full flex gap-3 px-4 py-3 rounded-lg transition-all text-left items-center", 
                activeTab === t.id 
                  ? "bg-slate-800 text-white border border-slate-700 shadow-md" 
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              )}
            >
              <t.icon size={18} className={activeTab === t.id ? t.color : ""}/>
              <span className="text-sm font-medium">{t.label}</span>
            </button>
          ))}
        </div>
        
        {/* 右侧内容 */}
        <div className="flex-1 p-8 space-y-8 overflow-y-auto bg-slate-900 scrollbar-thin">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
             <div className="flex items-center gap-3">
                 <div className={cn("p-2 rounded-lg bg-slate-800", curTabInfo.color.replace('text', 'bg').replace('400', '900/20'))}>
                    <curTabInfo.icon size={24} className={curTabInfo.color}/>
                 </div>
                 <h3 className="text-2xl font-bold text-white">{curTabInfo.label} API 设置</h3>
             </div>
             <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg transition-transform active:scale-95">
                完成设定
             </button>
          </div>
          
          {/* 表单区域 */}
          <div className="space-y-6 max-w-2xl">
             <div className="space-y-4">
                 <h4 className="text-xs font-bold text-slate-500 uppercase flex gap-2 items-center tracking-wider">
                    <Server size={12}/> 连接参数 (Endpoint)
                 </h4>
                 
                 <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Base URL</label>
                    <input 
                        value={cur.baseUrl} 
                        onChange={e => updateConfig('baseUrl', e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                        placeholder="https://api.openai.com"
                    />
                    <p className="text-[10px] text-slate-500">提示: 请输入完整的基础路径，例如 https://api.openai.com (无需 /v1)</p>
                 </div>
                 
                 <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">API Key</label>
                    <input 
                        type="password" 
                        value={cur.key} 
                        onChange={e => updateConfig('key', e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                        placeholder="sk-..."
                    />
                 </div>
             </div>

             <div className="pt-6 border-t border-slate-800 space-y-4">
                 <div className="flex justify-between items-end">
                    <label className="text-xs text-slate-300 font-medium">Model ID</label>
                    <button 
                        onClick={() => fetchModels(activeTab)} 
                        disabled={isLoadingModels}
                        className="text-xs text-blue-400 hover:text-blue-300 flex gap-1 items-center transition-colors disabled:opacity-50"
                    >
                        {isLoadingModels ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} 
                        测试连接并获取列表
                    </button>
                 </div>
                 
                 <ModelTrigger 
                    label="当前模型" 
                    icon={LayoutGrid} 
                    value={cur.model} 
                    onOpenPicker={() => { fetchModels(activeTab); setShowModelPicker(true); }} 
                    onManualChange={v => updateConfig('model', v)} 
                    className="w-full h-12 bg-slate-950" 
                    colorTheme={curTabInfo.color.split('-')[1]}
                 />
                 
                 <div className="bg-blue-900/10 border border-blue-900/30 p-3 rounded text-[11px] text-blue-300/80 leading-relaxed">
                    <strong>推荐配置:</strong><br/>
                    • LLM: gemini-2.0-flash-exp (免费且强), gpt-4o<br/>
                    • Image: nanobanana-2-pro (强参考), midjourney, flux<br/>
                    • Video: kling-v1.6 (性价比), hailuo, sora-turbo<br/>
                    • Audio: tts-1-hd, eleven-multilingual-v2
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
        title={curTabInfo.label}
      />
    </div>
  );
};

// --- D. 图片预览器 (支持滚轮缩放) ---
const ImagePreviewModal = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });

  // 屏蔽背景滚动
  useEffect(() => {
    if (url) document.body.style.overflow = 'hidden';
    return () => document.body.style.overflow = '';
  }, [url]);

  // 滚轮缩放逻辑
  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();
      setScale(s => {
        const newScale = s - e.deltaY * 0.001;
        return Math.max(0.1, Math.min(10, newScale));
      });
    };
    if (url) document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [url]);

  if (!url) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center overflow-hidden cursor-move" 
      onClick={onClose}
      onMouseDown={e => {
        setIsDragging(true);
        startRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      }}
      onMouseMove={e => {
        if (isDragging) {
          e.preventDefault();
          setPos({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
        }
      }}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
    >
      <img 
        src={url} 
        draggable={false}
        className="max-w-none transition-transform duration-75 ease-linear select-none" 
        style={{ 
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          cursor: isDragging ? 'grabbing' : 'grab'
        }} 
        onClick={e => e.stopPropagation()} 
      />
      
      {/* 顶部控制栏 */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
          <div className="bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-full text-xs text-white border border-slate-700 font-mono">
             {Math.round(scale * 100)}%
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur transition-colors"
          >
            <X size={20}/>
          </button>
      </div>
      
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-2 rounded-full text-xs text-slate-300 backdrop-blur pointer-events-none">
        滚轮缩放 • 拖拽移动 • 点击空白关闭
      </div>
    </div>
  );
};

// --- E. 灵感老虎机 (Inspiration Slot Machine) ---
const InspirationSlotMachine = ({ onClose }) => {
  const { setScriptContext, callApi } = useProject();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

  const handleSpin = async () => {
    setSpinning(true);
    setResult(null);
    try {
      const prompt = `Brainstorm a unique film concept. Return JSON: {"genre":"...", "visual_style":"...", "logline":"..."}. Be creative.`;
      const res = await callApi('analysis', { system: "Creative Director. JSON output only.", user: prompt });
      const json = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
      setResult(json);
    } catch (e) {
      setResult({ genre: "Error", visual_style: "Check API", logline: e.message });
    } finally {
      setSpinning(false);
    }
  };

  const applyInspiration = () => {
    if (!result) return;
    setScriptContext(prev => ({
        ...prev,
        style: result.visual_style,
        direction: `Genre: ${result.genre}. Premise: ${result.logline}`,
        script: `(Based on idea: ${result.logline})\n\n[Opening Scene]...`
    }));
    onClose();
    alert("灵感已注入导演控制台！");
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gradient-to-br from-indigo-900 to-purple-900 border border-purple-500/50 w-full max-w-md rounded-2xl p-8 shadow-2xl text-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 背景装饰 */}
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none"/>
        
        <h2 className="text-2xl font-bold text-white mb-2 flex justify-center gap-2 items-center relative z-10">
            <Sparkles className="text-yellow-400 fill-yellow-400" size={24}/> 
            AI 灵感风暴
        </h2>
        <p className="text-xs text-purple-200 mb-8 relative z-10">让大语言模型为你构思下一个爆款视频</p>
        
        <div className="min-h-[160px] flex items-center justify-center relative z-10 mb-6">
            {spinning ? (
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={48} className="text-yellow-400 animate-spin"/>
                    <span className="text-sm text-purple-200 animate-pulse">连接宇宙脑波...</span>
                </div>
            ) : result ? (
                <div className="w-full text-left space-y-3 animate-in zoom-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-black/40 p-3 rounded-lg border border-purple-500/30">
                            <div className="text-[10px] text-purple-400 uppercase font-bold">Genre</div>
                            <div className="text-sm font-bold text-white truncate">{result.genre}</div>
                        </div>
                        <div className="bg-black/40 p-3 rounded-lg border border-purple-500/30">
                            <div className="text-[10px] text-purple-400 uppercase font-bold">Style</div>
                            <div className="text-sm font-bold text-white truncate">{result.visual_style}</div>
                        </div>
                    </div>
                    <div className="bg-black/40 p-4 rounded-lg border border-purple-500/30">
                        <div className="text-[10px] text-purple-400 uppercase font-bold mb-1">Logline</div>
                        <div className="text-xs text-slate-200 leading-relaxed italic">"{result.logline}"</div>
                    </div>
                </div>
            ) : (
                <div className="text-purple-300/50 flex flex-col items-center">
                    <Brain size={64} className="mb-4 opacity-50"/>
                    <p className="text-sm">点击下方按钮开始</p>
                </div>
            )}
        </div>

        <div className="space-y-3 relative z-10">
            <button 
                onClick={handleSpin} 
                disabled={spinning} 
                className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-black text-lg rounded-xl shadow-lg shadow-orange-900/50 flex items-center justify-center gap-2 transform transition-transform active:scale-95 disabled:opacity-50"
            >
                <Dices size={24}/> {spinning ? "构思中..." : "生成 AI 创意"}
            </button>
            
            {result && (
                <button 
                    onClick={applyInspiration} 
                    className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    采用此方案并填入控制台
                </button>
            )}
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 核心模块 3: 角色工坊 (CharacterLab)
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
  const [targetLang, setTargetLang] = useState("Chinese"); // Chinese | English
  const [imgStrength, setImgStrength] = useState(1.0); // 默认 1.0 (强参考)
  const [isGeneratingGrid, setIsGeneratingGrid] = useState(false);

  // B. 12宫格数据 (每个格子独立存储历史)
  // 结构: { [index]: [{ url, loading, error, timestamp }] }
  const [gridImages, setGridImages] = useState({}); 

  // C. 签约中心状态
  const [showSignModal, setShowSignModal] = useState(false);
  const [signStatus, setSignStatus] = useState('idle'); // idle, analyzing, generating_portrait, generating_sheet
  const [signParams, setSignParams] = useState({
      name: "",
      voice: "",
      visual_head: "",
      visual_upper: "",
      visual_lower: "",
      visual_access: "",
      style: ""
  });
  
  // D. 签约生成历史 (双轨)
  const [portraitHistory, setPortraitHistory] = useState([]);
  const [sheetHistory, setSheetHistory] = useState([]);
  const [portraitIdx, setPortraitIdx] = useState(0);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [selectedRefIndices, setSelectedRefIndices] = useState([0, 3, 2, 1]); // 默认选几个

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
      // 获取用户勾选的12宫格图片 + 原参考图
      const refs = [];
      if (refImage) refs.push(refImage);
      selectedRefIndices.forEach(idx => {
          const hist = gridImages[idx];
          if (hist && hist.length > 0 && !hist[hist.length-1].error) {
              refs.push(hist[hist.length-1].url);
          }
      });
      return refs; // Base64 Array
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

    // 并发控制 (简单的 for 循环，实际可优化为队列)
    for (let i = 0; i < initialPrompts.length; i++) {
        await handleGenSingleSlot(i, initialPrompts[i]);
    }
    setIsGeneratingGrid(false);
  };

  const handleGenSingleSlot = async (idx, item) => {
      setGridImages(prev => ({ ...prev, [idx]: [...(prev[idx]||[]), { loading: true }] }));
      try {
          const url = await callApi('image', {
              prompt: item.fullPrompt,
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

  // --- 5. 核心功能: 签约中心 (Auto Analyze) ---
  const openSignModal = async () => {
      const hasGrid = Object.keys(gridImages).length > 0;
      if (!description && !refImage && !hasGrid) return alert("请先在工坊中创造角色");
      
      setShowSignModal(true);
      if (signParams.visual_head) return; // 已有数据不重复分析

      setSignStatus('analyzing');
      try {
          // 收集素材 (原图 + 正面 + 特写)
          const assets = [];
          if (refImage) assets.push(refImage);
          if (gridImages[0]?.length) assets.push(gridImages[0].slice(-1)[0].url); // 正面
          if (gridImages[3]?.length) assets.push(gridImages[3].slice(-1)[0].url); // 特写

          if (assets.length === 0 && !description) throw new Error("无素材可分析");

          const prompt = `Role: Character Concept Director.
          Task: Analyze these images/description and output a structured profile.
          Output JSON Only: {
            "visual_head": "Detailed face/hair/makeup description...",
            "visual_upper": "Detailed top clothing/accessories...",
            "visual_lower": "Detailed pants/shoes/legwear (INVENT IF MISSING)...",
            "visual_access": "Held items or signature accessories...",
            "style": "Art style keywords (e.g. Cyberpunk, 3D render)...",
            "voice_tone": "Voice description (e.g. Raspy, deep, cheerful)..."
          }
          Language: ${targetLang === 'Chinese' ? 'Simplified Chinese' : 'English'}.
          Context: ${description || "See images"}`;

          const res = await callApi('analysis', { system: "JSON Output Only", user: prompt, assets });
          const json = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
          
          setSignParams(prev => ({ ...prev, ...json }));
      } catch (e) {
          alert("自动分析失败，请手动填写: " + e.message);
      } finally {
          setSignStatus('idle');
      }
  };

  // 生成定妆照 (Portrait)
  const handleGenPortrait = async () => {
      if (!signParams.visual_head) return alert("请先填写角色参数");
      setSignStatus('generating_portrait');
      setPortraitHistory(p => [...p, { loading: true }]);
      setPortraitIdx(p => p + 1);

      try {
          const refs = getActiveRefs();
          const p = signParams;
          // 提示词规范: 干净背景，半身
          const prompt = `(Character Portrait), (Waist Up), (Clean Background).
          Visuals: ${p.visual_head}, ${p.visual_upper}, ${p.style}.
          Negative: multiple people, bad hands, text.`;

          const url = await callApi('image', { prompt, aspectRatio: "3:4", refImages: refs, strength: 0.65 });
          setPortraitHistory(prev => { const n = [...prev]; n[n.length-1] = { url, loading: false }; return n; });
      } catch (e) {
          setPortraitHistory(prev => { const n = [...prev]; n[n.length-1] = { error: e.message, loading: false }; return n; });
      } finally {
          setSignStatus('idle');
      }
  };

  // 生成设定图 (Sheet)
  const handleGenSheet = async () => {
      if (!signParams.visual_head) return alert("请先填写角色参数");
      setSignStatus('generating_sheet');
      setSheetHistory(p => [...p, { loading: true }]);
      setSheetIdx(p => p + 1);

      try {
          const refs = getActiveRefs();
          const p = signParams;
          // 提示词规范: 三视图，全身
          const prompt = `(Character Design Sheet), (Three Views: Front, Side, Back), (Full Body).
          Visuals: ${p.visual_head}, ${p.visual_upper}, ${p.visual_lower}, ${p.visual_access}, ${p.style}.
          Layout: White background, professional concept art.`;

          const url = await callApi('image', { prompt, aspectRatio: "16:9", refImages: refs, strength: 0.65 });
          setSheetHistory(prev => { const n = [...prev]; n[n.length-1] = { url, loading: false }; return n; });
      } catch (e) {
          setSheetHistory(prev => { const n = [...prev]; n[n.length-1] = { error: e.message, loading: false }; return n; });
      } finally {
          setSignStatus('idle');
      }
  };

  // 最终签约 (Register)
  const handleRegisterActor = () => {
      const portrait = portraitHistory[portraitIdx];
      const sheet = sheetHistory[sheetIdx];
      
      if (!portrait?.url || !sheet?.url) return alert("请确保定妆照和设定图都已生成并确认");
      if (!signParams.name) return alert("请填写演员名称");

      const newActor = {
          id: Date.now(),
          name: signParams.name,
          voice_tone: signParams.voice_tone,
          desc: signParams, // 存入完整结构化描述
          images: {
              portrait: portrait.url,
              sheet: sheet.url
          }
      };
      
      setActors(prev => [...prev, newActor]);
      setShowSignModal(false);
      alert(`签约成功！演员 ${signParams.name} 已入库。`);
  };

  // --- UI 部分 ---
  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      {/* 左侧控制栏 */}
      <div className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col z-10">
         <div className="p-4 border-b border-slate-800">
             <h2 className="text-white font-bold flex items-center gap-2"><UserCircle2 className="text-blue-400"/> 角色工坊</h2>
         </div>
         <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
             {/* 1. 参考图 */}
             <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-400">基础参考图 (Base Ref)</label>
                 <div className="relative group w-full h-32 border-2 border-dashed border-slate-700 rounded-lg hover:border-blue-500 transition-colors overflow-hidden bg-slate-900/50">
                     <input type="file" accept="image/*" onChange={handleUploadRef} className="absolute inset-0 opacity-0 cursor-pointer z-10"/>
                     {refImage ? (
                         <img src={refImage} className="w-full h-full object-cover"/>
                     ) : (
                         <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                             <Upload size={24} className="mb-2"/>
                             <span className="text-[10px]">点击上传</span>
                         </div>
                     )}
                     {refImage && <button onClick={(e)=>{e.preventDefault();setRefImage(null)}} className="absolute top-1 right-1 p-1 bg-red-600 rounded-full text-white z-20"><X size={12}/></button>}
                 </div>
             </div>
             
             {/* 2. 描述与设置 */}
             <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-400">角色描述</label>
                 <textarea value={description} onChange={e=>setDescription(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs resize-none outline-none focus:border-blue-500" placeholder="例如：一位穿着赛博朋克夹克的银发少女..."/>
             </div>

             <div className="grid grid-cols-2 gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                 <div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={aspectRatio} onChange={e=>setAspectRatio(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></div>
                 <div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={targetLang} onChange={e=>setTargetLang(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white"><option value="Chinese">中文</option><option value="English">English</option></select></div>
                 <div className="col-span-2 pt-2 border-t border-slate-700/50 space-y-1">
                     <div className="flex justify-between text-[10px] text-slate-400"><span>参考图权重</span><span className="text-blue-400">{imgStrength}</span></div>
                     <input type="range" min="0.1" max="1.0" step="0.1" value={imgStrength} onChange={e=>setImgStrength(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/>
                     <p className="text-[9px] text-slate-500 leading-tight">* 1.0 为强参考，0.5 给予模型更多幻想空间。</p>
                 </div>
             </div>
             
             {/* 3. 核心操作 */}
             <button onClick={handleGenGrid} disabled={isGeneratingGrid} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                 {isGeneratingGrid ? <Loader2 className="animate-spin" size={16}/> : <LayoutGrid size={16}/>} 生成/刷新 12 视角
             </button>

             <button onClick={openSignModal} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2">
                 <FileText size={16}/> 制作设定卡 & 签约
             </button>
             
             {/* 4. 演员库 */}
             {actors.length > 0 && (
                 <div className="pt-4 border-t border-slate-800">
                     <h3 className="text-xs font-bold text-slate-400 mb-2">已签约演员 ({actors.length})</h3>
                     <div className="grid grid-cols-3 gap-2">
                         {actors.map(actor => (
                             <div key={actor.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 group cursor-pointer" title={actor.name}>
                                 <img src={actor.images.portrait} className="w-full h-full object-cover"/>
                                 <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition-opacity">{actor.name}</div>
                                 <button onClick={()=>setActors(p=>p.filter(a=>a.id!==actor.id))} className="absolute top-0 right-0 p-1 bg-red-600 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500"><X size={8}/></button>
                             </div>
                         ))}
                     </div>
                 </div>
             )}
         </div>
      </div>

      {/* 右侧：12宫格视图 */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
              {FIXED_VIEWS.map((view, idx) => {
                  const history = gridImages[idx] || [];
                  const current = history.length > 0 ? history[history.length-1] : null;
                  
                  return (
                      <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow hover:border-blue-500/50 transition-all flex flex-col group">
                          {/* 图片区 */}
                          <div className={cn("bg-black relative w-full shrink-0", aspectRatio==="16:9"?"aspect-video":aspectRatio==="9:16"?"aspect-[9/16]":"aspect-square")}>
                              {current?.loading ? (
                                  <div className="absolute inset-0 flex items-center justify-center text-blue-500"><Loader2 className="animate-spin"/></div>
                              ) : current?.error ? (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 p-2 text-center text-xs"><span>Error</span><span className="opacity-50">{current.error}</span></div>
                              ) : current?.url ? (
                                  <>
                                    <img src={current.url} className="w-full h-full object-cover cursor-zoom-in" onClick={()=>onPreview(current.url)}/>
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button onClick={()=>saveAs(current.url, `${view.key}.png`)} className="p-1.5 bg-black/60 rounded text-white hover:bg-blue-600"><Download size={12}/></button>
                                        <button onClick={()=>handleGenSingleSlot(idx, clPrompts[idx])} className="p-1.5 bg-black/60 rounded text-white hover:bg-green-600"><RefreshCw size={12}/></button>
                                    </div>
                                  </>
                              ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
                                      <button onClick={()=>handleGenSingleSlot(idx, { fullPrompt: `(${description}), ${view.prompt}` })} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-full shadow">单独生成</button>
                                  </div>
                              )}
                              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-[10px] text-white border border-white/10">{view.title}</div>
                          </div>
                          {/* 底部信息 */}
                          <div className="p-2 border-t border-slate-800 bg-slate-900/50 min-h-[40px] flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 font-mono truncate flex-1" title={view.prompt}>{view.prompt}</span>
                              <div className="text-[10px] text-slate-600 pl-2">{history.length>0 ? history.length : 0}v</div>
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>

      {/* 弹窗：签约中心 */}
      {showSignModal && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="w-full max-w-6xl h-[90vh] bg-slate-900 border border-purple-500/30 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95">
                  {/* Header */}
                  <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950">
                      <h3 className="text-white font-bold flex items-center gap-2"><FileText className="text-purple-400"/> 角色定妆与签约中心</h3>
                      <button onClick={()=>setShowSignModal(false)}><X className="text-slate-500 hover:text-white"/></button>
                  </div>
                  
                  {/* Body */}
                  <div className="flex-1 flex overflow-hidden">
                      {/* 左侧参数区 (30%) */}
                      <div className="w-96 border-r border-slate-800 p-6 bg-slate-900/50 overflow-y-auto scrollbar-thin space-y-4">
                          {signStatus === 'analyzing' ? (
                              <div className="h-full flex flex-col items-center justify-center text-purple-400 gap-4">
                                  <Brain size={48} className="animate-pulse"/>
                                  <p className="text-xs text-center">AI 艺术总监正在分析素材...</p>
                              </div>
                          ) : (
                              <>
                                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-500">演员名称</label><input value={signParams.name} onChange={e=>setSignParams({...signParams, name:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-bold" placeholder="例如: Neo"/></div>
                                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-slate-500">声线特点</label><input value={signParams.voice_tone} onChange={e=>setSignParams({...signParams, voice_tone:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300"/></div>
                                
                                <div className="space-y-2 pt-2 border-t border-slate-800">
                                    <div className="text-[10px] font-bold text-blue-400 uppercase">视觉特征 (可手动修正)</div>
                                    <textarea value={signParams.visual_head} onChange={e=>setSignParams({...signParams, visual_head:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] text-slate-300 resize-none" placeholder="Head..."/>
                                    <textarea value={signParams.visual_upper} onChange={e=>setSignParams({...signParams, visual_upper:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] text-slate-300 resize-none" placeholder="Upper Body..."/>
                                    <textarea value={signParams.visual_lower} onChange={e=>setSignParams({...signParams, visual_lower:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] text-slate-300 resize-none" placeholder="Lower Body..."/>
                                    <textarea value={signParams.style} onChange={e=>setSignParams({...signParams, style:e.target.value})} className="w-full h-12 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] text-pink-300 resize-none" placeholder="Art Style..."/>
                                </div>

                                <div className="pt-2 border-t border-slate-800">
                                    <label className="text-[10px] uppercase font-bold text-green-400 mb-2 block">签约素材库 (最多选5张)</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {/* 原图 */}
                                        {refImage && <div onClick={()=>{}} className="aspect-square border-2 border-green-500 rounded overflow-hidden"><img src={refImage} className="w-full h-full object-cover"/></div>}
                                        {/* 12宫格图 */}
                                        {Object.entries(gridImages).map(([k,v]) => {
                                            const url = v[v.length-1]?.url;
                                            if(!url) return null;
                                            const isSel = selectedRefIndices.includes(parseInt(k));
                                            return <div key={k} onClick={()=>setSelectedRefIndices(p=>isSel?p.filter(i=>i!=k):[...p,parseInt(k)])} className={cn("aspect-square border-2 rounded overflow-hidden cursor-pointer", isSel?"border-green-500":"border-transparent opacity-50 hover:opacity-100")}><img src={url} className="w-full h-full object-cover"/></div>
                                        })}
                                    </div>
                                </div>
                              </>
                          )}
                      </div>

                      {/* 右侧生成预览区 (70%) */}
                      <div className="flex-1 bg-black p-8 flex flex-col gap-6 items-center justify-center">
                          <div className="flex gap-8 w-full max-w-4xl h-[450px]">
                              {/* 定妆照卡片 */}
                              <div className="flex-1 flex flex-col gap-2">
                                  <div className="flex justify-between text-xs font-bold text-slate-400"><span>定妆照 (Portrait)</span><span>{portraitHistory.length > 0 ? `${portraitIdx+1}/${portraitHistory.length}` : ''}</span></div>
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative group">
                                      {portraitHistory[portraitIdx]?.loading ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500"/></div> :
                                       portraitHistory[portraitIdx]?.url ? <img src={portraitHistory[portraitIdx].url} className="w-full h-full object-contain cursor-zoom-in" onClick={()=>onPreview(portraitHistory[portraitIdx].url)}/> :
                                       <div className="absolute inset-0 flex items-center justify-center text-slate-700"><UserCircle2 size={48}/></div>}
                                       
                                      {/* 历史回溯按钮 */}
                                      {portraitHistory.length>1 && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 rounded-full flex gap-2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={()=>setPortraitIdx(i=>Math.max(0,i-1))}><ChevronLeft size={14} className="text-white"/></button><button onClick={()=>setPortraitIdx(i=>Math.min(portraitHistory.length-1,i+1))}><ChevronRight size={14} className="text-white"/></button></div>}
                                  </div>
                                  <button onClick={handleGenPortrait} disabled={signStatus!=='idle'} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs flex items-center justify-center gap-2"><RefreshCw size={12}/> 生成/重绘</button>
                              </div>

                              {/* 设定图卡片 */}
                              <div className="flex-[1.5] flex flex-col gap-2">
                                  <div className="flex justify-between text-xs font-bold text-slate-400"><span>设定图 (Sheet)</span><span>{sheetHistory.length > 0 ? `${sheetIdx+1}/${sheetHistory.length}` : ''}</span></div>
                                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative group">
                                      {sheetHistory[sheetIdx]?.loading ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-purple-500"/></div> :
                                       sheetHistory[sheetIdx]?.url ? <img src={sheetHistory[sheetIdx].url} className="w-full h-full object-contain cursor-zoom-in" onClick={()=>onPreview(sheetHistory[sheetIdx].url)}/> :
                                       <div className="absolute inset-0 flex items-center justify-center text-slate-700"><LayoutGrid size={48}/></div>}

                                      {/* 历史回溯按钮 */}
                                      {sheetHistory.length>1 && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 rounded-full flex gap-2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={()=>setSheetIdx(i=>Math.max(0,i-1))}><ChevronLeft size={14} className="text-white"/></button><button onClick={()=>setSheetIdx(i=>Math.min(sheetHistory.length-1,i+1))}><ChevronRight size={14} className="text-white"/></button></div>}
                                  </div>
                                  <button onClick={handleGenSheet} disabled={signStatus!=='idle'} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs flex items-center justify-center gap-2"><RefreshCw size={12}/> 生成/重绘</button>
                              </div>
                          </div>
                          
                          {/* 底部确认栏 */}
                          <div className="w-full max-w-4xl border-t border-slate-800 pt-6 flex justify-end gap-4">
                              <div className="text-xs text-slate-500 flex items-center gap-2 mr-auto">
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  <span>当前显示的图片将被锁定为最终签约照</span>
                              </div>
                              <button onClick={handleRegisterActor} className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transform transition-transform active:scale-95">
                                  <CheckCircle2 size={18}/> 确认签约并入库
                              </button>
                          </div>
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
  
  // B. AI 助手状态
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
      { role: 'assistant', content: '我是您的 AI 分镜导演。请在上方输入剧本，我将为您拆解镜头。' }
  ]);
  
  // C. 视频生成状态
  const [genStatus, setGenStatus] = useState({}); // { [id]: 'loading' | 'success' | 'error' }

  // --- 2. 辅助逻辑 ---
  const handleAssetUpload = (e) => {
      const file = e.target.files?.[0];
      if (file) {
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

  // --- 3. 核心功能: 剧本分析 (LLM) ---
  const handleAnalyzeScript = async () => {
      const { script, direction, style, physics } = scriptContext;
      if (!script) return alert("请先填写剧本");
      
      setIsAnalyzing(true);
      try {
          // 注入演员信息
          const castList = actors.filter(a => selectedActors.includes(a.id));
          const castPrompt = castList.length > 0 
              ? `Available Cast: ${castList.map(a => `${a.name} (${a.desc.visual_upper})`).join(', ')}.`
              : "No specific cast selected.";

          const system = `Role: Professional Film Director.
          Task: Break down the script into a Shot List for AI Video Generation (Sora v2).
          
          Context:
          - Genre/Direction: ${direction}
          - Visual Style: ${style}
          - Physics Rules: ${physics}
          - ${castPrompt}
          
          Requirements:
          1. Replace generic names (e.g. "The man") with Actor Names if applicable.
          2. visual: Detailed visual description of the subject and action.
          3. camera: Specific camera movement (e.g. "Truck Left", "Dolly Zoom", "Orbit").
          4. sfx: Sound effects description (No dialogue here).
          5. audio: Dialogue lines (if any).
          6. duration: Estimated duration in seconds (2-5s).
          
          Output JSON Array Only:
          [{"id": 1, "visual": "...", "camera": "...", "sfx": "...", "audio": "...", "duration": 4}]`;

          const res = await callApi('analysis', { system, user: script });
          const json = JSON.parse(res.match(/\[[\s\S]*\]/)?.[0] || "[]");
          
          // 转换 ID 避免冲突
          const newShots = json.map(s => ({
              ...s,
              id: Date.now() + Math.random(),
              displayId: s.id,
              keyframeUrl: null // 初始化无图
          }));
          
          setShots(newShots);
          setChatMessages(p => [...p, { role: 'assistant', content: `分析完成！已为您拆解为 ${newShots.length} 个镜头。您可以在下方编辑每一个镜头的细节。` }]);
      } catch (e) {
          alert("剧本分析失败: " + e.message);
      } finally {
          setIsAnalyzing(false);
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
              console.log(`[Shot ${shot.displayId}] 使用演员 ${matchedActor.name} 的资产进行生成`);
          } else if (globalAsset) {
              // 未命中 -> 使用全局风格参考
              refImages = [globalAsset];
          }

          // C. 调用生图 API
          const url = await callApi('image', {
              prompt: basePrompt,
              aspectRatio: "16:9", // 视频默认 16:9
              refImages: refImages,
              strength: matchedActor ? 0.75 : 0.5 // 演员需要更高的一致性
          });
          
          // D. 更新 Shot 数据
          setShots(prev => prev.map(s => s.id === shot.id ? { ...s, keyframeUrl: url } : s));
          setGenStatus(prev => ({ ...prev, [shot.id]: 'success' }));

      } catch (e) {
          console.error(e);
          setGenStatus(prev => ({ ...prev, [shot.id]: 'error' }));
          alert(`镜头 ${shot.displayId} 生成失败: ${e.message}`);
      }
  };

  // --- 5. 核心功能: 大分镜组装 (Scene Assembly) ---
  // 逻辑: 模式 B (快照式) + Sora 编译器
  const handleAssembleScene = () => {
      if (activeShotIds.length === 0) return alert("请至少在左侧勾选一个镜头");
      
      // 1. 获取选中的 Shot 对象 (按在列表中的顺序)
      const selectedShots = shots.filter(s => activeShotIds.includes(s.id));
      
      // 2. 检查是否有关键帧 (这是生视频的基础)
      if (!selectedShots[0].keyframeUrl) {
          return alert("错误：所选的第一镜头 (Shot " + selectedShots[0].displayId + ") 必须先生成关键帧图片，作为视频的首帧锚定。");
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
          // 调用视频 API
          // 关键: 传入 compiledPrompt (Sora规范) 和 startImg (首帧)
          const url = await callApi('video', {
              prompt: scene.masterPrompt,
              startImg: scene.startImg,
              duration: Math.min(10, scene.duration), // 限制最大时长以防失败
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
          <div className={cn("bg-slate-900 border rounded-xl overflow-hidden flex flex-col transition-all group relative", isSelected ? "border-orange-500 ring-1 ring-orange-500" : "border-slate-800 hover:border-slate-600")}>
             {/* 顶部: 图片预览区 */}
             <div className="aspect-video bg-black relative shrink-0">
                 {shot.keyframeUrl ? (
                     <>
                        <img src={shot.keyframeUrl} className="w-full h-full object-cover"/>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={()=>saveAs(shot.keyframeUrl, `shot_${shot.displayId}.png`)} className="p-1 bg-black/60 text-white rounded"><Download size={12}/></button>
                            <button onClick={()=>onPreview(shot.keyframeUrl)} className="p-1 bg-black/60 text-white rounded"><Eye size={12}/></button>
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
                     <select 
                        value={shot.camera || ""} 
                        onChange={e => setShots(prev => prev.map(s => s.id === shot.id ? {...s, camera: e.target.value} : s))}
                        className="bg-slate-950 border border-slate-800 rounded p-1 text-[10px] text-slate-400 outline-none"
                     >
                        <option value="">(无运镜)</option>
                        <option value="Static">Static</option>
                        <option value="Pan Left">Pan Left</option>
                        <option value="Pan Right">Pan Right</option>
                        <option value="Tilt Up">Tilt Up</option>
                        <option value="Tilt Down">Tilt Down</option>
                        <option value="Dolly Zoom">Dolly Zoom</option>
                        <option value="Drone Shot">Drone Shot</option>
                        <option value="Handheld">Handheld</option>
                     </select>
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
      {/* ================= 左侧：分镜草稿流 (40%) ================= */}
      <div className="w-[40%] flex flex-col border-r border-slate-800 bg-slate-900/30">
        {/* 1. 导演控制台 (可折叠头部) */}
        <div className="p-4 border-b border-slate-800 bg-slate-900 shadow-md z-10 space-y-4 max-h-[40vh] overflow-y-auto scrollbar-thin">
            <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-white flex items-center gap-2"><Clapperboard size={16} className="text-purple-400"/> 导演控制台</h2>
                <div className="flex gap-2">
                    <label className="cursor-pointer text-slate-500 hover:text-white" title="上传通用参考图"><ImageIcon size={14}/><input type="file" className="hidden" onChange={handleAssetUpload}/></label>
                    <button onClick={() => setShots([])} className="text-slate-500 hover:text-red-400" title="清空分镜"><Trash2 size={14}/></button>
                </div>
            </div>
            
            {/* 剧本输入 */}
            <div className="space-y-2">
                <textarea value={scriptContext.script} onChange={e=>setScriptContext({...scriptContext, script:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white resize-none focus:border-purple-500 placeholder:text-slate-600" placeholder="剧本 / 故事大纲..."/>
                <div className="grid grid-cols-2 gap-2">
                    <input value={scriptContext.style} onChange={e=>setScriptContext({...scriptContext, style:e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-purple-500" placeholder="风格 (Style)"/>
                    <input value={scriptContext.direction} onChange={e=>setScriptContext({...scriptContext, direction:e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-purple-500" placeholder="环境 (Environment)"/>
                </div>
                <input value={scriptContext.physics} onChange={e=>setScriptContext({...scriptContext, physics:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-purple-500" placeholder="物理规则 (Physics, e.g. Low Gravity, Windy)"/>
            </div>

            {/* 演员选择 */}
            {actors.length > 0 && (
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">卡司 (Cast)</label>
                    <div className="flex flex-wrap gap-2">
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

        {/* 2. 小分镜列表 (Draft Stream) */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50 scrollbar-thin">
            <div className="flex justify-between items-center mb-4 sticky top-0 bg-slate-950/90 backdrop-blur z-10 py-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400">分镜草稿箱 ({shots.length})</span>
                {activeShotIds.length > 0 && (
                     <button onClick={handleAssembleScene} className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded-full font-bold shadow animate-in zoom-in flex items-center gap-1">
                         <Layers size={12}/> 组合 ({activeShotIds.length})
                     </button>
                )}
            </div>
            
            <div className="grid grid-cols-1 gap-4">
                {shots.map(shot => (
                    <ShotCard 
                        key={shot.id} 
                        shot={shot} 
                        isSelected={activeShotIds.includes(shot.id)} 
                        onToggle={toggleShotSelection}
                    />
                ))}
                {shots.length === 0 && <div className="text-center text-slate-600 py-10 text-xs">暂无镜头，请先在上方进行 AI 分析</div>}
            </div>
        </div>
      </div>

      {/* ================= 右侧：大分镜组装区 (60%) ================= */}
      <div className="flex-1 flex flex-col bg-slate-950 border-l border-slate-800">
          <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50">
              <h2 className="text-sm font-bold text-white flex items-center gap-2"><Layers size={16} className="text-orange-500"/> 大分镜组装 (Scene Assembly)</h2>
              <span className="text-xs text-slate-500">已生成的视频将自动同步至制片台</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              <div className="grid grid-cols-1 gap-8 max-w-3xl mx-auto">
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
                          <div className="flex flex-col md:flex-row">
                              {/* 视频/图片预览 (左侧) */}
                              <div className="md:w-1/2 aspect-video bg-black relative shrink-0">
                                  {scene.videoUrl ? (
                                      <video src={scene.videoUrl} controls className="w-full h-full object-cover"/>
                                  ) : (
                                      <>
                                          <img src={scene.startImg} className="w-full h-full object-cover opacity-60"/>
                                          {/* Ken Burns 模拟效果 */}
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"/>
                                          <div className="absolute inset-0 flex items-center justify-center">
                                              <button 
                                                onClick={() => handleGenVideo(scene)} 
                                                disabled={genStatus[`scene_${scene.id}`] === 'loading_video'}
                                                className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-full shadow-lg flex items-center gap-2 transition-transform hover:scale-105 disabled:opacity-50 disabled:scale-100"
                                              >
                                                  {genStatus[`scene_${scene.id}`] === 'loading_video' ? <Loader2 className="animate-spin"/> : <Film size={18}/>}
                                                  生成长视频
                                              </button>
                                          </div>
                                      </>
                                  )}
                              </div>
                              
                              {/* Prompt 代码预览 (右侧) */}
                              <div className="flex-1 p-3 bg-slate-950 border-l border-slate-800 flex flex-col relative group">
                                  <div className="flex justify-between text-[10px] text-slate-500 mb-1 uppercase font-bold">
                                      <span>Sora v2 Prompt Code</span>
                                      <button onClick={() => navigator.clipboard.writeText(scene.masterPrompt)} className="hover:text-white"><Copy size={10}/></button>
                                  </div>
                                  <textarea 
                                      readOnly 
                                      value={scene.masterPrompt} 
                                      className="flex-1 w-full bg-transparent text-[10px] font-mono text-slate-400 resize-none outline-none scrollbar-none hover:text-slate-300 transition-colors"
                                  />
                                  <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-600 flex justify-between">
                                      <span>Shots: {scene.shots.length}</span>
                                      <span>Aspect Ratio: 16:9</span>
                                  </div>
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
    shots, scenes, timeline, setTimeline, actors 
  } = useProject();

  const [activeBin, setActiveBin] = useState('scenes'); // scenes | shots | uploads
  const [playingClipId, setPlayingClipId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  
  // 本地上传素材状态
  const [uploads, setUploads] = useState([]);

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

  // 添加到时间轴
  const addToTimeline = (item, type) => {
      const newClip = {
          uuid: Date.now() + Math.random(),
          type: type, // 'scene' | 'shot' | 'upload'
          mediaType: item.videoUrl ? 'video' : (item.type || 'image'),
          url: item.videoUrl || item.keyframeUrl || item.url || item.startImg,
          duration: item.duration || 5, // 默认 5s
          name: item.title || `Shot ${item.displayId}` || item.name,
          sourceData: item
      };
      setTimeline(prev => [...prev, newClip]);
  };

  const removeFromTimeline = (uuid) => {
      setTimeline(prev => prev.filter(c => c.uuid !== uuid));
  };

  // --- 播放控制逻辑 ---
  const handlePlay = () => {
      if (timeline.length === 0) return;
      setIsPlaying(!isPlaying);
      if (!isPlaying) {
          // 开始播放: 从头开始或当前位置
          setPlayingClipId(timeline[0].uuid);
      } else {
          setPlayingClipId(null);
      }
  };

  // 简单的序列播放器副作用
  useEffect(() => {
      if (!isPlaying || !playingClipId) return;
      
      const currentIdx = timeline.findIndex(c => c.uuid === playingClipId);
      if (currentIdx === -1) {
          setIsPlaying(false);
          return;
      }

      const clip = timeline[currentIdx];
      const durationMs = (clip.duration || 5) * 1000;

      // 如果是视频，监听视频结束事件（这里简化为定时器模拟，实际应绑定 onEnded）
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

  // 当前显示的画面
  const currentDisplay = useMemo(() => {
      if (!playingClipId) return timeline.length > 0 ? timeline[0] : null;
      return timeline.find(c => c.uuid === playingClipId);
  }, [playingClipId, timeline]);

  // --- 导出逻辑 ---
  const handleExportEDL = () => {
      const header = "EDL EXPORT - AI DIRECTOR STUDIO v7.0\n------------------------------------\n";
      const content = timeline.map((c, i) => {
          return `${i+1}. [${c.mediaType.toUpperCase()}] ${c.name} (${c.duration}s)\n   Source: ${c.sourceData?.masterPrompt ? 'Sora Scene' : 'Single Shot'}`;
      }).join('\n\n');
      const blob = new Blob([header + content], { type: "text/plain;charset=utf-8" });
      saveAs(blob, "project_timeline.txt");
  };

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
        {/* 左侧：素材箱 */}
        <div className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col z-10">
            <div className="p-4 border-b border-slate-800 bg-slate-900">
                <h2 className="text-white font-bold flex items-center gap-2 mb-4"><FolderOpen className="text-orange-400"/> 制片素材箱</h2>
                <div className="flex bg-slate-800 rounded p-1">
                    {['scenes', 'shots', 'uploads'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveBin(tab)}
                            className={cn("flex-1 py-1 text-[10px] uppercase font-bold rounded transition-colors", activeBin === tab ? "bg-orange-600 text-white shadow" : "text-slate-500 hover:text-slate-300")}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                {activeBin === 'scenes' && scenes.map(scene => (
                    <div key={scene.id} onClick={() => addToTimeline(scene, 'scene')} className="group bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-orange-500 cursor-pointer flex gap-2 items-center">
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
                    <div key={shot.id} onClick={() => addToTimeline(shot, 'shot')} className="group bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-orange-500 cursor-pointer flex gap-2 items-center">
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
                        <label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-orange-500 hover:bg-slate-800/50 text-slate-500 gap-2">
                            <Upload size={16}/> <span className="text-xs">上传本地素材</span>
                            <input type="file" className="hidden" onChange={handleUpload}/>
                        </label>
                        {uploads.map(u => (
                            <div key={u.id} onClick={() => addToTimeline(u, 'upload')} className="group bg-slate-900 border border-slate-800 rounded-lg p-2 hover:border-orange-500 cursor-pointer flex gap-2 items-center">
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
                            <video 
                                src={currentDisplay.url} 
                                className="w-full h-full object-contain" 
                                autoPlay={isPlaying} 
                                loop 
                                controls={false}
                            />
                        ) : (
                            <div className="w-full h-full overflow-hidden relative">
                                <img 
                                    src={currentDisplay.url} 
                                    className={cn("w-full h-full object-contain", isPlaying ? "animate-[kenburns_10s_ease-out_forwards]" : "")} 
                                    style={{ transformOrigin: 'center center' }}
                                />
                                {isPlaying && <div className="absolute bottom-10 left-0 right-0 text-center text-white/50 text-sm animate-pulse font-mono">Simulating Motion (Ken Burns)...</div>}
                            </div>
                        )}
                        {/* 播放状态叠加层 */}
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
                {/* 工具栏 */}
                <div className="h-10 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-2"><Clock size={12}/> Timeline ({timeline.length} clips)</span>
                        <button onClick={() => setTimeline([])} className="text-[10px] text-slate-500 hover:text-red-400">清空</button>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={handleExportEDL} className="text-[10px] flex items-center gap-1 text-blue-400 hover:text-blue-300"><FileSpreadsheet size={12}/> 导出 EDL</button>
                        <button 
                            onClick={handlePlay} 
                            className={cn("flex items-center gap-1.5 px-6 py-1 text-white text-xs rounded-full font-bold transition-all shadow-lg", isPlaying ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500")}
                        >
                            {isPlaying ? <><span className="animate-pulse">●</span> 停止</> : <><Play size={12}/> 播放全片</>}
                        </button>
                    </div>
                </div>
                
                {/* 轨道 */}
                <div className="flex-1 overflow-x-auto p-4 space-x-1 flex items-center whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700 bg-slate-900/50 relative">
                    {/* 时间刻度线背景 (装饰) */}
                    <div className="absolute top-0 left-0 right-0 h-4 border-b border-slate-800 bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] opacity-20 pointer-events-none"/>
                    
                    {timeline.map((clip, idx) => (
                        <div 
                            key={clip.uuid} 
                            className={cn(
                                "inline-flex flex-col w-40 h-36 bg-slate-800 border rounded-lg overflow-hidden relative group shrink-0 transition-all cursor-pointer",
                                playingClipId === clip.uuid ? "border-green-500 ring-2 ring-green-500 z-10 scale-105 shadow-xl" : "border-slate-700 hover:border-orange-500"
                            )}
                            onClick={() => setPlayingClipId(clip.uuid)}
                        >
                            <div className="h-24 bg-black relative shrink-0">
                                {clip.mediaType === 'video' ? <video src={clip.url} className="w-full h-full object-cover"/> : <img src={clip.url} className="w-full h-full object-cover"/>}
                                <div className="absolute top-1 right-1 bg-black/60 px-1.5 rounded text-[9px] text-white font-mono">{clip.duration}s</div>
                                {clip.mediaType === 'video' && <div className="absolute top-1 left-1 bg-purple-600 px-1 rounded text-[8px] text-white"><Film size={8}/></div>}
                            </div>
                            <div className="flex-1 p-2 flex flex-col justify-between bg-slate-800">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-bold text-slate-300 truncate w-24" title={clip.name}>{idx+1}. {clip.name}</span>
                                    <button onClick={(e) => {e.stopPropagation(); removeFromTimeline(clip.uuid)}} className="text-slate-500 hover:text-red-400"><X size={10}/></button>
                                </div>
                                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-500 w-1/2 opacity-50"></div> {/* 模拟进度条 */}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {timeline.length === 0 && (
                        <div className="w-full text-center text-slate-600 text-xs italic">
                            👈 请从左侧素材箱添加镜头或上传视频
                        </div>
                    )}
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
  const [activeTab, setActiveTab] = useState('character'); // character | storyboard | studio
  const [showSettings, setShowSettings] = useState(false);
  const [showSlotMachine, setShowSlotMachine] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [activeModalType, setActiveModalType] = useState(null); // 'analysis' | 'image' | 'video'

  const { config, setConfig, fetchModels, availableModels, isLoadingModels } = useProject();

  // 快捷模型切换
  const handleQuickModelChange = (type, val) => {
    setConfig(prev => ({ ...prev, [type]: { ...prev[type], model: val } }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans select-none">
      {/* 全局弹窗层 */}
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      <ModelSelectionModal isOpen={activeModalType !== null} title={activeModalType?.toUpperCase()} models={availableModels} onClose={() => setActiveModalType(null)} onSelect={(m) => handleQuickModelChange(activeModalType, m)} />
      {showSettings && <ConfigCenter onClose={() => setShowSettings(false)} fetchModels={fetchModels} availableModels={availableModels} isLoadingModels={isLoadingModels}/>}
      {showSlotMachine && <InspirationSlotMachine onClose={() => setShowSlotMachine(false)} />}

      {/* 顶部导航栏 (Top Nav) */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex items-center justify-between px-4 z-50 shrink-0 shadow-lg">
        {/* Logo & Tabs */}
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
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                        "px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all", 
                        activeTab === tab.id 
                            ? "bg-slate-700 text-white shadow-md ring-1 ring-white/10" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    )}
                >
                    <tab.icon size={14} className={activeTab === tab.id ? tab.color : ""}/>
                    {tab.label}
                </button>
            ))}
          </div>
        </div>
        
        {/* Right Tools */}
        <div className="flex items-center gap-3">
          <div className="hidden xl:flex gap-3">
            <ModelTrigger label="大脑" icon={Brain} value={config.analysis.model} onOpenPicker={() => { setActiveModalType('analysis'); fetchModels('analysis'); }} onManualChange={(v) => handleQuickModelChange('analysis', v)} colorTheme="blue" />
            <ModelTrigger label="画师" icon={Palette} value={config.image.model} onOpenPicker={() => { setActiveModalType('image'); fetchModels('image'); }} onManualChange={(v) => handleQuickModelChange('image', v)} colorTheme="purple" />
            <ModelTrigger label="摄像" icon={Video} value={config.video.model} onOpenPicker={() => { setActiveModalType('video'); fetchModels('video'); }} onManualChange={(v) => handleQuickModelChange('video', v)} colorTheme="slate" />
          </div>
          
          <div className="h-6 w-px bg-slate-800 mx-2 hidden xl:block"></div>
          
          <button onClick={() => setShowSlotMachine(true)} className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white text-xs font-bold rounded-full shadow-lg shadow-orange-500/20 transition-all active:scale-95">
              <Sparkles size={12}/> 灵感
          </button>
          
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors" title="全局设置">
              <Settings size={20}/>
          </button>
        </div>
      </div>

      {/* Main Workspace (Tab Switching) */}
      <div className="flex-1 overflow-hidden relative bg-slate-950">
        <div className={cn("absolute inset-0 transition-opacity duration-300", activeTab === 'character' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none')}>
          <CharacterLab onPreview={setPreviewUrl} /> 
        </div>
        <div className={cn("absolute inset-0 transition-opacity duration-300", activeTab === 'storyboard' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none')}>
          <StoryboardStudio onPreview={setPreviewUrl} />
        </div>
        <div className={cn("absolute inset-0 transition-opacity duration-300", activeTab === 'studio' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none')}>
          <StudioBoard />
        </div>
      </div>
    </div>
  );
};

// 根组件导出
export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}
