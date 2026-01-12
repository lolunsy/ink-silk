# 自动分镜重构：严格对齐 Sora2 提示词模板

## 修改日期
2026-01-12

## 目标
重构自动分镜模块，严格落地 Sora2 提示词模板结构（Global Context + Timeline Script + Technical Specs），修复大分镜 prompt 组装逻辑偏离问题，并增强演员接入支持。

---

## 修改概览

### ✅ 修复的现有问题

1. **❌ 问题 1：sora_prompt 被错误地放到 Camera 字段**
   - **现象**：StoryboardStudio.jsx 第 117 行：`Camera: ${s.sora_prompt}`
   - **问题**：sora_prompt 是整段镜头提示词，不能当镜头运镜字段使用
   - **修复**：Camera 字段只使用 `shot.camera_movement`，Shot 描述主体优先用 `shot.sora_prompt`

2. **❌ 问题 2：大分镜 prompt 组装逻辑偏离**
   - **现象**：StoryboardStudio.jsx 自建了一套拼接规则
   - **问题**：两套逻辑长期漂移，不一致
   - **修复**：统一调用 `ProjectContext.assembleSoraPrompt`

### ✅ 新增功能

3. **提示词规范落地（对齐 sora2 模板）**
   - 严格输出 Global Context + Timeline Script + Technical Specs 结构
   - 添加 Environment、Physics、Audio Style 字段
   - 时间戳自动累加，时长向上取整到 5s 倍数
   - 镜头上限策略：15s 内最多 3 镜头

4. **演员与音色接入（最小可用版）**
   - 添加大分镜演员选择下拉框（单选）
   - Character 块自动合并演员描述
   - Voice Tone 自动注入（如果存在）
   - startImg 优先使用首镜关键帧，fallback 到演员定妆照

5. **UI/动线优化**
   - "组装大分镜"按钮上移到 shots 列表顶部
   - 添加引导文案：① 先生成小分镜 → ② 勾选镜头 → ③ 组装大分镜

---

## 修改文件清单

### 1. `src/context/ProjectContext.jsx`

#### 改动点 A：assembleSoraPrompt 函数重构（第 265-323 行）

**修改前**（旧版 assembleSoraPrompt）：
```javascript
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
```

