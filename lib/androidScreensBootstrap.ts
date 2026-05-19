import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

// Android/Fabric can issue out-of-order same-parent tab child moves through
// react-native-screens during dock tab switches. Run this before Expo Router
// initializes React Navigation so the shell uses plain RN views on Android.
if (Platform.OS === 'android') {
  enableScreens(false);
}
