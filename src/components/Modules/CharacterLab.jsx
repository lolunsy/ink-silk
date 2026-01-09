import React, { useState, useEffect } from 'react';
import { UserCircle2, Trash2, Upload, X, Sparkles, Loader2, LayoutGrid, FileText, RefreshCw, Download, ChevronLeft, ChevronRight, CheckCircle2, Wand2, Camera, Pencil, ImageIcon, Palette, GripHorizontal, Brain, Heart } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { cn } from '../../lib/utils';
import { useProject } from '../../context/ProjectContext';

// === Phase 2.6: 配置常量 ===
const MAX_HISTORY = 5; // 历史版本上限，防止内存过高/白屏

// === Phase 2.6: 工具函数 - 历史裁剪时保留锁定版本 ===
const limitHistoryKeepFinal = (history, max) => {
    if (!history || history.length === 0) return [];
    if (history.length <= max) return history;
    
    const finalItem = history.find(item => item.isFinal === true);
    
    if (finalItem) {
        // 有锁定版本：必须保留
        const otherItems = history.filter(item => item.isFinal !== true);
        const recentOthers = otherItems.slice(-(max - 1));
        
        // 确保 finalItem 在正确的位置（保留原始顺序）
        const finalIndex = history.indexOf(finalItem);
        const result = [...recentOthers, finalItem].sort((a, b) => {
            const aIdx = history.indexOf(a);
            const bIdx = history.indexOf(b);
            return aIdx - bIdx;
        });
        
        return result.slice(-max); // 确保不超过 max
    } else {
        // 无锁定版本：保留最新 max 条
        return history.slice(-max);
    }
};

