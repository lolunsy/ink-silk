import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, LayoutGrid, Clock, Monitor, Globe, Sliders, Film, Mic, Video, FileText, MessageSquare, Clapperboard, Send, ChevronDown } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

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
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <LayoutGrid size={20} className="text-blue-500"/> 选择模型: <span className="text-blue-400">{title}</span>
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-slate-500" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型名称 (例如: flux, nano)..." className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"/>
          </div>
        </div>
        <div className="px-4 pt-3 pb-0 border-b border-slate-700 bg-slate-800/30 overflow-x-auto">
          <div className="flex gap-2 pb-3">
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-1.5 text-sm font-medium rounded-full transition-all border", activeTab === tab ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200")}>
                {tab} <span className="ml-2 text-xs opacity-60 bg-black/20 px-1.5 rounded-full">{categorizedModels[tab].length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50">
          {categorizedModels[activeTab].length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500"><Search size={48} className="opacity-20 mb-4" /><p>未找到匹配的模型</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {categorizedModels[activeTab].map((modelName) => (
                <button key={modelName} onClick={() => { onSelect(modelName); onClose(); }} className="group flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900 hover:border-blue-500/50 hover:bg-slate-800 transition-all text-left">
                  <span className="text-sm text-slate-300 group-hover:text-white truncate font-mono" title={modelName}>{modelName}</span>
                  <ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-slate-800 bg-slate-900 text-xs text-slate-500 flex justify-between px-6"><span>共加载 {models.length} 个模型</span><span>按 ESC 关闭</span></div>
      </div>
    </div>
  );
};

