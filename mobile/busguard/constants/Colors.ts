import { themes } from './theme';

const tintColorLight = themes.light.primary;
const tintColorDark = themes.dark.primary;

export default {
  light: {
    text: themes.light.text,
    background: themes.light.background,
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: themes.dark.text,
    background: themes.dark.background,
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
  },
};
