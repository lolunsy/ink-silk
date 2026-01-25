import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Phase 4.5: 全局滚轮路由
 * 智能路由滚轮事件到最近的可滚动容器，保留多滚动区结构
 * 
 * @param {WheelEvent} event - 原始滚轮事件
 * @param {Object} options - 配置选项
 * @param {Array<React.RefObject>} options.fallbacks - 备用滚动容器（按优先级）
 */
export function handleWheelRouting(event, { fallbacks = [] } = {}) {
  // 1. 不拦截：Shift + 滚轮（横向滚动）
  if (event.shiftKey) return;
  
  // 2. 不拦截：事件来自可输入元素或标记了原生滚动的元素
  const target = event.target;
  const tagName = target.tagName?.toLowerCase();
  
  if (
    tagName === 'textarea' || 
    tagName === 'input' || 
    tagName === 'select' ||
    target.closest('[data-wheel-native="true"]') ||
    target.closest('dialog') ||
    target.closest('[role="dialog"]')
  ) {
    return;
  }
  
  // 3. 向上查找第一个可滚动容器
  let scrollContainer = null;
  let current = target;
  
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    
    // 检查是否可滚动
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      current.scrollHeight > current.clientHeight
    ) {
      scrollContainer = current;
      break;
    }
    
    current = current.parentElement;
  }
  
  // 4. 如果找到可滚动容器，路由到它
  if (scrollContainer) {
    event.preventDefault();
    event.stopPropagation();
    
    scrollContainer.scrollTop += event.deltaY;
    return;
  }
  
  // 5. 找不到则使用 fallbacks（按优先级尝试）
  for (const fallbackRef of fallbacks) {
    const fallbackEl = fallbackRef?.current;
    if (
      fallbackEl &&
      fallbackEl.scrollHeight > fallbackEl.clientHeight
    ) {
      event.preventDefault();
      event.stopPropagation();
      
      fallbackEl.scrollTop += event.deltaY;
      return;
    }
  }
}