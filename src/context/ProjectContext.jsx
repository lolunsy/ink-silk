import React, { useState, useEffect, useContext, createContext } from 'react';

// --- 1. 全局项目上下文 (Project Context - V6.0) ---
const ProjectContext = createContext();

export const useProject = () => {
  return useContext(ProjectContext);
};

export const ProjectProvider = ({ children }) => {
  // 核心工具：安全 JSON 解析
  const safeJsonParse = (key, fallback) => {
    try {
      const item = localStorage.getItem(key);
      if (item) {
        return JSON.parse(item);
      }
      return fallback;
    } catch (e) {
      console.warn(`Data corrupted for ${key}, using default.`);
      return fallback;
    }
  };

  // 核心工具：Base64 转 Blob URL
  const base64ToBlobUrl = (base64, type = 'image/png') => {
    if (!base64 || typeof base64 !== 'string') {
        return null;
    }
    if (base64.startsWith('http') || base64.startsWith('blob:')) {
        return base64;
    }
    try {
      const clean = base64.includes(',') ? base64.split(',')[1] : base64;
      const byteCharacters = atob(clean);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn("Blob conversion failed, using raw base64 (Low Perf)", e);
      return base64;
    }
  };

  // 核心工具：Blob 转 Base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // 核心工具：智能图片压缩器
  const compressImage = (base64Str, maxWidth = 1024) => {
    return new Promise((resolve) => {
      if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image')) {
        resolve(base64Str);
        return;
      }
      const timer = setTimeout(() => {
          console.warn("Image compression timed out, sending original.");
          resolve(base64Str);
      }, 3000);

      const img = new Image();
      img.src = base64Str;
      
      img.onload = () => {
        clearTimeout(timer);
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressedData = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressedData);
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(base64Str);
      };
    });
  };

  // A. 配置中心
  const [config, setConfig] = useState(() => {
    const v3 = safeJsonParse('app_config_v3', null);
    if (v3) {
        return v3;
    }
    return {
      analysis: { baseUrl: '', key: '', model: 'gemini-2.0-flash-exp' },
      image: { baseUrl: '', key: '', model: 'nanobanana-2-pro' },
      video: { baseUrl: '', key: '', model: 'kling-v1.6' },
      audio: { baseUrl: '', key: '', model: 'tts-1' }
    };
  });

  const [availableModels, setAvailableModels] = useState([]); 
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // B. 核心资产数据 
  const [script, setScript] = useState(() => localStorage.getItem('sb_script') || "");
  const [direction, setDirection] = useState(() => localStorage.getItem('sb_direction') || "");
  const [clPrompts, setClPrompts] = useState(() => safeJsonParse('cl_prompts', []));
  const [clImages, setClImages] = useState({}); 
  const [shots, setShots] = useState(() => safeJsonParse('sb_shots', []));
  const [shotImages, setShotImages] = useState({}); 
  const [timeline, setTimeline] = useState(() => safeJsonParse('studio_timeline', []));
  const [actors, setActors] = useState(() => safeJsonParse('studio_actors_v2', []));
  const [scenes, setScenes] = useState(() => safeJsonParse('sb_scenes', []));

  // C. 智能持久化
  const safeSetItem = (key, value) => {
      try {
          const str = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, str);
      } catch (e) {
          console.warn(`Storage Limit Exceeded for ${key}. Data kept in memory only.`);
      }
  };

  useEffect(() => { safeSetItem('app_config_v3', config); }, [config]);
  useEffect(() => { safeSetItem('sb_script', script); }, [script]);
  useEffect(() => { safeSetItem('sb_direction', direction); }, [direction]);
  useEffect(() => { safeSetItem('cl_prompts', clPrompts); }, [clPrompts]);
  useEffect(() => { safeSetItem('sb_shots', shots); }, [shots]);
  useEffect(() => { safeSetItem('studio_timeline', timeline); }, [timeline]);
  useEffect(() => { safeSetItem('studio_actors_v2', actors); }, [actors]);
  useEffect(() => { safeSetItem('sb_scenes', scenes); }, [scenes]);

  const fetchModels = async (type) => {
    const { baseUrl, key } = config[type];
    if (!baseUrl || !key) {
        return alert(`请先在设置中配置 [${type}] 的 Base URL 和 API Key`);
    }
    setIsLoadingModels(true); 
    setAvailableModels([]);
    try {
      let found = [];
      try { 
        const r = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } }); 
        const d = await r.json(); 
        if (d.data) found = d.data.map(m => m.id);
      } catch(e) {}
      
      if (!found.length && baseUrl.includes('google')) { 
        const r = await fetch(`${baseUrl}/v1beta/models?key=${key}`); 
        const d = await r.json(); 
        if (d.models) found = d.models.map(m => m.name.replace('models/', ''));
      }
      
      if (found.length) { 
          setAvailableModels([...new Set(found)].sort()); 
          alert(`成功获取 ${found.length} 个模型`); 
      } else { 
          alert("连接成功，但未自动获取到模型列表。"); 
      }
    } catch(e) { alert("连接失败: " + e.message); } finally { setIsLoadingModels(false); }
  };

  const assembleSoraPrompt = (targetShots, globalStyle, assignedActorId) => {
    const styleHeader = `\n# Global Context\nStyle: ${globalStyle || "Cinematic, high fidelity, 8k resolution"}.`;
    let actorContext = "";
    let mainActor = null;
    if (assignedActorId) {
        mainActor = actors.find(a => a.id.toString() === assignedActorId.toString());
        if (mainActor) {
            actorContext = `\nCharacter: ${mainActor.desc || mainActor.name}. (Maintain consistency).`;
        }
    }
    let currentTime = 0;
    const scriptBody = targetShots.map((s, idx) => {
        let dur = 5; 
        if (s.duration && s.duration.match(/\d+/)) dur = parseInt(s.duration.match(/\d+/)[0]);
        if (s.duration && s.duration.includes('ms')) dur = dur / 1000;
        const start = currentTime; const end = currentTime + dur;
        currentTime = end;
        let action = s.visual || s.sora_prompt;
        if (mainActor && !action.toLowerCase().includes('character') && !action.toLowerCase().includes(mainActor.name.toLowerCase())) {
            action = `(Character) ${action}`;
        }
        const camera = s.camera_movement ? ` Camera: ${s.camera_movement}.` : "";
        const audio = s.audio ? (s.audio.includes('"') ? ` [Dialogue: "${s.audio}"]` : ` [SFX: ${s.audio}]`) : "";
        return `[${start}s-${end}s] Shot ${idx+1}: ${action}.${camera}${audio}`;
    }).join("\nCUT TO:\n");
    const finalDuration = Math.ceil(currentTime / 5) * 5; 
    const specs = `\n\n# Technical Specs\n--duration ${finalDuration}s --quality high`;
    return {
        prompt: `${styleHeader}${actorContext}\n\n# Timeline Script\n${scriptBody}${specs}`,
        duration: finalDuration,
        actorRef: mainActor ? (mainActor.images?.portrait || mainActor.images?.sheet) : null 
    };
  };

  const sanitizePrompt = (text) => text ? text.replace(/[\{\}\[\]"]/g, "").trim() : "";

  // --- 关键升级：callApi 支持多图数组 ---
  const callApi = async (type, payload) => {
    const { baseUrl, key, model: configModel } = config[type];
    const activeModel = payload.model || configModel; 
    if (!baseUrl || !key) throw new Error(`请先在设置中配置 [${type}] 的 Base URL 和 API Key`);

    const fetchWithTimeout = async (url, options, timeout = 120000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw new Error(error.name === 'AbortError' ? 'API 请求超时 (120秒)' : error.message);
        }
    };

    // 1. 文本分析 (LLM) - 支持单图(asset) 和 多图(assets)
    if (type === 'analysis') {
        const { system, user, asset, assets } = payload;
        
        // 准备图片列表 (Unified Image List)
        let imagesToProcess = [];
        if (assets && Array.isArray(assets)) {
            imagesToProcess = assets; // 已经是数组
        } else if (asset) {
            imagesToProcess = [asset]; // 单图转数组
        }

        // Google Native Format
        if (baseUrl.includes('google') && !baseUrl.includes('openai') && !baseUrl.includes('v1')) {
            const parts = [{ text: system + "\n" + user }];
            // 遍历并添加多张图片
            imagesToProcess.forEach(imgData => {
                if (typeof imgData === 'string' && imgData.includes(';base64,')) {
                    const partsSplit = imgData.split(';base64,');
                    const mimeType = partsSplit[0].split(':')[1];
                    const base64Data = partsSplit[1];
                    parts.push({ inlineData: { mimeType, data: base64Data } });
                }
            });
            
            let targetModel = activeModel;
            if (payload.useFallback && activeModel.includes('2.0')) targetModel = 'gemini-1.5-flash';

            const r = await fetchWithTimeout(`${baseUrl}/v1beta/models/${targetModel}:generateContent?key=${key}`, { 
              method: 'POST', 
              headers: {'Content-Type': 'application/json'}, 
              body: JSON.stringify({ contents: [{ parts }] }) 
            });
            if (!r.ok) {
              const err = await r.json();
              throw new Error(err.error?.message || "Analysis API Error");
            }
            return (await r.json()).candidates[0].content.parts[0].text;
        }

        // OpenAI Compatible Format
        const content = [{ type: "text", text: user }];
        // 遍历并添加多张图片
        imagesToProcess.forEach(imgData => {
             if (typeof imgData === 'string' && imgData.includes(';base64,')) {
                 content.push({ type: "image_url", image_url: { url: imgData } });
             }
        });
        
        const r = await fetchWithTimeout(`${baseUrl}/v1/chat/completions`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
          body: JSON.stringify({
            model: activeModel,
            messages: [
              { role: "system", content: system },
              { role: "user", content: content }
            ]
          }) 
        });
        
        if (!r.ok) {
           try { const err = await r.json(); throw new Error(err.error?.message || "LLM API Error"); } 
           catch (e) { throw new Error(`LLM API Failed: ${r.status} ${r.statusText}`); }
        }
        return (await r.json()).choices[0].message.content;
    }

    // 2. 绘图 (Image)
    if (type === 'image') {
        let { prompt, aspectRatio, useImg2Img, refImg, refImages, strength, actorId } = payload;
        
        if (useImg2Img) {
            const hasSingle = refImg && refImg.length > 100;
            const hasMulti = refImages && refImages.length > 0;
            if (!hasSingle && !hasMulti) {
                console.warn("⚠️ 检测到未上传参考图，已自动降级为纯文字生成模式。");
                useImg2Img = false;
            }
        }

        let finalPrompt = prompt;
        if (actorId) {
            const actor = actors.find(a => a.id.toString() === actorId.toString());
            if (actor) {
                finalPrompt = `(Character: ${actor.desc}), ${finalPrompt}`;
                if (!refImg && !refImages && actor.images?.portrait) {
                    refImg = actor.images.portrait;
                    useImg2Img = true;
                    if (!strength) strength = 0.65; 
                }
            }
        }
        finalPrompt = sanitizePrompt(finalPrompt);

        let size = "1024x1024";
        if (aspectRatio === "16:9") size = "1280x720";
        else if (aspectRatio === "9:16") size = "720x1280";
        else if (aspectRatio === "2.35:1") size = "1536x640"; 
        else if (aspectRatio === "3:4") size = "768x1024";
        else if (aspectRatio === "1:1") size = "1024x1024";
        
        const body = { model: activeModel, prompt: finalPrompt, n: 1, size };
        const cleanBase64 = (str) => str && str.includes('base64,') ? str.split('base64,')[1] : str;

        const performRequest = async (requestBody) => {
            const r = await fetchWithTimeout(`${baseUrl}/v1/images/generations`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
                body: JSON.stringify(requestBody) 
            });
            if (!r.ok) {
                try { const d = await r.json(); throw new Error(d.error?.message || "Image Generation Failed"); } 
                catch (e) { throw new Error(`Image API Error: Status ${r.status}`); }
            }
            const d = await r.json();
            if (d.data && d.data.length > 0) {
                const rawUrl = d.data[0].url;
                if (rawUrl.startsWith('http')) return rawUrl;
                return base64ToBlobUrl(d.data[0].b64_json || rawUrl);
            }
            throw new Error("API returned empty data");
        };

        if (useImg2Img) {
            body.strength = parseFloat(strength || 0.7);
            if (refImages && Array.isArray(refImages) && refImages.length > 0) {
                try {
                    const compressedImages = await Promise.all(refImages.map(img => compressImage(img)));
                    const cleanArr = compressedImages.map(cleanBase64).filter(Boolean);
                    if (cleanArr.length > 0) {
                        body.image = cleanArr[0]; 
                        body.images = cleanArr;   
                        return await performRequest(body);
                    }
                } catch (e) {
                    const fallbackImg = await compressImage(refImages[0]);
                    body.image = cleanBase64(fallbackImg);
                    delete body.images;
                    return await performRequest(body);
                }
            } else if (refImg) {
                const compressedImg = await compressImage(refImg);
                body.image = cleanBase64(compressedImg);
                return await performRequest(body);
            }
        }
        return await performRequest(body);
    }

    if (type === 'audio') {
        let { input, voice, speed, actorId } = payload;
        if (actorId && !voice) {
            const actor = actors.find(a => a.id.toString() === actorId.toString());
            if (actor?.voice_tone) {
                const tone = actor.voice_tone.toLowerCase();
                if (tone.includes('male')) voice = 'onyx';
                else if (tone.includes('female')) voice = 'nova';
            }
        }
        const r = await fetchWithTimeout(`${baseUrl}/v1/audio/speech`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: activeModel, input, voice: voice || 'alloy', speed: speed || 1.0 })
        });
        if (!r.ok) throw new Error(`TTS API Error: ${r.status}`);
        return await blobToBase64(await r.blob());
    }

    if (type === 'sfx') {
        const { prompt, duration } = payload;
        const isEleven = baseUrl.includes('elevenlabs');
        const endpoint = isEleven ? '/v1/sound-generation' : '/v1/audio/sound-effects'; 
        const body = { text: prompt, duration_seconds: duration || 5, prompt_influence: 0.3 };
        if (!isEleven) body.model = activeModel || 'eleven-sound-effects';
        const r = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error("SFX Error");
        return await blobToBase64(await r.blob());
    }

    if (type === 'video') {
        const { prompt, startImg, duration, aspectRatio } = payload; 
        let optimizedStartImg = startImg;
        if (startImg && startImg.length > 500000) optimizedStartImg = await compressImage(startImg, 1024);
        const body = { model: activeModel, prompt: prompt, image: optimizedStartImg, duration: duration || 5, aspectRatio: aspectRatio || "16:9", size: "1080p" };
        const submitRes = await fetchWithTimeout(`${baseUrl}/v1/videos/generations`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        if (!submitRes.ok) throw new Error(`Video API Error: ${submitRes.status}`);
        const submitData = await submitRes.json();
        const taskId = submitData.id || submitData.data?.id;
        if (!taskId) { if (submitData.data && submitData.data[0].url) return submitData.data[0].url; throw new Error("No Task ID"); }
        for (let i = 0; i < 120; i++) { 
            await new Promise(r => setTimeout(r, 5000)); 
            const checkRes = await fetch(`${baseUrl}/v1/videos/generations/${taskId}`, { headers: { 'Authorization': `Bearer ${key}` } });
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                const status = checkData.status || checkData.data?.status;
                if (status === 'SUCCEEDED' || status === 'completed') return checkData.data?.[0]?.url || checkData.url;
                if (status === 'FAILED') throw new Error("Video Generation Failed");
            }
        }
        throw new Error("Video Generation Timeout");
    }
  };

  const value = {
    config, setConfig,
    script, setScript, direction, setDirection,
    clPrompts, setClPrompts, clImages, setClImages,
    shots, setShots, shotImages, setShotImages,
    timeline, setTimeline,
    actors, setActors, scenes, setScenes,
    callApi, fetchModels, availableModels, isLoadingModels,
    assembleSoraPrompt
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
