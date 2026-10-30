const light = {
  background: '#F7F8FD', surface: '#FFFFFF', surfaceAlt: '#F0F3FA',
  text: '#18233D', muted: '#61708B', primary: '#006B4F', primarySoft: '#E8F8F0',
  accent: '#F9B900', border: '#E5EAF2', danger: '#B42338', success: '#047857', dark: false,
};
const dark = {
  background: '#101727', surface: '#1b2539', surfaceAlt: '#25314a',
  text: '#f2f5fd', muted: '#b3bfd5', primary: '#7adeba', primarySoft: '#173e35',
  accent: '#F8B900', border: '#32415a', danger: '#ffadb8', success: '#7adeb1', dark: true,
};

export function useAppTheme() {
  return light;
}

export const themes = { light, dark };
