/**
 * Canonical Dispatch screen entry.
 *
 * Expo Router and compatibility imports converge here so Dispatch cannot drift
 * between two independently maintained command-center implementations.
 * DispatchCadCommandCenter remains the single implementation while its legacy
 * filename is retained for stable internal imports and focused domain tests.
 */
export { default } from './DispatchCadCommandCenter';
export { default as DispatchCommandCenter } from './DispatchCadCommandCenter';
