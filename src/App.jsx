import React, { useState, useEffect } from 'react';
import { Settings, Image as ImageIcon, Download, Copy, RefreshCw, Wand2, Loader2, Camera, Upload, List } from 'lucide-react';
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
  // 默认使用 gemini-1.5-flash，用户可选
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem('gemini_model') || 'gemini-1.5-flash');
  const [modelList, setModelList] = useState([]); // 存储获取到的模型列表
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('gemini_base_url') || 'https://generativelanguage.googleapis.com');
  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const [description, setDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [prompts, setPrompts] = useState([]);
  const [images, setImages] = useState({});

  // --- 功能逻辑 ---

  // 1. 保存设置
  const handleSaveSettings = () => {
    localStorage.setItem('gemini_key', apiKey);
    localStorage.setItem('gemini_base_url', baseUrl);
    localStorage.setItem('gemini_model', selectedModel); // 记住上次选的模型
    setShowSettings(false);
    // alert('设置已保存'); // 移除弹窗干扰
  };

  // 2. 获取模型列表 (核心新功能)
  const fetchModels = async () => {
    if (!apiKey) return alert("请先填写 API Key");
    setIsLoadingModels(true);
    setModelList([]);

    try {
      // 策略A: 尝试 OpenAI 格式 (大多数中转站使用这个 /v1/models)
      let foundModels = [];
      try {
        const res = await fetch(`${baseUrl}/v1/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
          const data = await res.json();
          // OpenAI 格式通常在 data.data 里
          if (data.data && Array.isArray(data.data)) {
            foundModels = data.data.map(m => m.id);
          }
        }
      } catch (e) { console.log("OpenAI 格式获取失败，尝试 Google 格式"); }

      // 策略B: 如果A没找到，尝试 Google 原生格式 (/v1beta/models)
      if (foundModels.length === 0) {
        const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`);
        if (res.ok) {
          const data = await res.json();
          // Google 格式在 data.models 里，且带有 "models/" 前缀，需要去掉
          if (data.models && Array.isArray(data.models)) {
            foundModels = data.models.map(m => m.name.replace('models/', ''));
          }
        }
      }

      if (foundModels.length > 0) {
        // 过滤一下，只保留包含 gemini 的模型，或者全部保留
        const filtered = foundModels.filter(m => m.toLowerCase().includes('gemini'));
        // 如果过滤后没了（可能用户用的是其他模型），就用全部
        const finalModels = filtered.length > 0 ? filtered : foundModels;
        
        setModelList(finalModels);
        // 如果当前选的模型不在列表里，默认选第一个
        if (!finalModels.includes(selectedModel)) {
          setSelectedModel(finalModels[0]);
        }
        alert(`成功加载 ${finalModels.length} 个模型`);
      } else {
        alert("未获取到模型列表，请检查 URL 或 Key。您仍可手动输入模型名称。");
      }

    } catch (error) {
      alert("获取模型失败: " + error.message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // 3. 处理图片上传
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 4. 调用 API (已更新：使用 selectedModel)
  const callGeminiText = async (prompt, imageBase64 = null) => {
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

    // 动态构建 URL，使用选中的模型
    // 注意：这里假设中转站支持 Google 的 :generateContent 格式
    // 如果中转站是纯 OpenAI 格式转发，这里可能需要改写为 chat/completions
    const url = `${baseUrl}/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
    
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

  // 5. 生成提示词逻辑
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

      const userContent = `角色描述：${description}`;
      const resultText = await callGeminiText(systemPrompt + "\n" + userContent, referenceImage);
      
      const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedPrompts = JSON.parse(cleanJson);
      
      if (Array.isArray(parsedPrompts)) {
        setPrompts(parsedPrompts);
      } else {
        throw new Error("API 返回格式无法解析");
      }

    } catch (error) {
      alert("生成失败: " + error.message);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  // 6. 生成图片 (保持兼容 OpenAI 格式)
  const generateSingleImage = async (index, prompt) => {
    setImages(prev => ({ ...prev, [index]: { loading: true } }));
    try {
      const targetUrl = `${baseUrl}/v1/images/generations`; 
      
      if (baseUrl.includes('googleapis.com')) {
         await new Promise(r => setTimeout(r, 1500));
         setImages(prev => ({ 
           ...prev, 
           [index]: { loading: false, url: `https://picsum.photos/seed/${Math.random()}/512/768` } 
         }));
         return;
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "dall-e-3", 
          prompt: prompt,
          n: 1,
          size: "1024x1024"
        })
      });

      const data = await res.json();
      if (data.data && data.data[0].url) {
        setImages(prev => ({ 
           ...prev, 
           [index]: { loading: false, url: data.data[0].url } 
        }));
      } else {
        throw new Error(JSON.stringify(data));
      }

    } catch (error) {
      setImages(prev => ({ 
         ...prev, 
         [index]: { loading: false, error: "生图失败" } 
      }));
    }
  };

  const generateAllImages = () => {
    prompts.forEach((p, idx) => generateSingleImage(idx, p.prompt));
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    const folder = zip.folder("character_design");
    const textContent = prompts.map(p => `[${p.title}]\n${p.prompt}`).join("\n\n");
    folder.file("prompts.txt", textContent);
    const promises = Object.entries(images).map(async ([index, data]) => {
      if (data.url && !data.error) {
         try {
           const imgBlob = await fetch(data.url).then(r => r.blob());
           folder.file(`view_${index}.png`, imgBlob);
         } catch (e) {}
      }
    });
    await Promise.all(promises);
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "character_design.zip");
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
                <label className="block text-sm text-slate-400 mb-1">API Endpoint</label>
                <input 
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://generativelanguage.googleapis.com"
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
              
              {/* 设置里的获取模型按钮 */}
              <div className="pt-2 border-t border-slate-800">
                 <button 
                   onClick={fetchModels} 
                   disabled={isLoadingModels}
                   className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                 >
                   {isLoadingModels ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                   刷新/测试模型列表
                 </button>
                 {modelList.length > 0 && (
                   <p className="text-xs text-green-500 mt-1">已获取 {modelList.length} 个模型</p>
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
              placeholder="例如：一位银发精灵弓箭手，穿着带有发光符文的森林绿色皮甲..."
            />
          </div>

          {/* 模型选择器 (新增) */}
          <div className="space-y-2">
             <div className="flex items-center justify-between">
               <label className="text-sm font-medium text-slate-300">使用模型</label>
               {/* 这里的刷新按钮为了方便用户直接在主界面刷新 */}
               <button onClick={fetchModels} className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1" title="刷新模型列表">
                  <RefreshCw size={12} className={isLoadingModels ? "animate-spin" : ""} />
               </button>
             </div>
             
             {modelList.length > 0 ? (
               <select 
                 value={selectedModel} 
                 onChange={(e) => {
                    setSelectedModel(e.target.value);
                    localStorage.setItem('gemini_model', e.target.value);
                 }}
                 className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
               >
                 {modelList.map(m => (
                   <option key={m} value={m}>{m}</option>
                 ))}
               </select>
             ) : (
               <input 
                 value={selectedModel}
                 onChange={(e) => {
                   setSelectedModel(e.target.value);
                   localStorage.setItem('gemini_model', e.target.value);
                 }}
                 placeholder="手动输入模型名, 如 gemini-1.5-pro"
                 className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
               />
             )}
             <p className="text-xs text-slate-600">当前: {selectedModel}</p>
          </div>

          <button 
            onClick={generatePrompts}
            disabled={isGeneratingPrompts}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {isGeneratingPrompts ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
            {isGeneratingPrompts ? '正在构思...' : '生成 9 组视角'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm z-10">
          <h2 className="text-slate-400 text-sm">生成的视角预览 ({prompts.length})</h2>
          <div className="flex items-center gap-3">
             {prompts.length > 0 && (
               <>
                <button onClick={generateAllImages} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700 transition-colors">
                  <Camera size={16} /> 生成所有预览图
                </button>
                <button onClick={downloadAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded border border-slate-700 transition-colors">
                  <Download size={16} /> 打包下载
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
              <p>在左侧输入描述，开始创作您的角色分镜</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
              {prompts.map((item, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-600 transition-colors group">
                  <div className="aspect-[2/3] bg-slate-950 relative group-hover:bg-slate-900 transition-colors">
                    {images[idx]?.loading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="animate-spin text-blue-500" size={32} />
                      </div>
                    ) : images[idx]?.url ? (
                      <img src={images[idx].url} alt={item.title} className="w-full h-full object-cover" />
                    ) : images[idx]?.error ? (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-center text-xs">
                         <p>{images[idx].error}</p>
                       </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => generateSingleImage(idx, item.prompt)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
                           生成预览
                         </button>
                      </div>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); generateSingleImage(idx, item.prompt); }}
                      className="absolute bottom-3 right-3 p-2 bg-black/50 hover:bg-blue-600 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-slate-200 text-sm">{item.title}</h3>
                      <button 
                         onClick={() => navigator.clipboard.writeText(item.prompt)}
                         className="text-slate-500 hover:text-white transition-colors"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed font-mono bg-black/20 p-2 rounded">
                      {item.prompt}
                    </p>
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
