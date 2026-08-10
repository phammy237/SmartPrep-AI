import { Redirect } from 'expo-router';

/**
 * This tab screen is never actually shown - the tab bar intercepts presses
 * on Scan and pushes the /scan modal stack instead (see (tabs)/_layout.tsx).
 * The redirect is just a safety net for direct/deep navigation to this route.
 */
export default function ScanTabRoute() {
  return <Redirect href="/scan" />;
}