// --- 内部小组件：媒体预览 ---
const MediaPreview = ({ history, idx, setIdx, onGen, label, onPreview }) => {
    const current = history[idx] || {};
    const max = history.length - 1;
    
    return (
      <div className="flex flex-col gap-2 h-full">
          <div className="flex justify-between items-center px-1 shrink-0">
              <span className="text-xs font-bold text-slate-400">{label}</span>
              {history.length > 0 && <span className="text-[10px] text-slate-500">{idx+1}/{history.length}</span>}
          </div>
          <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden relative group min-h-0 flex items-center justify-center">
              {current.loading ? (
                  <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="animate-spin text-blue-500"/>
                      <span className="text-xs text-slate-400">AI 绘制中...</span>
                  </div>
              ) : current.error ? (
                  <div className="p-4 text-center max-w-full">
                      <div className="text-red-500 font-bold text-xs mb-1">生成失败</div>
                      <div className="text-[10px] text-red-400/80 leading-tight border border-red-900/50 p-2 rounded bg-red-900/10 break-words whitespace-normal">{current.error}</div>
                      <button onClick={onGen} className="mt-2 text-[10px] text-slate-400 underline hover:text-white">重试</button>
                  </div>
              ) : current.url ? (
                 <>
                    <img src={current.url} className="w-full h-full object-contain cursor-zoom-in bg-black" onClick={()=>onPreview(current.url)}/>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button onClick={()=>saveAs(current.url, "img.png")} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600 shadow"><Download size={14}/></button>
                        <button onClick={onGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600 shadow"><RefreshCw size={14}/></button>
                    </div>
                    {history.length > 1 && (<div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur z-10 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={idx<=0} onClick={()=>setIdx(i=>i-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={16}/></button><span className="text-[10px] text-white font-mono">{idx+1}/{history.length}</span><button disabled={idx>=max} onClick={()=>setIdx(i=>i+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={16}/></button></div>)}
                 </>
              ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-600 text-xs text-center px-4">
                      <ImageIcon size={24} className="opacity-20"/>
                      <span>{label.includes("Portrait") ? "等待生成定妆照" : "等待生成设定图"}</span>
                  </div>
              )}
          </div>
          <button onClick={onGen} disabled={current.loading} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 flex items-center justify-center gap-2 text-xs transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
              {current.loading ? <Loader2 className="animate-spin" size={12}/> : <RefreshCw size={12}/>} 
              {history.length>0 ? "重绘 (Regen)" : "生成 (Generate)"}
          </button>
      </div>
    );
};

// --- 主组件 ---
export const CharacterLab = ({ onPreview }) => {
  const { config, clPrompts, setClPrompts, clImages, setClImages, actors, setActors, callApi } = useProject();

  const FIXED_VIEWS = [
    { title: "正面全身 (Front Full)", prompt: "Full body shot, front view, standing straight, neutral expression, detailed outfit, looking at camera. (Depth of Field, Bokeh)" },
    { title: "背面全身 (Back Full)", prompt: "Full body shot, back view, standing straight, detailed back design of outfit. (Depth of Field, Bokeh)" },
    { title: "侧面半身 (Side Half)", prompt: "Upper body shot, side profile view, looking forward, sharp features. (Depth of Field, Bokeh)" },
    { title: "面部特写-正 (Face Front)", prompt: "Extreme close-up on face, front view, detailed eyes, detailed skin texture, emotions. (Depth of Field, Bokeh)" },
    { title: "面部特写-侧 (Face Side)", prompt: "Extreme close-up on face, side profile, jawline focus, cinematic lighting. (Depth of Field, Bokeh)" },
    { title: "背面特写 (Back Close)", prompt: "Close-up from behind, focus on hair texture and neck/collar details. (Depth of Field, Bokeh)" },
    { title: "俯视视角 (High Angle)", prompt: "High angle shot, looking down at character, cinematic composition. (Depth of Field, Bokeh)" },
    { title: "仰视视角 (Low Angle)", prompt: "Low angle shot, looking up at character, imposing presence, dramatic sky. (Depth of Field, Bokeh)" },
    { title: "动态姿势 (Action Pose)", prompt: "Dynamic action pose, fighting stance or running, motion blur on limbs, high energy. (Depth of Field, Bokeh)" },
    { title: "电影广角 (Cinematic Wide)", prompt: "Wide angle cinematic shot, character in environment, rule of thirds, atmospheric lighting. (Depth of Field, Bokeh)" },
    { title: "自然抓拍-喜 (Candid Joy)", prompt: "Candid shot, laughing or smiling naturally, sparkles in eyes, warm lighting. (Depth of Field, Bokeh)" },
    { title: "自然抓拍-怒 (Candid Anger)", prompt: "Candid shot, angry expression, intense stare, dramatic shadows, cold lighting. (Depth of Field, Bokeh)" }
  ];
  
  const [description, setDescription] = useState(() => localStorage.getItem('cl_desc') || '');
  const [drawDesc, setDrawDesc] = useState(() => localStorage.getItem('cl_draw_desc') || ''); // Phase 2.6: 绘图专用描述
  const [referenceImage, setReferenceImage] = useState(() => { try { return localStorage.getItem('cl_ref') || null; } catch(e) { return null; } });
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('cl_lang') || "Chinese");
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('cl_ar') || "16:9");
  const [imgStrength, setImgStrength] = useState(0.65);
  const [useImg2Img, setUseImg2Img] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isTranslatingDesc, setIsTranslatingDesc] = useState(false); // Phase 2.6: 转换描述状态
  
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [sheetParams, setSheetParams] = useState({ name: "", voice: "", visual_head: "", visual_upper: "", visual_lower: "", visual_access: "", style: "" }); 
  const [suggestedVoices, setSuggestedVoices] = useState([]); 
  const [isRegeneratingVoices, setIsRegeneratingVoices] = useState(false);
  const [selectedRefIndices, setSelectedRefIndices] = useState([]); 
  const [sheetConsistency, setSheetConsistency] = useState(1.0);
  
  const [genStatus, setGenStatus] = useState('idle'); 
  const [portraitHistory, setPortraitHistory] = useState([]); 
  const [sheetHistory, setSheetHistory] = useState([]);       
  const [portraitIdx, setPortraitIdx] = useState(0);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [viewingActor, setViewingActor] = useState(null);
  const [showAdvancedDownload, setShowAdvancedDownload] = useState(false); // Phase 2.6: 高级下载器

  useEffect(() => {
      setGenStatus('idle'); setIsGenerating(false);
      if (!clPrompts || clPrompts.length === 0) setClPrompts(FIXED_VIEWS);
      setPortraitHistory(prev => prev.map(item => item.loading ? { ...item, loading: false, error: "系统重置" } : item));
      setSheetHistory(prev => prev.map(item => item.loading ? { ...item, loading: false, error: "系统重置" } : item));
      return () => { portraitHistory.forEach(i => i.url && URL.revokeObjectURL(i.url)); sheetHistory.forEach(i => i.url && URL.revokeObjectURL(i.url)); };
  }, []);

  const safeSave = (key, val) => { try { localStorage.setItem(key, val); } catch (e) {} };
  useEffect(() => { safeSave('cl_desc', description); }, [description]);
  useEffect(() => { safeSave('cl_draw_desc', drawDesc); }, [drawDesc]); // Phase 2.6
  useEffect(() => { if(referenceImage) safeSave('cl_ref', referenceImage); }, [referenceImage]);
  useEffect(() => { safeSave('cl_lang', targetLang); }, [targetLang]);
  useEffect(() => { safeSave('cl_ar', aspectRatio); }, [aspectRatio]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 3 * 1024 * 1024) alert("⚠️ 图片过大，建议压缩");
        const reader = new FileReader();
        reader.onloadend = () => { setReferenceImage(reader.result); safeSave('cl_ref', reader.result); };
        reader.readAsDataURL(file); 
    }
  };

  const forceText = (val) => { if (!val) return ""; if (typeof val === 'string') return val; if (typeof val === 'object') return Object.values(val).join(', '); return String(val); };

  const blobUrlToBase64 = async (blobUrl) => {
      if (!blobUrl || typeof blobUrl !== 'string') return null;
      if (blobUrl.startsWith('data:')) return blobUrl;
      try { const response = await fetch(blobUrl); const blob = await response.blob(); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); } catch (e) { return null; }
  };

  // === Phase 2.6: 绘图描述智能转换 ===
  const ensureDrawDesc = async () => {
      if (!description) return description;
      
      // 中文模式：直接使用原描述
      if (targetLang === "Chinese") {
          if (drawDesc !== description) {
              setDrawDesc(description);
          }
          return description;
      }
      
      // 英文模式：需要转换为绘图可执行 prompt
      if (targetLang === "English") {
          // 如果已有且与描述一致，直接返回
          if (drawDesc && drawDesc.length > 10) {
              return drawDesc;
          }
          
          // 需要转换
          if (!isTranslatingDesc) {
              setIsTranslatingDesc(true);
              try {
                  let refData = referenceImage;
                  if (refData && refData.startsWith('blob:')) {
                      refData = await blobUrlToBase64(refData);
                  }
                  
                  const system = `Role: Image Generation Prompt Engineer.
Task: Convert Chinese character description to ENGLISH image generation prompt.
Requirements:
1. Output MUST be in PURE ENGLISH (no Chinese characters)
2. Keep ALL visual details: face, hair, clothing, accessories, style
3. Use short, precise phrases (not long sentences)
4. NO preset words like "masterpiece", "best quality"
5. Focus on visual executability for AI image generation
6. Format: comma-separated descriptive phrases
Output: Only the English prompt, nothing else.`;
                  
                  const userPrompt = `Character Description (Chinese):\n${description}\n\nConvert to English image generation prompt:`;
                  
                  const result = await callApi('analysis', { 
                      system, 
                      user: userPrompt, 
                      asset: refData 
                  });
                  
                  const cleanResult = result.trim().replace(/^["']|["']$/g, '');
                  setDrawDesc(cleanResult);
                  setIsTranslatingDesc(false);
                  return cleanResult;
              } catch (e) {
                  console.error("Failed to translate description:", e);
                  setIsTranslatingDesc(false);
                  // 降级：直接使用原描述
                  return description;
              }
          }
          return drawDesc || description;
      }
      
      return description;
  };

  // === Phase 2: 工具函数 - 获取最终锁定版本或最新版本 ===
  const getFinalOrLatest = (list) => {
      if (!list || list.length === 0) return null;
      const finalItem = list.find(item => item.isFinal === true);
      return finalItem || list[list.length - 1];
  };

  // === Phase 2: 设置某视角的最终版本（只能锁定一个）===
  const setFinalVersion = (viewIndex, versionIndex) => {
      setClImages(prev => {
          const newImages = { ...prev };
          const history = newImages[viewIndex] || [];
          const updated = history.map((item, idx) => ({
              ...item,
              isFinal: idx === versionIndex
          }));
          newImages[viewIndex] = updated;
          return newImages;
      });
  };

  const handleAnalyzeImage = async () => {
    if (!referenceImage) return alert("请先上传参考图");
    setIsAnalyzingImage(true);
    try {
        let refData = referenceImage;
        if (refData.startsWith('blob:')) refData = await blobUrlToBase64(refData);
        
        // Phase 2.6: 强化为美术总监级识别
        const langInstruction = targetLang === "Chinese" ? "Language: Simplified Chinese." : "Language: English.";
        const system = `Role: Art Director & Visual Designer (Master Level).
Task: Analyze this character image with professional precision.
Requirements:
1. Describe EVERY visual detail: facial features, hairstyle, hair color, eye color, skin tone
2. Describe clothing: upper body, lower body, shoes, materials, colors, patterns
3. Describe accessories: jewelry, weapons, props, bags, glasses, hats
4. Describe art style: realistic/anime/cartoon, rendering style, color palette, lighting
5. NO lazy/generic words like "standard", "normal", "typical" - be SPECIFIC
6. NO template responses - analyze THIS character uniquely
7. Output: One detailed paragraph (NOT JSON, just natural description)
${langInstruction}`;
        
        const userPrompt = targetLang === "Chinese" 
            ? "请详细描述这个角色的所有视觉特征："
            : "Please describe all visual features of this character in detail:";
        
        const text = await callApi('analysis', { system, user: userPrompt, asset: refData });
        setDescription(text);
        
        // Phase 2.6: 如果是英文模式，识别结果已经是英文，可以直接用作 drawDesc
        if (targetLang === "English") {
            setDrawDesc(text);
        }
    } catch(e) { alert("识别失败: " + e.message); } finally { setIsAnalyzingImage(false); }
  };

  const handleClearAll = () => {
      if (!confirm("确定要清空所有内容吗？此操作无法撤销。")) return;
      setDescription(""); setReferenceImage(null); setClPrompts([]); setClImages({});
      localStorage.removeItem('cl_desc'); localStorage.removeItem('cl_ref'); localStorage.removeItem('cl_prompts');
      setSheetParams({ name: "", voice: "", visual_head: "", visual_upper: "", visual_lower: "", visual_access: "", style: "" });
      setUseImg2Img(true);
  };

  const handleRemoveRef = (e) => { e.preventDefault(); e.stopPropagation(); setReferenceImage(null); localStorage.removeItem('cl_ref'); setUseImg2Img(false); };

  const handleGenerateViews = async () => {
    if (!description) return alert("请先填写角色描述");
    
    // Phase 2.6: 确保绘图描述已准备好
    const finalDrawDesc = await ensureDrawDesc();
    
    if (!finalDrawDesc) {
        return alert("描述转换失败，请重试");
    }
    
    // Phase 2.6: 使用 drawDesc 生成视角 prompt
    const newPrompts = FIXED_VIEWS.map(view => {
        // 英文模式：完全英文 prompt
        if (targetLang === "English") {
            return { 
                title: view.title, 
                prompt: `${finalDrawDesc}. ${view.prompt}` 
            };
        }
        // 中文模式：保持原有逻辑
        return { 
            title: view.title, 
            prompt: `${finalDrawDesc}. ${view.prompt}` 
        };
    });
    
    setClPrompts(newPrompts); 
    setClImages({});
    localStorage.setItem('cl_prompts', JSON.stringify(newPrompts));
  };

  const updatePrompt = (idx, newText) => { setClPrompts(prev => { const next = [...prev]; next[idx] = { ...next[idx], prompt: newText }; return next; }); };

  const handleImageGen = async (idx, item, ar, useImg, ref, str) => {
    setClImages(p => {
        const currentList = p[idx] || [];
        const newItem = { loading: true, isFinal: false };
        // Phase 2.6: 使用智能裁剪函数，保护锁定版本
        const updatedList = limitHistoryKeepFinal([...currentList, newItem], MAX_HISTORY);
        return { ...p, [idx]: updatedList };
    });
    try {
      let finalRef = ref;
      if (useImg && ref && ref.startsWith('blob:')) { finalRef = await blobUrlToBase64(ref); }
      const promptWithAction = `${item.prompt} --ar ${ar} (ActionID: ${Date.now()})`;
      const url = await callApi('image', { prompt: promptWithAction, aspectRatio: ar, useImg2Img: useImg, refImg: finalRef, strength: str });
      setClImages(p => { 
          const list = p[idx] || []; 
          list[list.length - 1] = { url, loading: false, timestamp: Date.now(), isFinal: false }; 
          return { ...p, [idx]: list }; 
      });
    } catch(e) { 
        setClImages(p => { 
            const list = p[idx] || []; 
            list[list.length - 1] = { error: e.message, loading: false, isFinal: false }; 
            return { ...p, [idx]: list }; 
        }); 
    }
  };

  // === Phase 2: 智能选择分析素材（4视角降级策略）===
  const chooseAnalysisAssets = async () => {
      // 关键4视角索引：正面全身(0)、面部特写-正(3)、侧面半身(2)、背面全身(1)
      const keyIndices = [0, 3, 2, 1];
      const candidates = [];
      
      // 优先从4个关键视角取图（优先锁定版本）
      for (let idx of keyIndices) {
          const history = clImages[idx];
          if (history && history.length > 0) {
              const finalOrLatest = getFinalOrLatest(history);
              if (finalOrLatest?.url && !finalOrLatest.error) {
                  candidates.push(finalOrLatest.url);
              }
          }
      }
      
      // 降级策略 1: 如果4张都有，直接返回
      if (candidates.length === 4) {
          return Promise.all(candidates.map(url => blobUrlToBase64(url)));
      }
      
      // 降级策略 2: 只有部分视角有图，选择1张最优的
      if (candidates.length > 0) {
          return Promise.all([candidates[0]].map(url => blobUrlToBase64(url)));
      }
      
      // 降级策略 3: 没有关键视角，使用参考图
      if (referenceImage) {
          return [await blobUrlToBase64(referenceImage)];
      }
      
      // 降级策略 4: 什么都没有且没描述 -> 返回 null（调用方会阻断）
      return null;
  };

  const getGenerationAssets = async () => {
      if (selectedRefIndices.length === 0) { 
          return referenceImage ? [await blobUrlToBase64(referenceImage)] : null; 
      }
      // Phase 2: 优先使用锁定版本
      const assets = selectedRefIndices.map(idx => {
          const history = clImages[idx];
          const finalOrLatest = getFinalOrLatest(history);
          return finalOrLatest?.url;
      }).filter(url => url && typeof url === 'string');
      
      if (assets.length === 0) return null;
      return Promise.all(assets.map(url => blobUrlToBase64(url)));
  };

  const openSheetModal = async () => {
    const hasGenerated = Object.keys(clImages).some(k => clImages[k]?.length > 0 && !clImages[k][0].error);
    
    // Phase 2: 阻断策略 - 没图没描述直接阻断
    if (!description && !referenceImage && !hasGenerated) {
        return alert("请先创造角色：上传参考图或生成视角图。");
    }
    
    setShowSheetModal(true); 
    setGenStatus('analyzing'); 
    setPortraitHistory([]); 
    setSheetHistory([]); 
    setSelectedRefIndices([]); 
    setSuggestedVoices([]); 
    setSheetConsistency(1.0); 
    
    try {
        // Phase 2: 使用新的智能选择函数
        const assets = await chooseAnalysisAssets();
        
        if (!assets && !description) {
            alert("未找到可用素材，请先上传参考图或生成视角图");
            setGenStatus('idle');
            return;
        }
        
        const langInstruction = targetLang === "Chinese" ? "Language: Simplified Chinese." : "Language: English.";
        
        // Phase 2: 强化 system prompt - 美术总监级细致分析
        const system = `Role: Art Director & Character Designer (Master Level).
Task: Deep-analyze character visuals with professional precision.
Requirements:
1. Describe EVERY detail (face, hair, outfit, accessories, weapons, style).
2. NO lazy words like "standard", "normal", "typical" - be SPECIFIC.
3. NO cached/template responses - analyze THIS character uniquely.
4. Output strict JSON with keys: visual_head, visual_upper, visual_lower, visual_access, style, voice_tags.
${langInstruction}`;
        
        const userPrompt = description 
            ? `Character Description: ${description}\n\nBased on images and description, output detailed JSON.`
            : "Analyze these character images and output detailed JSON.";
        
        const res = await callApi('analysis', { 
            system, 
            user: userPrompt, 
            assets 
        });
        
        const d = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
        setSheetParams({ 
            name: "", 
            voice: "", 
            visual_head: forceText(d.visual_head), 
            visual_upper: forceText(d.visual_upper), 
            visual_lower: forceText(d.visual_lower), 
            visual_access: forceText(d.visual_access), 
            style: forceText(d.style) 
        });
        setSuggestedVoices(Array.isArray(d.voice_tags) ? d.voice_tags : ["Standard"]);
    } catch(e) {
        console.error("Analysis failed:", e);
    } finally { 
        setGenStatus('idle'); 
    }
  };

  const handleRegenVoices = async () => {
      setIsRegeneratingVoices(true);
      try {
          const assets = await chooseAnalysisAssets();
          const res = await callApi('analysis', { 
              system: `Role: Voice Director. Analyze character and suggest 3-5 specific voice traits. NO generic terms. Return JSON: { "voice_tags": [...] }.`, 
              user: "Based on character appearance and style, suggest unique voice characteristics.", 
              assets 
          });
          const data = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
          if(data.voice_tags) setSuggestedVoices(data.voice_tags);
      } catch(e) {} finally { setIsRegeneratingVoices(false); }
  };

  const toggleRefSelection = (idx) => { setSelectedRefIndices(prev => { if (prev.includes(idx)) return prev.filter(i => i !== idx); if (prev.length >= 5) { alert("最多只能选择 5 张参考图"); return prev; } return [...prev, idx]; }); };
  const toggleVoiceTag = (tag) => { setSheetParams(p => ({ ...p, voice: p.voice.includes(tag) ? p.voice.replace(tag, '').replace(',,', ',') : p.voice ? p.voice + ', ' + tag : tag })); };

  const handleGenPortrait = async () => {
    if (genStatus !== 'idle') return; 
    setGenStatus('gen_portrait'); 
    
    // Phase 2.6: 智能裁剪历史，保护锁定版本
    setPortraitHistory(prev => { 
        const newItem = { loading: true, isFinal: false };
        const newHistory = limitHistoryKeepFinal([...prev, newItem], MAX_HISTORY);
        setPortraitIdx(newHistory.length - 1); 
        return newHistory; 
    });
    
    try {
        const finalRefs = await getGenerationAssets();
        
        // Phase 2.6: 包含 visual_access（道具/武器），去除 "Best Quality" 等预设词
        const accessPart = sheetParams.visual_access ? `, ${forceText(sheetParams.visual_access)}` : "";
        
        // Phase 2.6: 根据语言模式构建 prompt
        let portraitPrompt;
        if (targetLang === "English") {
            portraitPrompt = `(${forceText(sheetParams.style)}), waist-up portrait. Character: ${forceText(sheetParams.visual_head)}, ${forceText(sheetParams.visual_upper)}${accessPart}. Clean background. --ar 3:4 (ActionID: ${Date.now()})`;
        } else {
            portraitPrompt = `(${forceText(sheetParams.style)}), 半身肖像照. 角色: ${forceText(sheetParams.visual_head)}, ${forceText(sheetParams.visual_upper)}${accessPart}. 干净背景. --ar 3:4 (ActionID: ${Date.now()})`;
        }
        
        const url = await callApi('image', { prompt: portraitPrompt, aspectRatio: "9:16", useImg2Img: !!finalRefs, refImages: finalRefs, strength: finalRefs ? sheetConsistency : 0.65 });
        setPortraitHistory(prev => { const n = [...prev]; n[n.length - 1] = { url, loading: false, isFinal: false }; return n; });
    } catch(e){ 
        setPortraitHistory(prev => { const n = [...prev]; n[n.length - 1] = { error: e.message, loading: false, isFinal: false }; return n; }); 
    } finally { 
        setGenStatus('idle'); 
    }
  };

  const handleGenSheet = async () => {
    if (genStatus !== 'idle') return; 
    setGenStatus('gen_sheet'); 
    
    // Phase 2.6: 智能裁剪历史，保护锁定版本
    setSheetHistory(prev => { 
        const newItem = { loading: true, isFinal: false };
        const n = limitHistoryKeepFinal([...prev, newItem], MAX_HISTORY);
        setSheetIdx(n.length - 1); 
        return n; 
    });
    
    try {
        const finalRefs = await getGenerationAssets();
        
        // Phase 2.6: 包含 visual_access（道具/武器）
        const accessPart = sheetParams.visual_access ? `, ${forceText(sheetParams.visual_access)}` : "";
        
        // Phase 2.6: 强结构化设定图 prompt
        let sheetPrompt;
        if (targetLang === "English") {
            // 英文强结构版
            sheetPrompt = `Character design sheet, model sheet, turnaround sheet. 
LAYOUT: Pure white background, three-column layout (LEFT / CENTER / RIGHT).
LEFT SECTION: Full-body turnaround (front view / side view / back view), same character, same costume, orthographic projection, flat camera angle.
CENTER SECTION: 4 facial expressions grid (neutral / happy / angry / surprised), half-body or close-up face, clear emotion display.
RIGHT SECTION: Accessories and costume breakdown, product design style, isolated items display.
CHARACTER DETAILS: ${forceText(sheetParams.visual_head)}, ${forceText(sheetParams.visual_upper)}, ${forceText(sheetParams.visual_lower)}${accessPart}.
STYLE: ${forceText(sheetParams.style)}.
CONSTRAINTS: No watermark, no logo, no extra text labels, no messy background, professional character sheet format.
--ar 16:9 (ActionID: ${Date.now()})`;
        } else {
            // 中文强结构版
            sheetPrompt = `角色设定图, 模型表, 三视图设定.
版式: 纯白背景, 三栏布局 (左 / 中 / 右).
左侧区域: 全身三视图 (正面 / 侧面 / 背面), 同一角色, 同一服装, 正交投影, 平视角度.
中间区域: 4种人物表情网格 (平静 / 开心 / 愤怒 / 惊讶), 半身或面部特写, 表情清晰.
右侧区域: 服装与配饰拆解, 产品设计风格, 单品展示.
角色细节: ${forceText(sheetParams.visual_head)}, ${forceText(sheetParams.visual_upper)}, ${forceText(sheetParams.visual_lower)}${accessPart}.
艺术风格: ${forceText(sheetParams.style)}.
约束: 无水印, 无logo, 无额外文字标注, 无杂乱背景, 专业角色设定图格式.
--ar 16:9 (ActionID: ${Date.now()})`;
        }
        
        const url = await callApi('image', { prompt: sheetPrompt, aspectRatio: "16:9", useImg2Img: !!finalRefs, refImages: finalRefs, strength: finalRefs ? sheetConsistency : 0.65 });
        setSheetHistory(prev => { const n = [...prev]; n[n.length - 1] = { url, loading: false, isFinal: false }; return n; });
    } catch(e){ 
        setSheetHistory(prev => { const n = [...prev]; n[n.length - 1] = { error: e.message, loading: false, isFinal: false }; return n; }); 
    } finally { 
        setGenStatus('idle'); 
    }
  };

  const handleGenAll = async () => {
      if (!sheetParams.visual_head) return alert("请先等待分析");
      if (genStatus !== 'idle') return;
      try { alert("即将开始生成：先生成定妆照，完成后请手动点击生成设定图，或再次点击此按钮。"); await handleGenPortrait(); } catch(e) { setGenStatus('idle'); }
  };

  const handleRegister = async () => {
      const p = portraitHistory[portraitIdx], s = sheetHistory[sheetIdx];
      
      // 错误检查：必须有定妆照和设定图
      if(!p?.url || !s?.url) {
          return alert("请先生成并确认定妆照与设定图");
      }
      
      // 转换 blob URL 为 base64 (保证刷新后仍可用)
      try {
          const portraitBase64 = await blobUrlToBase64(p.url);
          const sheetBase64 = await blobUrlToBase64(s.url);
          
          if (!portraitBase64 || !sheetBase64) {
              return alert("图片转换失败，请重试");
          }
          
          // 使用正确的不可变更新方式写入 actors
          setActors(prev => [...prev, { 
              id: Date.now(), 
              name: sheetParams.name, 
              desc: JSON.stringify(sheetParams), 
              voice_tone: sheetParams.voice, 
              images: { 
                  sheet: sheetBase64, 
                  portrait: portraitBase64 
              } 
          }]);
          
          setShowSheetModal(false); 
          alert("签约成功");
      } catch (error) {
          alert("签约失败：" + error.message);
      }
  };

  const handleSlotUpload = (idx, e) => {
      const file = e.target.files?.[0];
      if (file) { 
          const reader = new FileReader(); 
          reader.onloadend = () => {
              setClImages(prev => {
                  const currentList = prev[idx] || [];
                  const newItem = { url: reader.result, loading: false, isFinal: false };
                  // Phase 2.6: 智能裁剪，保护锁定版本
                  const updatedList = limitHistoryKeepFinal([...currentList, newItem], MAX_HISTORY);
                  return { ...prev, [idx]: updatedList };
              });
          };
          reader.readAsDataURL(file); 
      }
  };

  // Phase 2.6: 下载最终版本（每个视角1张：优先❤️锁定，否则最新）
  const downloadPack = async () => { 
      const zip = new JSZip(); 
      const folder = zip.folder("character_pack"); 
      let txt = "=== Prompts ===\n\n"; 
      
      for (let i = 0; i < clPrompts.length; i++) { 
          const item = clPrompts[i]; 
          txt += `[${item.title}]\n${item.prompt}\n\n`; 
          
          const hist = clImages[i]; 
          if (hist && hist.length > 0) { 
              const finalOrLatest = getFinalOrLatest(hist);
              if (finalOrLatest?.url && !finalOrLatest.error) {
                  folder.file(`view_${String(i+1).padStart(2, '0')}.png`, await fetch(finalOrLatest.url).then(r=>r.blob())); 
              }
          } 
      } 
      
      folder.file("prompts.txt", txt); 
      saveAs(await zip.generateAsync({type:"blob"}), "character_pack_final.zip"); 
  };

  // Phase 2.6: 下载全部历史版本
  const downloadPackAll = async () => {
      // 计算总图片数
      let totalImages = 0;
      Object.values(clImages).forEach(hist => {
          if (hist && hist.length > 0) {
              totalImages += hist.filter(item => item.url && !item.error).length;
          }
      });
      
      if (totalImages > 80) {
          if (!confirm(`将下载 ${totalImages} 张图片，可能耗时较长或造成卡顿。是否继续？`)) {
              return;
          }
      }
      
      const zip = new JSZip(); 
      const folder = zip.folder("character_pack_all"); 
      let txt = "=== All Versions History ===\n\n"; 
      
      for (let i = 0; i < clPrompts.length; i++) { 
          const item = clPrompts[i]; 
          txt += `[${item.title}]\n${item.prompt}\n\n`; 
          
          const hist = clImages[i]; 
          if (hist && hist.length > 0) {
              const viewFolder = folder.folder(`view_${String(i+1).padStart(2, '0')}`);
              
              for (let j = 0; j < hist.length; j++) {
                  const version = hist[j];
                  if (version.url && !version.error) {
                      const versionName = version.isFinal 
                          ? `v${String(j+1).padStart(2, '0')}_FINAL.png`
                          : `v${String(j+1).padStart(2, '0')}.png`;
                      viewFolder.file(versionName, await fetch(version.url).then(r=>r.blob()));
                  }
              }
          } 
      } 
      
      folder.file("prompts.txt", txt); 
      saveAs(await zip.generateAsync({type:"blob"}), "character_pack_all.zip"); 
  };

  // --- 内部组件：GridCard ---
  const GridCard = ({ item, index }) => {
      const history = clImages[index] || [];
      const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
      const [isEditing, setIsEditing] = useState(false);
      const [localPrompt, setLocalPrompt] = useState(item.prompt);

      useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
      const current = history[verIndex] || {};
      const arClass = aspectRatio === "16:9" ? "aspect-video" : aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-square";
      const saveEdit = () => { updatePrompt(index, localPrompt); setIsEditing(false); };

      return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col relative shadow-lg">
              <div className={cn("bg-black relative w-full shrink-0", arClass)}>
                  {current.loading ? <div className="absolute inset-0 flex items-center justify-center flex-col gap-2"><Loader2 className="animate-spin text-blue-500"/><span className="text-[10px] text-slate-500">绘制中...</span></div>
                  : current.error ? <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 p-2"><span className="text-red-500 text-xs font-bold">Error</span><button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-slate-800 text-white px-2 py-1 rounded text-[9px] mt-1 border border-slate-700">重试</button></div>
                  : current.url ? <div className="relative w-full h-full group/img"><img src={current.url} className="w-full h-full object-cover cursor-zoom-in" onClick={()=>onPreview(current.url)}/><div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={()=>saveAs(current.url, `${item.title}.png`)} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={12}/></button><button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600"><RefreshCw size={12}/></button>{current.isFinal ? <button className="p-1.5 bg-pink-600 text-white rounded shadow pointer-events-none"><Heart size={12} fill="currentColor"/></button> : <button onClick={(e)=>{e.preventDefault();e.stopPropagation();setFinalVersion(index, verIndex);}} className="p-1.5 bg-black/60 text-white rounded hover:bg-pink-600 shadow" title="设为最终版本"><Heart size={12}/></button>}</div></div>
                  : <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[1px] gap-2"><button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1"><Camera size={12}/> 生成</button><label className="bg-slate-700 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1 cursor-pointer hover:bg-slate-600"><Upload size={12}/> 上传<input type="file" className="hidden" accept="image/*" onChange={(e)=>handleSlotUpload(index, e)}/></label></div>}
                  <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white backdrop-blur pointer-events-none border border-white/10">{item.title}</div>
                  {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur z-20 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={verIndex<=0} onClick={()=>setVerIndex(v=>v-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={()=>setVerIndex(v=>v+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
              </div>
              <div className="flex-1 bg-slate-900/50 border-t border-slate-800 p-2 relative min-h-[60px]">
                  {isEditing ? <div className="absolute inset-0 bg-slate-800 z-10 flex flex-col"><textarea autoFocus value={localPrompt} onChange={e=>setLocalPrompt(e.target.value)} className="flex-1 w-full bg-slate-900 text-[10px] text-slate-200 p-2 resize-none outline-none border-b border-blue-500"/><div className="flex justify-end bg-slate-900 p-1 gap-2 border-t border-slate-700"><button onClick={()=>setIsEditing(false)} className="text-[10px] text-slate-400 hover:text-white">取消</button><button onClick={saveEdit} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-500">确认</button></div></div>
                  : <><p className="text-[10px] text-slate-500 font-mono line-clamp-3 select-all hover:text-slate-300 transition-colors cursor-text pr-4" title={item.prompt}>{item.prompt}</p><button onClick={()=>setIsEditing(true)} className="absolute bottom-2 right-2 text-slate-600 hover:text-blue-400 transition-colors"><Pencil size={12}/></button></>}
              </div>
          </div>
      );
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-950">
      <div className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 shrink-0 z-10">
         <div className="p-4 overflow-y-auto flex-1 scrollbar-thin space-y-6">
            <div className="flex items-center justify-between font-bold text-slate-200"><span className="flex items-center gap-2"><UserCircle2 size={18} className="text-blue-400"/> 角色工坊</span><button onClick={handleClearAll} title="清空当前项目" className="p-1.5 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded transition-colors"><Trash2 size={14}/></button></div>
            <div className="relative group"><input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ref-img" /><label htmlFor="ref-img" className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 overflow-hidden transition-all relative">{referenceImage ? <><img src={referenceImage} className="w-full h-full object-cover opacity-80" /><button onClick={handleRemoveRef} className="absolute top-1 right-1 bg-red-600/80 text-white p-1 rounded-full hover:bg-red-500 z-20"><X size={12}/></button><button onClick={(e)=>{e.preventDefault();handleAnalyzeImage()}} disabled={isAnalyzingImage} className="absolute bottom-2 bg-blue-600/90 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg z-20 backdrop-blur-sm transition-all">{isAnalyzingImage ? <Loader2 className="animate-spin" size={12}/> : <Sparkles size={12}/>} AI 识别并填写描述</button></> : <div className="text-slate-500 flex flex-col items-center"><Upload size={20} className="mb-2"/><span className="text-xs">上传参考图 (可选)</span></div>}</label></div>
            <div className="space-y-2"><label className="text-sm font-medium text-slate-300">角色描述</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full h-24 bg-slate-800 border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-600" placeholder="描述你的角色..."/></div>
            <div className="grid grid-cols-2 gap-2 bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                <div className="space-y-1"><label className="text-[10px] text-slate-500">画面比例</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-500">语言</label><select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"><option value="Chinese">中文</option><option value="English">English</option></select></div>
                <div className="col-span-2 pt-2 border-t border-slate-700/50"><div className="flex justify-between items-center mb-1"><span className="text-[10px] text-slate-400">参考图权重 (Strength)</span><input type="checkbox" checked={useImg2Img} onChange={(e) => setUseImg2Img(e.target.checked)} disabled={!referenceImage} className="accent-blue-600 disabled:opacity-50"/></div>{useImg2Img && referenceImage && (<div className="flex items-center gap-2"><input type="range" min="0.1" max="1.0" step="0.05" value={imgStrength} onChange={(e) => setImgStrength(e.target.value)} className="flex-1 h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"/><span className="text-[10px] text-slate-300 font-mono w-8 text-right">{imgStrength}</span></div>)}</div>
            </div>
            <div className="space-y-2"><button onClick={handleGenerateViews} disabled={isGenerating} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isGenerating ? <Loader2 className="animate-spin" size={16}/> : <LayoutGrid size={16}/>} ⚡ 生成/刷新 12 标准视角</button><button onClick={openSheetModal} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2"><FileText size={16}/> 制作设定卡 & 签约</button><p className="text-[9px] text-slate-600 text-center pt-1">💡 历史仅保留最近 {MAX_HISTORY} 次，避免浏览器内存过高</p></div>
            {actors.length > 0 && (<div className="pt-4 border-t border-slate-800"><div className="flex justify-between items-center mb-2"><h4 className="text-xs font-bold text-slate-400">已签约演员 ({actors.length})</h4><button onClick={()=>saveAs(new Blob([JSON.stringify(actors)], {type: "application/json"}), "actors.json")} title="备份"><Download size={12} className="text-slate-500 hover:text-white"/></button></div><div className="grid grid-cols-4 gap-2">{actors.map(actor => (<div key={actor.id} onClick={()=>setViewingActor(actor)} className="aspect-square rounded-lg border border-slate-700 bg-slate-800 overflow-hidden relative cursor-pointer hover:border-blue-500 group"><img src={actor.images.portrait} className="w-full h-full object-cover"/><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] text-white p-1 text-center">{actor.name}</div></div>))}</div></div>)}
         </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-950">
          <div className="h-12 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30 backdrop-blur-sm shrink-0">
             <h2 className="text-slate-400 text-sm font-bold">视角预览 ({clPrompts.length})</h2>
             <div className="flex items-center gap-2">
                {clPrompts.length > 0 && <button onClick={()=>setShowAdvancedDownload(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-colors"><Download size={12}/> 下载管理</button>}
                {clPrompts.length > 0 && <button onClick={() => clPrompts.forEach((p, idx) => handleImageGen(idx, p, aspectRatio, useImg2Img, referenceImage, imgStrength))} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold shadow transition-colors"><Camera size={12}/> 全部渲染</button>}
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">{clPrompts.map((item, idx) => <GridCard key={idx} item={item} index={idx} />)}</div>
             {clPrompts.length === 0 && <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50"><UserCircle2 size={64}/><p className="mt-4">请点击左侧“生成/刷新 12 标准视角”开始工作</p></div>}
          </div>
      </div>
      {showSheetModal && (
        <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setShowSheetModal(false)}>
           <div className="bg-slate-900 border border-purple-500/30 w-full max-w-6xl h-[85vh] max-h-[800px] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e=>e.stopPropagation()}>
              <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950 shrink-0"><h3 className="text-base font-bold text-white flex items-center gap-2"><FileText className="text-purple-400" size={18}/> 角色定妆与签约中心</h3><button onClick={()=>setShowSheetModal(false)}><X size={18} className="text-slate-500 hover:text-white"/></button></div>
              <div className="flex-1 flex overflow-hidden">
                 <div className="w-80 border-r border-slate-800 p-5 bg-slate-900/50 flex flex-col overflow-y-auto scrollbar-thin">
                    {genStatus === 'analyzing' ? <div className="flex-1 flex flex-col items-center justify-center gap-4 text-purple-400"><Brain className="animate-pulse" size={48}/><p className="text-xs text-center px-4 leading-relaxed">AI 正在综合多图分析角色特征 (Auto-Analyze)...</p></div> : 
                      <div className="space-y-4 animate-in slide-in-from-left-4">
                         <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase">角色真名</label><input value={sheetParams.name} onChange={e=>setSheetParams({...sheetParams, name:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-bold" placeholder="例如：Neo"/></div>
                         <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[10px] text-slate-400 font-bold uppercase">声线 (AI推导)</label><button onClick={handleRegenVoices} disabled={isRegeneratingVoices} className="text-[10px] text-purple-400 hover:text-white flex gap-1 items-center">{isRegeneratingVoices?<Loader2 size={10} className="animate-spin"/>:<RefreshCw size={10}/>} 重组</button></div><input value={sheetParams.voice} onChange={e=>setSheetParams({...sheetParams, voice:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" placeholder="点击下方标签或输入"/><div className="flex flex-wrap gap-1.5">{suggestedVoices.map(tag => <button key={tag} onClick={()=>toggleVoiceTag(tag)} className={cn("px-2 py-0.5 border text-[10px] rounded-full transition-colors", sheetParams.voice.includes(tag) ? "bg-purple-600 border-purple-500 text-white" : "bg-purple-900/30 border-purple-800 text-purple-200 hover:bg-purple-800")}>{tag}</button>)}</div></div>
                         <div className="grid grid-cols-1 gap-3 pt-2">
                             <div className="space-y-1"><label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><Brain size={10}/> 头部 / 五官 / 发型</label><textarea value={sheetParams.visual_head} onChange={e=>setSheetParams({...sheetParams, visual_head:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/></div>
                             <div className="space-y-1"><label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><UserCircle2 size={10}/> 上身穿着</label><textarea value={sheetParams.visual_upper} onChange={e=>setSheetParams({...sheetParams, visual_upper:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/></div>
                             <div className="space-y-1"><label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1"><GripHorizontal size={10}/> 下身 / 鞋子 (AI脑补)</label><textarea value={sheetParams.visual_lower} onChange={e=>setSheetParams({...sheetParams, visual_lower:e.target.value})} className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"/></div>
                             <div className="space-y-1"><label className="text-[10px] text-green-400 font-bold uppercase flex items-center gap-1"><Wand2 size={10}/> 随身道具 / 武器</label><textarea value={sheetParams.visual_access} onChange={e=>setSheetParams({...sheetParams, visual_access:e.target.value})} className="w-full h-12 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-green-500" placeholder="例如：持激光剑、背包、眼镜"/></div>
                             <div className="space-y-1"><label className="text-[10px] text-pink-400 font-bold uppercase flex items-center gap-1"><Palette size={10}/> 艺术风格 (真实检测)</label><textarea value={sheetParams.style} onChange={e=>setSheetParams({...sheetParams, style:e.target.value})} className="w-full h-12 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-pink-500"/></div>
                         </div>
                         <div className="pt-2 border-t border-slate-800"><div className="flex justify-between items-center mb-1"><label className="text-[10px] text-slate-400 font-bold">参考素材 (手动干预, Max 5)</label><span className="text-[9px] text-green-400">Consistency: {sheetConsistency}</span></div><input type="range" min="0.1" max="1.0" step="0.05" value={sheetConsistency} onChange={(e) => setSheetConsistency(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg accent-green-500 cursor-pointer mb-2"/><div className="grid grid-cols-3 gap-2 max-h-24 overflow-y-auto scrollbar-none">{Object.entries(clImages).map(([idx, hist]) => { const img = hist && hist.length>0 ? hist[hist.length-1] : null; if(!img || !img.url) return null; const isSelected = selectedRefIndices.includes(parseInt(idx)); return <div key={idx} onClick={()=>toggleRefSelection(parseInt(idx))} className={cn("aspect-square rounded border-2 overflow-hidden relative cursor-pointer transition-all", isSelected ? "border-green-500 opacity-100" : "border-transparent opacity-40 hover:opacity-100")}><img src={img.url} className="w-full h-full object-cover"/>{isSelected && <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center"><CheckCircle2 size={16} className="text-white"/></div>}</div>; })}</div></div>
                      </div>}
                 </div>
                 <div className="flex-1 p-6 bg-black flex flex-col min-w-0">
                    <div className="flex gap-6 h-[500px] min-h-0 mb-4 shrink-0"><div className="w-1/3 h-full"><MediaPreview label="核心定妆照 (Half-Body)" history={portraitHistory} idx={portraitIdx} setIdx={setPortraitIdx} onGen={handleGenPortrait} onPreview={onPreview} /></div><div className="flex-1 h-full"><MediaPreview label="角色设定图 (Sheet)" history={sheetHistory} idx={sheetIdx} setIdx={setSheetIdx} onGen={handleGenSheet} onPreview={onPreview} /></div></div>
                    <div className="h-16 shrink-0 flex gap-4 items-center justify-end border-t border-slate-800 pt-4"><button onClick={handleGenAll} disabled={genStatus!=='idle'} className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg h-12 font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all cursor-pointer">{genStatus!=='idle' ? <Loader2 className="animate-spin"/> : <Wand2 size={18}/>} <span>✨ 一键制作定妆照 & 设定图</span></button>{portraitHistory[portraitIdx]?.url && sheetHistory[sheetIdx]?.url && <button onClick={handleRegister} className="w-64 bg-green-600 hover:bg-green-500 text-white rounded-lg h-12 font-bold shadow-lg flex items-center justify-center gap-2 animate-in slide-in-from-right-4"><CheckCircle2 size={18}/> 确认签约 (Register)</button>}</div>
                 </div>
              </div>
           </div>
        </div>
      )}
      {viewingActor && (
         <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setViewingActor(null)}>
            <div className="bg-slate-900 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex" onClick={e=>e.stopPropagation()}>
               <div className="w-1/2 bg-black relative"><img src={viewingActor.images.portrait} className="w-full h-full object-cover"/><div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4"><h3 className="text-2xl font-bold text-white">{viewingActor.name}</h3><span className="text-xs bg-purple-900 text-purple-200 px-2 py-0.5 rounded ml-2">{viewingActor.voice_tone}</span></div></div>
               <div className="w-1/2 p-6 bg-slate-900 flex flex-col">
                   <div className="mb-4"><h4 className="text-xs font-bold text-slate-500 mb-2">设定图</h4><img src={viewingActor.images.sheet} className="w-full h-24 object-cover rounded border border-slate-700 cursor-zoom-in" onClick={()=>onPreview(viewingActor.images.sheet)}/></div>
                   <div className="flex-1 overflow-y-auto mb-4"><h4 className="text-xs font-bold text-slate-500 mb-1">描述参数</h4><p className="text-[10px] text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800 leading-relaxed">{viewingActor.desc}</p></div>
                   <button onClick={()=>{setActors(p=>p.filter(a=>a.id!==viewingActor.id));setViewingActor(null)}} className="w-full py-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-white border border-red-900 rounded flex items-center justify-center gap-2 text-xs transition-colors"><Trash2 size={14}/> 解除签约</button>
               </div>
            </div>
         </div>
      )}
      {showAdvancedDownload && (
         <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setShowAdvancedDownload(false)}>
            <div className="bg-slate-900 border border-blue-500/30 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e=>e.stopPropagation()}>
               <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950">
                  <h3 className="text-base font-bold text-white flex items-center gap-2"><Download className="text-blue-400" size={18}/> 高级下载器</h3>
                  <button onClick={()=>setShowAdvancedDownload(false)}><X size={18} className="text-slate-500 hover:text-white"/></button>
               </div>
               <div className="p-6 space-y-4">
                  <div className="space-y-3">
                     <button onClick={()=>{downloadPack();setShowAdvancedDownload(false);}} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg flex flex-col items-center justify-center gap-1 transition-colors">
                        <span className="text-sm">下载最终角色图包（❤️/最新）</span>
                        <span className="text-[10px] text-blue-200/80">每个视角只包含1张：若已❤️锁定则使用锁定图，否则使用最新图</span>
                     </button>
                     <button onClick={()=>{downloadPackAll();setShowAdvancedDownload(false);}} className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold shadow-lg flex flex-col items-center justify-center gap-1 transition-colors">
                        <span className="text-sm">下载全部历史版本</span>
                        <span className="text-[10px] text-slate-300/80">包含所有视角的所有历史版本（可能较大）</span>
                     </button>
                  </div>
                  <div className="text-[10px] text-slate-500 text-center pt-2 border-t border-slate-800">
                     💡 提示：全部历史版本会包含每个视角的所有生成记录，带 _FINAL 后缀的为锁定版本
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

/*
===========================================
Phase 2 自测清单 (QA Checklist)
===========================================

A. 历史版本限制 (MAX_HISTORY = 5)
   ✓ 同一视角连续生成 10 次，历史最多保留 5 条
   ✓ 定妆照/设定图连续生成超过 5 次，只保留最新 5 条
   ✓ UI 显示提示："历史仅保留最近 5 次，避免浏览器内存过高"

B. 锁定功能 (❤️ Final Version)
   ✓ 某视角切到旧版本，点击❤️，该版本被标记为最终版本
   ✓ 再次点击其他版本的❤️，旧锁定被取消，新版本被锁定
   ✓ 打包下载时，使用❤️锁定版本（无锁定则用最新版）
   ✓ 签约中心取图优先使用❤️锁定版本

C. 签约中心取图逻辑
   ✓ 有 4 张关键视角（正面全身、面部特写、侧面、背面全身）-> 发送 4 张
   ✓ 只有 1-3 张关键视角 -> 正确降级，发送 1 张（优先级：正面>面部>侧面>背面）
   ✓ 没有关键视角但有参考图 -> 发送参考图
   ✓ 没有任何图且没有描述 -> 阻断并提示"请先创造角色"
   ✓ System Prompt 强化：美术总监级、禁止偷懒、禁止预设词

D. visual_access 字段
   ✓ 签约中心 UI 可见"随身道具/武器"编辑框
   ✓ 生成定妆照时，visual_access 内容被正确拼接到 prompt
   ✓ 生成设定图时，visual_access 内容被正确拼接到 prompt
   ✓ 签约保存时，visual_access 数据被保存到 sheetParams

E. 向后兼容性
   ✓ 旧数据（无 isFinal 字段）仍能正常显示和使用
   ✓ getFinalOrLatest 函数正确处理空数组/null 情况
   ✓ 不影响 ProjectContext.jsx 的 assembleSoraPrompt 和 callApi 调用

===========================================
*/
