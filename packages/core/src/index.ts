export type { AvatarDefinition, AvatarEyes, AvatarMotion, AvatarMotionBlend, RenderOptions, ValidationResult } from './types.ts';
export { validateAvatar } from './validate.ts';
export {
  avatarFrame,
  preparedVolume,
  projectPoint,
  renderAvatarSvg,
  renderAvatarScene,
  sceneFrame,
  viewBasis,
  DEFAULT_COLOR,
  DEFAULT_DEPTH,
  DEFAULT_EYE_COLOR,
} from './render.ts';
export type { AvatarFrame, EyeMark, FramePath, FrameShape, Matrix, SceneFrame, ViewBasis } from './render.ts';
export { spanAt } from './volume.ts';
export type { Volume } from './volume.ts';
export type { Point } from './path.ts';
export { BASE_PITCH, BASE_YAW, blendPoses, computePose } from './motion.ts';
export type { Pose, PoseInput } from './motion.ts';
export { MOOD_MS, moodProgress, settleMood } from './mood.ts';
export type { MoodState } from './mood.ts';
export { REST, followGaze, followStep, pointerGaze } from './follow.ts';
export type { FollowState } from './follow.ts';
export { createAnimator } from './animator.ts';
export type { Animator, AnimatorInput, AnimatorStep } from './animator.ts';
export { examples, getExample } from './examples.ts';
