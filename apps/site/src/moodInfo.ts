import type { AvatarActivity, AvatarMotion } from "open-bot-avatar";

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

export const ACTIVITY_INFO: Record<AvatarActivity, { label: string; text: string }> = {
  thinking: { label: "Thinking", text: "Looks up and away with one eye squinting, then mulls it over on the other side." },
  listening: { label: "Listening", text: "Perks up wide-eyed and faces you with its head cocked, nodding along twice." },
  speaking: { label: "Speaking", text: "Bounces in an uneven, syllable-like rhythm, its eyes popping tall with each beat, turning from phrase to phrase." },
  working: { label: "Working", text: "Hunches over and taps away, eyes narrowed and reading along a line, and looks up now and then to check." },
  waiting: { label: "Waiting", text: "Rocks from side to side gazing off, then turns, leans in wide-eyed and hops twice." },
  success: { label: "Success", text: "Hops once with smiling eyes, nods twice, then stands proud." },
  error: { label: "Error", text: "Shakes its head with a flinch, then stays off balance and uneasy." },
};

export const activityLabel = (activity: AvatarActivity) => ACTIVITY_INFO[activity].label;
