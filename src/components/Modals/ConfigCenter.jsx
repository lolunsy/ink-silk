import React, { useState } from 'react';
import { Settings, Brain, Palette, Film, Mic, Server, RefreshCw, LayoutGrid } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useProject } from '../../context/ProjectContext'; // 引入大脑
import { ModelTrigger, ModelSelectionModal } from '../Shared/UIComponents'; // 引入刚才建的组件

export const ConfigCenter = ({ onClose, fetchModels, availableModels, isLoadingModels }) => {
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
