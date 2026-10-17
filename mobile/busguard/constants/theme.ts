import { useColorScheme } from '@/components/useColorScheme';

const light = {
  background: '#f7f8fd', surface: '#ffffff', surfaceAlt: '#eef2ff',
  text: '#18233d', muted: '#61708b', primary: '#078861', primarySoft: '#e6f8f0',
  accent: '#f9b900', border: '#e7ebf4', danger: '#b42338', success: '#067650', dark: false,
};
const dark = {
  background: '#101727', surface: '#1b2539', surfaceAlt: '#25314a',
  text: '#f2f5fd', muted: '#b3bfd5', primary: '#7adeba', primarySoft: '#173e35',
  accent: '#f9b900', border: '#32415a', danger: '#ffadb8', success: '#7adeb1', dark: true,
};

export function useAppTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export const themes = { light, dark };
