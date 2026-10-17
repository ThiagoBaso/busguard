import { useColorScheme } from '@/components/useColorScheme';

const light = {
  background: '#F8FAFC', surface: '#ffffff', surfaceAlt: '#F0F4FA',
  text: '#17243C', muted: '#61708b', primary: '#006B4F', primarySoft: '#E8F8F0',
  accent: '#F8B900', border: '#E8EDF3', danger: '#b42338', success: '#047857', dark: false,
};
const dark = {
  background: '#101727', surface: '#1b2539', surfaceAlt: '#25314a',
  text: '#f2f5fd', muted: '#b3bfd5', primary: '#7adeba', primarySoft: '#173e35',
  accent: '#F8B900', border: '#32415a', danger: '#ffadb8', success: '#7adeb1', dark: true,
};

export function useAppTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export const themes = { light, dark };
