import React, { useState, useEffect } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, Palette } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function App() {
  // --- 状态管理 ---
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_key') || '');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('gemini_base_url') || 'https://generativelanguage.googleapis.com');
  
  // 文本模型 (用于生成提示词)
  const [textModel, setTextModel] = useState(localStorage.getItem('text_model') || 'gemini-1.5-flash');
  const [textModelList, setTextModelList] = useState([]); 
  
  // 图片模型 (用于生成预览图) - 新增
  const [imageModel, setImageModel] = useState(localStorage.getItem('image_model') || 'dall-e-3');

  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const [description, setDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [prompts, setPrompts] = useState([]);
  const [images, setImages] = useState({});

  // --- 1. 保存设置 ---
  const handleSaveSettings = () => {
    localStorage.setItem('gemini_key', apiKey);
    localStorage.setItem('gemini_base_url', baseUrl);
    localStorage.setItem('text_model', textModel);
    localStorage.setItem('image_model', imageModel); // 保存图片模型
    setShowSettings(false);
  };

  // --- 2. 获取文本模型列表 ---
  const fetchModels = async () => {
    if (!apiKey) return alert("请先填写 API Key");
    setIsLoadingModels(true);
    setTextModelList([]);

    try {
      let foundModels = [];
      // 策略A: OpenAI 格式 (/v1/models) - 聚合站常用
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
      } catch (e) {}

      // 策略B: Google 原生格式
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
        setTextModelList(foundModels);
        if (!foundModels.includes(textModel)) setTextModel(foundModels[0]);
        alert(`成功加载 ${foundModels.length} 个模型`);
      } else {
        alert("未能获取模型列表，请手动输入");
      }
    } catch (error) {
      alert("获取失败: " + error.message);
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

  // --- 3. 调用文本 API (生成 Prompt) ---
  const callTextApi = async (prompt, imageBase64 = null) => {
    if (!apiKey) throw new Error("请先设置 API Key");
    
    const contents = [];
    const parts = [{ text: prompt }];
    
    if (imageBase64) {
      const base64Data = imageBase64.split(',')[1];
      const mimeType = imageBase64.split(';')[0].split(':')[1];
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      });
    }
    contents.push({ parts });

    // 默认尝试 Google 格式，如果中转站是纯 OpenAI 格式，这里可能需要调整为 chat/completions
    // 但大多数支持 Gemini 的中转站都兼容这个端点
    const url = `${baseUrl}/v1beta/models/${textModel}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'API 请求失败');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
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

      const resultText = await callTextApi(systemPrompt + "\n角色描述：" + description, referenceImage);
      const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedPrompts = JSON.parse(cleanJson);
      
      if (Array.isArray(parsedPrompts)) setPrompts(parsedPrompts);
      else throw new Error("API 返回格式异常");

    } catch (error) {
      alert("生成提示词失败: " + error.message);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  // --- 4. 调用生图 API (无限制版) ---
  const generateSingleImage = async (index, prompt) => {
    setImages(prev => ({ ...prev, [index]: { loading: true, error: null } }));
    try {
      // 使用标准的 OpenAI 生图接口
      // 聚合渠道通常将 dall-e-3, mj, flux 等映射到这个接口
      const targetUrl = `${baseUrl}/v1/images/generations`;
      
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}` // 聚合站通常用 Bearer Token
        },
        body: JSON.stringify({
          model: imageModel, // <--- 使用用户自定义的图片模型
          prompt: prompt,
          n: 1,
          size: "1024x1024" 
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || JSON.stringify(data));
      }

      // 兼容两种常见的返回格式
      let imgUrl = "";
      if (data.data && data.data[0]?.url) imgUrl = data.data[0].url; // 标准 OpenAI
      else if (data.data && typeof data.data[0] === 'string') imgUrl = data.data[0]; // 某些 MJ 代理

      if (imgUrl) {
        setImages(prev => ({ ...prev, [index]: { loading: false, url: imgUrl } }));
      } else {
        throw new Error("无法解析返回的图片地址");
      }

    } catch (error) {
      console.error(error);
      setImages(prev => ({ 
         ...prev, 
         [index]: { loading: false, error: error.message || "生成失败" } 
      }));
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
      
      {/* 设置弹窗 */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white">API 设置</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">API Endpoint (Base URL)</label>
                <input 
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">API Key</label>
                <input 
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"
                />
              </div>
              <div className="pt-2 border-t border-slate-800">
                 <button onClick={fetchModels} disabled={isLoadingModels} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                   {isLoadingModels ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                   刷新文本模型列表
                 </button>
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
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto">
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
          {/* 参考图上传 */}
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
                    <span className="text-xs">点击上传参考图</span>
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
              className="w-full h-48 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="描述您的角色..."
            />
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg space-y-3 border border-slate-700/50">
            {/* 文本模型选择 */}
            <div className="space-y-1">
               <label className="text-xs text-slate-400">文本模型 (生成Prompt)</label>
               {textModelList.length > 0 ? (
                 <select value={textModel} onChange={(e) => { setTextModel(e.target.value); localStorage.setItem('text_model', e.target.value); }}
                   className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none">
                   {textModelList.map(m => <option key={m} value={m}>{m}</option>)}
                 </select>
               ) : (
                 <input value={textModel} onChange={(e) => { setTextModel(e.target.value); localStorage.setItem('text_model', e.target.value); }}
                   className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none"/>
               )}
            </div>

            {/* 图片模型选择 (新增) */}
            <div className="space-y-1">
               <label className="text-xs text-slate-400 flex items-center gap-1"><Palette size={12}/> 图片生成模型</label>
               <input 
                 value={imageModel}
                 onChange={(e) => { setImageModel(e.target.value); localStorage.setItem('image_model', e.target.value); }}
                 placeholder="例如: dall-e-3, mj-chat, flux"
                 className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
               />
               <p className="text-[10px] text-slate-500">输入您的API渠道支持的模型ID</p>
            </div>
          </div>

          <button onClick={generatePrompts} disabled={isGeneratingPrompts}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50">
            {isGeneratingPrompts ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
            {isGeneratingPrompts ? '正在构思...' : '生成 9 组视角'}
          </button>
        </div>
      </div>

      {/* 右侧主区域 */}
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
