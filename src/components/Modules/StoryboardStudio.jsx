import React, { useState, useRef, useEffect } from 'react';
import { Clapperboard, Trash2, FileText, Video, Settings, Sliders, Upload, X, ImageIcon, Mic, Film, Loader2, Layers, MessageSquare, Send, FileSpreadsheet, Download, Copy, RefreshCw, Camera, Clock, ChevronLeft, ChevronRight, CheckCircle2, User, Users, MapPin, Plus } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { cn } from '../../lib/utils';
import { useProject } from '../../context/ProjectContext';
import { AnimaticPlayer } from '../Preview/AnimaticPlayer';

export const StoryboardStudio = ({ onPreview }) => {
  const { script, setScript, direction, setDirection, shots, setShots, shotImages, setShotImages, scenes, setScenes, actors, callApi, assembleSoraPrompt, storyInput, setStoryInput } = useProject();
  
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
  
  const chatEndRef = useRef(null);

  useEffect(() => { localStorage.setItem('sb_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem('sb_ar', sbAspectRatio); }, [sbAspectRatio]);
  useEffect(() => { localStorage.setItem('sb_lang', sbTargetLang); }, [sbTargetLang]);
  useEffect(() => { localStorage.setItem('sb_main_actors', JSON.stringify(mainActorIds)); }, [mainActorIds]);
  useEffect(() => { localStorage.setItem('sb_scene_anchor', JSON.stringify(sceneAnchor)); }, [sceneAnchor]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pendingUpdate]);

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
        image: { name: file.name, dataUrl: reader.result }
      }));
    };
    reader.readAsDataURL(file);
  };

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
    setStoryInput(prev => ({
      ...prev,
      [storyInput.mode]: null
    }));
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

    if (storyInput.mode === 'image') {
      systemPrompt += `\n\nSource Image Mode: A reference image is provided as visual starting point. Use it as creative context for shot design.`;
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
          assets.push(storyInput.image.dataUrl);
        }
        // 仅当开关开启时才叠加场景锚点图片
        if (includeSceneAnchorInSourceMode && sceneAnchor.images.length > 0) {
          assets = assets.concat(sceneAnchor.images);
        }
      } else if (storyInput.mode === 'text') {
        // 文本模式：保持现状，使用场景锚点图
        if (sceneAnchor.images.length > 0) {
          assets = [...sceneAnchor.images];
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
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ 分析完成！设计了 ${processedShots.length} 个镜头。\n\n主角出场：${processedShots.filter(s => s.mainCastIds?.length > 0).length} 个镜头\nNPC/场景：${processedShots.filter(s => !s.mainCastIds || s.mainCastIds.length === 0).length} 个镜头` }]);
      }
    } catch (e) { 
      alert("分析失败: " + e.message); 
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  // Phase 4.0: AI 导演助手（JSON diff 修改机制）
  const handleSendMessage = async () => {
    if(!chatInput.trim()) return;
    const msg = chatInput; 
    setChatInput(""); 
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    
    try {
      const currentContext = shots.map(s => ({
        id: s.id, 
        visual: s.visual, 
        sora_prompt: s.sora_prompt,
        mainCastIds: s.mainCastIds || [],
        npcSpec: s.npcSpec || null,
        duration: s.duration
      }));
      
      const system = `Role: Co-Director (Phase 4.0).
Task: Modify storyboard based on user feedback.

Main Cast Pool: ${mainActorIds.map(id => actors.find(a => a.id === id)?.name).filter(Boolean).join(", ") || "(None)"}

Modifiable fields per shot:
- sora_prompt (shot description)
- duration (e.g. "5s")
- mainCastIds (array of actor IDs from Main Cast Pool, can be empty)
- npcSpec (NPC description, can be null)

Return JSON array with ONLY the shots you want to modify.
Wrap in \`\`\`json ... \`\`\`.`;

      const res = await callApi('analysis', {
        system, 
        user: `Current Storyboard: ${JSON.stringify(currentContext)}\n\nFeedback: ${msg}\n\nResponse:`
      });
      
      const jsonMatch = res.match(/```json([\s\S]*?)```/);
      const reply = jsonMatch ? res.replace(jsonMatch[0], "") : res;
      setMessages(prev => [...prev, { role: 'assistant', content: reply || "修改建议如下：" }]);
      
      if (jsonMatch) {
        const updates = JSON.parse(jsonMatch[1]);
        setPendingUpdate(Array.isArray(updates) ? updates : [updates]);
      }
    } catch (e) { 
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + e.message }]); 
    }
  };

  const applyUpdate = () => {
    if (!pendingUpdate) return;
    let newShots = [...shots];
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];
    
    updates.forEach(upd => {
      const idx = newShots.findIndex(s => s.id === upd.id);
      if (idx !== -1) {
        // Phase 4.0: 支持 mainCastIds 和 npcSpec 修改
        newShots[idx] = { 
          ...newShots[idx], 
          ...upd, 
          image_prompt: upd.image_prompt || upd.sora_prompt,
          mainCastIds: upd.mainCastIds || newShots[idx].mainCastIds,
          npcSpec: upd.npcSpec !== undefined ? upd.npcSpec : newShots[idx].npcSpec
        };
      } else {
        newShots.push({
          ...upd,
          image_prompt: upd.image_prompt || upd.sora_prompt,
          mainCastIds: upd.mainCastIds || [],
          npcSpec: upd.npcSpec || null
        });
      }
    });
    
    setShots(newShots.sort((a,b) => a.id - b.id)); 
    setPendingUpdate(null);
    setMessages(prev => [...prev, { role: 'assistant', content: "✅ 修改已应用。" }]);
  };

  const addImageToShot = (id, url) => setShotImages(prev => ({ ...prev, [id]: [...(prev[id] || []), url] }));
  
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
    setSelectedShotIds([]);
    setPendingUpdate(null);
    setMainActorIds([]);
    setSceneAnchor({ description: "", images: [] });
    setStoryInput({ mode: "text", image: null, audio: null, video: null });
    setIncludeSceneAnchorInSourceMode(false);
    
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

  const ChangePreview = () => {
    if (!pendingUpdate) return null;
    const updates = Array.isArray(pendingUpdate) ? pendingUpdate : [pendingUpdate];
    
    return (
      <div className="bg-slate-800/90 border border-purple-500/50 rounded-lg p-3 my-2 text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <div className="flex justify-between items-center mb-2 pb-2 border-b border-purple-500/20">
          <span className="font-bold text-purple-300 flex items-center gap-2">
            <Settings size={12}/> 修改方案 ({updates.length})
          </span>
          <button onClick={applyUpdate} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded flex items-center gap-1 shadow">
            <CheckCircle2 size={10}/> 应用
          </button>
        </div>
        <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-1">
          {updates.map((u, i) => (
            <div key={i} className="bg-slate-900/50 p-2.5 rounded border-l-2 border-purple-500">
              <div className="font-mono text-slate-400 mb-1 font-bold">Shot {u.id}</div>
              <div className="text-slate-300 whitespace-pre-wrap leading-relaxed text-[10px]">
                {u.sora_prompt && <div className="mb-1"><span className="text-purple-400 font-bold">Prompt:</span> {u.sora_prompt}</div>}
                {u.mainCastIds && <div className="mb-1"><span className="text-green-400 font-bold">主角:</span> {u.mainCastIds.map(id => actors.find(a => a.id === id)?.name).filter(Boolean).join(", ") || "(无)"}</div>}
                {u.npcSpec && <div className="mb-1"><span className="text-blue-400 font-bold">NPC:</span> {u.npcSpec}</div>}
                {u.duration && <div><span className="text-orange-400 font-bold">时长:</span> {u.duration}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const toggleShotSelection = (id) => setSelectedShotIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  // Phase 4.0: 组装大分镜（传入主角池和场景锚点）
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
    
    const newScene = {
      id: Date.now(),
      title: `Scene ${scenes.length + 1} (Shots ${selectedShotIds.join(',')})`,
      prompt: masterPrompt,
      duration: duration,
      startImg: startImg,
      video_url: null,
      shots: selectedShotIds,
      mainActorIds: aggregatedMainActorIds
    };
    
    setScenes([...scenes, newScene]);
    setSelectedShotIds([]);
    setActiveTab("scenes");
    alert("✨ 大分镜组装完成！");
  };

  const handleGenSceneVideo = async (scene) => {
    const arMatch = scene.prompt.match(/--ar\s+([\d:.]+)/);
    const ar = arMatch ? arMatch[1] : sbAspectRatio;
    
    try {
        const url = await callApi('video', { 
          model: 'kling-v2.6', 
          prompt: scene.prompt, 
          startImg: typeof scene.startImg === 'string' ? scene.startImg : scene.startImg?.url, 
          aspectRatio: ar, 
          duration: scene.duration 
        });
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, video_url: url } : s));
        alert("🎬 大分镜视频生成成功！");
    } catch (e) { 
      alert("生成失败: " + e.message); 
    }
  };

  // Phase 4.0: ShotCard（展示主角/NPC，参考图选择规则）
  const ShotCard = ({ shot, currentAr }) => {
    const history = shotImages[shot.id] || [];
    const [verIndex, setVerIndex] = useState(history.length > 0 ? history.length - 1 : 0);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => { setVerIndex(history.length > 0 ? history.length - 1 : 0); }, [history.length]);
    
    const currentUrl = history[verIndex];
    
    // Phase 4.0: 关键帧生图（参考图选择规则）
    const gen = async () => { 
      setLoading(true); 
      try { 
        let refImages = [];
        
        // 规则：若有主角，使用主角图 + 场景锚点图；否则只用场景锚点图
        if (shot.mainCastIds && shot.mainCastIds.length > 0) {
          // 有主角：主角 portrait/sheet（最多2张）+ 场景锚点图
          shot.mainCastIds.forEach(actorId => {
            const actor = actors.find(a => a.id === actorId);
            if (actor) {
              const actorImg = actor.images?.portrait || actor.images?.sheet;
              if (actorImg) refImages.push(actorImg);
            }
          });
          
          // 附加场景锚点图（作为次级参考）
          if (sceneAnchor.images && sceneAnchor.images.length > 0) {
            refImages = refImages.concat(sceneAnchor.images);
          }
        } else {
          // 无主角：只用场景锚点图（NPC 不使用参考图）
          if (sceneAnchor.images && sceneAnchor.images.length > 0) {
            refImages = sceneAnchor.images;
          }
        }
        
        // 限制最多 5 张参考图
        refImages = refImages.slice(0, 5);
        
        const url = await callApi('image', { 
          prompt: shot.image_prompt || shot.sora_prompt, 
          aspectRatio: currentAr, 
          useImg2Img: refImages.length > 0, 
          refImages: refImages.length > 0 ? refImages : undefined,
          strength: 0.75
        }); 
        
        addImageToShot(shot.id, url); 
      } catch(e) { 
        alert(e.message); 
      } finally { 
        setLoading(false); 
      } 
    };
    
    const handlePreview = () => { if(currentUrl) onPreview(currentUrl); };
    
    // 判断镜头类型
    const hasMainCast = shot.mainCastIds && shot.mainCastIds.length > 0;
    const hasNPC = shot.npcSpec && shot.npcSpec.trim();
    const isPureScene = !hasMainCast && !hasNPC;
    
    return (
      <div className={cn(
        "bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row mb-4 group transition-all hover:border-purple-500/50", 
        selectedShotIds.includes(shot.id) ? "border-orange-500 bg-orange-900/10 ring-1 ring-orange-500" : ""
      )}>
        <div className={cn(
          "bg-black relative shrink-0 md:w-72 group/media", 
          currentAr === "9:16" ? "w-40 aspect-[9/16]" : "w-full aspect-video"
        )}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2">
              <Loader2 className="animate-spin"/>
              <span className="text-[10px]">Rendering...</span>
            </div>
          ) : currentUrl ? (
            <div className="relative w-full h-full cursor-zoom-in" onClick={handlePreview}>
              <img src={currentUrl} className="w-full h-full object-cover"/>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity">
                <button 
                  onClick={(e)=>{e.stopPropagation();saveAs(currentUrl, `shot_${shot.id}.png`)}} 
                  className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"
                >
                  <Download size={12}/>
                </button>
                <button 
                  onClick={(e)=>{e.stopPropagation();gen()}} 
                  className="p-1.5 bg-black/60 text-white rounded hover:bg-purple-600"
                >
                  <RefreshCw size={12}/>
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <button 
                onClick={gen} 
                className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded border border-slate-700 flex gap-2 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <Camera size={14}/> 生成画面
              </button>
            </div>
          )}
          
          <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white backdrop-blur pointer-events-none">
            Shot {shot.id}
          </div>
          
          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-slate-300 backdrop-blur flex items-center gap-1 pointer-events-none">
            <Clock size={10}/> {shot.duration}
          </div>
          
          {history.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded-full backdrop-blur opacity-0 group-hover/media:opacity-100 transition-opacity z-20">
              <button 
                disabled={verIndex<=0} 
                onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v-1)}} 
                className="text-white hover:text-purple-400 disabled:opacity-30"
              >
                <ChevronLeft size={12}/>
              </button>
              <span className="text-[10px] text-white">{verIndex+1}/{history.length}</span>
              <button 
                disabled={verIndex>=history.length-1} 
                onClick={(e)=>{e.stopPropagation();setVerIndex(v=>v+1)}} 
                className="text-white hover:text-purple-400 disabled:opacity-30"
              >
                <ChevronRight size={12}/>
              </button>
            </div>
          )}
        </div>
        
        <div 
          className="p-4 flex-1 space-y-3 min-w-0 flex flex-col justify-center relative" 
          onClick={()=>toggleShotSelection(shot.id)}
        >
          <button 
            onClick={(e)=>{e.stopPropagation();toggleShotSelection(shot.id)}} 
            className={cn(
              "absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center transition-all", 
              selectedShotIds.includes(shot.id) 
                ? "bg-orange-500 border-orange-500 text-white" 
                : "border-slate-600 text-transparent hover:border-orange-500"
            )}
          >
            <CheckCircle2 size={14}/>
          </button>
          
          <div className="flex items-start justify-between gap-8 pr-6">
            <div className="text-sm text-slate-200 font-medium leading-relaxed">
              {shot.visual}
            </div>
          </div>
          
          {/* Phase 4.0: 显示主角/NPC/纯场景 */}
          <div className="flex flex-wrap gap-2 text-[10px]" onClick={e=>e.stopPropagation()}>
            {hasMainCast && (
              <div className="flex items-center gap-1 px-2 py-1 bg-green-900/30 text-green-300 rounded border border-green-800">
                <User size={10}/>
                <span>主角: {shot.mainCastIds.map(id => actors.find(a => a.id === id)?.name).filter(Boolean).join(", ")}</span>
              </div>
            )}
            
            {hasNPC && (
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-900/30 text-blue-300 rounded border border-blue-800">
                <Users size={10}/>
                <span>NPC: {shot.npcSpec}</span>
              </div>
            )}
            
            {isPureScene && (
              <div className="flex items-center gap-1 px-2 py-1 bg-slate-700/30 text-slate-400 rounded border border-slate-600">
                <MapPin size={10}/>
                <span>纯场景</span>
              </div>
            )}
          </div>
          
          {shot.audio && (
            <div className="flex gap-2 text-xs">
              <div className="bg-slate-950/50 p-2 rounded flex gap-2 border border-slate-800 items-center text-slate-400">
                <Mic size={12} className="text-purple-400"/> 
                {shot.audio}
              </div>
            </div>
          )}
          
          <div className="bg-purple-900/10 border border-purple-900/30 p-2.5 rounded text-[10px] font-mono text-purple-200/70 break-all select-all hover:border-purple-500/50 transition-colors">
            <span className="text-purple-500 font-bold select-none">Sora: </span>
            {shot.sora_prompt}
        </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <AnimaticPlayer isOpen={showAnimatic} onClose={() => setShowAnimatic(false)} shots={shots} images={shotImages} />
      
      <div className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/50 z-10 shrink-0">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-200 flex gap-2">
            <Clapperboard size={16}/> 导演控制台
          </h2>
          <button onClick={clearAll} className="text-slate-500 hover:text-red-400">
            <Trash2 size={14}/>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
          {/* Phase 4.1: 创作起点 Tab */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-3">
            <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2">
              <Film size={12}/> 创作起点
            </div>
            
            {/* Tabs */}
            <div className="flex gap-1 bg-slate-950/50 p-1 rounded-lg">
              <button
                onClick={() => setStoryInput(prev => ({...prev, mode: 'text'}))}
                className={cn(
                  "flex-1 px-2 py-1.5 text-[10px] rounded transition-all font-medium",
                  storyInput.mode === 'text' 
                    ? "bg-purple-600 text-white shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <FileText size={10} className="inline mr-1"/> 文本
              </button>
              <button
                onClick={() => setStoryInput(prev => ({...prev, mode: 'image'}))}
                className={cn(
                  "flex-1 px-2 py-1.5 text-[10px] rounded transition-all font-medium",
                  storyInput.mode === 'image' 
                    ? "bg-purple-600 text-white shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <ImageIcon size={10} className="inline mr-1"/> 母图
              </button>
              <button
                onClick={() => setStoryInput(prev => ({...prev, mode: 'audio'}))}
                className={cn(
                  "flex-1 px-2 py-1.5 text-[10px] rounded transition-all font-medium",
                  storyInput.mode === 'audio' 
                    ? "bg-purple-600 text-white shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Mic size={10} className="inline mr-1"/> 音频
              </button>
              <button
                onClick={() => setStoryInput(prev => ({...prev, mode: 'video'}))}
                className={cn(
                  "flex-1 px-2 py-1.5 text-[10px] rounded transition-all font-medium",
                  storyInput.mode === 'video' 
                    ? "bg-purple-600 text-white shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Video size={10} className="inline mr-1"/> 视频
              </button>
            </div>
            
            {/* Tab Content */}
            <div className="space-y-2">
              {storyInput.mode === 'text' && (
                <div className="text-[10px] text-slate-400 mb-1">
                  通过文字描述创建分镜
                </div>
              )}
              
              {storyInput.mode === 'image' && (
                <div className="space-y-3">
                  <div className="text-[10px] text-slate-400 mb-1">
                    上传单张母图作为视觉起点（非场景锚点）
                  </div>
                  {storyInput.image ? (
                    <div className="relative">
                      <img src={storyInput.image.dataUrl} className="w-full rounded border border-slate-600" alt="母图"/>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[9px] text-slate-500 truncate">{storyInput.image.name}</span>
                        <button
                          onClick={clearCurrentModeAsset}
                          className="px-2 py-1 bg-red-600/20 text-red-400 text-[9px] rounded border border-red-600/30 hover:bg-red-600/30"
                        >
                          清除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="block">
                      <div className="border-2 border-dashed border-purple-500/30 rounded-lg p-4 hover:border-purple-500 transition-colors cursor-pointer flex flex-col items-center gap-2">
                        <Upload size={20} className="text-purple-400"/>
                        <span className="text-[10px] text-purple-300">上传母图</span>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleSourceImageUpload} 
                        className="hidden"
                      />
                    </label>
                  )}
                  
                  {/* Phase 4.1.1: 母图模式优先级说明 */}
                  <div className="bg-purple-900/20 border border-purple-500/30 rounded p-2 space-y-1 text-[9px] text-purple-200/80">
                    <div>· 母图：故事/镜头起点（Primary）</div>
                    <div>· 主角池：人物一致性约束（Secondary）</div>
                    <div>· 场景锚点：世界一致性约束（Secondary）</div>
                  </div>
                  
                  {/* Phase 4.1.1: 场景锚点叠加开关 */}
                  <label className="flex items-start gap-2 cursor-pointer bg-slate-900/50 p-2 rounded border border-slate-700 hover:border-purple-500/50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={includeSceneAnchorInSourceMode}
                      onChange={(e) => setIncludeSceneAnchorInSourceMode(e.target.checked)}
                      className="mt-0.5 accent-purple-600"
                    />
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-300 leading-relaxed">
                        在母图模式中叠加【场景锚点图片】作为次级参考
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        若感觉结果被"场景图带跑"，关闭此开关
                      </div>
                    </div>
                  </label>
                </div>
              )}
              
              {storyInput.mode === 'audio' && (
                <div className="space-y-2">
                  <div className="text-[10px] text-orange-400 bg-orange-900/20 border border-orange-600/30 rounded p-2 mb-2">
                    ⚠️ 音频模式未实装（暂不参与生成）
                  </div>
                  {storyInput.audio ? (
                    <div className="bg-slate-900 border border-slate-700 rounded p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Mic size={12} className="text-purple-400"/>
                        <span className="text-[10px] text-slate-300 truncate flex-1">{storyInput.audio.name}</span>
                      </div>
                      <div className="text-[9px] text-slate-500">{formatFileSize(storyInput.audio.size)}</div>
                      <button
                        onClick={clearCurrentModeAsset}
                        className="w-full px-2 py-1 bg-red-600/20 text-red-400 text-[9px] rounded border border-red-600/30 hover:bg-red-600/30"
                      >
                        清除
                      </button>
                    </div>
                  ) : (
                    <label className="block">
                      <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 hover:border-slate-500 transition-colors cursor-pointer flex flex-col items-center gap-2">
                        <Upload size={20} className="text-slate-400"/>
                        <span className="text-[10px] text-slate-400">上传音频文件</span>
                      </div>
                      <input 
                        type="file" 
                        accept="audio/*" 
                        onChange={handleAudioUpload} 
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              )}
              
              {storyInput.mode === 'video' && (
                <div className="space-y-2">
                  <div className="text-[10px] text-orange-400 bg-orange-900/20 border border-orange-600/30 rounded p-2 mb-2">
                    ⚠️ 视频模式未实装（暂不参与生成）
                  </div>
                  {storyInput.video ? (
                    <div className="bg-slate-900 border border-slate-700 rounded p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Video size={12} className="text-purple-400"/>
                        <span className="text-[10px] text-slate-300 truncate flex-1">{storyInput.video.name}</span>
                      </div>
                      <div className="text-[9px] text-slate-500">{formatFileSize(storyInput.video.size)}</div>
                      <button
                        onClick={clearCurrentModeAsset}
                        className="w-full px-2 py-1 bg-red-600/20 text-red-400 text-[9px] rounded border border-red-600/30 hover:bg-red-600/30"
                      >
                        清除
                      </button>
                    </div>
                  ) : (
                    <label className="block">
                      <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 hover:border-slate-500 transition-colors cursor-pointer flex flex-col items-center gap-2">
                        <Upload size={20} className="text-slate-400"/>
                        <span className="text-[10px] text-slate-400">上传视频文件</span>
                      </div>
                      <input 
                        type="file" 
                        accept="video/*" 
                        onChange={handleVideoUpload} 
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Phase 4.1.1: 剧本/导演意图（所有模式下都可见） */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-3">
            {storyInput.mode === 'image' && (
              <div className="text-[10px] text-blue-300 bg-blue-900/20 border border-blue-500/30 rounded p-2 mb-2">
                💡 建议填写导演意图以控制镜头拆解；不填将主要依赖母图推断
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                <FileText size={10}/> 剧本 / 台词 {storyInput.mode === 'text' && <span className="text-red-400">*</span>}
              </label>
              <textarea 
                value={script} 
                onChange={e => setScript(e.target.value)} 
                className="w-full h-20 bg-slate-900 border-slate-700 rounded p-2 text-[10px] focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono placeholder:text-slate-600" 
                placeholder="例如：(旁白) 2077年，霓虹灯下的雨夜..."
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                <Video size={10}/> 导演意图 {storyInput.mode === 'text' && <span className="text-red-400">*</span>}
              </label>
              <textarea 
                value={direction} 
                onChange={e => setDirection(e.target.value)} 
                className="w-full h-16 bg-slate-900 border-slate-700 rounded p-2 text-[10px] focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600" 
                placeholder="例如：赛博朋克风格，雨夜霓虹..."
              />
            </div>
          </div>
          
          {/* Phase 4.0: 主角池选择（≤2个） */}
          <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-500/30 rounded-lg p-3 space-y-2">
            <label className="text-xs font-bold text-green-300 flex items-center gap-1.5">
              <User size={12}/> 主角池（最多 2 个）
            </label>
            <div className="text-[10px] text-green-200/60 mb-2">
              来自演员库的资产级角色，保持跨镜头一致性
            </div>
            
            {actors.length === 0 ? (
              <div className="text-[10px] text-slate-500 p-2 bg-slate-800/50 rounded">
                暂无演员，请先在"角色工坊"签约演员
              </div>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                {actors.map(actor => (
                  <button
                    key={actor.id}
                    onClick={() => toggleMainActor(actor.id)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded text-[10px] flex items-center justify-between transition-all",
                      mainActorIds.includes(actor.id)
                        ? "bg-green-600 text-white border border-green-500"
                        : "bg-slate-800 text-slate-300 border border-slate-700 hover:border-green-500"
                    )}
                  >
                    <span>{actor.name}</span>
                    {mainActorIds.includes(actor.id) && <CheckCircle2 size={12}/>}
                  </button>
                ))}
              </div>
            )}
            
            <div className="text-[10px] text-green-300/80 flex items-center gap-1">
              <span>已选: {mainActorIds.length}/2</span>
            </div>
          </div>
          
          {/* Phase 4.0: 场景锚点 */}
          <div className="bg-gradient-to-r from-blue-900/20 to-cyan-900/20 border border-blue-500/30 rounded-lg p-3 space-y-2">
            <label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
              <MapPin size={12}/> 场景锚点
            </label>
            <div className="text-[10px] text-blue-200/60 mb-2">
              影响所有镜头的空间一致性
            </div>
            
            <textarea 
              value={sceneAnchor.description} 
              onChange={e => setSceneAnchor(prev => ({...prev, description: e.target.value}))} 
              className="w-full h-16 bg-slate-800 border-slate-700 rounded-lg p-2 text-[10px] focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-600" 
              placeholder="例如：赛博朋克城市街道，雨夜，霓虹灯反射在湿滑地面..."
            />
            
            <div className="space-y-2">
              <div className="text-[10px] text-blue-300/80">参考图（最多 3 张）</div>
              
              {sceneAnchor.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {sceneAnchor.images.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded overflow-hidden border border-blue-500/30">
                      <img src={img} className="w-full h-full object-cover"/>
                      <button
                        onClick={() => removeSceneAnchorImage(idx)}
                        className="absolute top-0.5 right-0.5 bg-red-600 rounded-full p-0.5 text-white hover:bg-red-500"
                      >
                        <X size={10}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {sceneAnchor.images.length < 3 && (
                <label className="block">
                  <div className="border-2 border-dashed border-blue-500/30 rounded-lg p-3 hover:border-blue-500 transition-colors cursor-pointer flex flex-col items-center gap-1">
                    <Plus size={16} className="text-blue-400"/>
                    <span className="text-[10px] text-blue-300">添加场景图片</span>
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    onChange={handleSceneAnchorImageUpload} 
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
          
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
              <Settings size={12}/> 分镜设置
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">画面比例</label>
                <select 
                  value={sbAspectRatio} 
                  onChange={(e) => setSbAspectRatio(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="2.35:1">2.35:1</option>
                </select>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">语言</label>
                <select 
                  value={sbTargetLang} 
                  onChange={(e) => setSbTargetLang(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
                >
                  <option value="English">English</option>
                  <option value="Chinese">中文</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Phase 4.1: 生成按钮（audio/video 模式禁用） */}
          {(storyInput.mode === 'audio' || storyInput.mode === 'video') && (
            <div className="text-[10px] text-orange-400 bg-orange-900/20 border border-orange-600/30 rounded p-2 text-center">
              {storyInput.mode === 'audio' ? '音频' : '视频'}模式未实装，生成功能暂时禁用
          </div>
          )}
          <button 
            onClick={handleAnalyzeScript} 
            disabled={isAnalyzing || storyInput.mode === 'audio' || storyInput.mode === 'video'} 
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-lg font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Clapperboard size={16}/>} 
            {isAnalyzing ? '分析中...' : '生成分镜表'}
          </button>
        </div>
        
        <div className="h-1/3 border-t border-slate-800 flex flex-col bg-slate-900/30">
          <div className="p-2 border-b border-slate-800/50 text-xs text-slate-500 flex justify-between items-center px-4">
            <span className="flex items-center gap-2 font-medium text-slate-400">
              <MessageSquare size={12}/> AI 导演助手
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.map((m, i) => (
              <div 
                key={i} 
                className={cn(
                  "rounded-lg p-2.5 text-xs shadow-sm max-w-[85%]", 
                  m.role==='user' 
                    ? "bg-purple-600 text-white ml-auto" 
                    : "bg-slate-800 text-slate-300 border border-slate-700"
                )}
              >
                {m.content}
              </div>
            ))}
            <ChangePreview />
            <div ref={chatEndRef}/>
          </div>
          
          <div className="p-3 border-t border-slate-800 flex gap-2">
            <input 
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 transition-colors" 
              placeholder="输入修改建议..."
            />
            <button 
              onClick={handleSendMessage} 
              className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors shadow-lg shadow-purple-900/20"
            >
              <Send size={14}/>
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 bg-slate-950 overflow-hidden flex flex-col">
        <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-4 bg-slate-900/80 backdrop-blur shrink-0">
          <button 
            onClick={()=>setActiveTab("shots")} 
            className={cn(
              "px-4 py-2 text-sm font-bold border-b-2 transition-all", 
              activeTab==="shots" ? "border-purple-500 text-white" : "border-transparent text-slate-500"
            )}
          >
            分镜 Shot ({shots.length})
          </button>
          <button 
            onClick={()=>setActiveTab("scenes")} 
            className={cn(
              "px-4 py-2 text-sm font-bold border-b-2 transition-all", 
              activeTab==="scenes" ? "border-orange-500 text-white" : "border-transparent text-slate-500"
            )}
          >
            大分镜 Scene ({scenes.length})
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {activeTab === "shots" ? (
            <div className="max-w-4xl mx-auto pb-20 space-y-4">
              <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur py-3 mb-4 border-b border-slate-800/50">
                <div className="flex justify-between items-center mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2>
                    <button 
                      onClick={()=>setShowAnimatic(true)} 
                      className="ml-4 flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg"
                    >
                      <Film size={12}/> 播放预览
                    </button>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleDownload('csv')} 
                      className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <FileSpreadsheet size={12}/> 导出 CSV
                    </button>
                    <button 
                      onClick={() => handleDownload('all')} 
                      className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <Download size={12}/> 打包全部
                    </button>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-500/30 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-xs text-orange-200/80 flex items-center gap-3">
                    <span className="font-bold text-orange-400">① 生成小分镜</span>
                    <span className="text-orange-500">→</span>
                    <span className="font-bold text-orange-400">② 勾选镜头</span>
                    <span className="text-orange-500">→</span>
                    <span className="font-bold text-orange-400">③ 组装大分镜</span>
                  </div>
                  <button 
                    onClick={compileScene} 
                    disabled={selectedShotIds.length < 1} 
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Layers size={16}/> 组合为大分镜 ({selectedShotIds.length})
                  </button>
                </div>
              </div>
              
              {shots.map(s => (
                <div 
                  key={s.id} 
                  className={cn(
                    "cursor-pointer border-2 rounded-xl transition-all", 
                    selectedShotIds.includes(s.id) 
                      ? "border-orange-500 bg-orange-900/10 ring-2 ring-orange-500" 
                      : "border-transparent"
                  )} 
                  onClick={()=>toggleShotSelection(s.id)}
                >
                  <ShotCard shot={s} currentAr={sbAspectRatio}/>
                </div>
              ))}
              
              {shots.length===0 && (
                <div className="text-center text-slate-500 mt-20">暂无分镜</div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto pb-20">
                {scenes.map(scene => (
                <div 
                  key={scene.id} 
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-orange-500/50 transition-all"
                >
                        <div className="aspect-video bg-black relative">
                    {scene.video_url ? (
                      <video src={scene.video_url} controls className="w-full h-full object-cover"/>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center relative">
                        {scene.startImg && (
                          <>
                            <img 
                              src={typeof scene.startImg==='string' ? scene.startImg : scene.startImg.url} 
                              className="w-full h-full object-cover opacity-50"
                            />
                            <div className="absolute inset-0 bg-black/60"/>
                          </>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <button 
                            onClick={()=>handleGenSceneVideo(scene)} 
                            className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"
                          >
                            <Film size={18}/> 生成长视频 ({scene.duration}s)
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-orange-600 text-white text-[10px] px-2 py-1 rounded font-bold shadow">
                      {scene.title}
                    </div>
                        </div>
                  
                        <div className="p-4 space-y-2">
                    <div className="text-xs text-slate-500 font-mono bg-black/30 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap select-all">
                      {scene.prompt}
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span>包含 {scene.shots.length} 个镜头</span>
                      <button 
                        onClick={()=>navigator.clipboard.writeText(scene.prompt)} 
                        className="hover:text-white"
                      >
                        <Copy size={12}/>
                      </button>
                    </div>
                        </div>
                    </div>
                ))}
              
              {scenes.length === 0 && (
                <div className="col-span-full text-center text-slate-600 mt-20">
                  暂无大分镜。请在"分镜 Shot"标签页选中多个镜头进行组合。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
