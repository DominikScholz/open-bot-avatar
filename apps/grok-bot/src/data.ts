export type BotState = 'idle' | 'working' | 'waiting' | 'blocked' | 'thinking' | 'done';

export const STATE_ORDER: BotState[] = ['idle', 'working', 'waiting', 'blocked', 'thinking', 'done'];

export interface StateCopy {
  label: string;
  headline: string;
  description: string;
}

export const STATES: Record<BotState, StateCopy> = {
  idle: {
    label: 'Idle',
    headline: 'Calm and curious',
    description: 'A slow breath, a soft glance, the occasional blink. The Bot is present without demanding attention.',
  },
  working: {
    label: 'Working',
    headline: 'Kicking into gear',
    description: 'The body picks up a quick rhythm and the eyes scan. Motion says the work has started.',
  },
  waiting: {
    label: 'Waiting',
    headline: 'Waiting on you',
    description: 'Half-lidded eyes look around slowly. Patient, attentive, and clearly not finished.',
  },
  blocked: {
    label: 'Blocked',
    headline: 'Needs a hand',
    description: 'The silhouette becomes an exclamation mark. No extra badge is needed to ask for help.',
  },
  thinking: {
    label: 'Thinking',
    headline: 'Working it out',
    description: 'Three dots cycle in place while the Bot reasons, then resolve back into the character.',
  },
  done: {
    label: 'Done',
    headline: 'Settles once more',
    description: 'Paint ribbons loop around the silhouette and dry, then clear as the Bot returns to its resting shape.',
  },
};

export type ShapeKey = 'circle' | 'teardrop' | 'triangle' | 'blob' | 'capsule' | 'squircle' | 'hexagon' | 'puffy';

/** Silhouettes sampled from the article and its product shots, in the 0 0 259 259 avatar space. */
export const SHAPES: Record<ShapeKey, string> = {
  circle:
    'M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z',
  teardrop:
    'M125.97 7.2Q114.27 -7.28 102.57 7.2L43.49 80.31C13.46 117.46 17.28 171.51 52.23 204.08C87.17 236.65 141.37 236.65 176.32 204.08C211.26 171.51 215.08 117.46 185.05 80.31Z',
  triangle:
    'M77.26 42.06Q114.27 -22.05 151.28 42.06L216.15 154.43Q253.17 218.53 179.14 218.53L49.4 218.53Q-24.62 218.53 12.39 154.43Z',
  blob: 'M114 6C172 6 222 44 224 108C226 172 178 222 114 222C50 222 4 176 4 110C4 44 56 6 114 6Z',
  capsule:
    'M74.27 40.27L154.27 40.27C195.14 40.27 228.27 73.4 228.27 114.27C228.27 155.14 195.14 188.27 154.27 188.27L74.27 188.27C33.4 188.27 0.27 155.14 0.27 114.27C0.27 73.4 33.4 40.27 74.27 40.27Z',
  squircle: 'M62 6H166A56 56 0 0 1 222 62V166A56 56 0 0 1 166 222H62A56 56 0 0 1 6 166V62A56 56 0 0 1 62 6Z',
  hexagon:
    'M217.73 153.04Q217.73 174 199.58 184.48L132.42 223.25Q114.27 233.73 96.12 223.25L28.96 184.48Q10.81 174 10.81 153.04L10.81 75.5Q10.81 54.54 28.96 44.06L96.12 5.29Q114.27 -5.19 132.42 5.29L199.58 44.06Q217.73 54.54 217.73 75.5Z',
  puffy:
    'M114 10C133 10 148 22 152 40C172 37 190 51 193 71C210 79 218 99 208 115C217 132 208 152 190 158C187 176 169 188 151 183C138 198 116 199 103 186C85 193 65 182 62 164C45 160 35 142 42 125C28 114 31 93 47 85C48 66 65 53 83 56C91 33 101 10 114 10Z',
};

export interface EyeConfig {
  y: number;
  spacing: number;
  w: number;
  h: number;
  rot: number;
}

export interface Bot {
  id: string;
  name: string;
  role: string;
  color: string;
  shape: ShapeKey;
  eyes: EyeConfig;
  state: BotState;
}

export const BOTS: Bot[] = [
  {
    id: 'kenny',
    name: 'Kenny',
    role: 'Chief of Staff',
    color: '#070707',
    shape: 'circle',
    eyes: { y: 103, spacing: 52, w: 20, h: 48, rot: -20 },
    state: 'idle',
  },
  {
    id: 'justin',
    name: 'Justin',
    role: 'Researcher',
    color: '#797979',
    shape: 'teardrop',
    eyes: { y: 110, spacing: 50, w: 18, h: 46, rot: 0 },
    state: 'working',
  },
  {
    id: 'luke',
    name: 'Luke',
    role: 'Engineer',
    color: '#1084FE',
    shape: 'triangle',
    eyes: { y: 132, spacing: 48, w: 18, h: 40, rot: 0 },
    state: 'waiting',
  },
  {
    id: 'john',
    name: 'John',
    role: 'Designer',
    color: '#FF6700',
    shape: 'blob',
    eyes: { y: 104, spacing: 50, w: 22, h: 38, rot: -18 },
    state: 'blocked',
  },
  {
    id: 'keith',
    name: 'Keith',
    role: 'Analyst',
    color: '#00C972',
    shape: 'capsule',
    eyes: { y: 114, spacing: 50, w: 20, h: 48, rot: 0 },
    state: 'thinking',
  },
  {
    id: 'tyler',
    name: 'Tyler',
    role: 'Writer',
    color: '#936439',
    shape: 'puffy',
    eyes: { y: 108, spacing: 44, w: 18, h: 42, rot: -28 },
    state: 'done',
  },
  {
    id: 'jenny',
    name: 'Jenny',
    role: 'Product Manager',
    color: '#9159FE',
    shape: 'squircle',
    eyes: { y: 104, spacing: 50, w: 20, h: 46, rot: -6 },
    state: 'idle',
  },
  {
    id: 'chang',
    name: 'Chang',
    role: 'Data Scientist',
    color: '#FF309B',
    shape: 'hexagon',
    eyes: { y: 110, spacing: 50, w: 19, h: 46, rot: 0 },
    state: 'working',
  },
  {
    id: 'peng',
    name: 'Peng',
    role: 'Support',
    color: '#00BCA6',
    shape: 'teardrop',
    eyes: { y: 110, spacing: 50, w: 18, h: 46, rot: -12 },
    state: 'waiting',
  },
];
