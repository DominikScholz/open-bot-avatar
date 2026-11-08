import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { mountAvatar, type AvatarOptions, type MountedAvatar } from 'open-bot-avatar/dom';

export interface BotAvatarProps extends AvatarOptions {
  /** Width and height (the avatar is square): a number of pixels or any CSS length. Omit to fill the width. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** The host element, for hosts that need to reach into the mounted scene. */
  hostRef?: RefObject<HTMLDivElement | null>;
  /** Called with the mounted avatar once it is live, and with null when it goes away. */
  onMount?: (mounted: MountedAvatar | null) => void;
}

/**
 * The site's React wrapper around mountAvatar: a live avatar (painted to a canvas; it idles, blinks,
 * changes mood smoothly and, with `followPointer`, looks toward the cursor), or with `still` a
 * single static SVG. The Docs page shows the same pattern for other apps to copy.
 */
export function BotAvatar({ size, className, style, hostRef, onMount, ...options }: BotAvatarProps) {
  const own = useRef<HTMLDivElement | null>(null);
  const host: RefObject<HTMLDivElement | null> = hostRef ?? own;
  const avatar = useRef<MountedAvatar | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(onMount);
  mounted.current = onMount;

  useEffect(() => {
    if (!host.current) return;
    const instance = mountAvatar(host.current, latest.current);
    avatar.current = instance;
    mounted.current?.(instance);
    return () => {
      instance.destroy();
      avatar.current = null;
      mounted.current?.(null);
    };
  }, []);

  const { definition, color, eyeColor, depth, mood, followPointer, lookAt, holdGaze, view, reducedMotion, still, label } = options;
  useEffect(() => {
    avatar.current?.update(latest.current);
  }, [definition, color, eyeColor, depth, mood, followPointer, lookAt, holdGaze, view, reducedMotion, still, label]);

  return (
    <div
      ref={host}
      className={className}
      // mountAvatar makes a static box relative; a class or style may position it otherwise.
      style={{ aspectRatio: '1 / 1', width: size, ...style }}
    />
  );
}
