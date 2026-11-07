import type { AvatarMotion } from "open-bot-avatar";

export const MOOD_INFO: Record<AvatarMotion, { label: string; text: string }> = {
  idle: { label: "Idle", text: "Breathes, sways, blinks and glances around." },
  thinking: { label: "Thinking", text: "Tilts away and looks up, lids lowered." },
  happy: { label: "Happy", text: "Hops and rocks with arched, smiling eyes." },
  excited: { label: "Excited", text: "Rapid hops and wiggles, eyes big and raised." },
  celebrate: { label: "Celebrate", text: "Spins all the way round, then hops twice." },
  determined: { label: "Determined", text: "Leans in, eyes level and locked ahead, with a slow nod of resolve." },
  surprised: { label: "Surprised", text: "Startles upright and holds still while its eyes open wider, then blinks twice." },
  angry: { label: "Angry", text: "Leans in and glares; with each huff its eyes narrow and slant more." },
  sad: { label: "Sad", text: "Slumps low, small drooping eyes looking down." },
  sleepy: { label: "Sleepy", text: "Heavy lids; it nods off, eyes closing, then jerks awake." },
};

export const moodLabel = (mood: AvatarMotion) => MOOD_INFO[mood].label;
