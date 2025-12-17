import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, Brain, Volume2 } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) { return twMerge(clsx(inputs)); }

// --- 组件：大型模型选择弹窗 (支持搜索与分类 - 2025版) ---
const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");

  const categorizedModels = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const allFiltered = models.filter(m => m.toLowerCase().includes(lowerSearch));
    return {
      "All": allFiltered,
      "OpenAI": allFiltered.filter(m => m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('dall-e') || m.includes('tts')),
      "Google": allFiltered.filter(m => m.includes('gemini') || m.includes('imagen') || m.includes('veo') || m.includes('banana')),
      "Claude": allFiltered.filter(m => m.includes('claude')),
      "Image": allFiltered.filter(m => ['dall-e', 'mj', 'midjourney', 'flux', 'sd', 'stable-diffusion', 'imagen', 'drawing', 'nano', 'banana', 'recraft', 'jimeng'].some(k => m.toLowerCase().includes(k))),
      "Video": allFiltered.filter(m => ['sora', 'kling', 'luma', 'runway', 'minimax', 'hailuo', 'veo', 'wan', 'jimeng'].some(k => m.toLowerCase().includes(k))),
      "Audio": allFiltered.filter(m => ['tts', 'elevenlabs', 'suno', 'udio', 'fish'].some(k => m.toLowerCase().includes(k))),
    };
  }, [models, search]);

  const tabs = ["All", "OpenAI", "Google", "Claude", "Image", "Video", "Audio"];
  
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-white flex items-center gap-2"><LayoutGrid size={20} className="text-blue-500"/> 切换模型: <span className="text-blue-400">{title}</span></h3><button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400"><X size={20}/></button></div>
          <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-500"/><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型 ID (例如: nanobanana, gpt-5)..." className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"/></div>
        </div>
        <div className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 overflow-x-auto"><div className="flex gap-2 pb-3">{tabs.map(tab => (<button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-1.5 text-xs font-medium rounded-full border transition-all", activeTab === tab ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400")}>{tab} <span className="ml-1 opacity-50">{categorizedModels[tab].length}</span></button>))}</div></div>
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50">
          {categorizedModels[activeTab].length === 0 ? <div className="text-center text-slate-500 mt-10 text-sm">未找到匹配模型</div> : 
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{categorizedModels[activeTab].map(m => (<button key={m} onClick={() => { onSelect(m); onClose(); }} className="group flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900 hover:border-blue-500/50 hover:bg-slate-800 text-left"><span className="text-sm text-slate-300 group-hover:text-white truncate font-mono">{m}</span><ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"/></button>))}</div>}
        </div>
      </div>
    </div>
  );
};
// --- 组件：模型触发器 (TopBar & Settings Widget) ---
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, variant = "vertical", colorTheme = "slate" }) => {
  const [isManual, setIsManual] = useState(false);
  const themes = { slate: { border: "border-slate-700", icon: "text-slate-400", bg: "bg-slate-900" }, blue: { border: "border-blue-900/50", icon: "text-blue-400", bg: "bg-blue-950/20" }, purple: { border: "border-purple-900/50", icon: "text-purple-400", bg: "bg-purple-950/20" } };
  const t = themes[colorTheme] || themes.slate;
  if (variant === "horizontal") {
    return (
      <div className={cn("flex items-center rounded-lg border transition-all h-9 group w-full", t.bg, t.border)}>
        <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full select-none shrink-0"><Icon size={14} className={t.icon} /><span className={cn("text-xs font-medium", t.icon)}>{label}</span></div>
        <div className="flex-1 px-2 h-full flex items-center min-w-0">{isManual ? <input value={value} onChange={(e) => onManualChange(e.target.value)} placeholder="输入ID..." className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono placeholder:text-slate-600" autoFocus /> : <button onClick={onOpenPicker} className="w-full text-left truncate text-xs text-slate-300 font-mono hover:text-white flex items-center justify-between"><span className="truncate mr-2">{value || "Default"}</span><ChevronDown size={12} className="opacity-50"/></button>}</div>
        <button onClick={() => setIsManual(!isManual)} className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50 shrink-0"><Pencil size={12}/></button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5"><div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Icon size={12}/> {label}</label><button onClick={() => setIsManual(!isManual)} className={cn("p-1 rounded hover:bg-slate-700 transition-colors", isManual ? "text-blue-400 bg-blue-900/20" : "text-slate-500")}><Pencil size={12} /></button></div>{isManual ? <input value={value} onChange={(e) => onManualChange(e.target.value)} placeholder="手动输入模型ID..." className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 transition-colors font-mono"/> : <button onClick={onOpenPicker} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none hover:border-blue-500/50 hover:bg-slate-800 transition-all flex items-center justify-between group text-left"><span className="truncate font-mono">{value || "点击选择模型..."}</span><LayoutGrid size={14} className="text-slate-600 group-hover:text-blue-400 transition-colors" /></button>}</div>
  );
};
// ==========================================
// 模块：全能配置中心 (Configuration Center - Enhanced 2025)
// ==========================================
const ConfigCenter = ({ config, setConfig, onClose, fetchModels, availableModels, isLoadingModels }) => {
  const [activeTab, setActiveTab] = useState("analysis"); // analysis | image | video | audio
  const [showModelPicker, setShowModelPicker] = useState(false);

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], [key]: value } }));
  };

  // 2025 Update: Updated Tabs & Icons
  const tabs = [
    { id: "analysis", label: "大脑 (LLM)", icon: Brain, desc: "剧本分析 (GPT-5.2/Gemini 3)", color: "blue" },
    { id: "image", label: "画师 (Image)", icon: Palette, desc: "绘图 (Nanobanana 2/Flux)", color: "purple" },
    { id: "video", label: "摄像 (Video)", icon: Film, desc: "视频 (Kling 2.6/Wan 2.6)", color: "orange" },
    { id: "audio", label: "录音 (Audio)", icon: Mic, desc: "配音 (TTS/Suno)", color: "green" },
  ];

  const currentConfig = config[activeTab];
  const currentTabInfo = tabs.find(t => t.id === activeTab);

  // 处理打开选择器逻辑
  const handleOpenPicker = () => {
    if (availableModels.length === 0 && !isLoadingModels) {
        fetchModels(activeTab);
    }
    setShowModelPicker(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[80vh] rounded-2xl shadow-2xl flex overflow-hidden" onClick={e => e.stopPropagation()}>
          
          {/* 左侧导航 */}
          <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="text-blue-500"/> 配置中心</h2>
              <p className="text-xs text-slate-500 mt-2">API 供应商与模型管理</p>
            </div>
            <div className="flex-1 py-4 space-y-1 px-2">
              {tabs.map(t => (
                <button key={t.id} onClick={() => { setActiveTab(t.id); setShowModelPicker(false); }} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all", activeTab === t.id ? "bg-blue-900/30 text-white border border-blue-800/50" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200")}>
                  <div className={cn("p-2 rounded-md", activeTab === t.id ? "bg-blue-600" : "bg-slate-800")}>{<t.icon size={18}/>}</div>
                  <div><div className="text-sm font-medium">{t.label}</div><div className="text-[10px] opacity-60">{t.desc}</div></div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-slate-800 text-center text-xs text-slate-600">Ink & Silk Studio v2.5</div>
          </div>

          {/* 右侧配置区 */}
          <div className="flex-1 flex flex-col bg-slate-900">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center">
              <div><h3 className="text-2xl font-bold text-white flex items-center gap-2">{tabs.find(t => t.id === activeTab).label} 设置</h3></div>
              <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">完成</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* 1. 连接设置 */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2"><Server size={14}/> 连接参数</h4>
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Base URL (接口地址)</label>
                    <input value={currentConfig.baseUrl} onChange={(e) => updateConfig('baseUrl', e.target.value)} placeholder="https://api.openai.com" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 outline-none focus:border-blue-500 font-mono transition-colors"/>
                    <p className="text-[10px] text-slate-500">支持 OpenAI 格式的中转地址 (OneAPI/NewAPI) 或官方地址</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">API Key (密钥)</label>
                    <input type="password" value={currentConfig.key} onChange={(e) => updateConfig('key', e.target.value)} placeholder="sk-..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 outline-none focus:border-blue-500 font-mono transition-colors"/>
                  </div>
                </div>
              </div>

              {/* 2. 模型选择 */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex justify-between items-end">
                  <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2"><LayoutGrid size={14}/> 默认模型</h4>
                  <button onClick={() => fetchModels(activeTab)} disabled={isLoadingModels} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 border border-blue-900/50 px-2 py-1 rounded bg-blue-900/10">
                    {isLoadingModels ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} 测试连接并更新列表
                  </button>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400">Model ID (支持手动输入或列表选择)</label>
                  <ModelTrigger 
                    label="当前模型" 
                    icon={currentTabInfo.icon} 
                    value={currentConfig.model} 
                    onOpenPicker={handleOpenPicker}
                    onManualChange={(v) => updateConfig('model', v)}
                    variant="horizontal"
                    colorTheme={currentTabInfo.color}
                  />
                  <p className="text-[10px] text-slate-500 mt-2">
                    {activeTab === 'analysis' && "推荐: gpt-5.2-pro, gemini-3-pro, claude-3.7-opus"}
                    {activeTab === 'image' && "推荐: nanobanana-2-pro, flux-2-pro, jimeng-4.5, recraft-v4"}
                    {activeTab === 'video' && "推荐: kling-v2.6, wan-2.6, luma-ray-2, runway-gen4"}
                    {activeTab === 'audio' && "推荐: tts-1-hd, elevenlabs-v3, fish-speech-1.5"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ModelSelectionModal 
        isOpen={showModelPicker} 
        title={`${tabs.find(t => t.id === activeTab).label} 模型列表`}
        models={availableModels} 
        onClose={() => setShowModelPicker(false)} 
        onSelect={(m) => { updateConfig('model', m); setShowModelPicker(false); }}
      />
    </>
  );
};
// ==========================================
// 模块 2：角色工坊 (CharacterLab - Safe Mode)
// ==========================================
const CharacterLab = ({ onGeneratePrompts, onGenerateImage, isGenerating, prompts, images, setAspectRatio, aspectRatio }) => {
  // 安全读取初始状态
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [referenceImage, setReferenceImage] = useState(() => {
    try { return localStorage.getItem('cl_ref') || null; } catch(e) { return null; }
  });
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  const [imgStrength, setImgStrength] = useState(0.8);
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [localPrompts, setLocalPrompts] = useState(prompts);

  useEffect(() => { setLocalPrompts(prompts); }, [prompts]);
  
  // 安全保存函数 (核心修复：存不下时不报错，只静默失败，防止白屏)
  const safeSave = (key, val) => {
    try { localStorage.setItem(key, val); } catch (e) { console.warn(`Storage quota exceeded for ${key}, skipping save.`); }
  };

  useEffect(() => { safeSave('cl_desc', description); }, [description]);
  useEffect(() => { if(referenceImage) safeSave('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { safeSave('cl_lang', targetLang); }, [targetLang]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // 移除 strict alert，改为允许上传但不一定保存
      const reader = new FileReader();
      reader.onloadend = () => { 
        setReferenceImage(reader.result); // 内存状态更新，界面立马有反应
        safeSave('cl_ref', reader.result); // 尝试保存，失败也不崩
      };
      reader.readAsDataURL(file);
    }
  };

  const clearProject = () => {
    if(confirm("确定清空角色设定吗？")) {
      setDescription(""); setReferenceImage(null); setLocalPrompts([]);
      localStorage.removeItem('cl_desc'); localStorage.removeItem('cl_ref');
    }
  };

  const getAspectRatioClass = () => {
    switch(aspectRatio) {
      case "16:9": return "aspect-video";
      case "9:16": return "aspect-[9/16]";
      case "1:1": return "aspect-square";
      case "2.35:1": return "aspect-[21/9]";
      default: return "aspect-[2/3]"; 
    }
  };

  const handleGenerate = () => {
    const systemInstruction = `你是一个专家级角色概念设计师。请生成 9 组标准电影镜头视角提示词。
    要求：
    1. 必须包含这9种视角，并**强制使用中文作为标题(title)**：正面视图, 侧面视图, 背影, 面部特写, 俯视, 仰视, 动态姿势, 电影广角, 自然抓拍。
    2. 提示词内容(prompt)保持英文以便于绘图模型理解，但需包含 "Bokeh, depth of field"。
    3. 严格返回 JSON 数组。
    格式示例：[{"title": "正面视图", "prompt": "Full body shot..."}]`;
    onGeneratePrompts({ systemPrompt: systemInstruction, description, referenceImage, aspectRatio, targetLang });
  };

  const handleUpdateSinglePrompt = (index, newText) => {
    const updated = [...localPrompts];
    updated[index] = { ...updated[index], prompt: newText };
    setLocalPrompts(updated);
  };

  const downloadAll = async () => {
    const zip = new JSZip(); const folder = zip.folder("character_design");
    folder.file("prompts.txt", localPrompts.map(p => `[${p.title}]\n${p.prompt}`).join("\n\n"));
    Object.entries(images).forEach(([index, history]) => {
      const current = history[history.length - 1]; 
      if (current && current.url && !current.error) { try { folder.file(`view_${index}.png`, fetch(current.url).then(r => r.blob())); } catch (e) {} }
    });
    saveAs(await zip.generateAsync({ type: "blob" }), "character_design.zip");
  };

  const CharCard = ({ item, index }) => {
    const history = images[index] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(item.prompt);
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    useEffect(() => { setEditValue(item.prompt); }, [item.prompt]);
    const currentImg = history[verIndex] || { loading: false, url: null, error: null };
    
    const handleGen = (e) => { e.stopPropagation(); onGenerateImage(index, isEditing ? editValue : item.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength); };
    const downloadSingle = (e) => { e.stopPropagation(); if (currentImg.url) saveAs(currentImg.url, `view_${index}.png`); };
    const saveEdit = () => { handleUpdateSinglePrompt(index, editValue); setIsEditing(false); };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col">
        <div className={cn("bg-black relative w-full shrink-0", getAspectRatioClass())}>
          {currentImg.loading ? (<div className="absolute inset-0 flex items-center justify-center flex-col gap-2 text-slate-500"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div>) 
          : currentImg.url ? (
            <div className="relative w-full h-full group/img">
              <img src={currentImg.url} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"><button onClick={downloadSingle} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={12}/></button></div>
              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"><button onClick={handleGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><RefreshCw size={12}/></button></div>
              {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity"><button disabled={verIndex<=0} onClick={()=>setVerIndex(v=>v-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={()=>setVerIndex(v=>v+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
            </div>
          ) : currentImg.error ? (<div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-xs text-center"><p>{currentImg.error}</p><button onClick={handleGen} className="mt-2 text-white underline">重试</button></div>) 
          : (<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 backdrop-blur-[2px] transition-opacity"><button onClick={handleGen} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2"><Camera size={14}/> 生成</button></div>)}
        </div>
        <div className="p-3 border-t border-slate-800 flex-1 flex flex-col min-h-[100px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-200 text-xs truncate pr-2">{item.title}</h3>
            <div className="flex gap-1">{isEditing ? (<><button onClick={saveEdit} className="text-green-400 hover:text-green-300"><CheckCircle2 size={14}/></button><button onClick={()=>setIsEditing(false)} className="text-red-400 hover:text-red-300"><X size={14}/></button></>) : (<><button onClick={()=>setIsEditing(true)} className="text-slate-500 hover:text-blue-400"><Pencil size={12}/></button><button onClick={()=>navigator.clipboard.writeText(item.prompt)} className="text-slate-500 hover:text-white"><Copy size={12}/></button></>)}</div>
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
             <div className="pt-2 border-t border-slate-700/50 space-y-2"><div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考权重 (Image Weight)</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>{useImg2Img && referenceImage && (<div className="space-y-1 animate-in fade-in"><div className="flex justify-between text-[10px] text-slate-500"><span>Weight: {imgStrength}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/><div className="text-[9px] text-slate-500 leading-tight mt-1">1.0: 强一致 (像原图)<br/>0.1: 弱一致 (自由发挥)</div></div>)}</div>
          </div>
          <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Wand2 size={20}/>} {isGenerating ? '正在构思...' : '生成 9 组视角'}</button>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm z-10">
          <h2 className="text-slate-400 text-sm hidden md:block">视角预览 ({localPrompts.length})</h2>
          <div className="flex items-center gap-3">{localPrompts.length > 0 && (<><button onClick={() => localPrompts.forEach((p, idx) => onGenerateImage(idx, p.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength))} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-200 text-sm rounded border border-blue-800"><Camera size={16}/> 全部生成</button><button onClick={downloadAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700"><Download size={16}/> 打包下载</button></>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
            {localPrompts.map((item, idx) => <CharCard key={idx} item={item} index={idx} />)}
          </div>
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 3：自动分镜工作台 (StoryboardStudio - Stable)
// ==========================================
const StoryboardStudio = ({ onCallApi, onGenerateImage }) => {
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  const [shots, setShots] = useState(() => JSON.parse(localStorage.getItem('sb_shots')) || []);
  const [shotImages, setShotImages] = useState(() => JSON.parse(localStorage.getItem('sb_shot_images')) || {});
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
  const chatEndRef = useRef(null);

  useEffect(() => { localStorage.setItem('sb_script', script); }, [script]);
  useEffect(() => { localStorage.setItem('sb_direction', direction); }, [direction]);
  useEffect(() => { localStorage.setItem('sb_shots', JSON.stringify(shots)); }, [shots]);
  useEffect(() => { localStorage.setItem('sb_shot_images', JSON.stringify(shotImages)); }, [shotImages]);
  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem('sb_ar', sbAspectRatio); }, [sbAspectRatio]);
  useEffect(() => { localStorage.setItem('sb_lang', sbTargetLang); }, [sbTargetLang]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pendingUpdate]);

  const pushHistory = (newShots) => {
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(newShots);
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
    setShots(newShots);
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
    try {
      const prompt = `Role: Expert Film Director. Task: Create a Shot List for Sora/Veo.
      Requirements: 1. Break down script. 2. **Camera Lingo**: Truck, Dolly, Pan, Tilt. 3. **Consistency**: Use Reference if provided.
      Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "image_prompt":"..."}]
      Language: ${sbTargetLang}.`;
      const content = `Script: ${script}\nDirection: ${direction}\nFile: ${mediaAsset ? mediaAsset.name : 'None'}`;
      const res = await onCallApi(prompt, content, mediaAsset);
      const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      if (Array.isArray(json)) { pushHistory(json); setMessages(prev => [...prev, { role: 'assistant', content: `分析完成！设计了 ${json.length} 个镜头。` }]); }
    } catch (e) { alert("分析失败: " + e.message); } finally { setIsAnalyzing(false); }
  };

  const handleSendMessage = async () => {
    if(!chatInput.trim()) return;
    const msg = chatInput; setChatInput(""); setMessages(prev => [...prev, { role: 'user', content: msg }]);
    try {
      const currentContext = shots.map(s => ({id: s.id, visual: s.visual, sora_prompt: s.sora_prompt}));
      const res = await onCallApi(
        "Role: Co-Director. Task: Modify storyboard. IMPORTANT: Update 'visual', 'sora_prompt', 'image_prompt' TOGETHER. Return JSON array ONLY for modified shots.", 
        `Context: ${JSON.stringify(currentContext)}\nFeedback: ${msg}\nResponse: Wrap JSON in \`\`\`json ... \`\`\`.`
      );
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      const reply = jsonMatch ? res.replace(jsonMatch[0], "") : res;
      setMessages(prev => [...prev, { role: 'assistant', content: reply || "修改建议如下：" }]);
      if (jsonMatch) setPendingUpdate(JSON.parse(jsonMatch[1]));
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: "Error." }]); }
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
    if (shots.length === 0) return;
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

  const ShotCard = ({ shot }) => {
    const history = shotImages[shot.id] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [loading, setLoading] = useState(false);
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    const currentUrl = history[verIndex];
    const gen = async () => { 
      setLoading(true); try { const url = await onGenerateImage(shot.image_prompt, sbAspectRatio, useImg2Img, mediaAsset?.type === 'image' ? mediaAsset.data : null, imgStrength); addImageToShot(shot.id, url); } catch(e) { alert(e.message); } finally { setLoading(false); } 
    };
    const downloadSingle = () => { if(currentUrl) saveAs(currentUrl, `shot_${shot.id}.png`); };
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group hover:border-purple-500/50 transition-all">
        <div className={cn("bg-black relative shrink-0 md:w-72", sbAspectRatio === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video")}>{loading ? <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div> : currentUrl ? <div className="relative w-full h-full group/img"><img src={currentUrl} className="w-full h-full object-cover"/><div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"><button onClick={downloadSingle} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><Download size={12}/></button><button onClick={gen} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><RefreshCw size={12}/></button></div>{history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity"><button disabled={verIndex<=0} onClick={()=>setVerIndex(v=>v-1)} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={()=>setVerIndex(v=>v+1)} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}</div> : <div className="absolute inset-0 flex items-center justify-center"><button onClick={gen} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"><Camera size={14}/> 生成画面</button></div>}<div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur">Shot {shot.id}</div><div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1"><Clock size={10}/> {shot.duration}</div></div>
        <div className="p-4 flex-1 space-y-3 min-w-0 flex flex-col justify-center"><div className="flex items-start justify-between gap-4"><div className="text-sm text-slate-200 font-medium leading-relaxed">{shot.visual}</div><div className="flex gap-1 shrink-0"><button onClick={() => navigator.clipboard.writeText(shot.sora_prompt)} className="p-1.5 text-slate-500 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors"><Copy size={14}/></button></div></div><div className="flex gap-2 text-xs"><div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400"><Mic size={12} className="text-purple-400"/> {shot.audio || "No Audio"}</div></div><div className="bg-purple-900/10 border border-purple-900/30 p-2.5 rounded text-[10px] font-mono text-purple-200/70 break-all select-all hover:border-purple-500/50 transition-colors"><span className="text-purple-500 font-bold select-none">Sora: </span>{shot.sora_prompt}</div></div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
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
               <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2><div className="flex gap-1 ml-4 border-l border-slate-700 pl-4"><button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800" title="撤销"><Undo2 size={14}/></button><button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800" title="重做"><Redo2 size={14}/></button></div></div>
               <div className="flex gap-2"><button onClick={() => handleDownload('csv')} className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1 transition-colors"><FileSpreadsheet size={12}/> 导出 CSV</button><button onClick={() => handleDownload('all')} className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors"><Download size={12}/> 打包全部</button></div>
            </div>
            {shots.map(s => <ShotCard key={s.id} shot={s} />)}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4"><div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800"><Clapperboard size={32} className="opacity-20 text-purple-500"/></div><div className="text-center"><p className="text-sm font-medium text-slate-500">分镜白板为空</p><p className="text-xs text-slate-600 mt-1">请上传素材并生成</p></div></div>
        )}
      </div>
    </div>
  );
};
// ==========================================
// 主应用入口 (App - Architecture v2.0)
// ==========================================
export default function App() {
  const [activeTab, setActiveTab] = useState('character'); 
  const [showSettings, setShowSettings] = useState(false);
  const [activeModalType, setActiveModalType] = useState(null); 
  
  // --- v2.5 核心配置状态 (智能迁移版) ---
  const [config, setConfig] = useState(() => {
    // 1. 优先读取最新的 v3 配置 (2025版)
    const savedV3 = localStorage.getItem('app_config_v3');
    if (savedV3) return JSON.parse(savedV3);
    
    // 2. 如果没有 v3，准备迁移数据。定义 2025 年的新默认模型
    const defaults2025 = {
      analysis: { baseUrl: 'https://generativelanguage.googleapis.com', key: '', model: 'gemini-3-pro' },
      image: { baseUrl: '', key: '', model: 'nanobanana-2-pro' },
      video: { baseUrl: '', key: '', model: 'kling-v2.6' },
      audio: { baseUrl: '', key: '', model: 'tts-1-hd' }
    };

    // 3. 尝试读取 v2 (上次的配置)
    const savedV2 = localStorage.getItem('app_config_v2');
    let oldConfig = null;

    if (savedV2) {
      oldConfig = JSON.parse(savedV2);
    } else {
      // 4. 如果 v2 也没有，尝试抢救 v1 (最原始的配置)
      const oldKey = localStorage.getItem('gemini_key'); // v1 key
      const oldBase = localStorage.getItem('gemini_base_url');
      
      if (oldKey) {
        // 构造一个临时的 v2 结构以便统一处理
        oldConfig = {
          analysis: { baseUrl: oldBase || defaults2025.analysis.baseUrl, key: oldKey, model: 'gemini-1.5-flash' },
          image: { baseUrl: oldBase || defaults2025.image.baseUrl, key: oldKey, model: 'dall-e-3' }
        };
      }
    }

    // 5. 执行迁移：如果有旧配置，保留 Key/URL，但替换 Model 为 2025 标准
    if (oldConfig) {
      return {
        analysis: { 
          ...defaults2025.analysis, 
          baseUrl: oldConfig.analysis?.baseUrl || defaults2025.analysis.baseUrl, 
          key: oldConfig.analysis?.key || '' 
        },
        image: { 
          ...defaults2025.image, 
          baseUrl: oldConfig.image?.baseUrl || defaults2025.image.baseUrl, 
          key: oldConfig.image?.key || oldConfig.analysis?.key || '' // 尝试复用 analysis key
        },
        video: { ...defaults2025.video, key: oldConfig.video?.key || '' },
        audio: { ...defaults2025.audio, key: oldConfig.audio?.key || '' }
      };
    }

    // 6. 纯新用户，直接返回 2025 默认值
    return defaults2025;
  });
  const [availableModels, setAvailableModels] = useState([]); 
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 角色工坊状态 (提升至此以持久化)
  const [clPrompts, setClPrompts] = useState(() => JSON.parse(localStorage.getItem('cl_prompts')) || []);
  const [clImages, setClImages] = useState(() => JSON.parse(localStorage.getItem('cl_images')) || {});
  const [isGeneratingCL, setIsGeneratingCL] = useState(false);
  const [charAspectRatio, setCharAspectRatio] = useState(() => localStorage.getItem('cl_ar') || "16:9");

  // 持久化监听
  useEffect(() => { localStorage.setItem('app_config_v3', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('cl_prompts', JSON.stringify(clPrompts)); }, [clPrompts]);
  useEffect(() => { localStorage.setItem('cl_images', JSON.stringify(clImages)); }, [clImages]);
  useEffect(() => { localStorage.setItem('cl_ar', charAspectRatio); }, [charAspectRatio]);

  // --- API: 获取模型列表 (针对特定能力) ---
  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!key) return alert(`请先在设置中填写 [${type}] 的 API Key`);
    
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
      
      // 2. Google Format (Fallback)
      if(!found.length && baseUrl.includes('google')) { 
        const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); 
        const d = await r.json(); 
        if(d.models) found = d.models.map(m=>m.name.replace('models/','')); 
      }
      
      if(found.length) {
        const list = [...new Set(found)].sort();
        setAvailableModels(list);
        if(showSettings) alert(`连接成功！获取到 ${list.length} 个模型。`);
      } else { 
        alert("连接成功，但未获取到模型列表 (API可能不支持)，请手动输入 ID。"); 
      }
    } catch(e) { alert("连接失败: " + e.message); } 
    finally { setIsLoadingModels(false); }
  };

  // --- API: 核心文本分析 (路由 -> config.analysis) ---
  const callTextApi = async (system, user, asset) => {
    const { baseUrl, key, model } = config.analysis;
    if(!key) throw new Error("请在设置中配置 [大脑/Analysis] 的 API Key");

    let mimeType = null, base64Data = null;
    if (asset) {
      const dataStr = typeof asset === 'string' ? asset : asset.data;
      if (dataStr) { mimeType = dataStr.split(';')[0].split(':')[1]; base64Data = dataStr.split(',')[1]; }
    }

    // 1. OpenAI Chat
    try {
      const content = [{ type: "text", text: user }];
      if (base64Data && mimeType?.startsWith('image')) content.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } });
      
      const r = await fetch(`${baseUrl}/v1/chat/completions`, { 
        method:'POST', 
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, 
        body:JSON.stringify({model, messages:[{role:"system",content:system},{role:"user",content:content}]}) 
      });
      if(r.ok) return (await r.json()).choices[0].message.content;
    } catch(e){}

    // 2. Google Native (Fallback)
    const parts = [{ text: system + "\n" + user }];
    if (base64Data && mimeType) parts.push({ inlineData: { mimeType, data: base64Data } });
    const r = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${key}`, { 
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body:JSON.stringify({contents:[{parts}]}) 
    });
    if(!r.ok) { const err = await r.json(); throw new Error(err.error?.message || "Analysis API Error"); }
    return (await r.json()).candidates[0].content.parts[0].text;
  };

  // --- API: 核心生图 (路由 -> config.image) ---
  const callGenerateImage = async (prompt, aspectRatio = "16:9", useImg2Img = false, refImg = null, strength = 0.8) => {
    const { baseUrl, key, model } = config.image;
    if(!key) throw new Error("请在设置中配置 [画师/Image] 的 API Key");

// 2025 Update: 大多数新模型 (Flux/Banana/Jimeng) 更喜欢标准比例描述
  // 如果你的中转商支持直接传 "16:9" 最好，不支持则使用通用分辨率
  let size = "1024x1024";
  if (aspectRatio === "16:9") size = "1280x720"; // 更通用的宽屏，很多模型兼容性更好
  else if (aspectRatio === "9:16") size = "720x1280";
  else if (aspectRatio === "2.35:1") size = "1536x640"; // 电影宽屏

    const payload = { model, prompt, n: 1, size };
    
    // 垫图逻辑 (基于你的反馈：strength 1.0 = 强一致)
    if (useImg2Img && refImg) {
      const imgStr = typeof refImg === 'string' ? refImg : refImg.data;
      if (imgStr) { 
        payload.image = imgStr.split(',')[1]; 
        // 大多数第三方 API (如 OneAPI 转 MJ/Flux) 使用 strength 字段
        // 如果你的 API 行为是 1.0=像原图，那我们直接传这个值即可
        payload.strength = parseFloat(strength); 
      }
    }

    const r = await fetch(`${baseUrl}/v1/images/generations`, { 
      method:'POST', 
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, 
      body:JSON.stringify(payload) 
    });
    
    if(!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "Image API Error");
    }
    const data = await r.json();
    return data.data[0].url;
  };

  // 快捷切换处理
  const handleQuickModelChange = (type, val) => {
    setConfig(prev => ({ ...prev, [type]: { ...prev[type], model: val } }));
  };

  // 角色工坊包装
  const handleCLGenerate = async (params) => {
    setIsGeneratingCL(true); setClPrompts([]); setClImages({});
    try {
      const res = await callTextApi(params.systemPrompt, `描述内容: ${params.description}`, params.referenceImage);
      const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      setClPrompts(json);
    } catch(e) { alert("生成失败: " + e.message); } finally { setIsGeneratingCL(false); }
  };

  const handleCLImageGen = async (idx, prompt, ar, useImg, ref, str) => {
    setClImages(prev => ({ ...prev, [idx]: [...(prev[idx] || []), { loading: true }] }));
    try {
      const url = await callGenerateImage(prompt, ar, useImg, ref, str);
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

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* 快捷弹窗 (使用 activeModalType 判断是 Analysis 还是 Image) */}
      <ModelSelectionModal 
        isOpen={activeModalType !== null} 
        title={activeModalType === 'analysis' ? "分析模型 (大脑)" : "绘图模型 (画师)"} 
        models={availableModels} 
        onClose={() => setActiveModalType(null)} 
        onSelect={(m) => handleQuickModelChange(activeModalType, m)}
      />
      
      {/* 全能配置中心 */}
      {showSettings && (
        <ConfigCenter 
          config={config} 
          setConfig={setConfig} 
          onClose={() => setShowSettings(false)}
          fetchModels={fetchModels}
          availableModels={availableModels}
          isLoadingModels={isLoadingModels}
        />
      )}

      {/* 顶部导航 */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20"><Wand2 size={18} className="text-white" /></div><h1 className="font-bold text-lg hidden lg:block tracking-tight text-white">AI 导演工坊</h1></div>
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <button onClick={()=>setActiveTab('character')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='character'?"bg-slate-700 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><ImageIcon size={14}/> 角色工坊</button>
            <button onClick={()=>setActiveTab('storyboard')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='storyboard'?"bg-purple-600 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><Clapperboard size={14}/> 自动分镜</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex gap-3">
            <ModelTrigger 
              label="分析" 
              icon={Server} 
              value={config.analysis.model} 
              onOpenPicker={() => { setActiveModalType('analysis'); fetchModels('analysis'); }} 
              onManualChange={(v) => handleQuickModelChange('analysis', v)} 
              variant="horizontal" 
              colorTheme="blue"
            />
            <ModelTrigger 
              label="绘图" 
              icon={Palette} 
              value={config.image.model} 
              onOpenPicker={() => { setActiveModalType('image'); fetchModels('image'); }} 
              onManualChange={(v) => handleQuickModelChange('image', v)} 
              variant="horizontal" 
              colorTheme="purple"
            />
          </div>
          <button onClick={()=>setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><Settings size={20}/></button>
        </div>
      </div>

      {/* 主内容 */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab==='character' ? (
          <CharacterLab 
            onGeneratePrompts={handleCLGenerate} 
            onGenerateImage={handleCLImageGen} 
            isGenerating={isGeneratingCL} 
            prompts={clPrompts} 
            images={clImages} 
            setAspectRatio={setCharAspectRatio} 
            aspectRatio={charAspectRatio}
          />
        ) : (
          <StoryboardStudio onCallApi={callTextApi} onGenerateImage={callGenerateImage}/>
        )}
      </div>
    </div>
  );
}








