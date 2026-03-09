/**
 * 加载指示器
 *
 * 用纯文本帧动画实现，无外部依赖。
 */

import { useState, useEffect, useRef } from 'react';
import { Text } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL = 80;

export function Spinner() {
  const [frame, setFrame] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    const timer = setInterval(() => {
      if (mountedRef.current) {
        setFrame(f => (f + 1) % FRAMES.length);
      }
    }, INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, []);

  return <Text color="cyan">{FRAMES[frame]}</Text>;
}
