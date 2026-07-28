/**
 * Auth route group — no sidebar/header so sign-in is a clean centered card.
 */

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
