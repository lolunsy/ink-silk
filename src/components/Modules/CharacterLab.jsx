import React, { useState, useEffect } from 'react';
import { UserCircle2, Trash2, Upload, X, Sparkles, Loader2, LayoutGrid, FileText, RefreshCw, Download, ChevronLeft, ChevronRight, CheckCircle2, Wand2, Camera, Pencil, ImageIcon, Palette, GripHorizontal, Brain, Heart } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { cn } from '../../lib/utils';
import { useProject } from '../../context/ProjectContext';
import { ContractCenter } from '../Modals/ContractCenter'; // Phase 3.1: 签约中心独立组件

// === Phase 2.6: 配置常量 ===
const MAX_HISTORY = 5; // 历史版本上限，防止内存过高/白屏

// === Phase 2.7.1: 工具函数 - 历史裁剪时强制保留锁定版本（即使超出限制）===
const limitHistoryKeepFinal = (history, max) => {
    if (!history || history.length === 0) return [];
    if (history.length <= max) return history;
    
    const finalItem = history.find(item => item.isFinal === true);
    
    if (finalItem) {
        // 有锁定版本：必须保留，即使它很老
        const otherItems = history.filter(item => item.isFinal !== true);
        
        // 如果其他项超过 max-1，只保留最新的 max-1 个
        const recentOthers = otherItems.length > (max - 1) 
            ? otherItems.slice(-(max - 1)) 
            : otherItems;
        
        // 合并并保持原始顺序
        const combined = [...recentOthers, finalItem];
        combined.sort((a, b) => {
            const aIdx = history.indexOf(a);
            const bIdx = history.indexOf(b);
            return aIdx - bIdx;
        });
        
        return combined;
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
  const { config, clPrompts, setClPrompts, clImages, setClImages, actors, setActors, isActorsLoaded, callApi } = useProject();

  // Phase 2.7.2: 固定12视角（标题与顺序严格锁死，禁止改动）
  // 这12个视角的标题和顺序必须完全一致，不得增删改名
  const FIXED_12_VIEWS = [
      { title: "正面全身 (Front Full)", key: "front_full" },
      { title: "背面全身 (Back Full)", key: "back_full" },
      { title: "侧面半身 (Side Half)", key: "side_half" },
      { title: "面部特写-正 (Face Front)", key: "face_front" },
      { title: "面部特写-侧 (Face Side)", key: "face_side" },
      { title: "背面特写 (Back Close)", key: "back_close" },
      { title: "俯视视角 (High Angle)", key: "high_angle" },
      { title: "仰视视角 (Low Angle)", key: "low_angle" },
      { title: "动态姿势 (Action Pose)", key: "action_pose" },
      { title: "电影广角 (Cinematic Wide)", key: "cinematic_wide" },
      { title: "自然抓拍-喜 (Candid Joy)", key: "candid_joy" },
      { title: "自然抓拍-怒 (Candid Anger)", key: "candid_anger" }
  ];

  // Phase 2.7.1: 命令式视角模板（不强制纯背景，允许保留参考图背景）
  const getViewPrompt = (viewKey, lang) => {
      const templates = {
          front_full: {
              en: "Full-body front view, standing pose, show complete outfit from head to toe, same character consistency.",
              zh: "全身正面视角，站立姿势，展示从头到脚的完整服装，保持角色一致性。"
          },
          back_full: {
              en: "Full-body back view, show back design of outfit and hairstyle from behind, same character consistency.",
              zh: "全身背面视角，展示服装背部设计和发型背面，保持角色一致性。"
          },
          side_half: {
              en: "Upper body side profile, show silhouette and clothing details from side angle, same character consistency.",
              zh: "半身侧面轮廓，展示侧面剪影和服装细节，保持角色一致性。"
          },
          face_front: {
              en: "Close-up portrait, front-facing, detailed facial features, eyes, nose, mouth, skin texture, same character consistency.",
              zh: "面部特写，正面朝向，细节刻画五官、眼睛、鼻子、嘴巴、皮肤纹理，保持角色一致性。"
          },
          face_side: {
              en: "Close-up face side profile, show jawline, ear, cheekbone structure from side, same character consistency.",
              zh: "面部侧面特写，展示下颌线、耳朵、颧骨结构，保持角色一致性。"
          },
          back_close: {
              en: "Close-up from behind, focus on back of head, hair texture, neck and shoulder details, same character consistency.",
              zh: "背面特写，聚焦后脑、发质纹理、颈部和肩部细节，保持角色一致性。"
          },
          high_angle: {
              en: "High angle shot, camera looking down at character, full body visible from above perspective, same character consistency.",
              zh: "俯视角度，镜头向下俯拍角色，从上方视角展示全身，保持角色一致性。"
          },
          low_angle: {
              en: "Low angle shot, camera looking up at character, emphasize height and imposing presence, same character consistency.",
              zh: "仰视角度，镜头向上仰拍角色，强调身高和气场，保持角色一致性。"
          },
          action_pose: {
              en: "Dynamic action pose, character in motion or combat stance, show movement and energy, same character consistency.",
              zh: "动态动作姿势，角色处于运动或战斗姿态，展现动感和能量，保持角色一致性。"
          },
          cinematic_wide: {
              en: "Cinematic wide shot, character in environment, rule of thirds composition, atmospheric depth, same character consistency.",
              zh: "电影广角镜头，角色融入环境，三分法构图，层次感，保持角色一致性。"
          },
          candid_joy: {
              en: "Candid moment, natural happy expression, genuine smile or laughter, warm and positive mood, same character consistency.",
              zh: "自然抓拍时刻，真实的开心表情，真诚的微笑或笑容，温暖积极氛围，保持角色一致性。"
          },
          candid_anger: {
              en: "Candid moment, intense angry expression, fierce stare or frown, dramatic tension, same character consistency.",
              zh: "自然抓拍时刻，强烈的愤怒表情，凶狠的凝视或皱眉，戏剧化张力，保持角色一致性。"
          }
      };
      
      const template = templates[viewKey];
      if (!template) return "";
      return lang === "English" ? template.en : template.zh;
  };
  
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
  
  // Phase 3.1: 签约中心相关 state 已迁移到 ContractCenter.jsx
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [viewingActor, setViewingActor] = useState(null);
  const [showAdvancedDownload, setShowAdvancedDownload] = useState(false); // Phase 2.6: 高级下载器

  // Phase 3.1: 初始化 12 视角（清除签约中心旧状态引用，避免刷新白屏）
  useEffect(() => {
      setIsGenerating(false);
      // Phase 2.7.1: 使用固定12视角初始化
      if (!clPrompts || clPrompts.length === 0) {
          const initialPrompts = FIXED_12_VIEWS.map(view => ({
              title: view.title,
              prompt: ""
          }));
          setClPrompts(initialPrompts);
      }
      // Phase 3.1: 签约中心状态已迁移到 ContractCenter，不再需要清理逻辑
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

  // Phase 2.7: 描述净化函数 - 只保留外观特征，移除动作/表情/环境
  const purifyDescription = (rawDesc) => {
      if (!rawDesc || rawDesc.length < 10) return rawDesc;
      
      // 污染关键词列表（动作、表情、环境、镜头、时间、光影）
      const pollutionKeywords = [
          // 动作
          '站立', '行走', '奔跑', '跳跃', '坐着', '躺着', '手持', '拿着', '握着', '挥手', '指向', '战斗', '攻击',
          'standing', 'walking', 'running', 'jumping', 'sitting', 'lying', 'holding', 'grasping', 'waving', 'pointing', 'fighting',
          // 表情/情绪
          '微笑', '大笑', '哭泣', '愤怒', '惊讶', '恐惧', '狡黠', '冷漠', '温柔', '凶狠',
          'smiling', 'laughing', 'crying', 'angry', 'surprised', 'scared', 'sly', 'cold', 'gentle', 'fierce',
          // 环境/场景
          '雨夜', '城市', '街道', '森林', '山脉', '海边', '室内', '户外', '背景', '场景', '环境',
          'rainy night', 'city', 'street', 'forest', 'mountain', 'beach', 'indoor', 'outdoor', 'background', 'scene', 'environment',
          // 光影/氛围
          '霓虹', '日落', '黎明', '月光', '阳光', '阴影', '光影', '氛围', '雾气',
          'neon', 'sunset', 'dawn', 'moonlight', 'sunlight', 'shadow', 'lighting', 'atmosphere', 'fog',
          // 镜头语言
          '特写', '广角', '俯视', '仰视', '镜头', '构图', '景深', '虚化',
          'close-up', 'wide angle', 'high angle', 'low angle', 'camera', 'composition', 'depth of field', 'bokeh'
      ];
      
      let cleaned = rawDesc;
      
      // 按句子分割，过滤包含污染词的句子
      const sentences = cleaned.split(/[。！？;;\n]+/).filter(s => s.trim().length > 0);
      const pureSentences = sentences.filter(sentence => {
          const lower = sentence.toLowerCase();
          // 如果句子包含污染词，跳过
          return !pollutionKeywords.some(keyword => lower.includes(keyword.toLowerCase()));
      });
      
      cleaned = pureSentences.join('。');
      
      // 截断到 600 字，防止过长
      if (cleaned.length > 600) {
          cleaned = cleaned.substring(0, 600) + '...';
      }
      
      return cleaned || rawDesc; // 如果全部被过滤，返回原描述（避免空值）
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

  // === Phase 2.7.1: 设置某视角的最终版本（只更新标记，不改变 idx）===
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
      // 注意：不改变 GridCard 的 verIndex state，用户仍停留在当前查看的版本
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

  // Phase 3.2: 清空角色工坊数据（不影响演员库，演员由 IndexedDB 管理）
  const handleClearAll = () => {
      if (!confirm("确定要清空所有内容吗？此操作无法撤销。")) return;
      setDescription(""); setReferenceImage(null); setClPrompts([]); setClImages({});
      localStorage.removeItem('cl_desc'); localStorage.removeItem('cl_ref'); localStorage.removeItem('cl_prompts');
      // Phase 3.2: 移除 setSheetParams（已迁移到 ContractCenter）
      setUseImg2Img(true);
  };

  const handleRemoveRef = (e) => { e.preventDefault(); e.stopPropagation(); setReferenceImage(null); localStorage.removeItem('cl_ref'); setUseImg2Img(false); };
  
  // Phase 3.1: 打开签约中心（简化版本，实际逻辑在 ContractCenter.jsx）
  const openSheetModal = () => {
    const hasGenerated = Object.keys(clImages).some(k => clImages[k]?.length > 0 && !clImages[k][0].error);
    
    // 阻断策略：没图没描述直接阻断
    if (!description && !referenceImage && !hasGenerated) {
        return alert("请先创造角色：上传参考图或生成视角图。");
    }
    
    setShowSheetModal(true);
  };
  
  // Phase 3.1: 签约演员回调（由 ContractCenter 调用）
  const handleRegisterActor = (newActor) => {
    setActors(prev => [...prev, newActor]);
  };

  const handleGenerateViews = async () => {
    if (!description) return alert("请先填写角色描述");
    
    // Phase 2.7.1: 轻量净化描述（只移除明显环境/剧情词，保留服装材质/道具）
    const purifiedDesc = purifyDescription(description);
    
    // Phase 2.6/2.7: 确保绘图描述已准备好
    let identityDesc = purifiedDesc;
    if (targetLang === "English") {
        // 英文模式需要转换
        if (drawDesc && drawDesc.length > 10) {
            identityDesc = drawDesc;
        } else {
            identityDesc = await ensureDrawDesc();
        }
    }
    
    if (!identityDesc) {
        return alert("描述转换失败，请重试");
    }
    
    // Phase 2.7.1: 使用固定12视角 + 命令式模板
    const newPrompts = FIXED_12_VIEWS.map(view => {
        const viewCmd = getViewPrompt(view.key, targetLang);
        // 命令式结构：identity block + view block + consistency block
        const fullPrompt = `${identityDesc}. ${viewCmd}`;
            return { 
                title: view.title, 
            prompt: fullPrompt 
        };
    });
    
    setClPrompts(newPrompts); 
    setClImages({});
    localStorage.setItem('cl_prompts', JSON.stringify(newPrompts));
    
    // 提示用户描述已净化
    if (purifiedDesc !== description && purifiedDesc.length < description.length) {
        setTimeout(() => {
            alert("✅ 已自动净化描述为外观特征\n\n移除了：环境、剧情、天气等污染词，保留服装材质和道具特征。");
        }, 300);
    }
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

  // Phase 3.1: 签约中心相关函数已迁移到 ContractCenter.jsx
  // 以下函数已删除：chooseAnalysisAssets, getGenerationAssets, handleRegenVoices, 
  // toggleRefSelection, toggleVoiceTag, handleGenPortrait, handleGenSheet, handleGenAll, 
  // handleRegister, buildSheetPrompt

  // Phase 2.7: 上传演员包（支持 JSON 格式导入，合并或覆盖）
  const handleActorsUpload = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      try {
          const text = await file.text();
          const data = JSON.parse(text);
          
          // 兼容两种格式：{ actors: [...] } 或直接 [...]
          let importedActors = [];
          if (Array.isArray(data)) {
              importedActors = data;
          } else if (data.actors && Array.isArray(data.actors)) {
              importedActors = data.actors;
          } else {
              return alert("❌ 格式错误：JSON 必须包含 actors 数组或直接为演员数组");
          }
          
          if (importedActors.length === 0) {
              return alert("❌ 演员包为空，无可导入内容");
          }
          
          // 弹窗选择导入模式
          const mode = confirm(
              `📦 检测到 ${importedActors.length} 个演员\n\n` +
              `【确定】= 合并模式（按 id 去重，同 id 以导入覆盖）\n` +
              `【取消】= 覆盖模式（清空现有演员，使用导入的）\n\n` +
              `当前已有 ${actors.length} 个演员`
          ) ? 'merge' : 'replace';
          
          if (mode === 'replace') {
              // 覆盖模式：直接替换
              setActors(importedActors);
              alert(`✅ 已覆盖导入 ${importedActors.length} 个演员`);
          } else {
              // 合并模式：按 id 去重
              const merged = [...actors];
              let addedCount = 0;
              let updatedCount = 0;
              
              importedActors.forEach(importActor => {
                  const existingIndex = merged.findIndex(a => a.id === importActor.id);
                  if (existingIndex >= 0) {
                      // 同 id 存在，覆盖
                      merged[existingIndex] = importActor;
                      updatedCount++;
        } else {
                      // 新演员，追加
                      merged.push(importActor);
                      addedCount++;
                  }
              });
              
              setActors(merged);
              alert(
                  `✅ 合并完成\n\n` +
                  `新增: ${addedCount} 个\n` +
                  `更新: ${updatedCount} 个\n` +
                  `总计: ${merged.length} 个演员`
              );
          }
          
      } catch (error) {
          alert("❌ 导入失败：" + error.message);
    } finally { 
          // 清空 input，允许重复上传同一文件
          e.target.value = '';
      }
  };

  // Phase 2.7.1: 上传按钮始终可用，追加到历史并指向最新
  const handleSlotUpload = (idx, e) => {
      const file = e.target.files?.[0];
      if (file) { 
          const reader = new FileReader(); 
          reader.onloadend = () => {
              setClImages(prev => {
                  const currentList = prev[idx] || [];
                  const newItem = { url: reader.result, loading: false, isFinal: false, timestamp: Date.now() };
                  // 追加到历史，保护锁定版本
                  const updatedList = limitHistoryKeepFinal([...currentList, newItem], MAX_HISTORY);
                  return { ...prev, [idx]: updatedList };
              });
          };
          reader.readAsDataURL(file); 
      }
      // 清空 input，允许重复上传同一文件
      e.target.value = '';
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
      const [prevHistoryLength, setPrevHistoryLength] = useState(history.length);

      // Phase 2.7.2: 只在历史增加时跳到最新（上传/生成），点击❤️不跳页
      useEffect(() => {
          if (history.length > prevHistoryLength) {
              // 历史增加了，跳到最新版本（用户上传或生成了新图）
              setVerIndex(history.length - 1);
          } else if (history.length === 0) {
              // 历史被清空，重置到0
              setVerIndex(0);
          }
          // 更新记录
          setPrevHistoryLength(history.length);
      }, [history.length]);
      
      const current = history[verIndex] || {};
      const arClass = aspectRatio === "16:9" ? "aspect-video" : aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-square";
      const saveEdit = () => { updatePrompt(index, localPrompt); setIsEditing(false); };

      return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all flex flex-col relative shadow-lg">
              <div className={cn("bg-black relative w-full shrink-0", arClass)}>
                  {current.loading ? <div className="absolute inset-0 flex items-center justify-center flex-col gap-2"><Loader2 className="animate-spin text-blue-500"/><span className="text-[10px] text-slate-500">绘制中...</span></div>
                  : current.error ? <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 p-2"><span className="text-red-500 text-xs font-bold">Error</span><button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-slate-800 text-white px-2 py-1 rounded text-[9px] mt-1 border border-slate-700">重试</button></div>
                  : current.url ? <div className="relative w-full h-full group/img"><img src={current.url} className="w-full h-full object-cover cursor-zoom-in" onClick={()=>onPreview(current.url)}/><div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={()=>saveAs(current.url, `${item.title}.png`)} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={12}/></button><button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600"><RefreshCw size={12}/></button><label className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600 shadow cursor-pointer" title="上传替换"><Upload size={12}/><input type="file" className="hidden" accept="image/*" onChange={(e)=>handleSlotUpload(index, e)}/></label>{current.isFinal ? <button className="p-1.5 bg-pink-600 text-white rounded shadow pointer-events-none"><Heart size={12} fill="currentColor"/></button> : <button onClick={(e)=>{e.preventDefault();e.stopPropagation();setFinalVersion(index, verIndex);}} className="p-1.5 bg-black/60 text-white rounded hover:bg-pink-600 shadow" title="设为最终版本"><Heart size={12}/></button>}</div></div>
                  : <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[1px] gap-2"><button onClick={()=>handleImageGen(index, item, aspectRatio, useImg2Img, referenceImage, imgStrength)} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1"><Camera size={12}/> 生成</button><label className="bg-slate-700 text-white px-3 py-1.5 rounded-full text-xs shadow-lg flex items-center gap-1 cursor-pointer hover:bg-slate-600"><Upload size={12}/> 上传<input type="file" className="hidden" accept="image/*" onChange={(e)=>handleSlotUpload(index, e)}/></label></div>}
                  <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white backdrop-blur pointer-events-none border border-white/10">{item.title}</div>
                  {history.length > 1 && (<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur z-20 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={verIndex<=0} onClick={()=>setVerIndex(v=>v-1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronLeft size={12}/></button><span className="text-[10px] text-white">{verIndex+1}/{history.length}</span><button disabled={verIndex>=history.length-1} onClick={()=>setVerIndex(v=>v+1)} className="text-white hover:text-blue-400 disabled:opacity-30"><ChevronRight size={12}/></button></div>)}
              </div>
              <div className="flex-1 bg-slate-900/50 border-t border-slate-800 p-2 relative min-h-[60px] flex flex-col">
                  {isEditing ? <div className="absolute inset-0 bg-slate-800 z-10 flex flex-col"><textarea autoFocus value={localPrompt} onChange={e=>setLocalPrompt(e.target.value)} className="flex-1 w-full bg-slate-900 text-[10px] text-slate-200 p-2 resize-none outline-none border-b border-blue-500"/><div className="flex justify-end bg-slate-900 p-1 gap-2 border-t border-slate-700"><button onClick={()=>setIsEditing(false)} className="text-[10px] text-slate-400 hover:text-white">取消</button><button onClick={saveEdit} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-500">确认</button></div></div>
                  : <>
                      <p className="text-[10px] text-slate-500 font-mono line-clamp-2 select-all hover:text-slate-300 transition-colors cursor-text pr-4 flex-1" title={item.prompt}>{item.prompt}</p>
                      <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-700/50">
                          <label className="text-[10px] text-purple-400 hover:text-purple-300 cursor-pointer flex items-center gap-1 transition-colors">
                              <Upload size={10}/>
                              <span>{history.length > 0 ? '替换图片' : '上传图片'}</span>
                              <input type="file" className="hidden" accept="image/*" onChange={(e)=>handleSlotUpload(index, e)}/>
                          </label>
                          <button onClick={()=>setIsEditing(true)} className="text-slate-600 hover:text-blue-400 transition-colors"><Pencil size={12}/></button>
                      </div>
                  </>}
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
            <div className="pt-4 border-t border-slate-800">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-slate-400">已签约演员 ({actors.length})</h4>
                    <div className="flex gap-2">
                        {actors.length > 0 && <button onClick={()=>saveAs(new Blob([JSON.stringify({actors})], {type: "application/json"}), "actors_pack.json")} title="下载演员包" className="text-slate-500 hover:text-white"><Download size={12}/></button>}
                        <label title="上传演员包" className="text-slate-500 hover:text-green-400 cursor-pointer"><Upload size={12}/><input type="file" accept=".json" className="hidden" onChange={(e)=>handleActorsUpload(e)}/></label>
                    </div>
                </div>
                {!isActorsLoaded ? (
                    <div className="text-center py-8 text-slate-600 text-xs">
                        <Loader2 size={24} className="mx-auto mb-2 opacity-50 animate-spin"/>
                        <p>演员库加载中...</p>
                    </div>
                ) : actors.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">{actors.map(actor => (<div key={actor.id} onClick={()=>setViewingActor(actor)} className="aspect-square rounded-lg border border-slate-700 bg-slate-800 overflow-hidden relative cursor-pointer hover:border-blue-500 group"><img src={actor.images.portrait} className="w-full h-full object-cover"/><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] text-white p-1 text-center">{actor.name}</div></div>))}</div>
                ) : (
                    <div className="text-center py-8 text-slate-600 text-xs">
                        <UserCircle2 size={32} className="mx-auto mb-2 opacity-30"/>
                        <p>尚未签约演员</p>
                        <p className="text-[10px] mt-1 text-slate-700 leading-relaxed">签约后会在此显示，可下载/上传演员包管理</p>
                    </div>
                )}
            </div>
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
      {/* Phase 3.1: 签约中心已迁移到独立组件 ContractCenter.jsx */}
      <ContractCenter
        isOpen={showSheetModal}
        onClose={() => setShowSheetModal(false)}
        targetLang={targetLang}
        referenceImage={referenceImage}
        clImages={clImages}
        description={description}
        callApi={callApi}
        onRegisterActor={handleRegisterActor}
        onPreview={onPreview}
      />
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
Phase 2.7 自测清单 (QA Checklist) - 2025-01-09
===========================================

【测试前准备】
1. 打开浏览器开发者工具 -> Application -> Local Storage
2. 清空 localStorage（可选，测试持久化）
3. 准备一个包含"雨夜、霓虹、城市、手持平板电脑、狡黠微笑"等污染词的长描述

【A. 演员持久化测试】
测试步骤：
1. 创建一个角色 -> 签约（确保有定妆照和设定图）
2. 刷新页面（F5）
3. 检查演员是否仍在"已签约演员"列表中
4. 点击演员缩略图，检查定妆照和设定图是否正常显示

验收标准：
✓ 刷新后演员不丢失
✓ 演员数据包含 desc、voice_tone、images.portrait、images.sheet
✓ localStorage 中存在 key: ink_silk_actors_v1
✓ 如果手动触发 QuotaExceededError（大量签约），会弹出中文提示

【B. 上传演员包测试】
测试步骤：
1. 下载现有演员包（点击"演员库"右侧的下载按钮）
2. 打开开发者工具 -> Application -> Local Storage -> 清空 ink_silk_actors_v1
3. 刷新页面（演员应该消失）
4. 点击"演员库"右侧的上传按钮，选择刚下载的 actors_pack.json
5. 选择"合并"模式
6. 检查演员是否恢复

验收标准：
✓ 上传按钮存在且可用
✓ 支持 { actors: [...] } 和 [...] 两种 JSON 格式
✓ 弹窗提示"合并/覆盖"模式选择
✓ 导入后演员立即显示，刷新后仍在

【C. 12宫格提示词净化测试】
测试步骤：
1. 在"角色描述"输入框输入：
   "一个身穿黑色风衣的男子，雨夜中站在霓虹城市街道上，手持平板电脑，露出狡黠的微笑，背景是赛博朋克风格的高楼大厦和闪烁的霓虹灯。"
2. 点击"生成/刷新 12 标准视角"
3. 检查生成的 12 个视角 prompt（鼠标悬停在卡片底部可查看完整 prompt）
4. 切换语言为 "English"，再次点击"生成/刷新 12 标准视角"
5. 检查 prompt 是否变为英文

验收标准：
✓ 净化后的 prompt 不包含：雨夜、霓虹、城市、手持平板电脑、狡黠微笑
✓ 12 个视角的 prompt 明显不同（正面/背面/侧面/俯视/仰视等）
✓ prompt 以"COMMAND:"或"指令："开头（命令式）
✓ 切换 English 后，prompt 变为英文，UI 仍为中文
✓ 弹窗提示"已自动净化描述为外观特征"

【D. 签约中心声线和style测试】
测试步骤：
1. 生成几个视角图后，点击"制作设定卡 & 签约"
2. 等待 AI 分析完成，查看"艺术风格"字段
3. 点击"声线"右侧的"重组"按钮
4. 查看推荐的声线标签

验收标准：
✓ "艺术风格"字段不包含：雨夜、城市、霓虹、背景等环境词
✓ "艺术风格"字段包含：写实摄影、电影感、赛博朋克写实、3D渲染等风格词
✓ 点击"重组"后，声线标签为中文（如：低沉磁性、少年感、御姐音）
✓ 禁止出现英文声线标签（如：Deep, Male, Female）

【E. 定妆照/设定图强约束测试】
测试步骤：
1. 在签约中心点击"一键制作定妆照 & 设定图"或分别生成
2. 连续重绘定妆照 2-3 次
3. 连续重绘设定图 2-3 次
4. 观察生成结果

验收标准：
✓ 定妆照为纯色背景（白色/灰色），无雨夜/城市等环境
✓ 定妆照为半身或胸部以上，中性站姿，无夸张动作
✓ 设定图接近"三视图+表情+拆解"的白底设定板结构
✓ 设定图左侧：正面/侧面/背面三视图
✓ 设定图中间：4种表情（平静/开心/愤怒/惊讶）
✓ 设定图右侧：服装配饰拆解
✓ 设定图无漫画分镜、无插画场景化背景

【F. 双语模式测试】
测试步骤：
1. 切换语言为 "English"
2. 重新生成 12 标准视角
3. 打开签约中心，生成定妆照和设定图
4. 使用浏览器开发者工具 -> Network，查看发送到图片 API 的 prompt

验收标准：
✓ UI 全部保持中文（按钮、标签、提示文字）
✓ 发送到 API 的 prompt 为英文
✓ 切换回 "Chinese" 后，prompt 变为中文

【G. 综合测试流程（完整链路）】
1. 输入污染描述 -> 生成12宫格 -> prompt差异明显，无污染词
2. 切换 English -> prompt变英文，UI不变
3. 签约角色 -> 刷新页面 -> 演员仍在
4. 下载演员包 -> 清空localStorage -> 上传演员包 -> 演员恢复
5. 重组声线 -> 中文标签
6. 生成定妆照/设定图 -> 背景与结构符合要求

===========================================
Phase 2.7.2 自测清单 (QA Checklist) - 2025-01-09
===========================================

【0. 固定视角标题与顺序】
验收标准：
✓ 12个视角标题完全等于用户要求的列表（正面全身、背面全身、侧面半身...）
✓ 顺序完全一致，不得增删改名
✓ FIXED_12_VIEWS 是唯一的视角定义，所有地方统一使用

【1. 12宫格不清背景】
测试步骤：
1. 上传一张有复杂背景的参考图（例如：雨夜城市街道）
2. 生成12标准视角
3. 查看生成的prompt（编辑按钮查看）
4. 检查生成的图片

验收标准：
✓ prompt 不包含：plain background, clean background, studio backdrop, no background clutter
✓ prompt 只包含：视角命令 + 角色一致性要求
✓ 生成的12宫格图片背景允许保留参考图的背景元素
✓ 定妆照和设定图仍然强制纯背景（不受影响）

【2. 视角prompt命令式模板】
验收标准：
✓ 每个视角prompt结构：identityDesc（外貌/服饰/道具）+ viewCmd（视角命令）
✓ 12个视角的viewCmd明显不同（Full-body front / Full-body back / Upper body side...）
✓ 包含 "same character consistency" 等一致性约束
✓ 不包含环境/动作/表情污染词（已被 purifyDescription 清理）

【3. ❤️锁定不丢失+不跳页】
测试步骤：
1. 生成某个视角的3张图片（version 1, 2, 3）
2. 切换到 version 2，点击❤️锁定
3. 继续生成第4张图片
4. 检查当前显示的是哪个版本
5. 连续生成到第10张，检查 version 2（锁定版）是否仍在历史中

验收标准：
✓ 点击❤️后，当前仍停留在 version 2（不跳到最新）
✓ 继续生成新图时，自动跳到最新生成的版本（version 4）
✓ 即使历史超过 MAX_HISTORY=5，锁定的 version 2 仍保留
✓ 点击❤️时不触发父级事件（preventDefault + stopPropagation）

【4. 上传可替换+跳到最新】
测试步骤：
1. 生成某个视角的1张图片
2. 点击"上传替换"按钮，上传一张新图
3. 检查是否跳到刚上传的图片
4. 再次点击"上传替换"，上传第二张图
5. 检查历史记录

验收标准：
✓ 上传按钮在有图和无图时都可见且可用
✓ 上传后立即跳到最新上传的图片（不停留在旧版本）
✓ 上传的图片追加到历史，不替换原有历史
✓ 上传后清空 input，允许重复上传同一文件

【5. 演员库UI始终显示】
测试步骤：
1. 打开页面（无演员）
2. 签约一个演员
3. 刷新页面
4. 删除所有演员

验收标准：
✓ 0个演员时，显示"尚未签约演员"引导文案
✓ 有演员时，显示演员缩略图网格
✓ 标题始终显示"已签约演员 (n)"，n为当前数量
✓ 上传按钮始终可见（即使0个演员）
✓ 下载按钮只在有演员时显示

【6. 设定图三栏强结构】
测试步骤：
1. 进入签约中心
2. 在"艺术风格"字段输入包含环境词的文本（例如："赛博朋克写实，雨夜城市背景，霓虹灯"）
3. 生成设定图
4. 连续重绘2-3次

验收标准：
✓ buildSheetPrompt 是唯一的设定图prompt入口
✓ 设定图prompt强制包含：LEFT COLUMN (三视图) / CENTER COLUMN (4表情) / RIGHT COLUMN (拆解)
✓ style字段中的环境词被自动清洗（雨夜、城市、霓虹、背景等）
✓ 生成的设定图明显接近三栏布局（即使AI偶尔不完美）
✓ 纯白背景，无场景化背景

【H. 快速回归测试（5分钟）】
1. 12个视角标题检查 → 完全一致
2. 上传参考图 → 生成12宫格 → 背景保留（非纯色）
3. 锁定某视角的旧版本 → 继续生成 → 锁定不丢失且当前不跳页
4. 上传替换某视角 → 自动跳到最新上传的图
5. 演员库0个时 → 显示引导文案
6. 签约中心设定图 → 三栏结构白底

===========================================
*/
