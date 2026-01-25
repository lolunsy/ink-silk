import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { cn, handleWheelRouting } from '../../lib/utils';
import { useProject } from '../../context/ProjectContext';
import { AnimaticPlayer } from '../Preview/AnimaticPlayer';
import { DirectorPanel } from './storyboard/DirectorPanel';
import { ShotPool } from './storyboard/ShotPool';
import { SequenceBuilder } from './storyboard/SequenceBuilder';

export const StoryboardStudio = ({ onPreview }) => {
  const { script, setScript, direction, setDirection, shots, setShots, shotImages, setShotImages, scenes, setScenes, actors, callApi, assembleSoraPrompt, storyInput, setStoryInput, analyzeSourceImage, simpleHash } = useProject();
  
  const [messages, setMessages] = useState(() => JSON.parse(localStorage.getItem('sb_messages')) || [{ role: 'assistant', content: '我是您的 AI 分镜导演。' }]);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sbAspectRatio, setSbAspectRatio] = useState(() => localStorage.getItem('sb_ar') || "16:9");
  const [sbTargetLang, setSbTargetLang] = useState(() => localStorage.getItem('sb_lang') || "English");
  const [imgStrength, setImgStrength] = useState(0.8); 
  const [showAnimatic, setShowAnimatic] = useState(false);
  const [selectedShotIds, setSelectedShotIds] = useState([]); 
  const [activeTab, setActiveTab] = useState("shots");
  
  // Phase 4.5: 滚轮路由的 fallback 容器引用
  const leftColumnRef = useRef(null);
  const rightColumnRef = useRef(null);
  
  // Phase 4.5: Scene 数据结构（UI 层，带版本管理）
  const [uiScenes, setUIScenes] = useState([]);
  const [hoverSceneId, setHoverSceneId] = useState(null);
  const [hoverShotId, setHoverShotId] = useState(null);
  
  // Phase 4.0: 主角池（≤2个主角）
  const [mainActorIds, setMainActorIds] = useState(() => {
    const saved = localStorage.getItem('sb_main_actors');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Phase 4.0: 场景锚点（描述 + 1-3张图）
  const [sceneAnchor, setSceneAnchor] = useState(() => {
    const saved = localStorage.getItem('sb_scene_anchor');
    return saved ? JSON.parse(saved) : { description: "", images: [] };
  });
  
  // Phase 4.1.1: 母图模式下是否叠加场景锚点图片
  const [includeSceneAnchorInSourceMode, setIncludeSceneAnchorInSourceMode] = useState(false);
  
  // Phase 4.2-A1: 母图解析状态
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  
  // Phase 4.3: 母图模式下主角池和场景锚点折叠状态
  const [showMainActorsInImageMode, setShowMainActorsInImageMode] = useState(false);
  const [showSceneAnchorInImageMode, setShowSceneAnchorInImageMode] = useState(false);

  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem('sb_ar', sbAspectRatio); }, [sbAspectRatio]);
  useEffect(() => { localStorage.setItem('sb_lang', sbTargetLang); }, [sbTargetLang]);
  useEffect(() => { localStorage.setItem('sb_main_actors', JSON.stringify(mainActorIds)); }, [mainActorIds]);
  useEffect(() => { localStorage.setItem('sb_scene_anchor', JSON.stringify(sceneAnchor)); }, [sceneAnchor]);

  const pushHistory = (newShots) => setShots(newShots);
  
  const handleSceneAnchorImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const currentCount = sceneAnchor.images.length;
    const remaining = 3 - currentCount;
    const filesToProcess = files.slice(0, remaining);
    
    if (files.length > remaining) {
      alert(`⚠️ 场景锚点最多 3 张图片\n当前已有 ${currentCount} 张，仅添加前 ${remaining} 张`);
    }
    
    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSceneAnchor(prev => ({
          ...prev,
          images: [...prev.images, reader.result]
        }));
      };
      reader.readAsDataURL(file);
    });
  };
  
  const removeSceneAnchorImage = (index) => {
    setSceneAnchor(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  // Phase 4.1: 创作起点文件上传处理
  const handleSourceImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setStoryInput(prev => ({
        ...prev,
        image: { name: file.name, dataUrl: reader.result },
        imageBrief: null,
        imageHash: null
      }));
    };
    reader.readAsDataURL(file);
  };

  // Phase 4.2-A1: 母图解析方法
  const handleAnalyzeImage = async (force = false) => {
    if (!storyInput.image?.dataUrl) {
      alert('请先上传母图');
      return;
    }
    
    // 成本控制：如果不是强制重新解析，且 hash 未变化且已有 brief，则跳过
    if (!force && storyInput.imageBrief && storyInput.imageHash) {
      // 计算当前图片的 hash（使用 ProjectContext 的 simpleHash）
      const currentHash = simpleHash(storyInput.image.dataUrl);
      if (currentHash === storyInput.imageHash) {
        console.log('✅ 母图未变化，跳过重复解析');
        return;
      }
    }
    
    setIsAnalyzingImage(true);
    try {
      const { brief, hash } = await analyzeSourceImage({
        imageDataUrl: storyInput.image.dataUrl,
        script: script || '',
        direction: direction || '',
        lang: sbTargetLang
      });
      
      setStoryInput(prev => ({
        ...prev,
        imageBrief: brief,
        imageHash: hash
      }));
      
      alert('✅ 母图解析完成！');
    } catch (error) {
      alert('母图解析失败: ' + error.message);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Phase 4.2-A1: 母图上传后自动触发解析（基于 hash 变化判断）
  useEffect(() => {
    if (storyInput.mode === 'image' && storyInput.image?.dataUrl) {
      // 计算当前母图的 hash
      const currentHash = simpleHash(storyInput.image.dataUrl);
      
      // 只有当 hash 变化（或首次上传）时才自动解析
      if (!storyInput.imageHash || currentHash !== storyInput.imageHash) {
        console.log('🔍 检测到母图变化，自动触发解析');
        handleAnalyzeImage(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyInput.image?.dataUrl]);

  const handleAudioUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      alert('请上传音频文件');
      return;
    }
    setStoryInput(prev => ({
      ...prev,
      audio: { name: file.name, size: file.size }
    }));
  };

  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      alert('请上传视频文件');
      return;
    }
    setStoryInput(prev => ({
      ...prev,
      video: { name: file.name, size: file.size }
    }));
  };

  const clearCurrentModeAsset = () => {
    setStoryInput(prev => {
      const updates = { [storyInput.mode]: null };
      // Phase 4.2-A1: 清除母图时必须同时清除 brief 和 hash
      if (storyInput.mode === 'image') {
        updates.imageBrief = null;
        updates.imageHash = null;
      }
      return { ...prev, ...updates };
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const toggleMainActor = (actorId) => {
    setMainActorIds(prev => {
      if (prev.includes(actorId)) {
        return prev.filter(id => id !== actorId);
      } else {
        if (prev.length >= 2) {
          alert("⚠️ 主角池最多 2 个演员\n请先移除已选演员");
          return prev;
        }
        return [...prev, actorId];
      }
    });
  };

  // Phase 4.1: 生成小分镜（支持多模态输入）
  const handleAnalyzeScript = async () => {
    // Phase 4.1.1: 修改验证逻辑
    if (storyInput.mode === 'text') {
      if (!script && !direction) {
        return alert("请填写剧本或导演意图");
      }
    }
    if (storyInput.mode === 'image') {
      if (!storyInput.image) {
        return alert("请上传母图");
      }
      // 母图模式下 script/direction 不强制必填
    }
    
    setIsAnalyzing(true);
    
    // 准备主角信息
    const mainActorsInfo = mainActorIds.map(id => {
      const actor = actors.find(a => a.id === id);
      return actor ? { name: actor.name, desc: actor.desc || "" } : null;
    }).filter(Boolean);
    
    // 准备场景锚点信息
    const sceneAnchorText = sceneAnchor.description || "";
    
    // Phase 4.1: 根据模式构建提示词
    let systemPrompt = `Role: Expert Film Director (Phase 4.1).
Task: Create a Shot List with Main Cast and NPC support.

Main Cast Pool (from actor library, maintain consistency):
${mainActorsInfo.length > 0 ? mainActorsInfo.map(a => `- ${a.name}: ${a.desc}`).join('\n') : '(No main cast assigned)'}

Scene Anchor:
${sceneAnchorText || '(No scene anchor)'}`;

    // Phase 4.2-A1: 母图模式注入 imageBrief
    if (storyInput.mode === 'image') {
      // 检查是否有 imageBrief
      if (!storyInput.imageBrief) {
        const shouldContinue = window.confirm(
          "⚠️ 建议先解析母图以提高贴合度\n\n点击【确定】继续生成（不解析）\n点击【取消】返回解析母图"
        );
        if (!shouldContinue) {
          setIsAnalyzing(false);
          return;
        }
      }
      
      systemPrompt += `\n\nSource Image Mode: A reference image is provided as visual starting point.`;
      
      if (storyInput.imageBrief) {
        systemPrompt += `\n\nPrimary Visual Reference (Source Image Brief):
${storyInput.imageBrief}

Constraints:
- EVERY shot must inherit the main subject identity and core composition/style from the source image
- Camera movements and temporal progression are allowed
- Some shots may not feature main cast (per director's rules)
- Keep visual consistency with the source image's aesthetic`;
      }
    }

    systemPrompt += `\n\nRequirements:
1. Break script into key shots
2. For EACH shot, output:
   - main_cast_names: [] or subset of Main Cast Pool names (can be empty for pure scene/NPC shots)
   - npc_spec: "NPC description" or null (for non-main-cast characters)
   - visual: scene description
   - sora_prompt: detailed shot prompt (action + camera + environment + style)
   - audio: dialogue or SFX
   - duration: e.g. "5s"
   - camera_movement: e.g. "Dolly In"

3. NPC can be shot subject (including close-ups), but don't use reference images
4. Main cast can be absent in some shots (pure scene/NPC/detail shots)

Output JSON Array:
[{
  "id": 1,
  "main_cast_names": ["ActorName1"] or [],
  "npc_spec": "NPC description" or null,
  "visual": "...",
  "sora_prompt": "...",
  "audio": "...",
  "duration": "5s",
  "camera_movement": "..."
}]

Language: ${sbTargetLang}`;

    try {
      // Phase 4.1.1: 修改 assets 构建规则
      let assets = [];
      
      if (storyInput.mode === 'image') {
        // 母图模式：母图优先
        if (storyInput.image) {
          assets = [
            ...assets,
            storyInput.image.dataUrl
          ];
        }
        // 仅当开关开启时才叠加场景锚点图片
        if (includeSceneAnchorInSourceMode && sceneAnchor.images.length > 0) {
          assets = [
            ...assets,
            ...sceneAnchor.images
          ];
        }
      } else if (storyInput.mode === 'text') {
        // 文本模式：保持现状，使用场景锚点图
        if (sceneAnchor.images.length > 0) {
          assets = [
            ...sceneAnchor.images
          ];
        }
      }
      
      const res = await callApi('analysis', { 
        system: systemPrompt, 
        user: `Script: ${script || "(None)"}\nDirection: ${direction || "(None)"}`,
        assets: assets.length > 0 ? assets : undefined
      });
      
      let jsonStr = res.match(/```json([\s\S]*?)```/)?.[1] || res.substring(res.indexOf('['), res.lastIndexOf(']')+1);
      const json = JSON.parse(jsonStr.trim());
      
      if (Array.isArray(json)) {
        // Phase 4.0: 校验和转换 main_cast_names 为 mainCastIds
        const processedShots = json.map(shot => {
          const mainCastNames = shot.main_cast_names || [];
          const mainCastIds = mainCastNames
            .map(name => {
              const actor = actors.find(a => a.name === name && mainActorIds.includes(a.id));
              return actor ? actor.id : null;
            })
            .filter(Boolean);
          
          return {
            ...shot,
            mainCastIds: mainCastIds,
            npcSpec: shot.npc_spec || null,
            image_prompt: shot.sora_prompt || shot.visual
          };
        });
        
        pushHistory(processedShots);
        setMessages(prev => {
          return [...prev, { role: 'assistant', content: `✅ 分析完成！设计了 ${processedShots.length} 个镜头。\n\n主角出场：${processedShots.filter(s => s.mainCastIds?.length > 0).length} 个镜头\nNPC/场景：${processedShots.filter(s => !s.mainCastIds || s.mainCastIds.length === 0).length} 个镜头` }];
        });
      }
    } catch (e) { 
      alert("分析失败: " + e.message); 
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  // Phase 4.5: AI 导演助手（全能同步：完整字段 + 摘要确认）
  const handleSendMessage = async () => {
    if(!chatInput.trim()) return;
    const msg = chatInput; 
    setChatInput(""); 
    setMessages(prev => {
      return [...prev, { role: 'user', content: msg }];
    });
    
    try {
      // Phase 4.5: 扩充 currentContext，包含所有关键字段
      const currentContext = shots.map(s => ({
        id: s.id, 
        visual: s.visual, 
        sora_prompt: s.sora_prompt || s.image_prompt,
        audio: s.audio || "",
        camera_movement: s.camera_movement || "",
        duration: s.duration || "5s",
        mainCastIds: s.mainCastIds || [],
        npcSpec: s.npcSpec || null
      }));
      
      const system = `Role: Co-Director (Phase 4.5 - Full Sync).
Task: Modify/Insert/Delete shots based on user feedback.

Main Cast Pool: ${mainActorIds.map(id => actors.find(a => a.id === id)?.name).filter(Boolean).join(", ") || "(None)"}

Operations (each item must have "op" field):
1. MODIFY existing shot (field-level patch):
   {op:"modify", id:number, visual?:string, sora_prompt?:string, audio?:string, camera_movement?:string, duration?:string, mainCastIds?:array, npcSpec?:string|null}
   - Only provide fields that need to change
   - Unprovided fields keep original values

2. INSERT new shot:
   {op:"insert", after_id:number|null, shot:{visual:string, sora_prompt:string, audio?:string, camera_movement?:string, duration?:string, mainCastIds?:array, npcSpec?:string|null}}
   - after_id: insert after this shot ID (null = append to end)
   - shot.id: DO NOT provide, system will assign

3. DELETE shot:
   {op:"delete", id:number}

Response Format:
1. First, provide a Chinese summary of changes (修改摘要), listing each shot and modified fields clearly
2. Then provide JSON array wrapped in \`\`\`json ... \`\`\`

Example:
修改摘要：
- 镜头 3：增加环境音 "风声呼啸"
- 镜头 5：运镜改为 "Dolly In"，时长改为 8s
- 删除镜头 7
- 在镜头 2 之后插入：全景远山

\`\`\`json
[
  {op:"modify", id:3, audio:"风声呼啸"},
  {op:"modify", id:5, camera_movement:"Dolly In", duration:"8s"},
  {op:"delete", id:7},
  {op:"insert", after_id:2, shot:{visual:"全景远山", sora_prompt:"Wide establishing shot of misty mountains at dawn", duration:"6s"}}
]
\`\`\``;

      const res = await callApi('analysis', {
        system, 
        user: `Current Storyboard: ${JSON.stringify(currentContext)}\n\nFeedback: ${msg}\n\nResponse:`
      });
      
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      const reply = jsonMatch ? res.replace(jsonMatch[0], "").trim() : res;
      
      // Phase 4.5: 显示摘要（包含在 reply 中）
      setMessages(prev => {
        return [...prev, { role: 'assistant', content: reply || "修改建议如下：" }];
      });
      
      if (jsonMatch) {
        const updates = JSON.parse(jsonMatch[1]);
        setPendingUpdate(Array.isArray(updates) ? updates : [updates]);
        
        // Phase 4.5-A: 追加确认引导消息
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '我整理了修改方案，请在下方点击【应用】或【取消】确认。' }
        ]);
      }
    } catch (e) { 
      setMessages(prev => {
        return [...prev, { role: 'assistant', content: "Error: " + e.message }];
      });
    }
  };

  // Phase 4.5: Helper - 重排 shot id 并映射所有关联数据
  const remapShotIds = (oldShots, newShots) => {
    const idMap = {}; // oldId -> newId
    newShots.forEach((shot, idx) => {
      idMap[shot.id] = idx + 1;
    });
    
    // 1. 重新分配连续 ID
    const remappedShots = newShots.map((shot, idx) => ({
      ...shot,
      id: idx + 1
    }));
    
    // 2. 映射 shotImages
    setShotImages(prev => {
      const newImages = {};
      Object.keys(prev).forEach(oldId => {
        const newId = idMap[parseInt(oldId)];
        if (newId) {
          newImages[newId] = prev[oldId];
        }
      });
      return newImages;
    });
    
    // 3. 映射 selectedShotIds
    setSelectedShotIds(prev => {
      return prev.map(oldId => idMap[oldId]).filter(Boolean);
    });
    
    // 4. 映射 scenes / uiScenes 的 shotIds
    // Phase 4.5-A3: 增加防守，避免历史数据结构不一致导致崩溃
    setScenes(prev => prev.map(scene => {
      const oldShots = Array.isArray(scene.shots) ? scene.shots : [];
      return {
        ...scene,
        shots: oldShots.map(oldId => idMap[oldId]).filter(Boolean)
      };
    }));
    
    setUIScenes(prev => prev.map(scene => {
      const oldIds = Array.isArray(scene.shotIds) ? scene.shotIds : [];
      return {
        ...scene,
        shotIds: oldIds.map(oldId => idMap[oldId]).filter(Boolean)
      };
    }));
    
    return remappedShots;
  };

  // Phase 4.5-A3: 取消 pendingUpdate
  const cancelPendingUpdate = () => {
    setPendingUpdate(null);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: '已取消本次修改方案' }
    ]);
  };

  // Phase 4.5: applyUpdate - 支持 insert/delete/modify（字段级 patch）
  const applyUpdate = () => {
    if (!pendingUpdate) return;
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];
    
    let insertCount = 0;
    let modifyCount = 0;
    let deleteCount = 0;
    
    setShots(prev => {
      let newShots = [...prev];
      
      // 分类处理：先删除、再修改、最后插入
      const deleteOps = updates.filter(u => u.op === "delete");
      const modifyOps = updates.filter(u => u.op === "modify" || !u.op); // 兼容旧格式
      const insertOps = updates.filter(u => u.op === "insert");
      
      deleteCount = deleteOps.length;
      modifyCount = modifyOps.length;
      insertCount = insertOps.length;
      
      // 1. DELETE
      deleteOps.forEach(op => {
        newShots = newShots.filter(s => s.id !== op.id);
      });
      
      // 2. MODIFY（字段级 patch：仅更新提供的字段）
      modifyOps.forEach(upd => {
        const targetId = upd.id;
        const idx = newShots.findIndex(s => s.id === targetId);
        if (idx !== -1) {
          const oldShot = newShots[idx];
          const patchedShot = { ...oldShot };
          
          // 字段级更新（只更新提供的字段）
          if (upd.visual !== undefined) patchedShot.visual = upd.visual;
          if (upd.sora_prompt !== undefined) {
            patchedShot.sora_prompt = upd.sora_prompt;
            patchedShot.image_prompt = upd.sora_prompt;
          }
          if (upd.audio !== undefined) patchedShot.audio = upd.audio;
          if (upd.camera_movement !== undefined) patchedShot.camera_movement = upd.camera_movement;
          if (upd.duration !== undefined) patchedShot.duration = upd.duration;
          if (upd.mainCastIds !== undefined) patchedShot.mainCastIds = upd.mainCastIds;
          if (upd.npcSpec !== undefined) patchedShot.npcSpec = upd.npcSpec;
          
          // 保持 id 不变
          patchedShot.id = targetId;
          
          newShots[idx] = patchedShot;
        }
      });
      
      // 3. INSERT
      insertOps.forEach(op => {
        const { after_id, shot } = op;
        const newShot = {
          id: Date.now() + Math.random(), // 临时 ID，稍后会重排
          visual: shot.visual || shot.sora_prompt || "",
          sora_prompt: shot.sora_prompt,
          image_prompt: shot.sora_prompt,
          audio: shot.audio || "",
          duration: shot.duration || "5s",
          camera_movement: shot.camera_movement || "Static",
          mainCastIds: shot.mainCastIds || [],
          npcSpec: shot.npcSpec || null
        };
        
        if (after_id === null || after_id === undefined) {
          // 插入到末尾
          newShots.push(newShot);
        } else {
          // 插入到 after_id 之后
          const afterIdx = newShots.findIndex(s => s.id === after_id);
          if (afterIdx !== -1) {
            newShots.splice(afterIdx + 1, 0, newShot);
          } else {
            newShots.push(newShot);
          }
        }
      });
      
      // 4. 重排 ID 并映射关联数据（关键步骤）
      return remapShotIds(prev, newShots);
    });
    
    setPendingUpdate(null);
    
    // Phase 4.5: 更详细的应用结果提示
    const summary = [];
    if (insertCount > 0) summary.push(`新增${insertCount}个镜头`);
    if (modifyCount > 0) summary.push(`修改${modifyCount}个镜头`);
    if (deleteCount > 0) summary.push(`删除${deleteCount}个镜头`);
    
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: `✅ 已应用修改${summary.length > 0 ? '（' + summary.join('、') + '）' : ''}` }
    ]);
  };

  const addImageToShot = (id, url) => {
    setShotImages(prev => {
      return { ...prev, [id]: [...(prev[id] || []), url] };
    });
  };
  
  const handleDownload = async (type) => {
    const zip = new JSZip(); 
    const folder = zip.folder("storyboard");
    
    if (type === 'csv') {
      const csv = "\uFEFF" + [["Shot","Visual","Prompt","MainCast","NPC"], ...shots.map(s=>[
        s.id, 
        `"${s.visual}"`, 
        `"${s.sora_prompt}"`,
        `"${(s.mainCastIds || []).map(id => actors.find(a => a.id === id)?.name).filter(Boolean).join(", ")}"`,
        `"${s.npcSpec || ""}"`
      ])].map(e=>e.join(",")).join("\n");
      saveAs(new Blob([csv], {type:'text/csv;charset=utf-8;'}), "storyboard.csv"); 
      return;
    }
    
    const promises = Object.entries(shotImages).map(async ([id, urls]) => { 
      if (urls.length > 0) { 
        try { 
          const blob = await fetch(urls[urls.length-1]).then(r => r.blob()); 
          folder.file(`shot_${id}.png`, blob); 
        } catch(e){} 
      } 
    });
    await Promise.all(promises); 
    saveAs(await zip.generateAsync({ type: "blob" }), "storyboard_pack.zip");
  };
  
  const clearAll = () => {
    if (!confirm("确定清空分镜数据吗？此操作无法撤销。")) return;
    setShots([]);
    setMessages([]);
    setShotImages({});
    setScript("");
    setDirection("");
    setScenes([]);
    setUIScenes([]);
    setSelectedShotIds([]);
    setPendingUpdate(null);
    setMainActorIds([]);
    setSceneAnchor({ description: "", images: [] });
    setStoryInput({ mode: "text", image: null, audio: null, video: null });
    setIncludeSceneAnchorInSourceMode(false);
    setHoverSceneId(null);
    setHoverShotId(null);
    
    localStorage.removeItem('sb_messages');
    localStorage.removeItem('sb_ar');
    localStorage.removeItem('sb_lang');
    localStorage.removeItem('sb_script');
    localStorage.removeItem('sb_direction');
    localStorage.removeItem('sb_shots');
    localStorage.removeItem('sb_scenes');
    localStorage.removeItem('sb_main_actors');
    localStorage.removeItem('sb_scene_anchor');
    localStorage.removeItem('sb_story_input');
  };

  const toggleShotSelection = (id) => {
    setSelectedShotIds(prev => {
      return prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
    });
  };

  // Phase 4.5: 组装大分镜（使用新的 UI Scene 结构）
  const compileScene = () => {
    if (selectedShotIds.length < 1) return alert("请至少选择 1 个镜头");
    
    const selectedShots = shots.filter(s => selectedShotIds.includes(s.id)).sort((a,b) => a.id - b.id);
    
    // 聚合所有出现的主角
    const aggregatedMainActorIds = [...new Set(
      selectedShots.flatMap(s => s.mainCastIds || [])
    )];
    
    const result = assembleSoraPrompt(
      selectedShots, 
      direction || "Cinematic, high fidelity, 8k resolution",
      aggregatedMainActorIds,
      sbAspectRatio,
      sceneAnchor
    );
    
    if (!result) return;
    
    const { prompt: masterPrompt, duration, actorRef, sceneAnchorImages } = result;
    
    // startImg 优先级：首镜关键帧 > actorRef > sceneAnchorImages[0] > null
    let startImg = shotImages[selectedShots[0].id]?.slice(-1)[0] || actorRef || sceneAnchorImages[0] || null;
    
    // 收集预览帧（胶卷条）
    const previewFrames = selectedShotIds.map(shotId => shotImages[shotId]?.slice(-1)[0]).filter(Boolean);
    
    // 生成色码（基于 Scene ID）
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    const colorTag = colors[uiScenes.length % colors.length];
    
    const newScene = {
      id: Date.now(),
      name: `Scene ${uiScenes.length + 1}`,
      colorTag: colorTag,
      shotIds: selectedShotIds,
      mode: "live",
      versions: [],
      activeVersionId: "live",
      mainActorIds: aggregatedMainActorIds,
      hasManualPrompt: false,
      // Live Draft 数据
      livePrompt: masterPrompt,
      liveDuration: duration,
      liveStartImg: startImg,
      livePreviewFrames: previewFrames
    };
    
    // 兼容旧 scenes 数据（供后续可能的视频生成使用）
    const legacyScene = {
      id: newScene.id,
      title: `Scene ${scenes.length + 1} (Shots ${selectedShotIds.join(',')})`,
      prompt: masterPrompt,
      duration: duration,
      startImg: startImg,
      video_url: null,
      shots: selectedShotIds,
      mainActorIds: aggregatedMainActorIds
    };
    
    setUIScenes(prev => [...prev, newScene]);
    setScenes(prev => [...prev, legacyScene]);
    setSelectedShotIds([]);
    // Phase 4.5 修复：不再切换 Tab，保持在 shots 视图
    // setActiveTab("scenes"); 
    
    // 滚动到新 Scene（延迟执行以确保 DOM 更新）
    setTimeout(() => {
      const elem = document.getElementById(`scene-${newScene.id}`);
      elem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      elem?.classList.add('flash-highlight');
      setTimeout(() => elem?.classList.remove('flash-highlight'), 1000);
    }, 100);
  };

  // Phase 4.5: 重新计算 Live Draft Prompt（当 Shot 变化时）
  const recalculateLivePrompt = (sceneId) => {
    const scene = uiScenes.find(s => s.id === sceneId);
    if (!scene || scene.activeVersionId !== "live") return;
    
    const selectedShots = shots.filter(s => scene.shotIds.includes(s.id)).sort((a,b) => a.id - b.id);
    if (selectedShots.length === 0) return;
    
    const aggregatedMainActorIds = [...new Set(
      selectedShots.flatMap(s => s.mainCastIds || [])
    )];
    
    const result = assembleSoraPrompt(
      selectedShots, 
      direction || "Cinematic, high fidelity, 8k resolution",
      aggregatedMainActorIds,
      sbAspectRatio,
      sceneAnchor
    );
    
    if (!result) return;
    
    const { prompt: masterPrompt, duration, actorRef, sceneAnchorImages } = result;
    let startImg = shotImages[selectedShots[0].id]?.slice(-1)[0] || actorRef || sceneAnchorImages[0] || null;
    const previewFrames = scene.shotIds.map(shotId => shotImages[shotId]?.slice(-1)[0]).filter(Boolean);
    
    setUIScenes(prev => prev.map(s => 
      s.id === sceneId 
        ? { ...s, livePrompt: masterPrompt, liveDuration: duration, liveStartImg: startImg, livePreviewFrames: previewFrames }
        : s
    ));
  };

  // Phase 4.5: Live Draft 自动跟随（debounced）
  useEffect(() => {
    const timer = setTimeout(() => {
      // 只对 activeVersionId === "live" 且 hasManualPrompt === false 的 Scene 重算
      uiScenes.forEach(scene => {
        if (scene.activeVersionId === "live" && !scene.hasManualPrompt) {
          recalculateLivePrompt(scene.id);
        }
      });
    }, 400); // 400ms debounce
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, shotImages, direction, sceneAnchor, sbAspectRatio]);

  // Phase 4.5: 生成 Scene 视频（支持版本）
  const handleGenSceneVideo = async (sceneId, prompt, duration, startImg) => {
    const arMatch = prompt.match(/--ar\s+([\d:.]+)/);
    const ar = arMatch ? arMatch[1] : sbAspectRatio;
    
    try {
        const url = await callApi('video', { 
          model: 'kling-v2.6', 
          prompt: prompt, 
          startImg: typeof startImg === 'string' ? startImg : startImg?.url, 
          aspectRatio: ar, 
          duration: duration 
        });
        
        const newVersion = {
          id: `v${Date.now()}`,
          createdAt: Date.now(),
          kind: "generated",
          prompt: prompt,
          assets: { videoUrl: url, previewFrames: [] }
        };
        
        setUIScenes(prev => prev.map(s => 
          s.id === sceneId 
            ? { ...s, versions: [...s.versions, newVersion], activeVersionId: newVersion.id }
            : s
        ));
        
        // 同步更新旧 scenes（兼容）
        setScenes(prev => prev.map(s => 
          s.id === sceneId 
            ? { ...s, video_url: url }
            : s
        ));
        
        alert("🎬 大分镜视频生成成功！");
    } catch (e) { 
      alert("生成失败: " + e.message); 
    }
  };

  // ========== 构建 Props 分组 ==========
  
  // DirectorPanel data
  const directorPanelData = {
    script,
    direction,
    storyInput,
    actors,
    mainActorIds,
    sceneAnchor,
    messages,
    pendingUpdate,
    isAnalyzing,
    isAnalyzingImage
  };
  
  // DirectorPanel actions
  const directorPanelActions = {
    setScript,
    setDirection,
    setStoryInputMode: (mode) => setStoryInput(prev => ({ ...prev, mode })),
    handleSourceImageUpload,
    handleAudioUpload,
    handleVideoUpload,
    clearCurrentModeAsset,
    handleAnalyzeImage,
    updateImageBrief: (brief) => setStoryInput(prev => ({ ...prev, imageBrief: brief })),
    toggleMainActor,
    updateSceneAnchorDescription: (desc) => setSceneAnchor(prev => ({ ...prev, description: desc })),
    handleSceneAnchorImageUpload,
    removeSceneAnchorImage,
    handleAnalyzeScript,
    handleSendMessage,
    applyUpdate,
    cancelPendingUpdate,
    setPendingUpdate,
    clearAll,
    formatFileSize,
    setIncludeSceneAnchorInSourceMode,
    toggleShowMainActorsInImageMode: () => setShowMainActorsInImageMode(prev => !prev),
    toggleShowSceneAnchorInImageMode: () => setShowSceneAnchorInImageMode(prev => !prev),
    setSbAspectRatio,
    setSbTargetLang,
    setChatInput
  };
  
  // DirectorPanel UI
  const directorPanelUI = {
    chatInput,
    sbAspectRatio,
    sbTargetLang,
    includeSceneAnchorInSourceMode,
    showMainActorsInImageMode,
    showSceneAnchorInImageMode
  };
  
  // ShotPool data
  const shotPoolData = {
    shots,
    shotImages,
    actors,
    sceneAnchor,
    uiScenes
  };
  
  // ShotPool actions
  const shotPoolActions = {
    toggleShotSelection,
    addImageToShot,
    clearSelectedShots: () => setSelectedShotIds([]),
    compileScene,
    handleDownloadCSV: () => handleDownload('csv'),
    handleDownloadAll: () => handleDownload('all'),
    setShowAnimatic,
    onPreview,
    callApi,
    setHoverShotId
  };
  
  // ShotPool UI
  const shotPoolUI = {
    selectedShotIds,
    sbAspectRatio,
    hoverSceneId
  };
  
  // SequenceBuilder data
  const sequenceBuilderData = {
    scenes: uiScenes,
    shots,
    shotImages,
    actors,
    direction,
    sbAspectRatio,
    sceneAnchor
  };
  
  // SequenceBuilder actions
  const sequenceBuilderActions = {
    handleGenSceneVideo,
    setUIScenes,
    setScenes,
    recalculateLivePrompt,
    setHoverSceneId,
    callApi,
    assembleSoraPrompt
  };
  
  // SequenceBuilder UI
  const sequenceBuilderUI = {
    hoverShotId
  };

  return (
    <div className="flex h-full overflow-hidden">
      <AnimaticPlayer isOpen={showAnimatic} onClose={() => setShowAnimatic(false)} shots={shots} images={shotImages} />
      
      {/* DirectorPanel：仅在 shots tab 显示 */}
      {activeTab === "shots" && (
        <DirectorPanel 
          data={directorPanelData} 
          actions={directorPanelActions} 
          ui={directorPanelUI} 
        />
      )}
      
      {activeTab === "shots" ? (
        // Phase 4.5: shots 视图 - 双栏布局（ShotPool + SequenceBuilder）+ 全局滚轮路由
        <div className="flex-1 bg-slate-950 overflow-hidden flex flex-col">
          <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-4 bg-slate-900/80 backdrop-blur shrink-0">
            <button 
              onClick={()=>setActiveTab("shots")} 
              className={cn(
                "px-4 py-2 text-sm font-bold border-b-2 transition-all", 
                "border-purple-500 text-white"
              )}
            >
              分镜 Shot ({shots.length})
            </button>
            <button 
              onClick={()=>setActiveTab("scenes")} 
              className={cn(
                "px-4 py-2 text-sm font-bold border-b-2 transition-all", 
                "border-transparent text-slate-500"
              )}
            >
              大分镜 Scene ({uiScenes.length})
            </button>
          </div>
          
          <div 
            className="flex-1 flex overflow-hidden"
            onWheelCapture={(e) => handleWheelRouting(e, { fallbacks: [leftColumnRef, rightColumnRef] })}
          >
            {/* 左侧：ShotPool */}
            <div ref={leftColumnRef} className="flex-1 overflow-y-auto p-6 scrollbar-thin border-r border-slate-800">
              <ShotPool 
                data={shotPoolData} 
                actions={shotPoolActions} 
                ui={shotPoolUI}
                onSwitchToScenes={() => setActiveTab("scenes")}
              />
            </div>
            
            {/* 右侧：SequenceBuilder（embedded 模式）- Phase 4.5 响应式宽度 */}
            <div ref={rightColumnRef} className="w-[520px] xl:w-[620px] 2xl:w-[720px] min-w-[420px] overflow-y-auto p-4 scrollbar-thin bg-slate-900/30">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-400 mb-2">Scene 车间</h3>
                {uiScenes.length === 0 && (
                  <div className="text-xs text-slate-600 bg-slate-900/50 border border-slate-800 rounded p-3">
                    选择多个 Shot，点击"生成大分镜"创建 Scene
                  </div>
                )}
              </div>
              <SequenceBuilder 
                data={sequenceBuilderData} 
                actions={sequenceBuilderActions}
                ui={sequenceBuilderUI}
                mode="embedded"
              />
            </div>
          </div>
        </div>
      ) : (
        // Phase 4.5: scenes 视图 - 全屏专注模式
        <div className="flex-1 bg-slate-950 overflow-hidden flex flex-col">
          <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-4 bg-slate-900/80 backdrop-blur shrink-0">
            <button 
              onClick={()=>setActiveTab("shots")} 
              className={cn(
                "px-4 py-2 text-sm font-bold border-b-2 transition-all", 
                "border-transparent text-slate-500"
              )}
            >
              分镜 Shot ({shots.length})
            </button>
            <button 
              onClick={()=>setActiveTab("scenes")} 
              className={cn(
                "px-4 py-2 text-sm font-bold border-b-2 transition-all", 
                "border-orange-500 text-white"
              )}
            >
              大分镜 Scene ({uiScenes.length})
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <SequenceBuilder 
              data={sequenceBuilderData} 
              actions={sequenceBuilderActions}
              ui={sequenceBuilderUI}
              mode="full"
            />
          </div>
        </div>
      )}
    </div>
  );
};
