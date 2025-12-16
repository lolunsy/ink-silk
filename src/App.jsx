import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2, FileSpreadsheet, Trash2, Undo2, Redo2, ChevronLeft, Eye, MoreHorizontal } from 'lucide-react';
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
          <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-500"/><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型 (如: gpt-4, flux, midjourney)..." className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"/></div>
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
// 模块 1：角色工坊 (CharacterLab - Pro)
// ==========================================
const CharacterLab = ({ onGeneratePrompts, onGenerateImage, isGenerating, prompts, images, setAspectRatio, aspectRatio }) => {
  const [description, setDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [targetLang, setTargetLang] = useState("English");
  const [imgStrength, setImgStrength] = useState(0.55); // 默认微调
  const [useImg2Img, setUseImg2Img] = useState(true);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setReferenceImage(reader.result);
      reader.readAsDataURL(file);
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
    // 强制 9 视角 System Prompt
    const systemInstruction = `你是一个专业的角色概念设计师。请根据用户描述，严格按照以下 9 种标准电影镜头视角生成提示词。
    
    必须包含的 9 种视角：
    1. Front View (正面全身)
    2. Side Profile (侧面半身)
    3. Back View (背影)
    4. Close-up (面部特写)
    5. High Angle (俯视视角)
    6. Low Angle (仰视视角)
    7. Dynamic Action (动态姿势)
    8. Cinematic Wide Shot (电影宽画幅环境)
    9. Candid Shot (自然抓拍)

    要求：
    1. 每个提示词必须包含 "Bokeh, depth of field" 以确保背景虚化。
    2. 保持角色特征（发型、服饰、五官）在所有视角中的高度一致性。
    3. 目标语言：${targetLang} (JSON 键名保持英文)。
    4. 严格返回 JSON 数组格式，不要 Markdown 标记。
    
    格式示例：[{"title": "Front View", "prompt": "Full body shot..."}]`;
    
    onGeneratePrompts({ 
      systemPrompt: systemInstruction, 
      description, 
      referenceImage, 
      aspectRatio, 
      targetLang 
    });
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    const folder = zip.folder("character_design");
    folder.file("prompts.txt", prompts.map(p => `[${p.title}]\n${p.prompt}`).join("\n\n"));
    
    // 遍历所有图片的当前显示版本
    Object.entries(images).forEach(([index, history]) => {
      const current = history[history.length - 1]; // 取最新一张
      if (current && current.url && !current.error) {
         try {
           // 这里我们存一个 fetch promise，最后一起解析
           folder.file(`view_${index}.png`, fetch(current.url).then(r => r.blob()));
         } catch (e) {}
      }
    });
    
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "character_design.zip");
  };

  // 内部组件：角色卡片 (带版本管理)
  const CharCard = ({ item, index }) => {
    const history = images[index] || [];
    const [verIndex, setVerIndex] = useState(history.length - 1);
    
    // 当 history 更新时，自动跳到最新版
    useEffect(() => { setVerIndex(history.length - 1); }, [history.length]);

    const currentImg = history[verIndex] || { loading: false, url: null, error: null };
    
    const handleGen = () => onGenerateImage(index, item.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength);
    
    const downloadSingle = async () => {
      if (currentImg.url) saveAs(currentImg.url, `view_${index}_v${verIndex}.png`);
    };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col">
        {/* 图片区域 (动态比例) */}
        <div className={cn("bg-black relative w-full shrink-0", getAspectRatioClass())}>
          {currentImg.loading ? (
            <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 text-slate-500"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div>
          ) : currentImg.url ? (
            <div className="relative w-full h-full group/img">
              <img src={currentImg.url} className="w-full h-full object-cover"/>
              {/* 悬浮操作栏 */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                <button onClick={downloadSingle} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600" title="下载此图"><Download size={12}/></button>
              </div>
              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                <button onClick={handleGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600" title="重新生成"><RefreshCw size={12}/></button>
              </div>
              
              {/* 版本切换器 (如果有多个版本) */}
              {history.length > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <button disabled={verIndex <= 0} onClick={() => setVerIndex(v => v - 1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button>
                  <span className="text-[10px] text-white font-mono">{verIndex + 1}/{history.length}</span>
                  <button disabled={verIndex >= history.length - 1} onClick={() => setVerIndex(v => v + 1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button>
                </div>
              )}
            </div>
          ) : currentImg.error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-xs text-center"><p>{currentImg.error}</p><button onClick={handleGen} className="mt-2 text-white underline">重试</button></div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 backdrop-blur-[2px] transition-opacity">
              <button onClick={handleGen} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2"><Camera size={14}/> 生成</button>
            </div>
          )}
        </div>
        
        {/* 文本区域 */}
        <div className="p-3 border-t border-slate-800 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-200 text-xs truncate pr-2" title={item.title}>{item.title}</h3>
            <button onClick={() => navigator.clipboard.writeText(item.prompt)} className="text-slate-500 hover:text-white transition-colors" title="复制提示词"><Copy size={12}/></button>
          </div>
          <p className="text-[10px] text-slate-500 line-clamp-3 font-mono bg-black/30 p-2 rounded flex-1 select-all hover:text-slate-400 transition-colors">{item.prompt}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto z-10 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="space-y-6">
          <div className="space-y-2"><label className="text-sm font-medium text-slate-300 flex items-center gap-2"><ImageIcon size={16} /> 参考图片 (角色一致性)</label>
            <div className="relative group"><input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" /><label htmlFor="ref-img" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 overflow-hidden">{referenceImage ? (<img src={referenceImage} className="w-full h-full object-cover opacity-80" />) : (<div className="text-slate-500 flex flex-col items-center"><Upload size={24} className="mb-2"/><span className="text-xs">点击上传</span></div>)}</label></div>
          </div>
          <div className="space-y-2 flex-1"><label className="text-sm font-medium text-slate-300">角色描述</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-32 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="例如：一位银发精灵弓箭手，穿着带有发光符文的森林绿色皮甲..."/></div>
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-4">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 高级生成参数</div>
             <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><label className="text-[10px] text-slate-500 flex items-center gap-1"><Monitor size={10}/> 画面比例</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="2.35:1">2.35:1</option></select></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500 flex items-center gap-1"><Globe size={10}/> 提示词语言</label><select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"><option value="English">English</option><option value="Chinese">中文</option></select></div>
             </div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2">
               <div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 重绘幅度 (Denoising)</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>
               {useImg2Img && referenceImage && (
                 <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                   <div className="flex justify-between text-[10px] text-slate-500"><span>Strength: {imgStrength}</span></div>
                   <input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/>
                   <div className="text-[9px] text-slate-600 leading-tight mt-1">
                     0.3-0.5: 微调背景/动作 (像原图)<br/>
                     0.7-0.9: 仅参考构图/配色 (创造性)
                   </div>
                 </div>
               )}
             </div>
          </div>
          <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Wand2 size={20}/>} {isGenerating ? '正在构思...' : '生成 9 组视角'}</button>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm z-10">
          <h2 className="text-slate-400 text-sm hidden md:block">视角预览 ({prompts.length})</h2>
          <div className="flex items-center gap-3">
             {prompts.length > 0 && (<><button onClick={() => prompts.forEach((p, idx) => onGenerateImage(idx, p.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength))} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-200 text-sm rounded border border-blue-800"><Camera size={16}/> 全部生成</button><button onClick={downloadAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700"><Download size={16}/> 打包下载</button></>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
            {prompts.map((item, idx) => <CharCard key={idx} item={item} index={idx} />)}
          </div>
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 2：自动分镜工作台 (StoryboardStudio - Ultimate)
// ==========================================
const StoryboardStudio = ({ onCallApi, onGenerateImage }) => {
  // 核心数据状态
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  const [shots, setShots] = useState(() => JSON.parse(localStorage.getItem('sb_shots')) || []);
  
  // 图片历史管理: { [shotId]: [url1, url2, ...] }
  const [shotImages, setShotImages] = useState(() => JSON.parse(localStorage.getItem('sb_shot_images')) || {});

  // 历史记录 (Undo/Redo)
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 辅助状态
  const [messages, setMessages] = useState(() => JSON.parse(localStorage.getItem('sb_messages')) || [{ role: 'assistant', content: '我是您的 AI 分镜导演。请在左侧输入剧本，我们将一起构思精彩的镜头语言。' }]);
  const [mediaAsset, setMediaAsset] = useState(null);
  
  // 设置状态
  const [sbAspectRatio, setSbAspectRatio] = useState(() => localStorage.getItem('sb_ar') || "16:9");
  const [sbTargetLang, setSbTargetLang] = useState(() => localStorage.getItem('sb_lang') || "English");
  const [imgStrength, setImgStrength] = useState(0.55);
  const [useImg2Img, setUseImg2Img] = useState(true);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const chatEndRef = useRef(null);

  // 持久化 & 滚动
  useEffect(() => { localStorage.setItem('sb_script', script); }, [script]);
  useEffect(() => { localStorage.setItem('sb_direction', direction); }, [direction]);
  useEffect(() => { localStorage.setItem('sb_shots', JSON.stringify(shots)); }, [shots]);
  useEffect(() => { localStorage.setItem('sb_shot_images', JSON.stringify(shotImages)); }, [shotImages]);
  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Undo/Redo 逻辑
  const pushHistory = (newShots) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newShots);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setShots(newShots);
  };
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(h => h - 1);
      setShots(history[historyIndex - 1]);
    }
  };
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(h => h + 1);
      setShots(history[historyIndex + 1]);
    }
  };

  const handleAssetUpload = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert("文件过大(>10MB)，请使用短片段。");
    const reader = new FileReader();
    reader.onloadend = () => setMediaAsset({ type, data: reader.result, name: file.name });
    reader.readAsDataURL(file);
  };

  // 1. 生成分镜 (Sora 提示词工程核心)
  const handleAnalyzeScript = async () => {
    if (!script && !direction && !mediaAsset) return alert("请至少输入剧本、导演意图或上传参考图");
    setIsAnalyzing(true);
    try {
      const prompt = `Role: Expert Cinematographer & Director. 
      Task: Create a professional Shot List for video generation (Sora/Veo/Kling).
      
      [Sora Prompt Formula]:
      (Subject + Action) + (Environment + Lighting + Atmosphere) + (Camera Movement + Lens) + (Physics/VFX) + (Aesthetic Style)
      
      Requirements:
      1. Break down the script into shots based on pacing.
      2. **Camera Lingo**: MUST use terms like 'Truck Left', 'Dolly In', 'Rack Focus', 'Low Angle', 'FPV drone', etc.
      3. **Physics/VFX**: Describe movement, e.g., 'hair blowing in wind', 'neon reflections on wet ground', 'dust particles'.
      4. **Consistency**: Ensure visual consistency across shots.
      
      Output JSON Format (Strict Array):
      [
        {
          "id": 1,
          "duration": "4s",
          "visual": "Detailed visual description...",
          "audio": "Dialogue or SFX...",
          "sora_prompt": "Cinematic shot of [Subject], [Action], [Env], [Camera], [Style] --ar ${sbAspectRatio}",
          "image_prompt": "Keyframe for DALL-E, detailed, photorealistic --ar ${sbAspectRatio}"
        }
      ]
      
      Language: ${sbTargetLang} (Keys must be English).`;

      const content = `Script: ${script}\nDirection: ${direction}\nFile: ${mediaAsset ? mediaAsset.name : 'None'}`;
      const res = await onCallApi(prompt, content, mediaAsset);
      const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      
      if (Array.isArray(json)) { 
        pushHistory(json); // 存入历史
        setMessages(prev => [...prev, { role: 'assistant', content: `🎬 分析完成！为您设计了 ${json.length} 个镜头。您可以点击“生成预览”查看关键帧，或在对话框中修改分镜。` }]); 
      }
    } catch (e) { alert("分析失败: " + e.message); } finally { setIsAnalyzing(false); }
  };

  // 2. 导演对话 (修改逻辑)
  const handleSendMessage = async () => {
    if(!chatInput.trim()) return;
    const msg = chatInput; setChatInput(""); setMessages(prev => [...prev, { role: 'user', content: msg }]);
    try {
      const currentContext = shots.map(s => ({id: s.id, visual: s.visual}));
      const res = await onCallApi(
        "Role: Co-Director. Task: Modify the storyboard based on feedback. Return JSON array ONLY for the modified shots. If chatting, return plain text.", 
        `Current Context: ${JSON.stringify(currentContext)}\nUser Feedback: ${msg}\nNOTE: If updating shots, wrap JSON in \`\`\`json ... \`\`\`.`
      );
      
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      const reply = jsonMatch ? res.replace(jsonMatch[0], "") : res;
      setMessages(prev => [...prev, { role: 'assistant', content: reply || "好的，这是修改方案：" }]);
      
      if (jsonMatch) setPendingUpdate(JSON.parse(jsonMatch[1]));
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: "抱歉，处理出错了。" }]); }
  };

  // 3. 应用修改
  const applyUpdate = () => {
    if (!pendingUpdate) return;
    let newShots = [...shots];
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];
    updates.forEach(upd => {
      const idx = newShots.findIndex(s => s.id === upd.id);
      if (idx !== -1) newShots[idx] = { ...newShots[idx], ...upd }; // 图片状态由外部 Map 管理，这里只更新元数据
      else newShots.push(upd);
    });
    newShots.sort((a,b) => a.id - b.id);
    pushHistory(newShots); // 存入历史
    setPendingUpdate(null);
    setMessages(prev => [...prev, { role: 'assistant', content: "✅ 分镜表已更新，您可以继续调整。" }]);
  };

  // 4. 图片状态管理 (Add to History)
  const addImageToShot = (id, url) => {
    setShotImages(prev => {
      const oldList = prev[id] || [];
      return { ...prev, [id]: [...oldList, url] };
    });
  };

  // 5. 下载
  const handleDownload = async (type) => {
    if (shots.length === 0) return;
    if (type === 'csv') {
      const headers = ["Shot", "Duration", "Visual", "Audio", "Sora Prompt"];
      const rows = shots.map(s => [s.id, s.duration, `"${s.visual}"`, `"${s.audio}"`, `"${s.sora_prompt}"`]);
      const csv = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
      saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), "storyboard.csv");
      return;
    }
    const zip = new JSZip();
    const folder = zip.folder("storyboard");
    shots.forEach(s => folder.file(`shot_${s.id}.txt`, `Visual: ${s.visual}\nPrompt: ${s.sora_prompt}`));
    if (type === 'all') {
      const promises = Object.entries(shotImages).map(async ([id, urls]) => {
        if (urls.length > 0) {
          try { 
            const blob = await fetch(urls[urls.length-1]).then(r => r.blob()); 
            folder.file(`shot_${id}.png`, blob); 
          } catch(e) {}
        }
      });
      await Promise.all(promises);
    }
    saveAs(await zip.generateAsync({ type: "blob" }), "storyboard_pack.zip");
  };

  const clearAll = () => {
    if(confirm("确定要清空当前项目吗？")) {
      setShots([]); setMessages([]); setShotImages({}); setHistory([]); setScript(""); setDirection(""); setMediaAsset(null);
      localStorage.removeItem('sb_shots'); localStorage.removeItem('sb_shot_images');
    }
  };

  // 内部组件：分镜卡片 (ShotCard Ultimate)
  const ShotCard = ({ shot }) => {
    const history = shotImages[shot.id] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [loading, setLoading] = useState(false);

    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);

    const currentUrl = history[verIndex];

    const gen = async () => { 
      setLoading(true); 
      try { 
        // 传递重绘幅度
        const url = await onGenerateImage(shot.image_prompt, sbAspectRatio, useImg2Img, mediaAsset?.type === 'image' ? mediaAsset.data : null, imgStrength);
        addImageToShot(shot.id, url); 
      } catch(e) { alert("生图失败: " + e.message); } finally { setLoading(false); } 
    };

    const downloadSingle = () => { if(currentUrl) saveAs(currentUrl, `shot_${shot.id}_v${verIndex}.png`); };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group hover:border-purple-500/50 transition-all shadow-sm">
        {/* 图片区 */}
        <div className={cn("bg-black relative shrink-0 md:w-72", sbAspectRatio === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video")}>
          {loading ? <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2"><Loader2 className="animate-spin"/><span className="text-[10px]">Rendering...</span></div> 
          : currentUrl ? (
            <div className="relative w-full h-full group/img">
              <img src={currentUrl} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 transition-all flex gap-1">
                <button onClick={downloadSingle} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600" title="下载"><Download size={12}/></button>
                <button onClick={gen} className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600" title="重绘"><RefreshCw size={12}/></button>
              </div>
              {history.length > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <button disabled={verIndex <= 0} onClick={() => setVerIndex(v => v - 1)} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronLeft size={12}/></button>
                  <span className="text-[10px] text-white font-mono">{verIndex + 1}/{history.length}</span>
                  <button disabled={verIndex >= history.length - 1} onClick={() => setVerIndex(v => v + 1)} className="text-white hover:text-purple-400 disabled:opacity-30"><ChevronRight size={12}/></button>
                </div>
              )}
            </div>
          ) : <div className="absolute inset-0 flex items-center justify-center"><button onClick={gen} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"><Camera size={14}/> 生成画面</button></div>}
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur">Shot {shot.id}</div>
          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1"><Clock size={10}/> {shot.duration}</div>
        </div>

        {/* 信息区 */}
        <div className="p-4 flex-1 space-y-3 min-w-0 flex flex-col justify-center">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm text-slate-200 font-medium leading-relaxed">{shot.visual}</div>
            <div className="flex gap-1 shrink-0">
               <button onClick={() => navigator.clipboard.writeText(shot.sora_prompt)} className="p-1.5 text-slate-500 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors" title="复制提示词"><Copy size={14}/></button>
            </div>
          </div>
          <div className="flex gap-2 text-xs">
             <div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400"><Mic size={12} className="text-purple-400"/> {shot.audio || "No Audio"}</div>
          </div>
          <div className="bg-purple-900/10 border border-purple-900/30 p-2.5 rounded text-[10px] font-mono text-purple-200/70 break-all select-all hover:border-purple-500/50 transition-colors">
            <span className="text-purple-500 font-bold select-none">Sora Prompt: </span>{shot.sora_prompt}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧控制台 */}
      <div className="w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
        <div className="p-4 border-b border-slate-800 sticky top-0 bg-slate-900/80 backdrop-blur flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2"><Clapperboard size={16} className="text-purple-500"/> 导演控制台</h2>
          <button onClick={clearAll} className="text-slate-500 hover:text-red-400 transition-colors" title="清空项目"><Trash2 size={14}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><FileText size={12}/> 剧本 / 台词</label><textarea value={script} onChange={e => setScript(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600" placeholder="例如：(旁白) 2077年雨夜，霓虹闪烁。主角Jack从阴影中走出..."/></div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Video size={12}/> 导演意图</label><textarea value={direction} onChange={e => setDirection(e.target.value)} className="w-full h-20 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600" placeholder="例如：王家卫风格，抽帧效果，高对比度，色彩压抑..."/></div>
          
          {/* 设置面板 */}
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 分镜生成设置</div>
             <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={sbAspectRatio} onChange={(e) => setSbAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="2.35:1">2.35:1</option></select></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={sbTargetLang} onChange={(e) => setSbTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="English">English</option><option value="Chinese">中文</option></select></div>
             </div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2">
               <div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 重绘幅度 (Denoising)</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>
               {useImg2Img && mediaAsset?.type === 'image' && (
                 <div className="space-y-1 animate-in fade-in">
                   <div className="flex justify-between text-[10px] text-slate-500"><span>Strength: {imgStrength}</span></div>
                   <input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/>
                   <div className="text-[9px] text-slate-600 leading-tight mt-1">0.3-0.5: 微调 | 0.7-0.9: 创造</div>
                 </div>
               )}
             </div>
          </div>

          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Upload size={12}/> 多模态素材</label><div className="grid grid-cols-3 gap-2 h-20">
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='image'?"border-purple-500 bg-purple-900/20":"border-slate-600 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="image/*" onChange={(e)=>handleAssetUpload(e,'image')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 {mediaAsset?.type==='image' ? <img src={mediaAsset.data} className="w-full h-full object-cover opacity-80"/> : <><ImageIcon size={16} className="mb-1"/><span className="text-[10px]">图片</span></>}
              </div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='audio'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="audio/*" onChange={(e)=>handleAssetUpload(e,'audio')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 <Mic size={16} className={cn("mb-1", mediaAsset?.type==='audio'?"text-purple-400":"text-slate-500")}/> <span className="text-[10px]">{mediaAsset?.type==='audio'? '已上传' : '音频'}</span>
              </div>
              <div className={cn("relative border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors", mediaAsset?.type==='video'?"border-purple-500 bg-purple-900/20":"border-slate-700 hover:border-purple-500 bg-slate-800/30")}>
                 <input type="file" accept="video/*" onChange={(e)=>handleAssetUpload(e,'video')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                 <Film size={16} className={cn("mb-1", mediaAsset?.type==='video'?"text-purple-400":"text-slate-500")}/> <span className="text-[10px]">{mediaAsset?.type==='video'? '已上传' : '视频'}</span>
              </div>
          </div></div>
          
          <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
             {isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} {isAnalyzing ? '分析中...' : '生成分镜'}
          </button>
        </div>

        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4">
            <span className="flex items-center gap-2 font-medium text-slate-400"><MessageSquare size={12}/> AI 导演助手</span>
            {pendingUpdate && <button onClick={applyUpdate} className="text-green-400 flex gap-1 items-center bg-green-900/20 px-2 py-0.5 rounded border border-green-900/50 animate-pulse cursor-pointer"><CheckCircle2 size={10}/> 确认修改</button>}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">{messages.map((m, i) => <div key={i} className={cn("flex", m.role==='user'?"justify-end":"justify-start")}><div className={cn("max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed shadow-sm", m.role==='user'?"bg-purple-600 text-white":"bg-slate-800 text-slate-300 border border-slate-700")}>{m.content}</div></div>)}<div ref={chatEndRef}/></div>
          <div className="p-3 border-t border-slate-800 flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 transition-colors" placeholder="对分镜有什么修改意见？"/><button onClick={handleSendMessage} className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors shadow-lg shadow-purple-900/20"><Send size={14}/></button></div>
        </div>
      </div>
      
      <div className="flex-1 bg-slate-950 p-6 overflow-y-auto">
        {shots.length > 0 ? (
          <div className="max-w-4xl mx-auto pb-20 space-y-4">
            <div className="flex items-center justify-between mb-4 px-1 sticky top-0 z-20 bg-slate-950/80 backdrop-blur py-2">
               <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2>
                 <div className="flex gap-1 ml-4 border-l border-slate-700 pl-4">
                   <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800" title="撤销"><Undo2 size={14}/></button>
                   <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800" title="重做"><Redo2 size={14}/></button>
                 </div>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => handleDownload('csv')} className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1 transition-colors"><FileSpreadsheet size={12}/> 导出 CSV</button>
                 <button onClick={() => handleDownload('all')} className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors"><Download size={12}/> 下载全部 (Zip)</button>
               </div>
            </div>
            {shots.map(s => <ShotCard key={s.id} shot={s} onUpdateImage={addImageToShot} />)}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
            <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800"><Clapperboard size={32} className="opacity-20 text-purple-500"/></div>
            <div className="text-center"><p className="text-sm font-medium text-slate-500">分镜白板为空</p><p className="text-xs text-slate-600 mt-1">请上传素材并生成</p></div>
          </div>
        )}
      </div>
    </div>
  );
};
// ==========================================
// 主应用入口 (App)
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

  // 角色工坊 State (保留以避免切换Tab丢失数据)
  const [prompts, setPrompts] = useState([]);
  const [images, setImages] = useState({});
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [charAspectRatio, setCharAspectRatio] = useState("16:9");

  // API Calls
  const fetchModels = async () => {
    if (!apiKey) return alert("请先填写 API Key");
    setIsLoadingModels(true); setAvailableModels([]);
    try {
      let found = [];
      try { const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } }); const d = await r.json(); if(d.data) found = d.data.map(m=>m.id); } catch(e){}
      if(!found.length) { const r = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`); const d = await r.json(); if(d.models) found = d.models.map(m=>m.name.replace('models/','')); }
      if(found.length) setAvailableModels([...new Set(found)].sort()); else alert("未获取到列表");
    } catch(e) { alert(e.message); } finally { setIsLoadingModels(false); }
  };

  const handleSaveSettings = () => { localStorage.setItem('gemini_key', apiKey); localStorage.setItem('gemini_base_url', baseUrl); localStorage.setItem('text_model', textModel); localStorage.setItem('image_model', imageModel); setShowSettings(false); };

  // 核心文本 API (支持 多模态对象 和 普通Base64字符串)
  const callTextApi = async (system, user, asset) => {
    if(!apiKey) throw new Error("No API Key");
    
    // 解析素材数据
    let mimeType = null;
    let base64Data = null;
    
    if (asset) {
      const dataStr = typeof asset === 'string' ? asset : asset.data; // 兼容 string 和 object
      if (dataStr) {
        mimeType = dataStr.split(';')[0].split(':')[1];
        base64Data = dataStr.split(',')[1];
      }
    }

    // 1. OpenAI Chat Format (Vision only usually)
    try {
      const content = [{ type: "text", text: user }];
      if (base64Data && mimeType?.startsWith('image')) {
        content.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } });
      }
      const msgs = [{ role: "system", content: system }, { role: "user", content: content }];
      const r = await fetch(`${baseUrl}/v1/chat/completions`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`}, body:JSON.stringify({model:textModel, messages:msgs}) });
      if(r.ok) return (await r.json()).choices[0].message.content;
    } catch(e){}

    // 2. Google Native Format (支持 Audio/Video/Image)
    const parts = [{ text: system + "\n" + user }];
    if (base64Data && mimeType) {
      parts.push({ inlineData: { mimeType: mimeType, data: base64Data } });
    }

    const r = await fetch(`${baseUrl}/v1beta/models/${textModel}:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts}]}) });
    if(!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "API Error");
    }
    return (await r.json()).candidates[0].content.parts[0].text;
  };

  // 通用生图 (支持动态比例 & 垫图 & 强度)
  const callGenerateImage = async (prompt, aspectRatio = "16:9", useImg2Img = false, refImg = null, strength = 0.55) => {
    let size = "1024x1024";
    if (aspectRatio === "16:9") size = "1792x1024";
    else if (aspectRatio === "9:16") size = "1024x1792";
    else if (aspectRatio === "2.35:1") size = "1792x1024";

    const payload = { model:imageModel, prompt, n:1, size };
    
    // 注入垫图参数 (适配第三方 API)
    if (useImg2Img && refImg) {
      // 兼容 CharacterLab 传 string 和 Storyboard 传 object 两种情况
      const imgStr = typeof refImg === 'string' ? refImg : refImg.data;
      if (imgStr) {
        payload.image = imgStr.split(',')[1];
        payload.strength = parseFloat(strength);
      }
    }

    const r = await fetch(`${baseUrl}/v1/images/generations`, { 
      method:'POST', 
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`}, 
      body:JSON.stringify(payload) 
    });
    
    if(!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "Img Gen Error");
    }
    const data = await r.json();
    return data.data[0].url;
  };

  // CharacterLab 专用包装 (因参数传递方式略有不同)
  const handleGeneratePrompts = async (params) => {
    setIsGeneratingPrompts(true); setPrompts([]); setImages({});
    try {
      // 直接调用通用接口，但在 CharacterLab 内部构建好 Prompt
      const res = await callTextApi(params.systemPrompt, `Description: ${params.description}`, params.referenceImage);
      const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      setPrompts(json.map(p => ({ title: p.title||p.标题||"Shot", prompt: p.prompt||p.提示词||"Error" })));
    } catch(e) { alert(e.message); } finally { setIsGeneratingPrompts(false); }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <ModelSelectionModal isOpen={activeModalType!==null} title={activeModalType==='text'?"分析模型":"绘图模型"} models={availableModels} onClose={()=>setActiveModalType(null)} onSelect={m=>{if(activeModalType==='text'){setTextModel(m);localStorage.setItem('text_model',m)}else{setImageModel(m);localStorage.setItem('image_model',m)}}}/>
      {showSettings && <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"><div className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-full max-w-md"><h2 className="text-xl font-bold mb-4 text-white">设置</h2><div className="space-y-4"><div><label className="text-sm text-slate-400">Endpoint</label><input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} className="w-full bg-slate-800 border-slate-600 rounded p-2 text-sm"/></div><div><label className="text-sm text-slate-400">Key</label><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} className="w-full bg-slate-800 border-slate-600 rounded p-2 text-sm"/></div><button onClick={fetchModels} disabled={isLoadingModels} className="w-full py-2 bg-blue-900/20 text-blue-400 border border-blue-900/50 rounded flex justify-center gap-2">{isLoadingModels?<Loader2 size={14} className="animate-spin"/>:<RefreshCw size={14}/>} 刷新模型列表</button></div><div className="flex justify-end mt-6 gap-2"><button onClick={()=>setShowSettings(false)} className="px-4 py-2 hover:bg-slate-800 rounded text-sm">取消</button><button onClick={handleSaveSettings} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">保存</button></div></div></div>}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-6"><div className="flex items-center gap-2"><Wand2 size={18} className="text-white"/><h1 className="font-bold text-lg hidden md:block">Ink & Silk</h1></div><div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50"><button onClick={()=>setActiveTab('character')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2", activeTab==='character'?"bg-slate-700 text-white":"text-slate-400")}><ImageIcon size={14}/> 角色工坊</button><button onClick={()=>setActiveTab('storyboard')} className={cn("px-4 py-1.5 text-xs font-medium rounded-md flex gap-2", activeTab==='storyboard'?"bg-purple-600 text-white":"text-slate-400")}><Clapperboard size={14}/> 自动分镜 <span className="text-[9px] bg-purple-800 px-1 rounded text-purple-200">New</span></button></div></div>
        <div className="flex items-center gap-4"><div className="hidden md:flex gap-4"><ModelTrigger label="分析" icon={Server} value={textModel} onOpenPicker={()=>setActiveModalType('text')} onManualChange={v=>{setTextModel(v);localStorage.setItem('text_model',v)}} variant="horizontal" colorTheme="blue"/><ModelTrigger label="绘图" icon={Palette} value={imageModel} onOpenPicker={()=>setActiveModalType('image')} onManualChange={v=>{setImageModel(v);localStorage.setItem('image_model',v)}} variant="horizontal" colorTheme="purple"/></div><button onClick={()=>setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400"><Settings size={20}/></button></div>
      </div>
      <div className="flex-1 overflow-hidden relative">
        {activeTab==='character' ? <CharacterLab onGeneratePrompts={handleGeneratePrompts} onGenerateImage={callGenerateImage} isGenerating={isGeneratingPrompts} prompts={prompts} images={images} setAspectRatio={setCharAspectRatio} aspectRatio={charAspectRatio}/> : <StoryboardStudio onCallApi={callTextApi} onGenerateImage={callGenerateImage}/>}
      </div>
    </div>
  );
}
