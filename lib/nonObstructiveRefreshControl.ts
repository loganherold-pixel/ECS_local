import type { RefreshControlProps } from 'react-native';

type NonObstructiveRefreshControlProps = Pick<
  RefreshControlProps,
  'colors' | 'progressBackgroundColor' | 'progressViewOffset' | 'tintColor' | 'title' | 'titleColor'
>;

export const NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS: NonObstructiveRefreshControlProps = {
  colors: ['transparent'],
  progressBackgroundColor: 'transparent',
  progressViewOffset: 0,
  tintColor: 'transparent',
  title: '',
  titleColor: 'transparent',
};
