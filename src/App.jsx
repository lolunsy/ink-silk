import React, { useState, useMemo } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette, Server, Search, X, Pencil, ChevronRight, Check, LayoutGrid } from 'lucide-react';
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

  // 智能分类逻辑
  const categorizedModels = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const allFiltered = models.filter(m => m.toLowerCase().includes(lowerSearch));

    return {
      "All": allFiltered,
      "OpenAI": allFiltered.filter(m => m.includes('gpt') || m.includes('o1-')),
      "Claude": allFiltered.filter(m => m.includes('claude')),
      "Gemini": allFiltered.filter(m => m.includes('gemini')),
      "Image": allFiltered.filter(m => ['dall-e', 'mj', 'midjourney', 'flux', 'sd', 'stable-diffusion', 'imagen', 'drawing'].some(k => m.toLowerCase().includes(k))),
      "OpenSource": allFiltered.filter(m => ['llama', 'qwen', 'mistral', 'yi-', 'deepseek', 'phi'].some(k => m.toLowerCase().includes(k))),
    };
  }, [models, search]);

  const tabs = ["All", "OpenAI", "Claude", "Gemini", "Image", "OpenSource"];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={e => e.stopPropagation()} // 防止点击内部关闭
      >
        {/* 1. 顶部标题与搜索 */}
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <LayoutGrid size={20} className="text-blue-500"/> 
              选择模型: <span className="text-blue-400">{title}</span>
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-slate-500" />
            <input 
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型名称 (例如: gpt-4, flux)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>

        {/* 2. 分类 Tabs (横向排列) */}
        <div className="px-4 pt-3 pb-0 border-b border-slate-700 bg-slate-800/30 overflow-x-auto">
          <div className="flex gap-2 pb-3">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-full transition-all border",
                  activeTab === tab 
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50" 
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                )}
              >
                {tab}
                <span className="ml-2 text-xs opacity-60 bg-black/20 px-1.5 rounded-full">
                  {categorizedModels[tab].length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. 模型列表 (双列布局) */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50">
          {categorizedModels[activeTab].length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <Search size={48} className="opacity-20 mb-4" />
              <p>未找到匹配的模型</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {categorizedModels[activeTab].map((modelName) => (
                <button
                  key={modelName}
                  onClick={() => { onSelect(modelName); onClose(); }}
                  className="group flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900 hover:border-blue-500/50 hover:bg-slate-800 transition-all text-left"
                >
                  <span className="text-sm text-slate-300 group-hover:text-white truncate font-mono" title={modelName}>
                    {modelName}
                  </span>
                  <ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 text-xs text-slate-500 flex justify-between px-6">
          <span>共加载 {models.length} 个模型</span>
          <span>按 ESC 关闭</span>
        </div>
      </div>
    </div>
  );
};

// --- 组件：侧边栏触发器 ---
const ModelTrigger = ({ label, icon: Icon, value, onOpenPicker, onManualChange }) => {
  const [isManual, setIsManual] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
          <Icon size={12}/> {label}
        </label>
        <button 
          onClick={() => setIsManual(!isManual)} 
          className={cn("p-1 rounded hover:bg-slate-700 transition-colors", isManual ? "text-blue-400 bg-blue-900/20" : "text-slate-500")}
          title={isManual ? "切换回列表选择" : "切换到手动输入"}
        >
          <Pencil size={12} />
        </button>
      </div>

      {isManual ? (
        <input 
          value={value} 
          onChange={(e) => onManualChange(e.target.value)}
          placeholder="手动输入模型ID..."
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 transition-colors font-mono"
        />
      ) : (
        <button 
          onClick={onOpenPicker}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none hover:border-blue-500/50 hover:bg-slate-800 transition-all flex items-center justify-between group text-left"
        >
          <span className="truncate font-mono">{value || "点击选择模型..."}</span>
          <LayoutGrid size={14} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
        </button>
      )}
    </div>
  );
};

// --- 主应用 ---
export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_key') || '');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('gemini_base_url') || 'https://generativelanguage.googleapis.com');
  const [availableModels, setAvailableModels] = useState([]); 
  
  const [textModel, setTextModel] = useState(localStorage.getItem('text_model') || 'gemini-1.5-flash');
  const [imageModel, setImageModel] = useState(localStorage.getItem('image_model') || 'dall-e-3');

  // 控制哪个模态框打开: 'text' | 'image' | null
  const [activeModalType, setActiveModalType] = useState(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const [description, setDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [prompts, setPrompts] = useState([]);
  const [images, setImages] = useState({});

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
        const res = await fetch(`${baseUrl}/v1/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data)) {
            foundModels = data.data.map(m => m.id);
          }
        }
      } catch (e) { console.log("OpenAI fetch failed"); }

      if (foundModels.length === 0) {
        const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`);
        if (res.ok) {
          const data = await res.json();
          if (data.models && Array.isArray(data.models)) {
            foundModels = data.models.map(m => m.name.replace('models/', ''));
          }
        }
      }

      if (foundModels.length > 0) {
        const uniqueModels = [...new Set(foundModels)].sort();
        setAvailableModels(uniqueModels);
        alert(`成功加载 ${uniqueModels.length} 个模型！`);
      } else {
        alert("未获取到模型列表，请手动输入。");
      }
    } catch (error) {
      alert("获取模型列表失败: " + error.message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setReferenceImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const generatePrompts = async () => {
    if (!description && !referenceImage) return alert("请输入描述或上传参考图");
    setIsGeneratingPrompts(true);
    setPrompts([]);
    setImages({});

    try {
      const systemPrompt = `你是一个专业的电影概念设计师。请根据用户提供的角色描述（和参考图），生成 9 组用于 AI 绘画的英文提示词（Prompts）。
      要求：
      1. 必须包含以下 9 种视角：Front View, Side Profile, Back View, Close-up, High Angle, Low Angle, Dynamic Action, Cinematic Wide Shot, Candid Shot.
      2. 每个提示词必须包含 "Bokeh, depth of field"。
      3. 直接返回 JSON 数组，不要 Markdown 标记。
      格式示例：[{"title": "正面", "prompt": "..."}]`;

      let resultText = "";
      const isGoogleNative = baseUrl.includes('googleapis.com');
      
      if (!isGoogleNative) {
         try {
           const res = await fetch(`${baseUrl}/v1/chat/completions`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
             body: JSON.stringify({
               model: textModel,
               messages: [
                 { role: "user", content: referenceImage ? [
                    { type: "text", text: systemPrompt + "\n角色描述：" + description },
                    { type: "image_url", image_url: { url: referenceImage } }
                   ] : systemPrompt + "\n角色描述：" + description 
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
        const parts = [{ text: systemPrompt + "\n角色描述：" + description }];
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
      if (Array.isArray(parsedPrompts)) setPrompts(parsedPrompts);
      else throw new Error("API 返回格式异常");

    } catch (error) {
      alert("生成失败: " + error.message);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  const generateSingleImage = async (index, prompt) => {
    setImages(prev => ({ ...prev, [index]: { loading: true, error: null } }));
    try {
      const targetUrl = `${baseUrl}/v1/images/generations`;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: imageModel,
          prompt: prompt,
          n: 1,
          size: "1024x1024"
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "API error");

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

  const generateAllImages = () => {
    prompts.forEach((p, idx) => generateSingleImage(idx, p.prompt));
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
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      
      {/* --- 全局模态框：模型选择器 --- */}
      <ModelSelectionModal 
        isOpen={activeModalType !== null}
        title={activeModalType === 'text' ? "文本模型" : "图片模型"}
        models={availableModels}
        onClose={() => setActiveModalType(null)}
        onSelect={(model) => {
          if (activeModalType === 'text') {
            setTextModel(model);
            localStorage.setItem('text_model', model);
          } else {
            setImageModel(model);
            localStorage.setItem('image_model', model);
          }
        }}
      />

      {/* 设置弹窗 */}
      {showSettings && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white">API 设置</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">API Endpoint</label>
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm" placeholder="https://api.openai.com"/>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"/>
              </div>
              <div className="pt-2 border-t border-slate-800">
                 <button onClick={fetchModels} disabled={isLoadingModels} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 w-full justify-center border border-blue-900/50 p-2 rounded bg-blue-900/20 transition-colors">
                   {isLoadingModels ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                   刷新/获取 API 可用模型列表
                 </button>
                 {availableModels.length > 0 && (
                   <p className="text-xs text-green-500 mt-2 text-center">已加载 {availableModels.length} 个模型</p>
                 )}
              </div>
            </div>
            <div className="flex justify-end mt-6 gap-2">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 hover:bg-slate-800 rounded text-sm">取消</button>
              <button onClick={handleSaveSettings} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium">保存配置</button>
            </div>
          </div>
        </div>
      )}

      {/* 左侧侧边栏 */}
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Wand2 size={18} className="text-white" />
            </div>
            <h1 className="font-bold text-lg text-white tracking-tight">Ink & Silk</h1>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
            <Settings size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <ImageIcon size={16} /> 参考图片 (可选)
            </label>
            <div className="relative group">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" />
              <label htmlFor="ref-img" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 transition-all overflow-hidden">
                {referenceImage ? (
                  <img src={referenceImage} alt="ref" className="w-full h-full object-cover opacity-80" />
                ) : (
                  <div className="text-slate-500 flex flex-col items-center">
                    <Upload size={24} className="mb-2" />
                    <span className="text-xs">点击上传</span>
                  </div>
                )}
              </label>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            <label className="text-sm font-medium text-slate-300">角色描述</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-32 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="例如：一位银发精灵弓箭手..."
            />
          </div>

          {/* 新版触发器区域 */}
          <div className="bg-slate-800/50 p-4 rounded-xl space-y-5 border border-slate-700/50">
            
            <ModelTrigger 
              label="文本模型 (Prompt)" 
              icon={Server} 
              value={textModel} 
              onOpenPicker={() => setActiveModalType('text')}
              onManualChange={(v) => { setTextModel(v); localStorage.setItem('text_model', v); }}
            />

            <ModelTrigger 
              label="图片生成模型" 
              icon={Palette} 
              value={imageModel} 
              onOpenPicker={() => setActiveModalType('image')}
              onManualChange={(v) => { setImageModel(v); localStorage.setItem('image_model', v); }}
            />
            
            {availableModels.length === 0 && (
              <div className="text-[10px] text-orange-400 bg-orange-900/20 p-2 rounded text-center cursor-pointer hover:bg-orange-900/30 transition-colors" onClick={() => setShowSettings(true)}>
                ⚠ 列表为空? 点此去设置页获取模型
              </div>
            )}
          </div>

          <button onClick={generatePrompts} disabled={isGeneratingPrompts}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50">
            {isGeneratingPrompts ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
            {isGeneratingPrompts ? '正在构思...' : '生成 9 组视角'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
        <div className="h-16 border-b border-slate-800 flex items-center justify-center md:justify-between px-6 bg-slate-900/30 backdrop-blur-sm z-10">
          <h2 className="text-slate-400 text-sm hidden md:block">生成的视角预览 ({prompts.length})</h2>
          <div className="flex items-center gap-3">
             {prompts.length > 0 && (
               <>
                <button onClick={generateAllImages} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-200 text-sm rounded border border-blue-800 transition-colors">
                  <Camera size={16} /> 生成所有图片 ({imageModel})
                </button>
                <button onClick={downloadAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700 transition-colors">
                  <Download size={16} /> 下载
                </button>
               </>
             )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {prompts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600">
              <div className="w-24 h-24 rounded-full bg-slate-900 flex items-center justify-center mb-4">
                <Wand2 size={40} className="opacity-20" />
              </div>
              <p>在左侧配置模型并开始创作</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
              {prompts.map((item, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group">
                  <div className="aspect-[2/3] bg-slate-950 relative">
                    {images[idx]?.loading ? (
                      <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
                        <Loader2 className="animate-spin text-blue-500" size={32} />
                        <span className="text-xs text-slate-500">Calling {imageModel}...</span>
                      </div>
                    ) : images[idx]?.url ? (
                      <img src={images[idx].url} alt={item.title} className="w-full h-full object-cover" />
                    ) : images[idx]?.error ? (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-center text-xs overflow-auto">
                         <p>{images[idx].error}</p>
                       </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                         <button onClick={() => generateSingleImage(idx, item.prompt)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">
                           生成此视角
                         </button>
                      </div>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); generateSingleImage(idx, item.prompt); }}
                      className="absolute bottom-3 right-3 p-2 bg-black/60 hover:bg-blue-600 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                  <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-slate-200 text-sm">{item.title}</h3>
                      <button onClick={() => navigator.clipboard.writeText(item.prompt)} className="text-slate-500 hover:text-white transition-colors">
                        <Copy size={14} />
                      </button>
                    </div>
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
}
