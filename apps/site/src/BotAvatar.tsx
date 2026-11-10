import { useEffect, useRef, type CSSProperties } from 'react';
import { mountAvatar, type AvatarOptions, type MountedAvatar } from 'open-bot-avatar/dom';

export interface BotAvatarProps extends AvatarOptions {
  /** Width and height (the avatar is square): a number of pixels or any CSS length. Omit to fill the width. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The site's React wrapper around mountAvatar: a live avatar (painted to a canvas; it idles, blinks,
 * changes state and mood smoothly and, with `followPointer`, looks toward the cursor), or with `still` a
 * single static SVG. The Docs page shows the same pattern for other apps to copy.
 */
export function BotAvatar({ size, className, style, ...options }: BotAvatarProps) {
  const host = useRef<HTMLDivElement>(null);
  const avatar = useRef<MountedAvatar | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!host.current) return;
    const mounted = mountAvatar(host.current, latest.current);
    avatar.current = mounted;
    return () => {
      mounted.destroy();
      avatar.current = null;
    };
  }, []);

  const { definition, color, eyeColor, depth, state, mood, followPointer, lookAt, holdGaze, view, reducedMotion, still, label } = options;
  useEffect(() => {
    avatar.current?.update(latest.current);
  }, [definition, color, eyeColor, depth, state, mood, followPointer, lookAt, holdGaze, view, reducedMotion, still, label]);

  return (
    <div
      ref={host}
      className={className}
      // mountAvatar makes a static box relative; a class or style may position it otherwise.
      style={{ aspectRatio: '1 / 1', width: size, ...style }}
    />
  );
}
