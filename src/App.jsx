import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown, CheckCircle2 } from 'lucide-react';
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
      "Image": allFiltered.filter(m => ['dall-e', 'mj', 'midjourney', 'flux', 'sd', 'stable-diffusion', 'imagen', 'drawing', 'nano', 'banana'].some(k => m.toLowerCase().includes(k))),
      "OpenSource": allFiltered.filter(m => ['llama', 'qwen', 'mistral', 'yi-', 'deepseek', 'phi'].some(k => m.toLowerCase().includes(k))),
    };
  }, [models, search]);

  const tabs = ["All", "OpenAI", "Claude", "Gemini", "Image", "OpenSource"];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><LayoutGrid size={20} className="text-blue-500"/> 选择: <span className="text-blue-400">{title}</span></h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400"><X size={20}/></button>
          </div>
          <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-500"/><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型..." className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"/></div>
        </div>
        <div className="px-4 pt-3 border-b border-slate-700 bg-slate-800/30 overflow-x-auto"><div className="flex gap-2 pb-3">{tabs.map(tab => (<button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-1.5 text-xs font-medium rounded-full border transition-all", activeTab === tab ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400")}>{tab} <span className="ml-1 opacity-50">{categorizedModels[tab].length}</span></button>))}</div></div>
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {categorizedModels[activeTab].map(m => (
              <button key={m} onClick={() => { onSelect(m); onClose(); }} className="group flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900 hover:border-blue-500/50 hover:bg-slate-800 text-left"><span className="text-sm text-slate-300 group-hover:text-white truncate font-mono">{m}</span><ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"/></button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
// --- 组件：模型触发器 ---
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, variant = "vertical", colorTheme = "slate" }) => {
  const [isManual, setIsManual] = useState(false);
  const themes = {
    slate: { border: "border-slate-700", icon: "text-slate-400", bg: "bg-slate-900" },
    blue: { border: "border-blue-900/50", icon: "text-blue-400", bg: "bg-blue-950/20" },
    purple: { border: "border-purple-900/50", icon: "text-purple-400", bg: "bg-purple-950/20" },
  };
  const t = themes[colorTheme] || themes.slate;

  if (variant === "horizontal") {
    return (
      <div className={cn("flex items-center rounded-lg border transition-all h-9 group", t.bg, t.border)}>
        <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full select-none"><Icon size={14} className={t.icon} /><span className={cn("text-xs font-medium", t.icon)}>{label}</span></div>
        <div className="w-40 px-2 h-full flex items-center">
          {isManual ? <input value={value} onChange={(e) => onManualChange(e.target.value)} placeholder="输入ID..." className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono placeholder:text-slate-600" autoFocus /> 
          : <button onClick={onOpenPicker} className="w-full text-left truncate text-xs text-slate-300 font-mono hover:text-white flex items-center justify-between"><span className="truncate mr-2">{value || "选择..."}</span><ChevronDown size={12} className="opacity-50"/></button>}
        </div>
        <button onClick={() => setIsManual(!isManual)} className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50"><Pencil size={12}/></button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Icon size={12}/> {label}</label>
        <button onClick={() => setIsManual(!isManual)} className={cn("p-1 rounded hover:bg-slate-700 transition-colors", isManual ? "text-blue-400 bg-blue-900/20" : "text-slate-500")} title={isManual ? "切换回列表选择" : "切换到手动输入"}><Pencil size={12} /></button>
      </div>
      {isManual ? (
        <input value={value} onChange={(e) => onManualChange(e.target.value)} placeholder="手动输入模型ID..." className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 transition-colors font-mono"/>
      ) : (
        <button onClick={onOpenPicker} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none hover:border-blue-500/50 hover:bg-slate-800 transition-all flex items-center justify-between group text-left">
          <span className="truncate font-mono">{value || "点击选择模型..."}</span><LayoutGrid size={14} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
        </button>
      )}
    </div>
  );
};

// ==========================================
// 模块 1：角色工坊 (CharacterLab)
// ==========================================
const CharacterLab = ({ onGeneratePrompts, onGenerateImage, isGenerating, prompts, images, setAspectRatio, aspectRatio }) => {
  const [description, setDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [targetLang, setTargetLang] = useState("English");
  const [imgStrength, setImgStrength] = useState(0.75); 
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

  const downloadAll = async () => {
    const zip = new JSZip();
    const folder = zip.folder("character_design");
    folder.file("prompts.txt", prompts.map(p => `[${p.title}]\n${p.prompt}`).join("\n\n"));
    const promises = Object.entries(images).map(async ([index, data]) => {
      if (data.url && !data.error) { try { const imgBlob = await fetch(data.url).then(r => r.blob()); folder.file(`view_${index}.png`, imgBlob); } catch (e) {} }
    });
    await Promise.all(promises);
    saveAs(await zip.generateAsync({ type: "blob" }), "character_design.zip");
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto z-10 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="space-y-6">
          <div className="space-y-2"><label className="text-sm font-medium text-slate-300 flex items-center gap-2"><ImageIcon size={16} /> 参考图片 (垫图)</label>
            <div className="relative group"><input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" /><label htmlFor="ref-img" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 overflow-hidden">{referenceImage ? (<img src={referenceImage} className="w-full h-full object-cover opacity-80" />) : (<div className="text-slate-500 flex flex-col items-center"><Upload size={24} className="mb-2"/><span className="text-xs">点击上传</span></div>)}</label></div>
          </div>
          <div className="space-y-2 flex-1"><label className="text-sm font-medium text-slate-300">角色描述</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-32 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="例如：一位银发精灵弓箭手..."/></div>
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-4">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 高级生成参数</div>
             <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><label className="text-[10px] text-slate-500 flex items-center gap-1"><Monitor size={10}/> 画面比例</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="2.35:1">2.35:1</option></select></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500 flex items-center gap-1"><Globe size={10}/> 提示词语言</label><select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"><option value="English">English</option><option value="Chinese">中文</option></select></div>
             </div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2">
               <div className="flex items-center justify-between"><label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 图生图 (垫图) 开关</label><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/></div>
               {useImg2Img && referenceImage && (<div className="space-y-1"><div className="flex justify-between text-[10px] text-slate-500"><span>重绘幅度</span><span>{imgStrength}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-blue-500"/></div>)}
             </div>
          </div>
          <button onClick={() => onGeneratePrompts({ description, referenceImage, aspectRatio, targetLang })} disabled={isGenerating} className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Wand2 size={20}/>} {isGenerating ? '正在构思...' : '生成 9 组视角'}</button>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm z-10">
          <h2 className="text-slate-400 text-sm hidden md:block">预览 ({prompts.length})</h2>
          <div className="flex items-center gap-3">
             {prompts.length > 0 && (<><button onClick={() => prompts.forEach((p, idx) => onGenerateImage(idx, p.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength))} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-200 text-sm rounded border border-blue-800"><Camera size={16}/> 生成所有图片</button><button onClick={downloadAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700"><Download size={16}/> 下载</button></>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
            {prompts.map((item, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group">
                <div className={cn("bg-slate-950 relative", getAspectRatioClass())}>
                  {images[idx]?.loading ? (<div className="absolute inset-0 flex items-center justify-center flex-col gap-2"><Loader2 className="animate-spin text-blue-500" size={32}/><span className="text-xs text-slate-500">Generating...</span></div>) : images[idx]?.url ? (<img src={images[idx].url} className="w-full h-full object-cover"/>) : images[idx]?.error ? (<div className="absolute inset-0 flex items-center justify-center text-red-400 p-4 text-xs text-center">{images[idx].error}</div>) : (<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40"><button onClick={() => onGenerateImage(idx, item.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm shadow-lg">生成</button></div>)}
                </div>
                <div className="p-4 border-t border-slate-800"><div className="flex items-center justify-between mb-2"><h3 className="font-bold text-slate-200 text-sm">{item.title}</h3><Copy size={14} className="text-slate-500 cursor-pointer" onClick={() => navigator.clipboard.writeText(item.prompt)}/></div><p className="text-xs text-slate-500 line-clamp-3 font-mono bg-black/30 p-2 rounded">{item.prompt}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
// ==========================================
// 模块 2：自动分镜工作台 (StoryboardStudio - Phase 4)
// ==========================================
const StoryboardStudio = ({ onCallApi, onGenerateImage }) => {
  const [script, setScript] = useState("");
  const [direction, setDirection] = useState("");
  const [referenceAsset, setReferenceAsset] = useState(null);
  const [shots, setShots] = useState([]); // 核心数据：包含文本和 imageUrl
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([{ role: 'assistant', content: '我是您的 AI 分镜导演。请在左侧上传素材或输入剧本，点击“生成分镜表”开始工作。' }]);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  
  // 新增设置状态
  const [sbAspectRatio, setSbAspectRatio] = useState("16:9");
  const [sbTargetLang, setSbTargetLang] = useState("English");

  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleAssetUpload = (e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setReferenceAsset(reader.result); reader.readAsDataURL(file); } };

  // 1. 生成分镜 (带参数)
  const handleAnalyzeScript = async () => {
    if (!script && !direction && !referenceAsset) return alert("请至少输入剧本、导演意图或上传参考图");
    setIsAnalyzing(true); 
    // 注意：这里不直接清空 shots，如果是重新生成，建议清空；如果是追加暂不处理。这里选择重置。
    setShots([]); 
    try {
      const prompt = `Role: Expert Film Director. Task: Analyze Script/Direction/Reference. Output: JSON Shot List for Sora/Veo video generation.
      Requirements: 
      - Break down into shots based on pacing.
      - Keys: id, duration, visual, audio, sora_prompt (technical camera lingo), image_prompt (for DALL-E).
      - Add parameter "--ar ${sbAspectRatio}" to prompts.
      - Prompts Language: ${sbTargetLang} (Keys must remain English).
      - Ensure strictly valid JSON array output.`;
      
      const content = `Script: ${script}\nDirection: ${direction}`;
      const res = await onCallApi(prompt, content, referenceAsset);
      const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      
      if (Array.isArray(json)) { 
        setShots(json); // 初始化 shots，此时没有 imageUrl
        setMessages(prev => [...prev, { role: 'assistant', content: `分析完成！共 ${json.length} 个镜头。您可以在右侧生成预览图。` }]); 
      }
    } catch (e) { alert("分析失败: " + e.message); } finally { setIsAnalyzing(false); }
  };

  // 2. 导演对话 (智能合并，防止图片丢失)
  const handleSendMessage = async () => {
    if(!chatInput.trim()) return;
    const msg = chatInput; setChatInput(""); setMessages(prev => [...prev, { role: 'user', content: msg }]);
    try {
      // 发送当前分镜表结构（简化版，省去 prompt 节省 token）
      const currentContext = shots.map(s => ({id: s.id, visual: s.visual}));
      
      const res = await onCallApi(
        "Role: Co-Director. Task: Modify storyboard based on user input. Return JSON block ONLY for modified/new shots. If no data change, return text only.", 
        `Current Shots Summary: ${JSON.stringify(currentContext)}\nUser Instruction: ${msg}\n\nIMPORTANT: If updating, return JSON array of objects.`
      );
      
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      const reply = jsonMatch ? res.replace(jsonMatch[0], "") : res;
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      
      if (jsonMatch) {
        const updates = JSON.parse(jsonMatch[1]);
        setPendingUpdate(updates); // 暂存修改
      }
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: "处理请求时出错。" }]); }
  };

  // 3. 应用修改 (核心修复：保留图片)
  const applyUpdate = () => {
    if (!pendingUpdate) return;
    
    let newShots = [...shots];
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];

    updates.forEach(upd => {
      const idx = newShots.findIndex(s => s.id === upd.id);
      if (idx !== -1) {
        // 关键点：合并新数据，但保留旧的 imageUrl
        newShots[idx] = { ...newShots[idx], ...upd, imageUrl: newShots[idx].imageUrl };
      } else {
        // 如果是新镜头，直接添加
        newShots.push(upd);
      }
    });
    
    // 重新排序（可选，按ID）
    newShots.sort((a,b) => a.id - b.id);
    
    setShots(newShots);
    setPendingUpdate(null);
    setMessages(prev => [...prev, { role: 'assistant', content: "✅ 分镜表已更新，原图已保留。" }]);
  };

  // 4. 更新单张图片的 URL (Lifted State)
  const updateShotImage = (id, url) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, imageUrl: url } : s));
  };

  // 5. 下载功能
  const handleDownload = async (type) => {
    if (shots.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder("storyboard");
    
    // 文本
    const textContent = shots.map(s => `[Shot ${s.id}] ${s.duration}\nVisual: ${s.visual}\nAudio: ${s.audio}\nPrompt: ${s.sora_prompt}\n`).join("\n---\n");
    if (type === 'text' || type === 'all') {
      const blob = new Blob([textContent], {type: "text/plain;charset=utf-8"});
      saveAs(blob, "storyboard_script.txt");
      if (type === 'text') return; // 仅下载文本
    }

    // 图片打包
    if (type === 'all') {
      folder.file("script.txt", textContent);
      const promises = shots.map(async (s) => {
        if (s.imageUrl) {
          try {
            const imgBlob = await fetch(s.imageUrl).then(r => r.blob());
            folder.file(`shot_${s.id}.png`, imgBlob);
          } catch(e) {}
        }
      });
      await Promise.all(promises);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "storyboard_assets.zip");
    }
  };

  // 子组件：分镜卡片 (现在只负责渲染和触发加载)
  const ShotCard = ({ shot, onUpdateImage }) => {
    const [loading, setLoading] = useState(false);
    
    const gen = async () => { 
      setLoading(true); 
      try { 
        const url = await onGenerateImage(shot.image_prompt, sbAspectRatio); // 传入当前比例
        onUpdateImage(shot.id, url); 
      } catch(e) { 
        alert("生图失败: " + e.message); 
      } finally { 
        setLoading(false); 
      } 
    };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group hover:border-purple-500/50 transition-all">
        {/* 预览图区域 */}
        <div className={cn("bg-black relative shrink-0 md:w-64", sbAspectRatio === "9:16" ? "w-32 aspect-[9/16]" : "w-full aspect-video")}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2"><Loader2 className="animate-spin"/><span className="text-[10px]">Generating...</span></div>
          ) : shot.imageUrl ? (
            <div className="relative w-full h-full group/img">
              <img src={shot.imageUrl} className="w-full h-full object-cover"/>
              <button onClick={gen} className="absolute bottom-2 right-2 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-purple-600"><RefreshCw size={12}/></button>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <button onClick={gen} className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"><Camera size={14}/> 生成画面</button>
            </div>
          )}
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur">Shot {shot.id}</div>
          <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1"><Clock size={10}/> {shot.duration}</div>
        </div>

        {/* 信息区域 */}
        <div className="p-4 flex-1 space-y-3 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm text-slate-200 font-medium leading-relaxed">{shot.visual}</div>
            <button onClick={() => navigator.clipboard.writeText(shot.sora_prompt)} className="text-slate-500 hover:text-purple-400 shrink-0"><Copy size={14}/></button>
          </div>
          <div className="text-xs text-slate-500 bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800"><Mic size={12} className="text-purple-400 shrink-0"/> <span className="truncate">{shot.audio}</span></div>
          <div className="bg-purple-900/10 border border-purple-900/30 p-2 rounded text-[10px] font-mono text-purple-200/70 break-all select-all"><span className="text-purple-500 font-bold select-none">Prompt: </span>{shot.sora_prompt}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧控制台 */}
      <div className="w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
        <div className="p-4 border-b border-slate-800 sticky top-0 bg-slate-900/80 backdrop-blur"><h2 className="text-sm font-bold text-slate-200 flex items-center gap-2"><Clapperboard size={16} className="text-purple-500"/> 导演控制台</h2></div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><FileText size={12}/> 剧本 / 旁白</label><textarea value={script} onChange={e => setScript(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono" placeholder="输入剧本..."/></div>
          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Video size={12}/> 导演意图</label><textarea value={direction} onChange={e => setDirection(e.target.value)} className="w-full h-20 bg-slate-800 border-slate-700 rounded-lg p-3 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none" placeholder="运镜风格、色调..."/></div>
          
          {/* 新增：分镜设置 (与 CharacterLab 保持一致) */}
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 分镜生成设置</div>
             <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><label className="text-[10px] text-slate-500 flex items-center gap-1"><Monitor size={10}/> 画面比例</label><select value={sbAspectRatio} onChange={(e) => setSbAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="2.35:1">2.35:1</option></select></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500 flex items-center gap-1"><Globe size={10}/> 语言</label><select value={sbTargetLang} onChange={(e) => setSbTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"><option value="English">English</option><option value="Chinese">中文</option></select></div>
             </div>
          </div>

          <div className="space-y-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Upload size={12}/> 参考素材</label><div className="h-16 border border-dashed border-slate-700 rounded flex items-center justify-center hover:bg-slate-800 relative cursor-pointer"><input type="file" onChange={handleAssetUpload} className="absolute inset-0 opacity-0"/>{referenceAsset ? <img src={referenceAsset} className="h-full opacity-60"/> : <ImageIcon size={16} className="text-slate-500"/>}</div></div>
          
          <button onClick={handleAnalyzeScript} disabled={isAnalyzing} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} {isAnalyzing ? '正在分析...' : '生成分镜表'}</button>
        </div>

        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4">
            <span className="flex items-center gap-2 font-medium text-slate-400"><MessageSquare size={12}/> AI 导演助手</span>
            {pendingUpdate && <button onClick={applyUpdate} className="text-green-400 flex gap-1 items-center bg-green-900/20 px-2 py-0.5 rounded border border-green-900/50 animate-pulse cursor-pointer"><CheckCircle2 size={10}/> 确认修改</button>}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">{messages.map((m, i) => <div key={i} className={cn("flex", m.role==='user'?"justify-end":"justify-start")}><div className={cn("max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed shadow-sm", m.role==='user'?"bg-purple-600 text-white":"bg-slate-800 text-slate-300 border border-slate-700")}>{m.content}</div></div>)}<div ref={chatEndRef}/></div>
          <div className="p-3 border-t border-slate-800 flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500" placeholder="修改建议..."/><button onClick={handleSendMessage} className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white"><Send size={14}/></button></div>
        </div>
      </div>
      
      {/* 右侧展示区 */}
      <div className="flex-1 bg-slate-950 p-6 overflow-y-auto">
        {shots.length > 0 ? (
          <div className="max-w-4xl mx-auto pb-20 space-y-4">
            <div className="flex items-center justify-between mb-4 px-1 sticky top-0 z-20 bg-slate-950/80 backdrop-blur py-2">
               <div className="flex items-center gap-2">
                 <h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => handleDownload('text')} className="text-xs bg-slate-800 px-3 py-1.5 rounded border border-slate-700 hover:text-white flex items-center gap-1 transition-colors"><FileText size={12}/> 仅脚本</button>
                 <button onClick={() => handleDownload('all')} className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors"><Download size={12}/> 打包全部 (Zip)</button>
               </div>
            </div>
            {shots.map(s => <ShotCard key={s.id} shot={s} onUpdateImage={updateShotImage} />)}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
            <div className="w-24 h-24 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800"><Clapperboard size={40} className="opacity-20 text-purple-500"/></div>
            <div className="text-center"><p className="text-sm font-medium text-slate-500">分镜白板为空</p><p className="text-xs text-slate-600 mt-1">请在左侧输入剧本并生成</p></div>
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

  const callTextApi = async (system, user, img) => {
    if(!apiKey) throw new Error("No API Key");
    try {
      const msgs = [{role:"system",content:system}, {role:"user", content: img ? [{type:"text",text:user},{type:"image_url",image_url:{url:img}}] : user}];
      const r = await fetch(`${baseUrl}/v1/chat/completions`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`}, body:JSON.stringify({model:textModel, messages:msgs}) });
      if(r.ok) return (await r.json()).choices[0].message.content;
    } catch(e){}
    const parts = [{text: system+"\n"+user}];
    if(img) parts.push({inlineData:{mimeType:img.split(';')[0].split(':')[1], data:img.split(',')[1]}});
    const r = await fetch(`${baseUrl}/v1beta/models/${textModel}:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{parts}]}) });
    if(!r.ok) throw new Error("API Error");
    return (await r.json()).candidates[0].content.parts[0].text;
  };

  // 通用生图 (支持动态比例)
  const callGenerateImage = async (prompt, aspectRatio = "16:9") => {
    // 映射比例到分辨率
    let size = "1024x1024";
    if (aspectRatio === "16:9") size = "1792x1024";
    else if (aspectRatio === "9:16") size = "1024x1792";
    else if (aspectRatio === "2.35:1") size = "1792x1024"; // 电影宽屏暂用横屏

    const r = await fetch(`${baseUrl}/v1/images/generations`, { 
      method:'POST', 
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`}, 
      body:JSON.stringify({model:imageModel, prompt, n:1, size}) 
    });
    
    if(!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "Img Gen Error");
    }
    const data = await r.json();
    return data.data[0].url;
  };

  const handleGeneratePrompts = async ({ description, referenceImage, aspectRatio, targetLang }) => {
    setIsGeneratingPrompts(true); setPrompts([]); setImages({});
    try {
      const prompt = `Task: Create 9 prompt variations for character design. Keys: title, prompt. Language: ${targetLang}. AspectRatio: ${aspectRatio}. Ensure strict JSON array output.`;
      const res = await callTextApi(prompt, `Desc: ${description}`, referenceImage);
      const json = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      setPrompts(json.map(p => ({ title: p.title||p.标题||"Shot", prompt: p.prompt||p.提示词||"Error" })));
    } catch(e) { alert(e.message); } finally { setIsGeneratingPrompts(false); }
  };

  // 角色工坊生图 (保留复杂逻辑)
  const handleCharGenerateImage = async (idx, prompt, ar, useImg, refImg, str) => {
    setImages(p => ({...p, [idx]:{loading:true}}));
    try {
      const payload = { model:imageModel, prompt, n:1, size: ar==="16:9"?"1792x1024":ar==="9:16"?"1024x1792":"1024x1024" };
      if(useImg && refImg) { payload.image = refImg.split(',')[1]; payload.strength = parseFloat(str); }
      const r = await fetch(`${baseUrl}/v1/images/generations`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`}, body:JSON.stringify(payload) });
      if(!r.ok) throw new Error("Error");
      const d = await r.json();
      setImages(p => ({...p, [idx]:{loading:false, url:d.data[0].url}}));
    } catch(e) { setImages(p => ({...p, [idx]:{loading:false, error:e.message}})); }
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
        {activeTab==='character' ? <CharacterLab onGeneratePrompts={handleGeneratePrompts} onGenerateImage={handleCharGenerateImage} isGenerating={isGeneratingPrompts} prompts={prompts} images={images} setAspectRatio={setCharAspectRatio} aspectRatio={charAspectRatio}/> : <StoryboardStudio onCallApi={callTextApi} onGenerateImage={callGenerateImage}/>}
      </div>
    </div>
  );
}
