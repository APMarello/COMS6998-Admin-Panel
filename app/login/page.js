import LoginButton from "./LoginButton";

export const metadata = { title: "Admin sign in | AI Humor App" };

export default function LoginPage() {
  return <main className="login-page"><section className="login-card">
    <p className="eyebrow">AI Humor App · restricted console</p>
    <h1>Administrative access only.</h1>
    <p>Sign in with Google. Your database role is verified before the admin dashboard can load.</p>
    <LoginButton />
  </section></main>;
}
