import React, { useState, useRef, useMemo, useEffect } from 'react';
import { X, LayoutGrid, ChevronRight, ChevronDown, Pencil } from 'lucide-react';
import { cn } from '../../lib/utils'; // 引入刚才建的小工具

// A. 模型选择器
export const ModelSelectionModal = ({ isOpen, onClose, onSelect, models = [], title }) => {
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

// B. 模型触发器 (输入框组件)
export const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange, colorTheme = "slate", className, variant }) => {
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

// D. 图片预览组件
export const ImagePreviewModal = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({x:0,y:0});
  const [drag, setDrag] = useState(false);
  const start = useRef({x:0,y:0});

  // 仅在弹窗开启时重置视图状态；避免“上次缩放/拖拽”残留
  useEffect(() => {
    if (!url) return;
    setScale(1);
    setPos({ x: 0, y: 0 });
    setDrag(false);
  }, [url]);

  if(!url) return null;

  const handleWheelZoom = (e) => {
    // 只在预览层消费滚轮，避免影响主界面滚动
    e.preventDefault();
    e.stopPropagation();
    setScale(s => Math.max(0.5, Math.min(5, s - e.deltaY * 0.001)));
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center overflow-hidden"
      onClick={onClose}
      onWheelCapture={handleWheelZoom}
    >
      <img
        src={url}
        className="max-w-full max-h-full object-contain cursor-move transition-transform duration-75"
        style={{transform:`scale(${scale}) translate(${pos.x/scale}px,${pos.y/scale}px)`}}
        onMouseDown={e=>{if(scale>1){setDrag(true);start.current={x:e.clientX-pos.x,y:e.clientY-pos.y}}}}
        onMouseMove={e=>{if(drag)setPos({x:e.clientX-start.current.x,y:e.clientY-start.current.y})}}
        onMouseUp={()=>setDrag(false)}
        onMouseLeave={()=>setDrag(false)}
        onClick={e=>e.stopPropagation()}
      />
      <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-red-600"><X size={24}/></button>
      <div className="absolute top-4 right-16 bg-slate-800/80 px-3 py-1 rounded-full text-xs text-white">{(scale*100).toFixed(0)}%</div>
    </div>
  );
};
