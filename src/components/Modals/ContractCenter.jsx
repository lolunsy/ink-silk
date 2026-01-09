// Phase 3.1: 角色定妆与签约中心（独立组件）
// 从 CharacterLab.jsx 拆分，保持业务规则不变

import React, { useState, useEffect } from 'react';
import { X, FileText, Brain, UserCircle2, GripHorizontal, Wand2, Palette, Loader2, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, Download, Heart, ImageIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { saveAs } from 'file-saver';

// === 配置常量 ===
const MAX_HISTORY = 5; // 历史版本上限

// === 工具函数：历史裁剪时保留锁定版本 ===
const limitHistoryKeepFinal = (history, max) => {
    if (!history || history.length === 0) return [];
    if (history.length <= max) return history;
    
    const finalItem = history.find(item => item.isFinal === true);
    
    if (finalItem) {
        const otherItems = history.filter(item => item.isFinal !== true);
        const recentOthers = otherItems.length > (max - 1) 
            ? otherItems.slice(-(max - 1)) 
            : otherItems;
        
        const combined = [...recentOthers, finalItem];
        combined.sort((a, b) => {
            const aIdx = history.indexOf(a);
            const bIdx = history.indexOf(b);
            return aIdx - bIdx;
        });
        
        return combined;
    } else {
        return history.slice(-max);
    }
};

// === 工具函数：获取锁定或最新版本 ===
const getFinalOrLatest = (history) => {
    if (!history || history.length === 0) return null;
    const finalItem = history.find(item => item.isFinal === true);
    return finalItem || history[history.length - 1];
};

// === 工具函数：Blob URL 转 Base64 ===
const blobUrlToBase64 = async (blobUrl) => {
    if (!blobUrl || !blobUrl.startsWith('blob:')) return blobUrl;
    try {
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("blobUrlToBase64 failed:", e);
        return blobUrl;
    }
};

// === 工具函数：强制文本 ===
const forceText = (val) => (val && typeof val === 'string') ? val : '';

// === 内部组件：媒体预览 ===
const MediaPreview = ({ history, idx, setIdx, onGen, label, onPreview }) => {
    const current = history[idx] || {};
    const max = history.length - 1;
    
    // 设置锁定版本
    const setFinalVersion = (targetIdx) => {
        // 这里不直接修改 history，而是通过回调通知父组件
        if (onGen.setFinal) {
            onGen.setFinal(targetIdx);
        }
    };
    
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
                    <img src={current.url} className="w-full h-full object-contain cursor-zoom-in" onClick={()=>onPreview(current.url)}/>
                    <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={()=>saveAs(current.url, `${label}.png`)} className="p-1.5 bg-black/60 text-white rounded hover:bg-blue-600"><Download size={14}/></button>
                        <button onClick={onGen} className="p-1.5 bg-black/60 text-white rounded hover:bg-green-600"><RefreshCw size={14}/></button>
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

// === 主组件：签约中心 ===
export const ContractCenter = ({ 
    isOpen, 
    onClose, 
    targetLang = "Chinese",
    referenceImage = null,
    clImages = {},
    description = "",
    callApi,
    onRegisterActor,
    onPreview
}) => {
    // 状态管理
    const [sheetParams, setSheetParams] = useState({ 
        name: "", 
        voice: "", 
        visual_head: "", 
        visual_upper: "", 
        visual_lower: "", 
        visual_access: "", 
        style: "" 
    });
    const [suggestedVoices, setSuggestedVoices] = useState([]);
    const [isRegeneratingVoices, setIsRegeneratingVoices] = useState(false);
    const [selectedRefIndices, setSelectedRefIndices] = useState([]);
    const [sheetConsistency, setSheetConsistency] = useState(1.0);
    
    const [genStatus, setGenStatus] = useState('idle'); // 'idle' | 'analyzing' | 'gen_portrait' | 'gen_sheet'
    const [portraitHistory, setPortraitHistory] = useState([]);
    const [sheetHistory, setSheetHistory] = useState([]);
    const [portraitIdx, setPortraitIdx] = useState(0);
    const [sheetIdx, setSheetIdx] = useState(0);

    // === Phase 3.1: 签约中心打开时自动触发分析 ===
    useEffect(() => {
        if (isOpen) {
            // 重置状态
            setGenStatus('analyzing');
            setPortraitHistory([]);
            setSheetHistory([]);
            setSelectedRefIndices([]);
            setSuggestedVoices([]);
            setSheetConsistency(1.0);
            setSheetParams({ 
                name: "", 
                voice: "", 
                visual_head: "", 
                visual_upper: "", 
                visual_lower: "", 
                visual_access: "", 
                style: "" 
            });
            
            // 异步分析
            performAutoAnalysis();
        }
    }, [isOpen]); // 每次打开时重新分析

    // === 智能选择分析素材（4视角降级策略）===
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
        
        // 降级策略 4: 什么都没有 -> 返回 null（调用方会阻断）
        return null;
    };

    // === 获取用户选中的素材 ===
    const getGenerationAssets = async () => {
        if (selectedRefIndices.length === 0) { 
            return referenceImage ? [await blobUrlToBase64(referenceImage)] : null; 
        }
        
        const assets = selectedRefIndices.map(idx => {
            const history = clImages[idx];
            const finalOrLatest = getFinalOrLatest(history);
            return finalOrLatest?.url;
        }).filter(url => url && typeof url === 'string');
        
        if (assets.length === 0) return null;
        return Promise.all(assets.map(url => blobUrlToBase64(url)));
    };

    // === 自动分析角色特征 ===
    const performAutoAnalysis = async () => {
        try {
            const assets = await chooseAnalysisAssets();
            
            if (!assets && !description) {
                alert("未找到可用素材，请先上传参考图或生成视角图");
                setGenStatus('idle');
                onClose(); // 关闭 Modal
                return;
            }
            
            const langInstruction = targetLang === "Chinese" ? "Language: Simplified Chinese." : "Language: English.";
            
            // Phase 2.7: 强化 system prompt - style 禁止环境词，voice_tags 必须中文
            const system = `Role: Art Director & Character Designer (Master Level).
Task: Deep-analyze character visuals with professional precision.
Requirements:
1. Describe EVERY detail (face, hair, outfit, accessories, weapons).
2. NO lazy words like "standard", "normal", "typical" - be SPECIFIC.
3. NO cached/template responses - analyze THIS character uniquely.
4. "style" field MUST ONLY contain: art style, rendering technique, texture quality (e.g. "realistic photography", "cinematic", "anime 2D", "3D rendering", "hand-drawn sketch", "cyberpunk realistic").
5. "style" field MUST NOT contain: environment, background, scene, lighting scenario, weather, time of day (禁止：雨夜、城市、霓虹、背景、光影场景).
6. "voice_tags" MUST be in Simplified Chinese (e.g. ["低沉磁性", "少年感", "御姐音", "沙哑烟嗓"]).
7. Output strict JSON with keys: visual_head, visual_upper, visual_lower, visual_access, style, voice_tags.
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
            setSuggestedVoices(Array.isArray(d.voice_tags) ? d.voice_tags : ["标准声线"]);
        } catch(e) {
            console.error("Analysis failed:", e);
            alert("自动分析失败：" + e.message);
        } finally { 
            setGenStatus('idle'); 
        }
    };

    // === 重新生成声线标签 ===
    const handleRegenVoices = async () => {
        setIsRegeneratingVoices(true);
        try {
            const assets = await chooseAnalysisAssets();
            const res = await callApi('analysis', { 
                system: `Role: 声音导演 (Voice Director)。
Task: 根据角色外观和风格，推导 3-5 个具体的声线特征标签。
Requirements:
1. 输出必须是简体中文（例如：低沉磁性、少年感、御姐音、沙哑烟嗓、清脆明快、成熟稳重）。
2. 禁止使用英文或通用词（如 "Standard", "Normal"）。
3. 返回 JSON 格式：{ "voice_tags": ["标签1", "标签2", "标签3"] }`, 
                user: "基于角色的外观特征和艺术风格，推导声线标签（中文）：", 
                assets 
            });
            const data = JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] || "{}");
            if(data.voice_tags) setSuggestedVoices(data.voice_tags);
        } catch(e) {
            console.error("Regenerate voices failed:", e);
        } finally { 
            setIsRegeneratingVoices(false); 
        }
    };

    // === 素材选择与声线标签切换 ===
    const toggleRefSelection = (idx) => {
        setSelectedRefIndices(prev => {
            if (prev.includes(idx)) return prev.filter(i => i !== idx);
            if (prev.length >= 5) {
                alert("最多只能选择 5 张参考图");
                return prev;
            }
            return [...prev, idx];
        });
    };

    const toggleVoiceTag = (tag) => {
        setSheetParams(p => ({
            ...p,
            voice: p.voice.includes(tag) 
                ? p.voice.replace(tag, '').replace(',,', ',') 
                : p.voice ? p.voice + ', ' + tag : tag
        }));
    };

    // === buildSheetPrompt（唯一入口，强制三栏结构）===
    const buildSheetPrompt = (params, lang) => {
        // 清洗 style 字段中的环境词
        const cleanStyle = (styleText) => {
            if (!styleText) return styleText;
            const envKeywords = ['雨夜', '城市', '霓虹', '背景', '街道', '环境', '场景', '光影', '日落', '黎明', '月光', 
                                 'rainy night', 'city', 'neon', 'background', 'street', 'environment', 'scene', 
                                 'lighting', 'sunset', 'dawn', 'moonlight', 'urban', 'outdoor', 'indoor'];
            let cleaned = styleText;
            envKeywords.forEach(keyword => {
                const regex = new RegExp(keyword, 'gi');
                cleaned = cleaned.replace(regex, '');
            });
            return cleaned.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
        };
        
        const cleanedStyle = cleanStyle(forceText(params.style));
        const head = forceText(params.visual_head);
        const upper = forceText(params.visual_upper);
        const lower = forceText(params.visual_lower);
        const access = params.visual_access ? forceText(params.visual_access) : "";
        
        if (lang === "English") {
            return `Professional character reference sheet on pure white background. Layout: LEFT COLUMN: 3-view turnaround (front/side/back full body). CENTER COLUMN: 4 facial expressions (neutral/smile/angry/surprise, front facing only). RIGHT COLUMN: Detailed anatomy breakdown (hands, hair detail, outfit textures, accessories closeup). Character: ${head}, wearing ${upper}, ${lower}${access ? `, carrying/wearing: ${access}` : ""}. Art style: ${cleanedStyle}. Pure white background, NO scene elements, studio lighting, ultra-high detail.`;
        } else {
            return `专业角色设定图，纯白背景。布局：【左栏】三视图（正面全身/侧面全身/背面全身）。【中栏】四表情（正面：中性/微笑/愤怒/惊讶）。【右栏】细节拆解（手部特写/发型细节/服装材质/配饰特写）。角色特征：${head}，穿着${upper}，${lower}${access ? `，携带/佩戴：${access}` : ""}。艺术风格：${cleanedStyle}。纯白背景，无场景元素，摄影棚光照，超高细节。`;
        }
    };

    // === 生成定妆照 ===
    const handleGenPortrait = async () => {
        if (genStatus !== 'idle') return;
        setGenStatus('gen_portrait');
        
        setPortraitHistory(prev => {
            const newItem = { loading: true, isFinal: false };
            const newHistory = limitHistoryKeepFinal([...prev, newItem], MAX_HISTORY);
            setPortraitIdx(newHistory.length - 1);
            return newHistory;
        });
        
        try {
            const finalRefs = await getGenerationAssets();
            
            // 定妆照强约束（极高细节、纯背景、禁止环境）
            const accessDesc = sheetParams.visual_access ? `, wearing/carrying: ${forceText(sheetParams.visual_access)}` : "";
            
            let portraitPrompt;
            if (targetLang === "English") {
                portraitPrompt = `Professional headshot portrait, half-body framing, front facing. Character: ${forceText(sheetParams.visual_head)}, wearing ${forceText(sheetParams.visual_upper)}${accessDesc}. Art style: ${forceText(sheetParams.style)}. Pure solid color background (no gradient), studio lighting, ultra-high detail, 8K resolution. NO environment, NO scene, NO text, NO watermark.`;
            } else {
                portraitPrompt = `专业定妆照，半身构图，正面视角。角色特征：${forceText(sheetParams.visual_head)}，穿着${forceText(sheetParams.visual_upper)}${accessDesc}。艺术风格：${forceText(sheetParams.style)}。纯色背景（无渐变），摄影棚光照，超高细节，8K 分辨率。禁止环境、场景、文字、水印。`;
            }
            
            const url = await callApi('image', { 
                prompt: portraitPrompt + ` (ActionID: ${Date.now()})`, 
                aspectRatio: "3:4", 
                useImg2Img: !!finalRefs, 
                refImages: finalRefs, 
                strength: finalRefs ? sheetConsistency : 0.65 
            });
            
            setPortraitHistory(prev => {
                const n = [...prev];
                n[n.length - 1] = { url, loading: false, isFinal: false };
                return n;
            });
        } catch(e) {
            setPortraitHistory(prev => {
                const n = [...prev];
                n[n.length - 1] = { error: e.message, loading: false, isFinal: false };
                return n;
            });
        } finally {
            setGenStatus('idle');
        }
    };

    // === 生成设定图 ===
    const handleGenSheet = async () => {
        if (genStatus !== 'idle') return;
        setGenStatus('gen_sheet');
        
        setSheetHistory(prev => {
            const newItem = { loading: true, isFinal: false };
            const n = limitHistoryKeepFinal([...prev, newItem], MAX_HISTORY);
            setSheetIdx(n.length - 1);
            return n;
        });
        
        try {
            const finalRefs = await getGenerationAssets();
            
            // 使用唯一 buildSheetPrompt 入口（强制三栏结构，style 清洗环境词）
            const sheetPrompt = buildSheetPrompt(sheetParams, targetLang) + ` (ActionID: ${Date.now()})`;
            
            const url = await callApi('image', { 
                prompt: sheetPrompt, 
                aspectRatio: "16:9", 
                useImg2Img: !!finalRefs, 
                refImages: finalRefs, 
                strength: finalRefs ? sheetConsistency : 0.65 
            });
            
            setSheetHistory(prev => {
                const n = [...prev];
                n[n.length - 1] = { url, loading: false, isFinal: false };
                return n;
            });
        } catch(e) {
            setSheetHistory(prev => {
                const n = [...prev];
                n[n.length - 1] = { error: e.message, loading: false, isFinal: false };
                return n;
            });
        } finally {
            setGenStatus('idle');
        }
    };

    // === 一键生成定妆照 & 设定图 ===
    const handleGenAll = async () => {
        if (!sheetParams.visual_head) return alert("请先等待分析");
        if (genStatus !== 'idle') return;
        
        try {
            alert("即将开始生成：先生成定妆照，完成后请手动点击生成设定图，或再次点击此按钮。");
            await handleGenPortrait();
        } catch(e) {
            setGenStatus('idle');
        }
    };

    // === 确认签约并保存演员 ===
    const handleRegister = async () => {
        const p = portraitHistory[portraitIdx];
        const s = sheetHistory[sheetIdx];
        
        // 错误检查：必须有定妆照和设定图
        if (!p?.url || !s?.url) {
            return alert("请先生成并确认定妆照与设定图");
        }
        
        // 转换 blob URL 为 base64
        try {
            const portraitBase64 = await blobUrlToBase64(p.url);
            const sheetBase64 = await blobUrlToBase64(s.url);
            
            if (!portraitBase64 || !sheetBase64) {
                return alert("图片转换失败，请重试");
            }
            
            // 构建演员对象（ActorPackage v1）
            const newActor = {
                version: "actorpkg-v1",
                id: crypto.randomUUID(),
                name: sheetParams.name || "未命名演员",
                voice_tone: sheetParams.voice || "标准音色",
                desc: `${sheetParams.visual_head}. ${sheetParams.visual_upper}. ${sheetParams.visual_lower}. ${sheetParams.visual_access}. Style: ${sheetParams.style}`,
                images: {
                    portrait: portraitBase64,
                    sheet: sheetBase64
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // 调用回调保存演员
            onRegisterActor(newActor);
            
            alert("✅ 签约成功！演员已加入演员库");
            onClose();
        } catch (error) {
            console.error("Register actor failed:", error);
            alert("签约失败：" + error.message);
        }
    };

    // 如果未打开，不渲染
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-purple-500/30 w-full max-w-6xl h-[85vh] max-h-[800px] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e=>e.stopPropagation()}>
                {/* Header */}
                <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950 shrink-0">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <FileText className="text-purple-400" size={18}/>
                        角色定妆与签约中心
                    </h3>
                    <button onClick={onClose}>
                        <X size={18} className="text-slate-500 hover:text-white"/>
                    </button>
                </div>
                
                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: 参数编辑 */}
                    <div className="w-80 border-r border-slate-800 p-5 bg-slate-900/50 flex flex-col overflow-y-auto scrollbar-thin">
                        {genStatus === 'analyzing' ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-purple-400">
                                <Brain className="animate-pulse" size={48}/>
                                <p className="text-xs text-center px-4 leading-relaxed">
                                    AI 正在综合多图分析角色特征 (Auto-Analyze)...
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in slide-in-from-left-4">
                                {/* 角色真名 */}
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase">角色真名</label>
                                    <input 
                                        value={sheetParams.name} 
                                        onChange={e=>setSheetParams({...sheetParams, name:e.target.value})} 
                                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-bold" 
                                        placeholder="例如：Neo"
                                    />
                                </div>
                                
                                {/* 声线 */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">声线 (AI推导)</label>
                                        <button 
                                            onClick={handleRegenVoices} 
                                            disabled={isRegeneratingVoices} 
                                            className="text-[10px] text-purple-400 hover:text-white flex gap-1 items-center"
                                        >
                                            {isRegeneratingVoices ? <Loader2 size={10} className="animate-spin"/> : <RefreshCw size={10}/>}
                                            重组
                                        </button>
                                    </div>
                                    <input 
                                        value={sheetParams.voice} 
                                        onChange={e=>setSheetParams({...sheetParams, voice:e.target.value})} 
                                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" 
                                        placeholder="点击下方标签或输入"
                                    />
                                    <div className="flex flex-wrap gap-1.5">
                                        {suggestedVoices.map(tag => (
                                            <button 
                                                key={tag} 
                                                onClick={()=>toggleVoiceTag(tag)} 
                                                className={cn(
                                                    "px-2 py-0.5 border text-[10px] rounded-full transition-colors",
                                                    sheetParams.voice.includes(tag) 
                                                        ? "bg-purple-600 border-purple-500 text-white" 
                                                        : "bg-purple-900/30 border-purple-800 text-purple-200 hover:bg-purple-800"
                                                )}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                {/* 视觉描述字段 */}
                                <div className="grid grid-cols-1 gap-3 pt-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1">
                                            <Brain size={10}/> 头部 / 五官 / 发型
                                        </label>
                                        <textarea 
                                            value={sheetParams.visual_head} 
                                            onChange={e=>setSheetParams({...sheetParams, visual_head:e.target.value})} 
                                            className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1">
                                            <UserCircle2 size={10}/> 上身穿着
                                        </label>
                                        <textarea 
                                            value={sheetParams.visual_upper} 
                                            onChange={e=>setSheetParams({...sheetParams, visual_upper:e.target.value})} 
                                            className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-1">
                                            <GripHorizontal size={10}/> 下身 / 鞋子 (AI脑补)
                                        </label>
                                        <textarea 
                                            value={sheetParams.visual_lower} 
                                            onChange={e=>setSheetParams({...sheetParams, visual_lower:e.target.value})} 
                                            className="w-full h-16 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-green-400 font-bold uppercase flex items-center gap-1">
                                            <Wand2 size={10}/> 随身道具 / 武器
                                        </label>
                                        <textarea 
                                            value={sheetParams.visual_access} 
                                            onChange={e=>setSheetParams({...sheetParams, visual_access:e.target.value})} 
                                            className="w-full h-12 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-green-500" 
                                            placeholder="例如：持激光剑、背包、眼镜"
                                        />
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-pink-400 font-bold uppercase flex items-center gap-1">
                                            <Palette size={10}/> 艺术风格 (真实检测)
                                        </label>
                                        <textarea 
                                            value={sheetParams.style} 
                                            onChange={e=>setSheetParams({...sheetParams, style:e.target.value})} 
                                            className="w-full h-12 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-300 resize-none outline-none focus:border-pink-500"
                                        />
                                    </div>
                                </div>
                                
                                {/* 参考素材选择 */}
                                <div className="pt-2 border-t border-slate-800">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] text-slate-400 font-bold">参考素材 (手动干预, Max 5)</label>
                                        <span className="text-[9px] text-green-400">Consistency: {sheetConsistency}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0.1" 
                                        max="1.0" 
                                        step="0.05" 
                                        value={sheetConsistency} 
                                        onChange={(e) => setSheetConsistency(e.target.value)} 
                                        className="w-full h-1 bg-slate-700 rounded-lg accent-green-500 cursor-pointer mb-2"
                                    />
                                    <div className="grid grid-cols-3 gap-2 max-h-24 overflow-y-auto scrollbar-none">
                                        {Object.entries(clImages).map(([idx, hist]) => {
                                            // Phase 3.1: 使用锁定版本或最新版本（与生成逻辑一致）
                                            const img = hist && hist.length > 0 ? getFinalOrLatest(hist) : null;
                                            if (!img || !img.url) return null;
                                            const isSelected = selectedRefIndices.includes(parseInt(idx));
                                            return (
                                                <div 
                                                    key={idx} 
                                                    onClick={() => toggleRefSelection(parseInt(idx))} 
                                                    className={cn(
                                                        "aspect-square rounded border-2 overflow-hidden relative cursor-pointer transition-all",
                                                        isSelected 
                                                            ? "border-green-500 opacity-100" 
                                                            : "border-transparent opacity-40 hover:opacity-100"
                                                    )}
                                                >
                                                    <img src={img.url} className="w-full h-full object-cover"/>
                                                    {isSelected && (
                                                        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                                                            <CheckCircle2 size={16} className="text-white"/>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Right Panel: 图片生成与预览 */}
                    <div className="flex-1 p-6 bg-black flex flex-col min-w-0">
                        <div className="flex gap-6 h-[500px] min-h-0 mb-4 shrink-0">
                            {/* 定妆照 */}
                            <div className="w-1/3 h-full">
                                <MediaPreview 
                                    label="核心定妆照 (Half-Body)" 
                                    history={portraitHistory} 
                                    idx={portraitIdx} 
                                    setIdx={setPortraitIdx} 
                                    onGen={handleGenPortrait} 
                                    onPreview={onPreview}
                                />
                            </div>
                            
                            {/* 设定图 */}
                            <div className="flex-1 h-full">
                                <MediaPreview 
                                    label="角色设定图 (Sheet)" 
                                    history={sheetHistory} 
                                    idx={sheetIdx} 
                                    setIdx={setSheetIdx} 
                                    onGen={handleGenSheet} 
                                    onPreview={onPreview}
                                />
                            </div>
                        </div>
                        
                        {/* 操作按钮 */}
                        <div className="h-16 shrink-0 flex gap-4 items-center justify-end border-t border-slate-800 pt-4">
                            <button 
                                onClick={handleGenAll} 
                                disabled={genStatus !== 'idle'} 
                                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg h-12 font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
                            >
                                {genStatus !== 'idle' ? <Loader2 className="animate-spin"/> : <Wand2 size={18}/>}
                                <span>✨ 一键制作定妆照 & 设定图</span>
                            </button>
                            
                            {portraitHistory[portraitIdx]?.url && sheetHistory[sheetIdx]?.url && (
                                <button 
                                    onClick={handleRegister} 
                                    className="w-64 bg-green-600 hover:bg-green-500 text-white rounded-lg h-12 font-bold shadow-lg flex items-center justify-center gap-2 animate-in slide-in-from-right-4"
                                >
                                    <CheckCircle2 size={18}/>
                                    确认签约 (Register)
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* Phase 3.1 签约中心独立组件说明：
 * 
 * 本组件从 CharacterLab.jsx 拆分而来，包含完整的角色定妆与签约逻辑。
 * 
 * 保持的业务规则（不变）：
 * 1. ✅ buildSheetPrompt 唯一入口（强制三栏结构，清洗 style 环境词）
 * 2. ✅ 定妆照纯背景规则（只在签约中心生效）
 * 3. ✅ 4视角降级策略（正面全身 > 面部特写 > 侧面 > 背面）
 * 4. ✅ 历史版本限制（MAX_HISTORY = 5）
 * 5. ✅ 锁定机制（❤️ isFinal，保留在历史中）
 * 6. ✅ voice_tags 必须中文
 * 7. ✅ 每次打开签约中心重新分析（不缓存）
 * 
 * 组件职责：
 * - 输入：targetLang, referenceImage, clImages, description, callApi, onRegisterActor, onPreview
 * - 输出：通过 onRegisterActor 回调保存演员对象（ActorPackage v1）
 * - UI：完整的签约中心 Modal，包含参数编辑、图片生成、历史回溯
 * 
 * CharacterLab.jsx 只需：
 * - 保留"制作设定卡&签约"按钮
 * - 准备传入数据（clImages, referenceImage, targetLang, description）
 * - 接收 onRegisterActor 回调，调用 setActors(prev => [...prev, actor])
 */

