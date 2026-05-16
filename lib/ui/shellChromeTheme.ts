import type { EffectiveTheme } from '../appearanceStore';

type ShellChromeThemeInput = {
  effectiveTheme: EffectiveTheme;
  palette: {
    amber: string;
    text: string;
    textMuted: string;
    border: string;
  };
  colors: {
    bgCard: string;
    bgElevated: string;
    border: string;
  };
};

export type ShellChromeTheme = {
  topBannerWash: string;
  bottomBannerWash: string;
  bodyScrim: string;
  goldRail: string;
  bottomEdge: string;
  title: string;
  iconActive: string;
  iconMuted: string;
  online: string;
  controlSurface: string;
  controlBorder: string;
  syncBadgeSurface: string;
  syncBadgeBorder: string;
  dockTopLine: string;
  dockLabelMuted: string;
  dockLabelActive: string;
  hintHalo: string;
  hintHaloBorder: string;
  hintText: string;
};

export function resolveShellChromeTheme({
  effectiveTheme,
  palette,
  colors,
}: ShellChromeThemeInput): ShellChromeTheme {
  switch (effectiveTheme) {
    case 'light':
      return {
        topBannerWash: 'rgba(244, 239, 229, 0.72)',
        bottomBannerWash: 'rgba(245, 240, 231, 0.78)',
        bodyScrim: 'rgba(245, 241, 234, 0.34)',
        goldRail: '#A9771B',
        bottomEdge: 'rgba(92, 78, 52, 0.16)',
        title: '#6E4E18',
        iconActive: '#A9771B',
        iconMuted: '#6D6455',
        online: '#356A49',
        controlSurface: 'rgba(255,255,255,0.64)',
        controlBorder: 'rgba(169,119,27,0.24)',
        syncBadgeSurface: 'rgba(249, 246, 240, 0.96)',
        syncBadgeBorder: 'rgba(169,119,27,0.24)',
        dockTopLine: 'rgba(169,119,27,0.32)',
        dockLabelMuted: '#716A5B',
        dockLabelActive: '#A9771B',
        hintHalo: 'rgba(169,119,27,0.12)',
        hintHaloBorder: 'rgba(169,119,27,0.20)',
        hintText: '#6E4E18',
      };
    case 'driving':
      return {
        topBannerWash: 'rgba(24, 28, 32, 0.34)',
        bottomBannerWash: 'rgba(22, 26, 31, 0.30)',
        bodyScrim: 'rgba(22, 28, 34, 0.44)',
        goldRail: '#C89020',
        bottomEdge: '#313941',
        title: '#E0A030',
        iconActive: '#E0A030',
        iconMuted: '#A6A19A',
        online: '#78B067',
        controlSurface: 'rgba(42,48,56,0.82)',
        controlBorder: 'rgba(224,160,48,0.28)',
        syncBadgeSurface: 'rgba(30,35,40,0.96)',
        syncBadgeBorder: 'rgba(224,160,48,0.22)',
        dockTopLine: 'rgba(224,160,48,0.28)',
        dockLabelMuted: '#9D978F',
        dockLabelActive: '#E0A030',
        hintHalo: 'rgba(224,160,48,0.14)',
        hintHaloBorder: 'rgba(224,160,48,0.22)',
        hintText: '#F1D3A0',
      };
    case 'dark':
    default:
      return {
        topBannerWash: 'rgba(0,0,0,0)',
        bottomBannerWash: 'rgba(7, 10, 14, 0.16)',
        bodyScrim: 'rgba(9, 11, 14, 0.58)',
        goldRail: '#A0813A',
        bottomEdge: '#262A2E',
        title: palette.amber,
        iconActive: '#C9A24C',
        iconMuted: '#8A7A58',
        online: '#3E6B3E',
        controlSurface: 'rgba(255,255,255,0.045)',
        controlBorder: 'rgba(201,162,76,0.20)',
        syncBadgeSurface: 'rgba(17,20,24,0.92)',
        syncBadgeBorder: 'rgba(201,162,76,0.22)',
        dockTopLine: 'rgba(196,138,44,0.28)',
        dockLabelMuted: '#6E7886',
        dockLabelActive: '#D1AC59',
        hintHalo: 'rgba(212,160,23,0.14)',
        hintHaloBorder: 'rgba(212,160,23,0.22)',
        hintText: colors.bgCard,
      };
  }
}
