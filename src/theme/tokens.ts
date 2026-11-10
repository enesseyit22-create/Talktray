export type Palette = {
  bg: string;
  text: string;
  muted: string;
  soft: string;
  primary: string;
  primaryDeep: string;
  onPrimary: string;
  glass: string;
  glassStrong: string;
  glassBorder: string;
  shadow: string;
  danger: string;
  success: string;
  tab: string;
  tabActive: string;
  dot: string;
  field: string;
  blobs: string[];
  task: { tile: string; icon: string };
  reminder: { tile: string; icon: string };
  event: { tile: string; icon: string };
  shopping: { tile: string; icon: string };
  note: { tile: string; icon: string };
};

export const lightColors: Palette = {
  bg: '#F7F2FF',
  text: '#2A2452',
  muted: '#8E89A8',
  soft: '#B0ABC6',
  primary: '#7A6AF0',
  primaryDeep: '#5C4ED6',
  onPrimary: '#FFFFFF',
  glass: 'rgba(255,255,255,0.72)',
  glassStrong: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.96)',
  shadow: '#8B7CFF',
  danger: '#E15B73',
  success: '#3CB98A',
  tab: '#A39EBE',
  tabActive: '#6E62E6',
  dot: '#FF5A6A',
  field: 'rgba(255,255,255,0.62)',
  blobs: ['#E3D4FF', '#FFD4C6', '#D4EBFF', '#D5F6E8', '#FFD9EC'],
  task: { tile: '#E6E0FF', icon: '#7A6AF0' },
  reminder: { tile: '#FFE3EA', icon: '#E36B8A' },
  event: { tile: '#DCEEFF', icon: '#5B8DEF' },
  shopping: { tile: '#FFE6D8', icon: '#F08A62' },
  note: { tile: '#DDF6EA', icon: '#3CB98A' },
};

export const darkColors: Palette = {
  bg: '#100E22',
  text: '#F5F2FF',
  muted: '#B7B1D0',
  soft: '#8E89A8',
  primary: '#C4B5FD',
  primaryDeep: '#8B7CFF',
  onPrimary: '#1A1333',
  glass: 'rgba(34, 28, 68, 0.62)',
  glassStrong: 'rgba(46, 38, 86, 0.84)',
  glassBorder: 'rgba(255,255,255,0.16)',
  shadow: '#000000',
  danger: '#FF8AA0',
  success: '#7EE0BE',
  tab: '#8E89A8',
  tabActive: '#D4C8FF',
  dot: '#FF6B7A',
  field: 'rgba(255,255,255,0.06)',
  blobs: [
    'rgba(124,104,255,0.48)',
    'rgba(255,150,170,0.28)',
    'rgba(90,140,255,0.32)',
    'rgba(80,210,180,0.22)',
    'rgba(255,180,140,0.18)',
  ],
  task: { tile: 'rgba(140,120,255,0.28)', icon: '#C4B5FD' },
  reminder: { tile: 'rgba(255,130,160,0.22)', icon: '#FFB4C6' },
  event: { tile: 'rgba(120,160,255,0.24)', icon: '#A9C4FF' },
  shopping: { tile: 'rgba(255,160,120,0.22)', icon: '#FDBA9A' },
  note: { tile: 'rgba(80,210,170,0.22)', icon: '#7EE0BE' },
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  wordmark: 'Manrope_600SemiBold',
} as const;
