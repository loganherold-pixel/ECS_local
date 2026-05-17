import LoadingTransitionVideo from '../components/LoadingTransitionVideo';

/**
 * Root entry route.
 *
 * AuthGate owns session routing. While it resolves startup or post-login
 * destination state, this route must remain the approved loading video.
 */
export default function Index() {
  return <LoadingTransitionVideo />;
}
