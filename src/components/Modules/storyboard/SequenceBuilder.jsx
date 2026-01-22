import React from 'react';
import { Film, Copy } from 'lucide-react';

export const SequenceBuilder = ({ data, actions }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto pb-20">
      {data.scenes.map(scene => (
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
                      src={typeof scene.startImg === 'string' ? scene.startImg : scene.startImg.url}
                      className="w-full h-full object-cover opacity-50"
                    />
                    <div className="absolute inset-0 bg-black/60"/>
                  </>
                )}
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <button
                    onClick={() => actions.handleGenSceneVideo(scene)}
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
                onClick={() => navigator.clipboard.writeText(scene.prompt)}
                className="hover:text-white"
              >
                <Copy size={12}/>
              </button>
            </div>
          </div>
        </div>
      ))}
      
      {data.scenes.length === 0 && (
        <div className="col-span-full text-center text-slate-600 mt-20">
          暂无大分镜。请在"分镜 Shot"标签页选中多个镜头进行组合。
        </div>
      )}
    </div>
  );
};