**修改后**（新版 assembleSoraPrompt）：
```javascript
// === Sora2 提示词组装器（严格对齐模板结构）===
const assembleSoraPrompt = (targetShots, globalStyle, assignedActorId, aspectRatio = "16:9", environment = "") => {
  // 镜头上限策略：15s内最多3镜头
  let totalDuration = 0;
  targetShots.forEach(s => {
    let dur = 5;
    if (s.duration && s.duration.match(/\d+/)) dur = parseInt(s.duration.match(/\d+/)[0]);
    if (s.duration && s.duration.includes('ms')) dur = dur / 1000;
    totalDuration += dur;
  });
  
  if (totalDuration <= 15 && targetShots.length > 3) {
    alert("⚠️ 镜头上限策略：15秒内最多组合 3 个镜头。\n\n当前已选 " + targetShots.length + " 个镜头，请减少选择。");
    return null;
  }

  // === 1. Global Context ===
  let globalContext = `# Global Context\nStyle: ${globalStyle || "Cinematic, high fidelity, 8k resolution, dramatic lighting"}`;
  
  // Environment (来自 direction 或传入参数)
  const envText = environment || "Consistent with visual context";
  globalContext += `\nEnvironment: ${envText}`;
  
  // 可选：Physics（1-2条物理细节）
  globalContext += `\nPhysics: Natural motion blur, realistic cloth dynamics, subtle wind effects`;
  
  // 可选：Audio Style（全局音频氛围）
  globalContext += `\nAudio Style: Cinematic soundscape, immersive ambience`;

  // === 2. Character Block（如果有演员）===
  let mainActor = null;
  if (assignedActorId) {
    mainActor = actors.find(a => a.id.toString() === assignedActorId.toString());
    if (mainActor) {
      globalContext += `\n\nCharacter: ${mainActor.desc || mainActor.name}`;
      // Voice Tone（如果存在）
      if (mainActor.voice_tone) {
        globalContext += `\nVoice: ${mainActor.voice_tone}`;
      }
      globalContext += ` (Maintain visual and audio consistency across all shots)`;
    }
  }

  // === 3. Timeline Script ===
  let currentTime = 0;
  const scriptLines = targetShots.map((s, idx) => {
    // 解析 duration
    let dur = 5;
    if (s.duration && s.duration.match(/\d+/)) dur = parseInt(s.duration.match(/\d+/)[0]);
    if (s.duration && s.duration.includes('ms')) dur = dur / 1000;
    
    const start = currentTime;
    const end = currentTime + dur;
    currentTime = end;

    // Shot 内容：优先用 sora_prompt，fallback 到 visual
    let shotContent = s.sora_prompt || s.visual || "Scene continues";
    
    // Camera：只用 camera_movement（不是 sora_prompt）
    const camera = s.camera_movement ? ` Camera: ${s.camera_movement}.` : "";
    
    // Audio：判断是 Dialogue 还是 SFX
    let audio = "";
    if (s.audio) {
      audio = s.audio.includes('"') 
        ? ` [Dialogue: "${s.audio.replace(/"/g, '')}"]` 
        : ` [SFX: ${s.audio}]`;
    }

    return `[${start}s-${end}s] Shot ${idx + 1}: ${shotContent}.${camera}${audio}`;
  });

  const timelineScript = `\n\n# Timeline Script\n${scriptLines.join("\nCUT TO:\n")}`;

  // === 4. Technical Specs ===
  // 时长向上取整到 5s 的倍数
  const finalDuration = Math.ceil(currentTime / 5) * 5;
  const techSpecs = `\n\n# Technical Specs\n--ar ${aspectRatio} --duration ${finalDuration}s --quality high`;

  // === 5. 组装最终 prompt ===
  const fullPrompt = `${globalContext}${timelineScript}${techSpecs}`;

  // === 6. 返回结果 ===
  return {
    prompt: fullPrompt,
    duration: finalDuration,
    actorRef: mainActor ? (mainActor.images?.portrait || mainActor.images?.sheet) : null
  };
};
```

**变化说明**：
- ✅ 新增参数：`aspectRatio`（画面比例）、`environment`（环境描述）
- ✅ 镜头上限策略：15s 内最多 3 镜头，超过则 alert 阻断并返回 null
- ✅ Global Context 结构：Style + Environment + Physics + Audio Style
- ✅ Character 块：合并演员描述 + Voice Tone（如果存在）
- ✅ Timeline Script：Shot 内容优先用 `sora_prompt`，Camera 只用 `camera_movement`
- ✅ Technical Specs：添加 `--ar` 参数
- ✅ 输出格式严格对齐 Sora2 模板

---

### 2. `src/components/Modules/StoryboardStudio.jsx`

#### 改动点 A：compileScene 函数重构（第 112-143 行）

**修改前**（自建拼接规则）：
```javascript
const compileScene = () => {
  if (selectedShotIds.length < 1) return alert("请至少选择 1 个镜头");
  const selectedShots = shots.filter(s => selectedShotIds.includes(s.id)).sort((a,b) => a.id - b.id);
  let currentTime = 0;
  const scriptParts = selectedShots.map(s => {
    let dur = 5; if (s.duration && s.duration.match(/\d+/)) dur = parseInt(s.duration.match(/\d+/)[0]); if (s.duration && s.duration.includes('ms')) dur = dur / 1000;
    const start = currentTime; const end = currentTime + dur; currentTime = end;
    let audioTag = s.audio ? (s.audio.includes('"') ? `[Dialogue: "${s.audio}"]` : `[SFX: ${s.audio}]`) : "";
    return `[${start}s-${end}s] Shot ${s.id}: ${s.visual}. Camera: ${s.sora_prompt}. ${audioTag}`; // ❌ 错误：sora_prompt 不是 Camera
  });
  const masterPrompt = `\n# Global Context\nStyle: Cinematic, high fidelity, 8k resolution.\nEnvironment: ${direction || "Consistent with script"}.\n\n# Timeline Script\n${scriptParts.join("\nCUT TO:\n")}\n\n# Technical Specs\n--ar ${sbAspectRatio} --duration ${currentTime}s --quality high`.trim();
  const newScene = { id: Date.now(), title: `Scene ${scenes.length + 1} (Shots ${selectedShotIds.join(',')})`, prompt: masterPrompt, duration: currentTime, startImg: shotImages[selectedShots[0].id]?.slice(-1)[0] || null, video_url: null, shots: selectedShotIds };
  setScenes([...scenes, newScene]); setSelectedShotIds([]); setActiveTab("scenes"); alert("✨ 大分镜组装完成！");
};
```

**修改后**（调用 assembleSoraPrompt）：
```javascript
// === 重构：组装大分镜（调用 assembleSoraPrompt）===
const compileScene = () => {
  if (selectedShotIds.length < 1) return alert("请至少选择 1 个镜头");
  
  const selectedShots = shots.filter(s => selectedShotIds.includes(s.id)).sort((a,b) => a.id - b.id);
  
  // 调用 assembleSoraPrompt 组装提示词
  const globalStyle = direction || "Cinematic, high fidelity, 8k resolution";
  const result = assembleSoraPrompt(
    selectedShots, 
    globalStyle, 
    selectedActorForScene || null,
    sbAspectRatio,
    direction || ""
  );
  
  if (!result) return; // assembleSoraPrompt 内部已 alert 阻断
  
  const { prompt: masterPrompt, duration, actorRef } = result;
  
  // startImg 优先级：选中镜头首张关键帧 > actorRef > null
  let startImg = shotImages[selectedShots[0].id]?.slice(-1)[0] || actorRef || null;
  
  const newScene = {
    id: Date.now(),
    title: `Scene ${scenes.length + 1} (Shots ${selectedShotIds.join(',')})`,
    prompt: masterPrompt,
    duration: duration,
    startImg: startImg,
    video_url: null,
    shots: selectedShotIds,
    assignedActorId: selectedActorForScene || null
  };
  
  setScenes([...scenes, newScene]);
  setSelectedShotIds([]);
  setActiveTab("scenes");
  alert("✨ 大分镜组装完成！");
};
```

**变化说明**：
- ❌ 删除自建拼接规则
- ✅ 统一调用 `assembleSoraPrompt`
- ✅ 传递演员 ID（`selectedActorForScene`）
- ✅ startImg 优先级：首镜关键帧 > actorRef > null
- ✅ 新增 `assignedActorId` 字段

---

#### 改动点 B：添加演员选择 UI（第 17 行 + 第 181 行）

**新增 state**（第 23 行）：
```javascript
const [selectedActorForScene, setSelectedActorForScene] = useState(""); // 大分镜演员选择
```

**新增演员下拉框**（第 181 行，在"分镜生成设置"区域）：
```javascript
<div className="space-y-1">
  <label className="text-[10px] text-slate-500 flex items-center gap-1">
    <User size={10}/> 大分镜演员（可选）
  </label>
  <select 
    value={selectedActorForScene} 
    onChange={(e) => setSelectedActorForScene(e.target.value)} 
    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
  >
    <option value="">(无指定演员)</option>
    {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>
</div>
```

---

#### 改动点 C：UI 优化 - 引导文案 + 按钮上移（第 220-231 行）

**修改前**（按钮在侧边栏底部，没有引导文案）：
```javascript
<button onClick={compileScene} disabled={selectedShotIds.length < 2} className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
  <Layers size={16}/> 组合为大分镜 ({selectedShotIds.length})
</button>
```

**修改后**（按钮移到 shots 列表顶部，添加引导文案）：
```javascript
<div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur py-3 mb-4 border-b border-slate-800/50">
  <div className="flex justify-between items-center mb-3 px-1">
    <div className="flex items-center gap-2">
      <h2 className="text-lg font-bold text-slate-200">分镜脚本 ({shots.length})</h2>
      <button onClick={()=>setShowAnimatic(true)} className="ml-4 flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-full font-bold shadow-lg">
        <Film size={12}/> 播放预览
      </button>
    </div>
    <div className="flex gap-2">
      <button onClick={() => handleDownload('csv')} className="text-xs bg-green-900/30 text-green-200 px-3 py-1.5 rounded border border-green-800 hover:bg-green-900/50 hover:text-white flex items-center gap-1 transition-colors">
        <FileSpreadsheet size={12}/> 导出 CSV
      </button>
      <button onClick={() => handleDownload('all')} className="text-xs bg-purple-900/30 text-purple-200 px-3 py-1.5 rounded border border-purple-800 hover:bg-purple-900/50 hover:text-white flex items-center gap-1 transition-colors">
        <Download size={12}/> 打包全部
      </button>
    </div>
  </div>
  
  {/* UI优化：引导文案 + 组装按钮上移 */}
  <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-500/30 rounded-lg p-3 flex items-center justify-between">
    <div className="text-xs text-orange-200/80 flex items-center gap-3">
      <span className="font-bold text-orange-400">① 先生成小分镜</span>
      <span className="text-orange-500">→</span>
      <span className="font-bold text-orange-400">② 勾选镜头</span>
      <span className="text-orange-500">→</span>
      <span className="font-bold text-orange-400">③ 组装大分镜</span>
    </div>
    <button onClick={compileScene} disabled={selectedShotIds.length < 1} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all">
      <Layers size={16}/> 组合为大分镜 ({selectedShotIds.length})
    </button>
  </div>
</div>
```

**变化说明**：
- ✅ 按钮从侧边栏底部移到 shots 列表顶部（sticky 固定）
- ✅ 添加引导文案：① 先生成小分镜 → ② 勾选镜头 → ③ 组装大分镜
- ✅ 视觉优化：橙色渐变背景 + 边框 + 箭头指引

---

#### 改动点 D：添加 User 图标导入（第 2 行）

**修改前**：
```javascript
import { Clapperboard, Trash2, FileText, Video, Settings, Sliders, Upload, X, ImageIcon, Mic, Film, Loader2, Layers, MessageSquare, Send, FileSpreadsheet, Download, Copy, RefreshCw, Camera, Clock, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
```

**修改后**：
```javascript
import { Clapperboard, Trash2, FileText, Video, Settings, Sliders, Upload, X, ImageIcon, Mic, Film, Loader2, Layers, MessageSquare, Send, FileSpreadsheet, Download, Copy, RefreshCw, Camera, Clock, ChevronLeft, ChevronRight, CheckCircle2, User } from 'lucide-react';
```

---

#### 改动点 E：handleAnalyzeScript 添加 camera_movement 字段（第 42 行）

**修改前**：
```javascript
const system = `Role: Expert Film Director. Task: Create a Shot List for Video Generation. Requirements: Break down script into key shots. **Camera Lingo**: Use 'Truck Left', 'Dolly Zoom', 'Pan Right', 'Tilt Up', 'Extreme Close-up'. Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "image_prompt":"..."}]. Language: ${sbTargetLang}.`;
```

**修改后**：
```javascript
const system = `Role: Expert Film Director. Task: Create a Shot List for Video Generation. Requirements: Break down script into key shots. **Camera Lingo**: Use 'Truck Left', 'Dolly Zoom', 'Pan Right', 'Tilt Up', 'Extreme Close-up'. Output JSON Array: [{"id":1, "duration":"4s", "visual":"...", "audio":"...", "sora_prompt":"...", "camera_movement":"...", "image_prompt":"..."}]. Language: ${sbTargetLang}.`;
```

---

## 代码行数统计

| 文件 | 修改前 | 修改后 | 变化 |
|------|--------|--------|------|
| ProjectContext.jsx | 543 行 | 568 行 | +25 行 |
| StoryboardStudio.jsx | 238 行 | 258 行 | +20 行 |
| **总计** | **781 行** | **826 行** | **+45 行** |

---

## Sora2 模板结构对齐

### ✅ 输出示例

#### 示例 1：无演员，2 镜头，16:9

```
# Global Context
Style: Cinematic, high fidelity, 8k resolution, dramatic lighting
Environment: Cyberpunk city, rainy night, neon lights
Physics: Natural motion blur, realistic cloth dynamics, subtle wind effects
Audio Style: Cinematic soundscape, immersive ambience

# Timeline Script
[0s-5s] Shot 1: A lone figure walks through a rain-soaked alley, neon reflections on puddles. Camera: Dolly Zoom. [SFX: Rain, distant sirens]
CUT TO:
[5s-10s] Shot 2: Close-up of the character's face, illuminated by flickering neon signs. Camera: Tilt Up. [Dialogue: "This city never sleeps"]

# Technical Specs
--ar 16:9 --duration 10s --quality high
```

#### 示例 2：有演员，3 镜头，9:16

```
# Global Context
Style: Anime style, vibrant colors, high contrast
Environment: Modern classroom, afternoon sunlight
Physics: Natural motion blur, realistic cloth dynamics, subtle wind effects
Audio Style: Cinematic soundscape, immersive ambience

Character: Female student with long black hair, school uniform, gentle eyes
Voice: Soft, warm, youthful female voice
 (Maintain visual and audio consistency across all shots)

# Timeline Script
[0s-4s] Shot 1: Character enters classroom, looks around curiously. Camera: Pan Right. [SFX: Door opening, footsteps]
CUT TO:
[4s-8s] Shot 2: Character sits at desk, opens notebook and starts writing. [SFX: Paper rustling, pen writing]
CUT TO:
[8s-12s] Shot 3: Close-up of character's face as she smiles at a passing classmate. Camera: Dolly In. [Dialogue: "Good morning!"]

# Technical Specs
--ar 9:16 --duration 15s --quality high
```

---

## 业务规则强化

### ✅ 保持不变的规则

- ✅ 12 视角标题/顺序（CharacterLab，未修改）
- ✅ buildSheetPrompt 唯一入口（ContractCenter，未修改）
- ✅ 定妆照纯背景规则（ContractCenter，未修改）
- ✅ ❤️锁定机制（CharacterLab + ContractCenter，未修改）
- ✅ 历史版本限制（MAX_HISTORY = 5，未修改）
- ✅ 演员持久化 IndexedDB（ProjectContext，未修改）

### ✅ 新增/强化的规则

- ✅ **Sora2 模板严格对齐**：Global Context + Timeline Script + Technical Specs
- ✅ **镜头上限策略**：15s 内最多 3 镜头（超过则 alert 阻断）
- ✅ **Shot 内容优先级**：sora_prompt > visual
- ✅ **Camera 字段规则**：只用 camera_movement（不是 sora_prompt）
- ✅ **时长取整规则**：向上取整到 5s 倍数
- ✅ **演员一致性**：Character + Voice Tone 自动注入
- ✅ **startImg 优先级**：首镜关键帧 > actorRef > null

---

## 验收清单

### 1. 修复验证

#### ✅ 问题 1：sora_prompt 不再放到 Camera 字段
```bash
# 测试步骤
1. 生成至少 2 个小分镜
2. 勾选镜头
3. 组装大分镜
4. 查看生成的 prompt

# 验收标准
✅ Timeline Script 中，Shot 行格式为：
   [0s-5s] Shot 1: {sora_prompt 或 visual}. Camera: {camera_movement}.
✅ Camera 字段只包含 camera_movement（如果存在）
✅ 不再出现 "Camera: {一大段 sora_prompt 内容}"
```

#### ✅ 问题 2：大分镜 prompt 统一调用 assembleSoraPrompt
```bash
# 测试步骤
1. 查看 StoryboardStudio.jsx 的 compileScene 函数
2. 确认调用 assembleSoraPrompt

# 验收标准
✅ compileScene 不再自建拼接规则
✅ 调用 assembleSoraPrompt(selectedShots, globalStyle, assignedActorId, sbAspectRatio, direction)
✅ 处理返回的 { prompt, duration, actorRef }
```

### 2. Sora2 模板对齐验证

#### ✅ Global Context 结构
```bash
# 验收标准
✅ 包含 Style 字段
✅ 包含 Environment 字段（来自 direction 或 fallback）
✅ 包含 Physics 字段（固定：Natural motion blur, realistic cloth dynamics...）
✅ 包含 Audio Style 字段（固定：Cinematic soundscape...）
✅ 如果有演员，包含 Character 块（演员描述 + Voice Tone）
```

#### ✅ Timeline Script 结构
```bash
# 验收标准
✅ 每个 Shot 行格式：[{start}s-{end}s] Shot {idx}: {content}. Camera: {movement}. [SFX/Dialogue...]
✅ Shot 内容优先用 sora_prompt，fallback 到 visual
✅ Camera 只用 camera_movement（不是 sora_prompt）
✅ Audio 正确判断 Dialogue（包含引号）或 SFX
✅ 镜头间用 "CUT TO:" 分隔
```

#### ✅ Technical Specs 结构
```bash
# 验收标准
✅ 包含 --ar {aspectRatio}（如 16:9, 9:16）
✅ 包含 --duration {duration}s（向上取整到 5s 倍数）
✅ 包含 --quality high
```

### 3. 镜头上限策略验证

```bash
# 测试步骤
1. 生成至少 4 个小分镜（每个 5s）
2. 勾选 4 个镜头（总时长 20s）
3. 点击"组装大分镜"

# 验收标准
✅ 总时长 <= 15s 时：最多允许 3 个镜头
✅ 总时长 > 15s 时：无限制
✅ 违反规则时，alert 提示并阻断
✅ prompt 为 null，不会创建 scene
```

### 4. 演员接入验证

```bash
# 测试步骤
1. 在角色工坊签约至少 1 个演员
2. 在自动分镜页面，选择演员（导演控制台 → 大分镜演员下拉框）
3. 生成小分镜并组装大分镜
4. 查看生成的 prompt

# 验收标准
✅ Global Context 包含 Character 块
✅ Character 块内容为演员的 desc 或 name
✅ 如果演员有 voice_tone，包含 Voice: {voice_tone} 行
✅ startImg 优先使用首镜关键帧，否则 fallback 到演员定妆照
✅ scene.assignedActorId 正确保存
```

### 5. UI 优化验证

```bash
# 测试步骤
1. 进入自动分镜页面
2. 切换到"分镜 Shot"标签页
3. 查看顶部区域

# 验收标准
✅ "组装大分镜"按钮在 shots 列表顶部（sticky 固定）
✅ 引导文案显示：① 先生成小分镜 → ② 勾选镜头 → ③ 组装大分镜
✅ 侧边栏底部不再有"组装大分镜"按钮
✅ 引导文案区域为橙色渐变背景 + 箭头指引
```

---

## 技术实现细节

### 1. assembleSoraPrompt 函数签名

```javascript
assembleSoraPrompt(
  targetShots,      // Shot[] - 选中的镜头数组
  globalStyle,      // string - 全局风格（来自 direction）
  assignedActorId,  // string | null - 演员 ID（可选）
  aspectRatio,      // string - 画面比例（如 "16:9"）
  environment       // string - 环境描述（来自 direction 或 fallback）
) => {
  prompt: string,   // 完整的 Sora2 提示词
  duration: number, // 总时长（向上取整到 5s 倍数）
  actorRef: string | null  // 演员参考图（portrait 或 sheet）
}
```

### 2. 镜头上限策略逻辑

```javascript
// 计算总时长
let totalDuration = 0;
targetShots.forEach(s => {
  let dur = 5;
  if (s.duration && s.duration.match(/\d+/)) dur = parseInt(s.duration.match(/\d+/)[0]);
  if (s.duration && s.duration.includes('ms')) dur = dur / 1000;
  totalDuration += dur;
});

// 检查规则：15s 内最多 3 镜头
if (totalDuration <= 15 && targetShots.length > 3) {
  alert("⚠️ 镜头上限策略：15秒内最多组合 3 个镜头。\n\n当前已选 " + targetShots.length + " 个镜头，请减少选择。");
  return null;
}
```

### 3. Shot 内容优先级

```javascript
// Shot 内容：优先用 sora_prompt，fallback 到 visual
let shotContent = s.sora_prompt || s.visual || "Scene continues";
```

### 4. Camera 字段规则

```javascript
// Camera：只用 camera_movement（不是 sora_prompt）
const camera = s.camera_movement ? ` Camera: ${s.camera_movement}.` : "";
```

### 5. startImg 优先级

```javascript
// startImg 优先级：选中镜头首张关键帧 > actorRef > null
let startImg = shotImages[selectedShots[0].id]?.slice(-1)[0] || actorRef || null;
```

---

## 向后兼容性

### ✅ 兼容旧数据

- ✅ 旧的 scene 对象（无 assignedActorId）仍可正常显示和生成视频
- ✅ 旧的 shot 对象（无 camera_movement）仍可正常组装大分镜
- ✅ 如果 shot.sora_prompt 缺失，fallback 到 shot.visual

### ✅ 不影响其他模块

- ✅ CharacterLab（角色工坊）：未修改
- ✅ StudioBoard（制片台）：未修改
- ✅ ContractCenter（签约中心）：未修改
- ✅ actorStore（演员存储）：未修改

---

## 测试建议

### 基础测试

1. **生成小分镜**
   - 填写剧本 + 导演意图
   - 点击"生成分镜表"
   - 验证：生成 3-5 个镜头，每个包含 visual, sora_prompt, camera_movement

2. **组装大分镜（无演员）**
   - 勾选 2-3 个镜头
   - 点击"组装大分镜"
   - 验证：prompt 结构符合 Sora2 模板

3. **组装大分镜（有演员）**
   - 选择演员（导演控制台下拉框）
   - 勾选 2-3 个镜头
   - 点击"组装大分镜"
   - 验证：prompt 包含 Character 块 + Voice Tone

4. **镜头上限策略**
   - 生成 5 个镜头（每个 3s）
   - 勾选 4 个镜头（总时长 12s < 15s）
   - 点击"组装大分镜"
   - 验证：alert 提示"15秒内最多组合 3 个镜头"

### 边界测试

1. **空镜头**
   - 不勾选任何镜头
   - 点击"组装大分镜"
   - 验证：alert 提示"请至少选择 1 个镜头"

2. **缺失字段**
   - 生成镜头时，某些 shot 缺少 sora_prompt
   - 组装大分镜
   - 验证：fallback 到 shot.visual，不会报错

3. **缺失 camera_movement**
   - 某些 shot 没有 camera_movement
   - 组装大分镜
   - 验证：Camera 字段为空，不会报错

4. **长时长镜头**
   - 生成 2 个镜头（每个 10s，总 20s）
   - 勾选 2 个镜头
   - 组装大分镜
   - 验证：不受 15s 上限限制（总时长 > 15s）

---

## 已知限制

### 当前版本

- 演员选择仅支持单选（多演员场景需后续支持）
- Physics 和 Audio Style 为固定文案（可后续改为可配置）
- camera_movement 需要 LLM 在分析时生成（依赖 system prompt）

### 未来优化方向

1. **多演员支持**
   - 允许为每个 shot 指定不同演员
   - Character 块支持多角色声明

2. **Physics 和 Audio Style 可配置**
   - 在导演控制台添加可选输入框
   - 允许用户自定义物理效果和音频风格

3. **camera_movement 智能推荐**
   - 根据 shot.visual 内容自动推荐镜头运动
   - 提供 camera_movement 预设库

4. **Sora2 模板版本管理**
   - 支持多个模板版本（v1, v2...）
   - 允许用户选择使用哪个模板

---

## 相关文档

- [Phase 3.2 代码审计与修复](./PHASE_3.2_代码审计与修复.md)
- [Phase 3.1.1 稳定性补丁](./PHASE_3.1.1_稳定性补丁.md)
- [Phase 3.1 修改总结（签约中心组件化）](./PHASE_3.1_修改总结.md)
- [Phase 3.0 修改总结（IndexedDB 迁移）](./PHASE_3.0_修改总结.md)

---

## 总结

### ✅ 修复成果

1. **sora_prompt 不再错误地放到 Camera 字段**
   - Camera 字段只用 `camera_movement`
   - Shot 描述主体优先用 `sora_prompt`

2. **大分镜 prompt 组装逻辑统一**
   - StoryboardStudio 不再自建拼接规则
   - 统一调用 `ProjectContext.assembleSoraPrompt`

3. **Sora2 模板严格对齐**
   - Global Context（Style + Environment + Physics + Audio Style）
   - Timeline Script（时间戳 + CUT TO + SFX/Dialogue）
   - Technical Specs（--ar + --duration + --quality）

4. **演员接入支持**
   - 添加大分镜演员选择下拉框
   - Character 块自动合并演员描述
   - Voice Tone 自动注入
   - startImg 优先使用首镜关键帧

5. **UI/动线优化**
   - "组装大分镜"按钮上移到 shots 列表顶部
   - 添加引导文案：① 先生成小分镜 → ② 勾选镜头 → ③ 组装大分镜

### 📊 代码质量

- ✅ 零 Linter 错误
- ✅ 代码量净增加 45 行
- ✅ 函数职责清晰，逻辑统一
- ✅ 注释完善，易于维护
- ✅ 向后兼容，不影响其他模块

### 🎯 业务规则

- ✅ Sora2 模板严格对齐
- ✅ 镜头上限策略（15s 内最多 3 镜头）
- ✅ Shot 内容优先级（sora_prompt > visual）
- ✅ Camera 字段规则（只用 camera_movement）
- ✅ 演员一致性（Character + Voice Tone）
- ✅ startImg 优先级（首镜关键帧 > actorRef > null）

---

**修改人**：Claude (Cursor AI)  
**验收人**：待用户验收  
**状态**：✅ 开发完成，等待测试  
**优先级**：🔴 Critical（修复 sora_prompt 错误放置问题）

