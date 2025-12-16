import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) { return twMerge(clsx(inputs)); }

// --- 组件：大型模型选择弹窗 ---
const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const categorizedModels = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const allFiltered = models.filter(m => m.toLowerCase().includes(lowerSearch));
    return {
      "All": allFiltered,
      "OpenAI": allFiltered.filter(m => m.includes('gpt') || m.includes('o1-')),
      "Claude": allFiltered.filter(m => m.includes('claude')),
      "Gemini": allFiltered.filter(m => m.includes('gemini')),
      "Image": allFiltered.filter(m => ['dall-e', 'mj', 'midjourney', 'flux', 'sd', 'stable-diffusion', 'imagen', 'drawing', 'nano', 'banana', 'recraft'].some(k => m.toLowerCase().includes(k))),
      "Video": allFiltered.filter(m => ['sora', 'veo', 'kling', 'luma', 'runway'].some(k => m.toLowerCase().includes(k))),
      "OpenSource": allFiltered.filter(m => ['llama', 'qwen', 'mistral', 'yi-', 'deepseek', 'phi'].some(k => m.toLowerCase().includes(k))),
    };
  }, [models, search]);
  const tabs = ["All", "OpenAI", "Claude", "Gemini", "Image", "Video", "OpenSource"];
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-white flex items-center gap-2"><LayoutGrid size={20} className="text-blue-500"/> 选择: <span className="text-blue-400">{title}</span></h3><button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400"><X size={20}/></button></div>
          <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-500"/><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型 (如: flux, sora)..." className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"/></div>
        </div>
        <div className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 overflow-x-auto"><div className="flex gap-2 pb-3">{tabs.map(tab => (<button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-1.5 text-xs font-medium rounded-full border transition-all", activeTab === tab ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400")}>{tab} <span className="ml-1 opacity-50">{categorizedModels[tab].length}</span></button>))}</div></div>
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{categorizedModels[activeTab].map(m => (<button key={m} onClick={() => { onSelect(m); onClose(); }} className="group flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900 hover:border-blue-500/50 hover:bg-slate-800 text-left"><span className="text-sm text-slate-300 group-hover:text-white truncate font-mono">{m}</span><ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"/></button>))}</div></div>
      </div>
    </div>
  );
};

// --- 组件：模型触发器 ---
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, variant = "vertical", colorTheme = "slate" }) => {
  const [isManual, setIsManual] = useState(false);
  const themes = { slate: { border: "border-slate-700", icon: "text-slate-400", bg: "bg-slate-900" }, blue: { border: "border-blue-900/50", icon: "text-blue-400", bg: "bg-blue-950/20" }, purple: { border: "border-purple-900/50", icon: "text-purple-400", bg: "bg-purple-950/20" } };
  const t = themes[colorTheme] || themes.slate;
  if (variant === "horizontal") {
    return (
      <div className={cn("flex items-center rounded-lg border transition-all h-9 group", t.bg, t.border)}>
        <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full select-none"><Icon size={14} className={t.icon} /><span className={cn("text-xs font-medium", t.icon)}>{label}</span></div>
        <div className="w-40 px-2 h-full flex items-center">{isManual ? <input value={value} onChange={(e) => onManualChange(e.target.value)} placeholder="输入ID..." className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono placeholder:text-slate-600" autoFocus /> : <button onClick={onOpenPicker} className="w-full text-left truncate text-xs text-slate-300 font-mono hover:text-white flex items-center justify-between"><span className="truncate mr-2">{value || "选择..."}</span><ChevronDown size={12} className="opacity-50"/></button>}</div>
        <button onClick={() => setIsManual(!isManual)} className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50"><Pencil size={12}/></button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5"><div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Icon size={12}/> {label}</label><button onClick={() => setIsManual(!isManual)} className={cn("p-1 rounded hover:bg-slate-700 transition-colors", isManual ? "text-blue-400 bg-blue-900/20" : "text-slate-500")}><Pencil size={12} /></button></div>{isManual ? <input value={value} onChange={(e) => onManualChange(e.target.value)} placeholder="手动输入模型ID..." className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 transition-colors font-mono"/> : <button onClick={onOpenPicker} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none hover:border-blue-500/50 hover:bg-slate-800 transition-all flex items-center justify-between group text-left"><span className="truncate font-mono">{value || "点击选择模型..."}</span><LayoutGrid size={14} className="text-slate-600 group-hover:text-blue-400 transition-colors" /></button>}</div>
  );
};
// ==========================================
// 模块 1：角色工坊 (CharacterLab - Editable & Fixed Weight)
// ==========================================
const CharacterLab = ({ onGeneratePrompts, onGenerateImage, isGenerating, prompts, images, setAspectRatio, aspectRatio }) => {
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [referenceImage, setReferenceImage] = useState(() => localStorage.getItem('cl_ref') || null);
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  
  // 修正：默认为 0.8 (强一致性)
  const [imgStrength, setImgStrength] = useState(0.8); 
  const [useImg2Img, setUseImg2Img] = useState(true);

  // 状态提升：修改提示词
  const [localPrompts, setLocalPrompts] = useState(prompts);
  useEffect(() => { setLocalPrompts(prompts); }, [prompts]);

  // 监听保存
  useEffect(() => { localStorage.setItem('cl_desc', description); }, [description]);
  useEffect(() => { if(referenceImage) localStorage.setItem('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { localStorage.setItem('cl_lang', targetLang); }, [targetLang]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setReferenceImage(reader.result); localStorage.setItem('cl_ref', reader.result); };
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

  // 更新单个提示词
  const handleUpdateSinglePrompt = (index, newText) => {
    const updated = [...localPrompts];
    updated[index] = { ...updated[index], prompt: newText };
    setLocalPrompts(updated);
    // 这里为了持久化，建议同时更新 localStorage 'cl_prompts'，这部分逻辑在 App.js 的 useEffect 中处理了
    // 但 App.js 监听的是 prompts，所以我们需要一种方式通知 App.js 更新 prompts
    // 由于 React 单向数据流，这里稍微 Hack 一下，直接调用 prop 里的 setPrompts 如果有的话，
    // 或者我们假设父组件传下来了 setPrompts。
    // *为了简单起见，我们假设 localPrompts 仅用于当前渲染，生图时使用 localPrompts[index].prompt*
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    const folder = zip.folder("character_design");
    folder.file("prompts.txt", localPrompts.map(p => `[${p.title}]\n${p.prompt}`).join("\n\n"));
    Object.entries(images).forEach(([index, history]) => {
      const current = history[history.length - 1]; 
      if (current && current.url && !current.error) { try { folder.file(`view_${index}.png`, fetch(current.url).then(r => r.blob())); } catch (e) {} }
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "character_design.zip");
  };

  // 内部组件：可编辑卡片
  const CharCard = ({ item, index }) => {
    const history = images[index] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(item.prompt);
    
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    useEffect(() => { setEditValue(item.prompt); }, [item.prompt]); // 同步外部更新

    const currentImg = history[verIndex] || { loading: false, url: null, error: null };
    
    // 使用当前编辑框里的值或者已保存的值进行生图
    const handleGen = (e) => {
        e.stopPropagation();
        onGenerateImage(index, isEditing ? editValue : item.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength);
    };
    
    const downloadSingle = (e) => { e.stopPropagation(); if (currentImg.url) saveAs(currentImg.url, `view_${index}.png`); };

    const saveEdit = () => {
        handleUpdateSinglePrompt(index, editValue);
        setIsEditing(false);
    };

    const cancelEdit = () => {
        setEditValue(item.prompt);
        setIsEditing(false);
    };

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
        
        {/* 可编辑文本区域 */}
        <div className="p-3 border-t border-slate-800 flex-1 flex flex-col min-h-[100px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-200 text-xs truncate pr-2">{item.title}</h3>
            <div className="flex gap-1">
                {isEditing ? (
                    <>
                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300"><CheckCircle2 size={14}/></button>
                        <button onClick={cancelEdit} className="text-red-400 hover:text-red-300"><X size={14}/></button>
                    </>
                ) : (
                    <>
                        <button onClick={() => setIsEditing(true)} className="text-slate-500 hover:text-blue-400"><Pencil size={12}/></button>
                        <button onClick={() => navigator.clipboard.writeText(item.prompt)} className="text-slate-500 hover:text-white"><Copy size={12}/></button>
                    </>
                )}
            </div>
          </div>
          {isEditing ? (
              <textarea 
                value={editValue} 
                onChange={(e) => setEditValue(e.target.value)} 
                className="w-full h-full bg-slate-950 border border-blue-500/50 rounded p-2 text-[10px] text-slate-200 font-mono outline-none resize-none"
                autoFocus
              />
          ) : (
              <p className="text-[10px] text-slate-500 line-clamp-3 font-mono bg-black/30 p-2 rounded flex-1 select-all hover:text-slate-400 transition-colors cursor-pointer" onClick={() => setIsEditing(true)}>{item.prompt}</p>
          )}
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
             <div className="pt-2 border-t border-slate-700/50 space-y-2"><div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考图权重 (Image Weight)</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>{useImg2Img && referenceImage && (<div className="space-y-1 animate-in fade-in"><div className="flex justify-between text-[10px] text-slate-500"><span>Weight: {imgStrength}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/><div className="text-[9px] text-slate-500 leading-tight mt-1">1.0: 强一致 (像原图)<br/>0.1: 弱一致 (自由发挥)</div></div>)}</div>
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
// 模块 2：自动分镜工作台 (StoryboardStudio - Preview Fix)
// ==========================================
const StoryboardStudio = ({ onCallApi, onGenerateImage }) => {
  // 核心数据
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  const [shots, setShots] = useState(() => JSON.parse(localStorage.getItem('sb_shots')) || []);
  const [shotImages, setShotImages] = useState(() => JSON.parse(localStorage.getItem('sb_shot_images')) || {});
  
  // 聊天与状态
  const [messages, setMessages] = useState(() => JSON.parse(localStorage.getItem('sb_messages')) || [{ role: 'assistant', content: '我是您的 AI 分镜导演。请在左侧上传素材或输入剧本，点击“生成分镜表”开始工作。' }]);
  const [mediaAsset, setMediaAsset] = useState(null); 
  const [pendingUpdate, setPendingUpdate] = useState(null); // JSON 对象
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  
  // 历史 (Undo/Redo)
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 设置
  const [sbAspectRatio, setSbAspectRatio] = useState(() => localStorage.getItem('sb_ar') || "16:9");
  const [sbTargetLang, setSbTargetLang] = useState(() => localStorage.getItem('sb_lang') || "English");
  const [imgStrength, setImgStrength] = useState(0.8); // 默认强权重
  const [useImg2Img, setUseImg2Img] = useState(true);

  const chatEndRef = useRef(null);

  // 持久化
  useEffect(() => { localStorage.setItem('sb_script', script); }, [script]);
  useEffect(() => { localStorage.setItem('sb_direction', direction); }, [direction]);
  useEffect(() => { localStorage.setItem('sb_shots', JSON.stringify(shots)); }, [shots]);
  useEffect(() => { localStorage.setItem('sb_shot_images', JSON.stringify(shotImages)); }, [shotImages]);
  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
  };
  const clearAsset = () => setMediaAsset(null);

  // 1. 生成分镜
  const handleAnalyzeScript = async () => {
    if (!script && !direction && !mediaAsset) return alert("请填写内容或上传素材");
    setIsAnalyzing(true);
    try {
      const prompt = `Role: Expert Film Director. Task: Create a Shot List for Sora/Veo.
      [Formula]: (Subject+Action) + (Env+Lighting) + (Camera+Lens) + (Physics) + (Style)
      Requirements:
      1. Break down script into shots.
      2. **Camera Lingo**: Truck, Dolly, Pan, Tilt, FPV.
      3. **Audio**: Dialogue & SFX.
      Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "image_prompt":"..."}]
      Language: ${sbTargetLang}.`;

      const content = `Script: ${script}\nDirection: ${direction}\nFile: ${mediaAsset ? mediaAsset.name : 'None'}`;
      const res = await onCallApi(prompt, content, mediaAsset);
      const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      
      if (Array.isArray(json)) { 
        pushHistory(json);
        setMessages(prev => [...prev, { role: 'assistant', content: `分析完成！设计了 ${json.length} 个镜头。` }]); 
      }
    } catch (e) { alert("分析失败: " + e.message); } finally { setIsAnalyzing(false); }
  };

  // 2. 导演对话
  const handleSendMessage = async () => {
    if(!chatInput.trim()) return;
    const msg = chatInput; setChatInput(""); setMessages(prev => [...prev, { role: 'user', content: msg }]);
    try {
      const currentContext = shots.map(s => ({id: s.id, visual: s.visual}));
      const res = await onCallApi(
        "Role: Co-Director. Task: Modify storyboard based on feedback. Return JSON array ONLY for modified shots. If chatting, return text.", 
        `Current Shots: ${JSON.stringify(currentContext)}\nFeedback: ${msg}\nResponse: Wrap JSON in \`\`\`json ... \`\`\`.`
      );
      
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      const reply = jsonMatch ? res.replace(jsonMatch[0], "") : res;
      setMessages(prev => [...prev, { role: 'assistant', content: reply || "修改建议如下：" }]);
      
      if (jsonMatch) setPendingUpdate(JSON.parse(jsonMatch[1]));
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: "Error." }]); }
  };

  // 3. 应用修改
  const applyUpdate = () => {
    if (!pendingUpdate) return;
    let newShots = [...shots];
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];
    updates.forEach(upd => {
      const idx = newShots.findIndex(s => s.id === upd.id);
      if (idx !== -1) newShots[idx] = { ...newShots[idx], ...upd };
      else newShots.push(upd);
    });
    newShots.sort((a,b) => a.id - b.id);
    pushHistory(newShots);
    setPendingUpdate(null);
    setMessages(prev => [...prev, { role: 'assistant', content: "✅ 已更新分镜表。" }]);
  };

  const addImageToShot = (id, url) => setShotImages(prev => ({ ...prev, [id]: [...(prev[id] || []), url] }));

  // 下载逻辑省略(与之前相同)...
  const handleDownload = async (type) => { /* ...保持原样... */ };
  const clearAll = () => { if(confirm("确定清空？")) { setShots([]); setMessages([]); setShotImages({}); setHistory([]); setScript(""); setDirection(""); setMediaAsset(null); localStorage.clear(); } };

  // 变更预览组件
  const ChangePreview = () => {
    if (!pendingUpdate) return null;
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];
    return (
      <div className="bg-slate-800/80 border border-purple-500/30 rounded-lg p-3 my-2 text-xs">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-purple-300">AI 建议修改 ({updates.length})</span>
          <button onClick={applyUpdate} className="bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded flex items-center gap-1"><CheckCircle2 size={10}/> 应用</button>
        </div>
        <div className="space-y-2 max-h-32 overflow-y-auto scrollbar-thin">
          {updates.map((u, i) => (
            <div key={i} className="bg-slate-900/50 p-2 rounded border-l-2 border-purple-500">
              <div className="font-mono text-slate-400 mb-1">Shot {u.id}</div>
              <div className="text-slate-300 line-clamp-2">{u.visual || u.sora_prompt}</div>
            </div>
          ))}
        </div>
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
      setLoading(true); 
      try { 
        // 关键：使用最新的 shot.image_prompt 进行生成，确保修改生效
        const url = await onGenerateImage(shot.image_prompt, sbAspectRatio, useImg2Img, mediaAsset?.type === 'image' ? mediaAsset.data : null, imgStrength);
        addImageToShot(shot.id, url); 
      } catch(e) { alert("Error: " + e.message); } finally { setLoading(false); } 
    };
    const downloadSingle = () => { if(currentUrl) saveAs(currentUrl, `shot_${shot.id}.png`); };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group hover:border-purple-500/50 transition-all">
        <div className={cn("bg-black relative shrink-0 md:w-72", sbAspectRatio === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video")}>
          {loading ? <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div> 
          : currentUrl ? (
            <div className="relative w-full h-full group/img">
              <img src={currentUrl} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"><button onClick={downloadSingle} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><Download size={12}/></button><button onClick={gen} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"><RefreshCw size={12}/></button></div>
              {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity"><button disabled={verIndex<=0} onClick={()=>setVerIndex(v=>v-1)} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={()=>setVerIndex(v=>v+1)} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
            </div>
          ) : <div className="absolute inset-0 flex items-center justify-center"><button onClick={gen} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"><Camera size={14}/> 生成画面</button></div>}
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur">Shot {shot.id}</div>
          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1"><Clock size={10}/> {shot.duration}</div>
        </div>
        <div className="p-4 flex-1 space-y-3 min-w-0">
          <div className="flex items-start justify-between gap-4"><div className="text-sm text-slate-200 font-medium leading-relaxed">{shot.visual}</div><button onClick={() => navigator.clipboard.writeText(shot.sora_prompt)} className="text-slate-500 hover:text-purple-400 shrink-0"><Copy size={14}/></button></div>
          <div className="flex gap-2 text-xs"><div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400"><Mic size={12} className="text-purple-400"/> {shot.audio || "No Audio"}</div></div>
          <div className="bg-purple-900/10 border border-purple-900/30 p-2.5 rounded text-[10px] font-mono text-purple-200/70 break-all select-all"><span className="text-purple-500 font-bold select-none">Sora: </span>{shot.sora_prompt}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
        <div className="p-4 border-b border-slate-800 sticky top-0 bg-slate-900/80 backdrop-blur flex justify-between items-center"><h2 className="text-sm font-bold text-slate-200 flex items-center gap-2"><Clapperboard size={16} className="text-purple-500"/> 导演控制台</h2><button onClick={clearAll} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><FileText size={12}/> 剧本 / 台词</label><textarea value={script} onChange={e => setScript(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600" placeholder="例如：(旁白) 2077年，霓虹灯下的雨夜。主角从阴影中走出，点了一支烟..."/></div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Video size={12}/> 导演意图</label><textarea value={direction} onChange={e => setDirection(e.target.value)} className="w-full h-20 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600" placeholder="例如：赛博朋克风格，压抑的氛围，多用低角度广角镜头..."/></div>
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 分镜生成设置</div>
             <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={sbAspectRatio} onChange={(e) => setSbAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="2.35:1">2.35:1</option></select></div><div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={sbTargetLang} onChange={(e) => setSbTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="English">English</option><option value="Chinese">中文</option></select></div></div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2"><div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 参考图权重 (Image Weight)</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>{useImg2Img && mediaAsset?.type === 'image' && (<div className="space-y-1 animate-in fade-in"><div className="flex justify-between text-[10px] text-slate-500"><span>Weight: {imgStrength}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/><div className="text-[9px] text-slate-500 leading-tight mt-1">1.0: 强一致 (像原图)<br/>0.1: 弱一致 (自由发挥)</div></div>)}</div>
          </div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Upload size={12}/> 多模态素材</label><div className="grid grid-cols-3 gap-2 h-20">
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='image'?"border-purple-500 bg-purple-900/20":"border-slate-600 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="image/*" onChange={(e)=>handleAssetUpload(e,'image')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 {mediaAsset?.type==='image' ? <><img src={mediaAsset.data} className="w-full h-full object-cover opacity-80"/><button onClick={(e)=>{e.stopPropagation();clearAsset()}} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500"><X size={10}/></button></> : <><ImageIcon size={16} className="mb-1"/><span className="text-[10px]">图片</span></>}
              </div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='audio'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="audio/*" onChange={(e)=>handleAssetUpload(e,'audio')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 {mediaAsset?.type==='audio' ? <><Mic size={16} className="text-purple-400 mb-1"/><span className="text-[10px] truncate w-16 text-center">{mediaAsset.name}</span><button onClick={(e)=>{e.stopPropagation();clearAsset()}} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500"><X size={10}/></button></> : <><Mic size={16} className="text-slate-500 mb-1"/><span className="text-[10px]">音频</span></>}
              </div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='video'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="video/*" onChange={(e)=>handleAssetUpload(e,'video')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 {mediaAsset?.type==='video' ? <><Film size={16} className="text-purple-400 mb-1"/><span className="text-[10px] truncate w-16 text-center">{mediaAsset.name}</span><button onClick={(e)=>{e.stopPropagation();clearAsset()}} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500"><X size={10}/></button></> : <><Film size={16} className="text-slate-500 mb-1"/><span className="text-[10px]">视频</span></>}
              </div>
          </div></div>
          <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} {isAnalyzing ? '分析中...' : '生成分镜表'}</button>
        </div>
        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4"><span className="flex items-center gap-2 font-medium text-slate-400"><MessageSquare size={12}/> AI 导演助手</span></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.map((m, i) => <div key={i} className={cn("flex", m.role==='user'?"justify-end":"justify-start")}><div className={cn("max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed shadow-sm", m.role==='user'?"bg-purple-600 text-white":"bg-slate-800 text-slate-300 border border-slate-700")}>{m.content}</div></div>)}
            {/* 新增：可视化预览 */}
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
// 主应用入口 (App - 核心逻辑整合)
// ==========================================
export default function App() {
  const [activeTab, setActiveTab] = useState('character'); 
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_key') || '');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('gemini_base_url') || 'https://generativelanguage.googleapis.com');
  const [availableModels, setAvailableModels] = useState([]); 
  const [textModel, setTextModel] = useState(localStorage.getItem('text_model') || 'gemini-1.5-flash');
  const [imageModel, setImageModel] = useState(localStorage.getItem('image_model') || 'dall-e-3');
  const [activeModalType, setActiveModalType] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 角色工坊全局状态 (提升至此以防Tab切换丢失)
  const [clPrompts, setClPrompts] = useState(() => JSON.parse(localStorage.getItem('cl_prompts')) || []);
  const [clImages, setClImages] = useState(() => JSON.parse(localStorage.getItem('cl_images')) || {});
  const [isGeneratingCL, setIsGeneratingCL] = useState(false);
  const [charAspectRatio, setCharAspectRatio] = useState(() => localStorage.getItem('cl_ar') || "16:9");

  // 持久化角色工坊数据
  useEffect(() => { localStorage.setItem('cl_prompts', JSON.stringify(clPrompts)); }, [clPrompts]);
  useEffect(() => { localStorage.setItem('cl_images', JSON.stringify(clImages)); }, [clImages]);
  useEffect(() => { localStorage.setItem('cl_ar', charAspectRatio); }, [charAspectRatio]);

  // --- API: 获取模型列表 ---
  const fetchModels = async () => {
    if (!apiKey) return alert("请先填写 API Key");
    setIsLoadingModels(true); setAvailableModels([]);
    try {
      let found = [];
      try { const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } }); const d = await r.json(); if(d.data) found = d.data.map(m=>m.id); } catch(e){}
      if(!found.length) { const r = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`); const d = await r.json(); if(d.models) found = d.models.map(m=>m.name.replace('models/','')); }
      if(found.length) setAvailableModels([...new Set(found)].sort()); else alert("未获取到列表，请手动输入");
    } catch(e) { alert("获取失败: " + e.message); } finally { setIsLoadingModels(false); }
  };

  const handleSaveSettings = () => { localStorage.setItem('gemini_key', apiKey); localStorage.setItem('gemini_base_url', baseUrl); localStorage.setItem('text_model', textModel); localStorage.setItem('image_model', imageModel); setShowSettings(false); };

  // --- API: 核心文本/分析调用 ---
  const callTextApi = async (system, user, asset) => {
    if(!apiKey) throw new Error("No API Key");
    let mimeType = null, base64Data = null;
    if (asset) {
      const dataStr = typeof asset === 'string' ? asset : asset.data;
      if (dataStr) { mimeType = dataStr.split(';')[0].split(':')[1]; base64Data = dataStr.split(',')[1]; }
    }
    // OpenAI 格式
    try {
      const content = [{ type: "text", text: user }];
      if (base64Data && mimeType?.startsWith('image')) content.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } });
      const r = await fetch(`${baseUrl}/v1/chat/completions`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`}, body:JSON.stringify({model:textModel, messages:[{role:"system",content:system},{role:"user",content:content}]}) });
      if(r.ok) return (await r.json()).choices[0].message.content;
    } catch(e){}
    // Google 格式 (Fallback)
    const parts = [{ text: system + "\n" + user }];
    if (base64Data && mimeType) parts.push({ inlineData: { mimeType, data: base64Data } });
    const r = await fetch(`${baseUrl}/v1beta/models/${textModel}:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts}]}) });
    if(!r.ok) { const err = await r.json(); throw new Error(err.error?.message || "API Error"); }
    return (await r.json()).candidates[0].content.parts[0].text;
  };

  // --- API: 核心生图调用 (支持比例与权重) ---
  const callGenerateImage = async (prompt, aspectRatio = "16:9", useImg2Img = false, refImg = null, strength = 0.55) => {
    let size = "1024x1024";
    if (aspectRatio === "16:9") size = "1792x1024";
    else if (aspectRatio === "9:16") size = "1024x1792";
    else if (aspectRatio === "2.35:1") size = "1792x1024";

    const payload = { model: imageModel, prompt, n: 1, size };
    if (useImg2Img && refImg) {
      const imgStr = typeof refImg === 'string' ? refImg : refImg.data;
      if (imgStr) { payload.image = imgStr.split(',')[1]; payload.strength = parseFloat(strength); }
    }
    const r = await fetch(`${baseUrl}/v1/images/generations`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`}, body:JSON.stringify(payload) });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error?.message || "生图请求失败");
    return data.data[0].url;
  };

  // --- 逻辑: 角色工坊 Prompt 生成 ---
  const handleCLGenerate = async (params) => {
    setIsGeneratingCL(true); setClPrompts([]); setClImages({});
    try {
      const res = await callTextApi(params.systemPrompt, `描述内容: ${params.description}`, params.referenceImage);
      const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      setClPrompts(json);
    } catch(e) { alert("生成失败: " + e.message); } finally { setIsGeneratingCL(false); }
  };

  // --- 逻辑: 角色工坊单图历史管理 ---
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
      {/* 弹窗组件 */}
      <ModelSelectionModal isOpen={activeModalType!==null} title={activeModalType==='text'?"分析模型":"绘图模型"} models={availableModels} onClose={()=>setActiveModalType(null)} onSelect={m=>{if(activeModalType==='text'){setTextModel(m);localStorage.setItem('text_model',m)}else{setImageModel(m);localStorage.setItem('image_model',m)}}}/>
      
      {showSettings && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white">全局设置</h2>
            <div className="space-y-4">
              <div><label className="text-sm text-slate-400">API Endpoint</label><input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm" placeholder="https://api.openai.com"/></div>
              <div><label className="text-sm text-slate-400">API Key</label><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm"/></div>
              <button onClick={fetchModels} disabled={isLoadingModels} className="w-full py-2 bg-blue-900/20 text-blue-400 border border-blue-900/50 rounded flex justify-center gap-2">{isLoadingModels?<Loader2 size={14} className="animate-spin"/>:<RefreshCw size={14}/>} 刷新模型列表</button>
            </div>
            <div className="flex justify-end mt-6 gap-2"><button onClick={()=>setShowSettings(false)} className="px-4 py-2 hover:bg-slate-800 rounded text-sm text-slate-400">取消</button><button onClick={handleSaveSettings} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium">保存配置</button></div>
          </div>
        </div>
      )}

      {/* 导航栏 */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20"><Wand2 size={18} className="text-white" /></div><h1 className="font-bold text-lg hidden lg:block tracking-tight text-white">Ink & Silk</h1></div>
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <button onClick={()=>setActiveTab('character')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='character'?"bg-slate-700 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><ImageIcon size={14}/> 角色工坊</button>
            <button onClick={()=>setActiveTab('storyboard')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2 transition-all", activeTab==='storyboard'?"bg-purple-600 text-white shadow-md":"text-slate-400 hover:text-slate-200")}><Clapperboard size={14}/> 自动分镜</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex gap-3">
            <ModelTrigger label="分析" icon={Server} value={textModel} onOpenPicker={()=>setActiveModalType('text')} onManualChange={v=>{setTextModel(v);localStorage.setItem('text_model',v)}} variant="horizontal" colorTheme="blue"/>
            <ModelTrigger label="绘图" icon={Palette} value={imageModel} onOpenPicker={()=>setActiveModalType('image')} onManualChange={v=>{setImageModel(v);localStorage.setItem('image_model',v)}} variant="horizontal" colorTheme="purple"/>
          </div>
          <button onClick={()=>setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><Settings size={20}/></button>
        </div>
      </div>

      {/* 内容区 */}
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