// --- 组件：模型触发器 (支持 垂直/横向 两种模式) ---
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, variant = "vertical", colorTheme = "slate" }) => {
  const [isManual, setIsManual] = useState(false);

  // 颜色主题配置
  const themes = {
    slate: { border: "border-slate-700", icon: "text-slate-400", activeBorder: "hover:border-slate-500", bg: "bg-slate-900" },
    blue: { border: "border-blue-900/50", icon: "text-blue-400", activeBorder: "hover:border-blue-500/50", bg: "bg-blue-950/20" },
    purple: { border: "border-purple-900/50", icon: "text-purple-400", activeBorder: "hover:border-purple-500/50", bg: "bg-purple-950/20" },
  };
  const t = themes[colorTheme] || themes.slate;

  // 模式 A: 顶部栏横向胶囊模式 (Header Mode)
  if (variant === "horizontal") {
    return (
      <div className={cn("flex items-center rounded-lg border transition-all h-9 group", t.bg, t.border, t.activeBorder)}>
        {/* 左侧：标签区 */}
        <div className="flex items-center gap-2 px-3 border-r border-slate-800/50 h-full select-none">
          <Icon size={14} className={t.icon} />
          <span className={cn("text-xs font-medium", t.icon)}>{label}</span>
        </div>

        {/* 中间：值显示/输入区 */}
        <div className="w-40 px-2 h-full flex items-center">
          {isManual ? (
            <input 
              value={value} 
              onChange={(e) => onManualChange(e.target.value)} 
              placeholder="输入ID..." 
              className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono placeholder:text-slate-600"
              autoFocus
            />
          ) : (
            <button 
              onClick={onOpenPicker} 
              className="w-full text-left truncate text-xs text-slate-300 font-mono hover:text-white transition-colors flex items-center justify-between"
            >
              <span className="truncate mr-2">{value || "选择模型..."}</span>
              <ChevronDown size={12} className="opacity-50" />
            </button>
          )}
        </div>

        {/* 右侧：编辑切换 */}
        <button 
          onClick={() => setIsManual(!isManual)} 
          className="px-2 h-full flex items-center justify-center text-slate-500 hover:text-white border-l border-slate-800/50 transition-colors"
          title={isManual ? "列表模式" : "手动输入"}
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  // 模式 B: 侧边栏垂直模式 (Sidebar Mode)
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
// 核心模块 1：角色工坊 (原功能)
// ==========================================
const CharacterLab = ({ 
  apiConfig, 
  models, 
  onGeneratePrompts, 
  onGenerateImage, 
  isGenerating, 
  prompts, 
  images, 
  setActiveModalType,
  setAspectRatio, // 提升状态以供预览使用
  aspectRatio
}) => {
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

  const handleGenerate = () => {
    onGeneratePrompts({ description, referenceImage, aspectRatio, targetLang });
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    const folder = zip.folder("character_design");
    folder.file("prompts.txt", prompts.map(p => `[${p.title}]\n${p.prompt}`).join("\n\n"));
    const promises = Object.entries(images).map(async ([index, data]) => {
      if (data.url && !data.error) {
         try {
           const imgBlob = await fetch(data.url).then(r => r.blob());
           folder.file(`view_${index}.png`, imgBlob);
         } catch (e) {}
      }
    });
    await Promise.all(promises);
    saveAs(await zip.generateAsync({ type: "blob" }), "character_design.zip");
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* 侧边栏 */}
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto z-10 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><ImageIcon size={16} /> 参考图片 (垫图)</label>
            <div className="relative group">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" />
              <label htmlFor="ref-img" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 transition-all overflow-hidden">{referenceImage ? (<img src={referenceImage} alt="ref" className="w-full h-full object-cover opacity-80" />) : (<div className="text-slate-500 flex flex-col items-center"><Upload size={24} className="mb-2" /><span className="text-xs">点击上传</span></div>)}</label>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            <label className="text-sm font-medium text-slate-300">角色描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-32 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="例如：一位银发精灵弓箭手..."/>
          </div>

          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-4">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1"><Settings size={12}/> 高级生成参数</div>
             <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 flex items-center gap-1"><Monitor size={10}/> 画面比例</label>
                  <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                    <option value="16:9">16:9 (横屏)</option>
                    <option value="9:16">9:16 (竖屏)</option>
                    <option value="1:1">1:1 (正方)</option>
                    <option value="2.35:1">2.35:1 (电影)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 flex items-center gap-1"><Globe size={10}/> 提示词语言</label>
                  <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                    <option value="English">English</option>
                    <option value="Chinese">中文</option>
                  </select>
                </div>
             </div>
             <div className="pt-2 border-t border-slate-700/50 space-y-2">
               <div className="flex items-center justify-between">
                 <label className="text-[10px] text-slate-400 flex items-center gap-1"><Sliders size={10}/> 图生图 (垫图) 开关</label>
                 <input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} className="accent-blue-600"/>
               </div>
               {useImg2Img && referenceImage && (
                 <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                   <div className="flex justify-between text-[10px] text-slate-500"><span>重绘幅度 (Strength)</span><span>{imgStrength}</span></div>
                   <input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                 </div>
               )}
             </div>
          </div>

          <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50">
            {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />} {isGenerating ? '正在构思...' : '生成 9 组视角'}
          </button>
        </div>
      </div>

      {/* 预览展示区 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
        <div className="h-16 border-b border-slate-800 flex items-center justify-center md:justify-between px-6 bg-slate-900/30 backdrop-blur-sm z-10">
          <h2 className="text-slate-400 text-sm hidden md:block">生成的视角预览 ({prompts.length})</h2>
          <div className="flex items-center gap-3">
             {prompts.length > 0 && (
               <>
                <button onClick={() => prompts.forEach((p, idx) => onGenerateImage(idx, p.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength))} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-200 text-sm rounded border border-blue-800 transition-colors"><Camera size={16} /> 生成所有图片</button>
                <button onClick={downloadAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700 transition-colors"><Download size={16} /> 下载</button>
               </>
             )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {prompts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600"><div className="w-24 h-24 rounded-full bg-slate-900 flex items-center justify-center mb-4"><Wand2 size={40} className="opacity-20" /></div><p>在左侧配置模型并开始创作</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
              {prompts.map((item, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group">
                  <div className={cn("bg-slate-950 relative", getAspectRatioClass())}>
                    {images[idx]?.loading ? (<div className="absolute inset-0 flex items-center justify-center flex-col gap-2"><Loader2 className="animate-spin text-blue-500" size={32} /><span className="text-xs text-slate-500">Generating...</span></div>) : images[idx]?.url ? (<img src={images[idx].url} alt={item.title} className="w-full h-full object-cover" />) : images[idx]?.error ? (<div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-center text-xs overflow-auto"><p>{images[idx].error}</p></div>) : (<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]"><button onClick={() => onGenerateImage(idx, item.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">生成此视角</button></div>)}
                    <button onClick={(e) => { e.stopPropagation(); onGenerateImage(idx, item.prompt, aspectRatio, useImg2Img, referenceImage, imgStrength); }} className="absolute bottom-3 right-3 p-2 bg-black/60 hover:bg-blue-600 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all"><RefreshCw size={14} /></button>
                  </div>
                  <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-slate-200 text-sm">{item.title}</h3><button onClick={() => navigator.clipboard.writeText(item.prompt)} className="text-slate-500 hover:text-white transition-colors"><Copy size={14} /></button></div>
                    <p className="text-xs text-slate-500 line-clamp-3 font-mono bg-black/30 p-2 rounded">{item.prompt}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 核心模块 2：自动分镜工作台 (新功能 UI 骨架)
// ==========================================
const StoryboardStudio = ({ }) => {
  const [script, setScript] = useState("");
  const [direction, setDirection] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '我是您的 AI 分镜导演。请在左侧上传素材或输入剧本，我们将一起构思精彩的镜头。' }
  ]);
  const chatEndRef = useRef(null);

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if(!chatInput.trim()) return;
    setMessages([...messages, { role: 'user', content: chatInput }]);
    setChatInput("");
    // 模拟回复
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: '收到，这是一个很好的想法。在下一阶段，我会接入 Gemini 模型来真正理解您的修改建议。' }]);
    }, 1000);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* 导演控制台 (左) */}
      <div className="w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10">
        <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2"><Clapperboard size={16} className="text-purple-500"/> 导演控制台</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><FileText size={12}/> 剧本 / 台词 / 旁白</label>
            <textarea value={script} onChange={e => setScript(e.target.value)} className="w-full h-32 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono" placeholder="例如：(旁白) 公元2077年，霓虹灯下的雨夜。主角从阴影中走出..."/>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Video size={12}/> 导演意图 / 运镜风格</label>
            <textarea value={direction} onChange={e => setDirection(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none" placeholder="例如：赛博朋克风格，压抑的氛围，多用低角度广角镜头..."/>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Upload size={12}/> 参考素材 (图片/音频/视频)</label>
            <div className="grid grid-cols-3 gap-2">
              <button className="h-16 border border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"><ImageIcon size={16} /> <span className="text-[10px] mt-1">图像</span></button>
              <button className="h-16 border border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"><Mic size={16} /> <span className="text-[10px] mt-1">音频</span></button>
              <button className="h-16 border border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"><Film size={16} /> <span className="text-[10px] mt-1">视频</span></button>
            </div>
          </div>
        </div>

        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex items-center gap-2"><MessageSquare size={12}/> AI 导演助手</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-lg p-2 text-xs leading-relaxed", msg.role === 'user' ? "bg-purple-900/50 text-purple-100" : "bg-slate-800 text-slate-300")}>{msg.content}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-slate-800 flex gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="对分镜有什么修改意见？" className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs outline-none focus:border-purple-500"/>
            <button onClick={handleSendMessage} className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded"><Send size={14}/></button>
          </div>
        </div>
      </div>

      {/* 分镜白板 (右) */}
      <div className="flex-1 bg-slate-950 p-8 flex flex-col items-center justify-center text-slate-600">
        <div className="w-24 h-24 rounded-full bg-slate-900 flex items-center justify-center mb-6"><Clapperboard size={40} className="opacity-20 text-purple-500" /></div>
        <h3 className="text-xl font-bold text-slate-500 mb-2">分镜生成工作台</h3>
        <p className="max-w-md text-center text-sm leading-relaxed">在左侧输入剧本和导演意图，点击生成。<br/>AI 将自动为您分析节奏、生成 Sora/Veo 视频提示词、并绘制关键帧分镜图。</p>
        <button className="mt-8 px-6 py-2 bg-slate-800 text-slate-400 rounded-full border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors">等待阶段二接入逻辑...</button>
      </div>
    </div>
  );
};


// ==========================================
// 主应用入口
// ==========================================
export default function App() {
  const [activeTab, setActiveTab] = useState('character'); // 'character' | 'storyboard'
  
  // 全局 API 设置
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_key') || '');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('gemini_base_url') || 'https://generativelanguage.googleapis.com');
  const [availableModels, setAvailableModels] = useState([]); 
  
  const [textModel, setTextModel] = useState(localStorage.getItem('text_model') || 'gemini-1.5-flash');
  const [imageModel, setImageModel] = useState(localStorage.getItem('image_model') || 'dall-e-3');
  
  // 提升 aspectRatio 状态到 App 层级，或者在 CharacterLab 中管理（当前在 CharacterLab 中）
  // 这里我们需要传递状态给 CharacterLab 吗？ 
  // CharacterLab 内部有自己的 aspectRatio 状态。
  // 暂时保留 CharacterLab 内部管理。

  const [activeModalType, setActiveModalType] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 角色工坊状态
  const [prompts, setPrompts] = useState([]);
  const [images, setImages] = useState({});
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  
  // 临时状态提升：为了让 CharacterLab 保持状态不丢失，我们需要在 App 层级保存 aspectRatio 吗？
  // 如果切换 Tab 后希望保持，则需要。这里为了简化，先让组件自己管理，切换 Tab 会重置 UI 状态（但数据 prompts/images 已提升保留）。
  const [charAspectRatio, setCharAspectRatio] = useState("16:9");

  // --- 全局函数 ---
  const handleSaveSettings = () => {
    localStorage.setItem('gemini_key', apiKey);
    localStorage.setItem('gemini_base_url', baseUrl);
    localStorage.setItem('text_model', textModel);
    localStorage.setItem('image_model', imageModel);
    setShowSettings(false);
  };

  const fetchModels = async () => {
    if (!apiKey) return alert("请先填写 API Key");
    setIsLoadingModels(true);
    setAvailableModels([]);
    try {
      let foundModels = [];
      try {
        const res = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data)) foundModels = data.data.map(m => m.id);
        }
      } catch (e) { console.log("OpenAI fetch failed"); }
      if (foundModels.length === 0) {
        const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`);
        if (res.ok) {
          const data = await res.json();
          if (data.models && Array.isArray(data.models)) foundModels = data.models.map(m => m.name.replace('models/', ''));
        }
      }
      if (foundModels.length > 0) {
        const uniqueModels = [...new Set(foundModels)].sort();
        setAvailableModels(uniqueModels);
        alert(`成功加载 ${uniqueModels.length} 个模型！`);
      } else { alert("未获取到模型列表，请手动输入。"); }
    } catch (error) { alert("获取模型列表失败: " + error.message); } 
    finally { setIsLoadingModels(false); }
  };

  // --- 角色工坊逻辑 ---
  const handleGeneratePrompts = async ({ description, referenceImage, aspectRatio, targetLang }) => {
    setIsGeneratingPrompts(true);
    setPrompts([]);
    setImages({});

    try {
      const systemPrompt = `你是一个专家级的AI视觉指令工程师。你的任务是根据用户描述（和参考图）编写高质量的绘画提示词。
      核心要求：
      1. 【视觉一致性】：如果有参考图，必须详细提取其特征并写入提示词。
      2. 【镜头语言】：必须生成 9 种视角：Front View, Side Profile, Back View, Close-up, High Angle, Low Angle, Dynamic Action, Cinematic Wide Shot, Candid Shot.
      3. 【参数】：末尾添加 "--ar ${aspectRatio}"。
      4. 【语言】：使用 ${targetLang}。
      5. 【重要格式】：请直接返回 JSON 数组。
      ⚠️ 极其重要：无论提示词内容使用什么语言，JSON对象的键名(Key)必须严格保持为英文 "title" 和 "prompt"！不要翻译键名！
      格式示例：[{"title": "正面", "prompt": "..."}]`;

      let resultText = "";
      const isGoogleNative = baseUrl.includes('googleapis.com');
      const userMessage = referenceImage 
        ? `角色/场景描述：${description}\n(请将参考图特征写入提示词)`
        : `角色/场景描述：${description}`;

      if (!isGoogleNative) {
         try {
           const res = await fetch(`${baseUrl}/v1/chat/completions`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
             body: JSON.stringify({
               model: textModel,
               messages: [
                 { role: "user", content: referenceImage ? [
                    { type: "text", text: systemPrompt + "\n" + userMessage },
                    { type: "image_url", image_url: { url: referenceImage } }
                   ] : systemPrompt + "\n" + userMessage
                 }
               ]
             })
           });
           if (res.ok) {
             const data = await res.json();
             resultText = data.choices[0].message.content;
           }
         } catch (e) {}
      }

      if (!resultText) {
        const contents = [];
        const parts = [{ text: systemPrompt + "\n" + userMessage }];
        if (referenceImage) {
          const base64Data = referenceImage.split(',')[1];
          const mimeType = referenceImage.split(';')[0].split(':')[1];
          parts.push({ inlineData: { mimeType, data: base64Data } });
        }
        contents.push({ parts });

        const url = `${baseUrl}/v1beta/models/${textModel}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        });
        if (!res.ok) {
           const err = await res.json();
           throw new Error(err.error?.message || "请求失败");
        }
        const data = await res.json();
        resultText = data.candidates[0].content.parts[0].text;
      }

      const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedPrompts = JSON.parse(cleanJson);
      const fixedPrompts = parsedPrompts.map(p => ({
        title: p.title || p.标题 || "视角",
        prompt: p.prompt || p.提示词 || p.content || p.内容 || "解析失败"
      }));

      if (Array.isArray(fixedPrompts)) setPrompts(fixedPrompts);
      else throw new Error("API 返回格式异常");

    } catch (error) {
      alert("生成失败: " + error.message);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  const handleGenerateImage = async (index, prompt, aspectRatio, useImg2Img, referenceImage, imgStrength) => {
    setImages(prev => ({ ...prev, [index]: { loading: true, error: null } }));
    try {
      const targetUrl = `${baseUrl}/v1/images/generations`;
      
      let size = "1024x1024";
      if (aspectRatio === "16:9") size = "1792x1024";
      else if (aspectRatio === "9:16") size = "1024x1792";

      const payload = {
        model: imageModel,
        prompt: prompt,
        n: 1,
        size: size
      };

      if (useImg2Img && referenceImage) {
        const base64Data = referenceImage.split(',')[1];
        payload.image = base64Data;       
        payload.init_image = base64Data;  
        payload.strength = parseFloat(imgStrength); 
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));

      let imgUrl = "";
      if (data.data && data.data[0]?.url) imgUrl = data.data[0].url;
      else if (data.data && typeof data.data[0] === 'string') imgUrl = data.data[0];

      if (imgUrl) {
        setImages(prev => ({ ...prev, [index]: { loading: false, url: imgUrl } }));
      } else {
        throw new Error("无法解析图片地址");
      }
    } catch (error) {
      setImages(prev => ({ ...prev, [index]: { loading: false, error: error.message } }));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <ModelSelectionModal isOpen={activeModalType !== null} title={activeModalType === 'text' ? "分析模型" : "绘图模型"} models={availableModels} onClose={() => setActiveModalType(null)} onSelect={(model) => {
          if (activeModalType === 'text') { setTextModel(model); localStorage.setItem('text_model', model); } 
          else { setImageModel(model); localStorage.setItem('image_model', model); }
      }}/>

      {showSettings && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white">API 设置</h2>
            <div className="space-y-4">
              <div><label className="block text-sm text-slate-400 mb-1">API Endpoint</label><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm" placeholder="https://api.openai.com"/></div>
              <div><label className="block text-sm text-slate-400 mb-1">API Key</label><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"/></div>
              <div className="pt-2 border-t border-slate-800"><button onClick={fetchModels} disabled={isLoadingModels} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 w-full justify-center border border-blue-900/50 p-2 rounded bg-blue-900/20 transition-colors">{isLoadingModels ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} 刷新/获取 API 可用模型列表</button></div>
            </div>
            <div className="flex justify-end mt-6 gap-2"><button onClick={() => setShowSettings(false)} className="px-4 py-2 hover:bg-slate-800 rounded text-sm">取消</button><button onClick={handleSaveSettings} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium">保存配置</button></div>
          </div>
        </div>
      )}

      {/* --- 顶部导航栏 --- */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Wand2 size={18} className="text-white" />
            </div>
            <h1 className="font-bold text-lg text-white tracking-tight hidden md:block">Ink & Silk</h1>
          </div>
          
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <button 
              onClick={() => setActiveTab('character')}
              className={cn("px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'character' ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200")}
            >
              <ImageIcon size={14}/> 角色工坊
            </button>
            <button 
              onClick={() => setActiveTab('storyboard')}
              className={cn("px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'storyboard' ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-slate-200")}
            >
              <Clapperboard size={14}/> 自动分镜 <span className="text-[9px] bg-purple-800 px-1 rounded text-purple-200">New</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex gap-4 mr-4">
            <ModelTrigger label="分析模型" icon={Server} value={textModel} onOpenPicker={() => setActiveModalType('text')} onManualChange={(v) => { setTextModel(v); localStorage.setItem('text_model', v); }} variant="horizontal" colorTheme="blue" />
            <ModelTrigger label="绘图模型" icon={Palette} value={imageModel} onOpenPicker={() => setActiveModalType('image')} onManualChange={(v) => { setImageModel(v); localStorage.setItem('image_model', v); }} variant="horizontal" colorTheme="purple" />
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"><Settings size={20} /></button>
        </div>
      </div>

      {/* --- 主内容区 (Tab 切换) --- */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'character' ? (
          <CharacterLab 
            apiConfig={{ apiKey, baseUrl, textModel, imageModel }}
            models={{ availableModels }}
            onGeneratePrompts={handleGeneratePrompts}
            onGenerateImage={handleGenerateImage}
            isGenerating={isGeneratingPrompts}
            prompts={prompts}
            images={images}
            setActiveModalType={setActiveModalType}
            setAspectRatio={setCharAspectRatio}
            aspectRatio={charAspectRatio}
          />
        ) : (
          <StoryboardStudio />
        )}
      </div>
    </div>
  );
}
